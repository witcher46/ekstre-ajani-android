import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as C from '../app/src/main/assets/core.mjs';
import {parseStatementCsv} from '../app/src/main/assets/csv.mjs';
import {parseStatement} from '../app/src/main/assets/parser.mjs';

const wallet = () => ({
  ...C.empty(),
  accounts: [
    {id:'bank', name:'Sentetik banka', type:'bank', opening:100000},
    {id:'other-bank', name:'Sentetik ikinci banka', type:'bank', opening:0},
    {id:'cash', name:'Sentetik nakit', type:'cash', opening:0},
    {id:'card', name:'Sentetik kart', type:'card', opening:0},
  ],
});

const record = (state, changes) => C.addTransaction(state, {
  account:'bank', date:'2026-01-03', desc:'Sentetik hareket',
  kind:'expense', amount:10000, category:'Diğer', ...changes,
});

const opening = {accountId:'bank', date:'2026-01-01', amountCents:100000};
const at = (state, date, anchor = opening) => C.balanceAt(state, anchor.accountId, date, {anchor});
const calculated = amountCents => ({status:'calculated', amountCents});
const unavailable = reason => ({status:'unavailable', reason});

test('uses the known end-of-day opening with no movements, including a zero balance', () => {
  const state = wallet();
  assert.deepEqual(at(state,'2026-01-01'), calculated(100000));
  assert.deepEqual(at(state,'2026-01-20'), calculated(100000));
  assert.deepEqual(at(state,'2026-01-20',{...opening, amountCents:0}), calculated(0));
});

test('uses the verified amount and counts only dates after the anchor through the query day', () => {
  let state = record(wallet(),{date:'2025-12-31', amount:5000});
  state = record(state,{date:'2026-01-01', amount:9000});
  state = record(state,{date:'2026-01-03', amount:10000});
  state = record(state,{date:'2026-01-04', amount:4000});
  const anchor = {...opening, amountCents:123450};
  assert.deepEqual(at(state,'2026-01-01',anchor), calculated(123450));
  assert.deepEqual(at(state,'2026-01-02',anchor), calculated(123450));
  assert.deepEqual(at(state,'2026-01-03',anchor), calculated(113450));
  assert.deepEqual(at(state,'2026-01-04',anchor), calculated(109450));
});

test('future-dated spend remains in legacy balance and stays outside the earlier as-of balance', () => {
  const state = record(wallet(),{date:'2099-01-01', amount:1701});
  assert.deepEqual(at(state,'2026-01-31'), calculated(100000));
  assert.equal(C.balance(state,state.accounts[0]),98299);
});

test('a backdated entry changes the reconstructed day regardless of insertion order', () => {
  const initial = record(wallet(),{kind:'income', date:'2026-01-15', amount:30000});
  const state = record(initial,{date:'2026-01-04', amount:1975});
  const before = C.backupText(state);
  assert.deepEqual(at(initial,'2026-01-04'), calculated(100000));
  assert.deepEqual(at(state,'2026-01-03'), calculated(100000));
  assert.deepEqual(at(state,'2026-01-04'), calculated(98025));
  assert.deepEqual(at(state,'2026-01-15'), calculated(128025));
  assert.equal(C.backupText(state), before);
});

test('bank transfers debit the sender and credit the recipient on the same day', () => {
  const state = record(wallet(),{kind:'transfer', target:'other-bank', amount:20021});
  const recipient = {...opening, accountId:'other-bank', amountCents:20000};
  assert.deepEqual(at(state,'2026-01-03'), calculated(79979));
  assert.deepEqual(at(state,'2026-01-02',recipient), calculated(20000));
  assert.deepEqual(at(state,'2026-01-03',recipient), calculated(40021));
});

test('a bank payment debits once, and card purchases and refunds do not move that bank balance', () => {
  let state = record(wallet(),{account:'card', amount:10000});
  state = record(state,{kind:'payment', target:'card', amount:10000});
  state = record(state,{account:'card', kind:'refund', date:'2026-01-04', amount:2000});
  assert.deepEqual(at(state,'2026-01-04'), calculated(90000));
  assert.equal(C.summary(state,'2026-01').net,8000);
});

test('linking a PDF payment preserves one bank debit dated by the manual bank row', () => {
  const bank = record(wallet(),{kind:'payment', target:'card'});
  const pdf = parseStatement('QNB\nHesap Kesim Tarihi: 31/01/2026\n02/01/2026 ODEME 100.00');
  const pending = C.importStatement(bank,pdf,'card');
  const alias = pending.transactions.find(t => t.source === 'pdf');
  assert.equal(alias.matchStatus,'pending');
  const linked = C.resolveCandidate(pending,alias.id,'link',bank.transactions[0].id);
  assert.deepEqual(at(linked,'2026-01-02'), calculated(100000));
  assert.deepEqual(at(linked,'2026-01-03'), calculated(90000));
  assert.deepEqual(at(C.importStatement(linked,pdf,'card'),'2026-01-31'), calculated(90000));
});

test('reimporting a linked CSV does not change either the bank debit or movement count', () => {
  const bank = record(wallet(),{kind:'payment', target:'card'});
  const rows = parseStatementCsv('period,date,desc,amount_cents,category,tur,bank,kart\n2026-01,2026-01-04,ODEME,10000,Kart ödemesi,odeme,QNB,Sentetik\n');
  const pending = C.importCsv(bank,rows,'card');
  const csv = pending.transactions.find(t => t.source === 'csv');
  assert.equal(csv.matchStatus,'pending');
  const linked = C.resolveCandidate(pending,csv.id,'link',bank.transactions[0].id);
  const replay = C.importCsv(linked,rows,'card');
  assert.deepEqual(replay,linked);
  assert.deepEqual(at(replay,'2026-01-03'), calculated(90000));
  assert.deepEqual(at(replay,'2026-01-04'), calculated(90000));
});

test('cash can be overdrawn and a refund credits that account on its recorded date', () => {
  const cash = {...opening, accountId:'cash', amountCents:2};
  let state = record(wallet(),{account:'cash', amount:3});
  state = record(state,{account:'cash', kind:'refund', date:'2026-01-04', amount:2});
  assert.deepEqual(at(state,'2026-01-03',cash), calculated(-1));
  assert.deepEqual(at(state,'2026-01-04',cash), calculated(1));
  assert.deepEqual(at(state,'2026-01-04'), calculated(100000));
});

test('a pending manual bank payment still counts when PDF is preferred across a card statement cut', () => {
  const bank = record(wallet(),{kind:'payment', target:'card'});
  const pdf = parseStatement('QNB\nHesap Kesim Tarihi: 02/01/2026\nDonem Borcu: 100.00\n02/01/2026 ODEME 100.00');
  const pending = C.importStatement(bank,pdf,'card');
  assert.equal(pending.transactions[0].matchStatus,'pending');
  assert.deepEqual(at(pending,'2026-01-02'), calculated(100000));
  assert.deepEqual(at(pending,'2026-01-03'), calculated(90000));
  const linked = C.resolveCandidate(pending,pending.transactions[0].id,'link',pending.transactions[1].id);
  assert.deepEqual(at(linked,'2026-01-03'), calculated(90000));
});

test('date boundaries include the last day of the month and year without time zone conversion', () => {
  const anchor = {...opening, date:'2024-02-28'};
  let state = record(wallet(),{date:'2024-02-29', amount:1});
  state = record(state,{date:'2024-03-01', amount:2});
  state = record(state,{date:'2024-12-31', amount:3});
  state = record(state,{date:'2025-01-01', amount:4});
  assert.deepEqual(at(state,'2024-02-29',anchor), calculated(99999));
  assert.deepEqual(at(state,'2024-03-01',anchor), calculated(99997));
  assert.deepEqual(at(state,'2024-12-31',anchor), calculated(99994));
  assert.deepEqual(at(state,'2025-01-01',anchor), calculated(99990));
});

test('old JSON v1 remains usable and no implicit anchor is derived from it', () => {
  const url = new URL('./fixtures/android-0.1.0.json',import.meta.url);
  const state = C.readBackup(readFileSync(url,'utf8'));
  assert.deepEqual(C.balanceAt(state,'synthetic-bank','2026-10-05'), unavailable('missing-anchor'));
  const anchor = {accountId:'synthetic-bank', date:'2026-10-01', amountCents:100000};
  assert.deepEqual(at(state,'2026-10-05',anchor), calculated(100000));
  assert.deepEqual(C.readBackup(C.backupText(state)),state);
});

test('holds exact integer cents through safe-number overflow and returns to number when safe', () => {
  const max = Number.MAX_SAFE_INTEGER;
  const anchor = {...opening, amountCents:max};
  let state = record(wallet(),{kind:'income', amount:10});
  state = record(state,{date:'2026-01-04', amount:11});
  assert.deepEqual(at(state,'2026-01-03',anchor), calculated(9007199254741001n));
  assert.deepEqual(at(state,'2026-01-04',anchor), calculated(9007199254740990));
});

test('without evidence or before its date the amount is unavailable even with a nonzero opening', () => {
  const state = record(wallet());
  assert.deepEqual(C.balanceAt(state,'bank','2026-01-03'), unavailable('missing-anchor'));
  assert.deepEqual(at(state,'2025-12-31'), unavailable('before-anchor'));
});

test('rejects calendar errors, a foreign anchor, imprecise cents and unsupported accounts', () => {
  const state = wallet();
  for (const date of ['2026-02-29','2026-01-01T23:59:59+03:00','2026-1-1']) {
    assert.throws(() => at(state,date),/tarih/i);
  }
  for (const anchor of [
    null,
    {...opening, accountId:'cash'},
    {...opening, date:'2026-02-30'},
    {...opening, amountCents:0.1},
    {...opening, amountCents:Number.MAX_SAFE_INTEGER+1},
  ]) {
    assert.throws(() => C.balanceAt(state,'bank','2026-01-03',{anchor}),/dayana/i);
  }
  for (const accountId of ['card','missing']) {
    assert.throws(() => C.balanceAt(state,accountId,'2026-01-03'),/banka veya nakit/i);
  }
});
