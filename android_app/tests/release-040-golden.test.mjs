import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/src/main/assets/core.mjs';
import * as W from '../app/src/main/assets/wallet.mjs';

// Release 0.4.0 golden contract. All identifiers and amounts are synthetic.
// Expected values are independently specified in kuruş, never calculated by
// the functions under test. Do not update them to match a changed implementation
// without an explicit change to docs/FINANCIAL_BEHAVIOR_CONTRACT.md.
const base = () => W.normalizeWallet({
  ...C.empty(),
  accounts: [
    {id:'bank', name:'Sentetik banka', type:'bank', opening:2_000_000},
    {id:'cash', name:'Sentetik nakit', type:'cash', opening:100_000},
    {id:'card', name:'Sentetik kredi kartı', type:'card', opening:0},
  ],
});
const tx = (id, account, kind, date, amount, extra={}) => ({
  id, account, kind, date, period:date.slice(0,7), amount,
  desc:'Sentetik ' + id, category:'Diğer', note:'', ...extra,
});
const add = (state, row) => C.addTransaction(state, row);
function referenceWallets() {
  let october = base();
  october = add(october, tx('salary','bank','income','2026-10-10',3_000_000,{category:'Maaş'}));
  october = add(october, tx('purchase','card','expense','2026-10-20',200_000));
  october = add(october, tx('card-payment','bank','payment','2026-10-25',120_000,{target:'card'}));
  october = add(october, tx('transfer','bank','transfer','2026-10-26',50_000,{target:'cash'}));

  let november = add(october, tx('refund','card','refund','2026-11-01',40_000));
  november = add(november, tx('bank-expense','bank','expense','2026-11-02',15_000));
  november = add(november, tx('cash-expense','cash','expense','2026-11-03',5_000));
  return {october, november};
}
const balances = state => Object.fromEntries(state.accounts.map(a => [a.id,C.balance(state,a)]));
const figures = (state, month) => {
  const o = W.overview(state,month);
  return {
    cash:o.cash, cardDebt:o.cardDebt, cardCredit:o.cardCredit, netWorth:o.netWorth,
    income:o.income, spent:o.spent, refunds:o.refunds, netExpense:o.netExpense,
    margin:o.margin, cardPayments:o.cardPayments, transfers:o.transfers,
  };
};

test('0.4.0 golden: salary, purchase, partial card payment and transfer preserve independent ledger totals',()=>{
  const {october} = referenceWallets();
  assert.deepEqual(balances(october), {bank:4_830_000,cash:150_000,card:80_000});
  assert.deepEqual(figures(october,'2026-10'),{
    cash:4_980_000,cardDebt:80_000,cardCredit:0,netWorth:4_900_000,
    income:3_000_000,spent:200_000,refunds:0,netExpense:200_000,
    margin:2_800_000,cardPayments:120_000,transfers:50_000,
  });
  assert.deepEqual(C.summary(october,'2026-10'),{
    spent:200_000,refunds:0,income:3_000_000,net:200_000,
    categories:[['Diğer',200_000]],
  });
  assert.equal(C.cardStatus(october,'card',{asOf:'2026-10-31'}).current,80_000);
});

test('0.4.0 golden: following-month refund changes only its own expense period, not income',()=>{
  const {october,november} = referenceWallets();
  assert.deepEqual(balances(november),{bank:4_815_000,cash:145_000,card:40_000});
  assert.deepEqual(figures(november,'2026-11'),{
    cash:4_960_000,cardDebt:40_000,cardCredit:0,netWorth:4_920_000,
    income:0,spent:20_000,refunds:40_000,netExpense:-20_000,
    margin:20_000,cardPayments:0,transfers:0,
  });
  assert.deepEqual(C.summary(november,'2026-11'),{
    spent:20_000,refunds:40_000,income:0,net:-20_000,
    categories:[['Diğer',-20_000]],
  });
  assert.deepEqual(C.summary(november,'2026-10'),C.summary(october,'2026-10'));
  assert.equal(C.cardStatus(november,'card',{asOf:'2026-11-30'}).current,40_000);
});

test('0.4.0 golden: JSON round-trip preserves identifiers, edits, unknown fields and all financial figures',()=>{
  const {november} = referenceWallets();
  const original = structuredClone(november);
  original.legacyExtension = {opaque:'sentetik-geriye-uyumluluk'};
  original.transactions.find(t=>t.id==='purchase').category = 'Giyim';
  original.transactions.find(t=>t.id==='purchase').note = 'Kullanıcı düzenlemesi';
  const prior = structuredClone(original);
  const restored = W.normalizeWallet(C.reviewLegacy(C.readBackup(C.backupText(original))));
  assert.deepEqual(restored,prior);
  assert.deepEqual(original,prior);
  assert.deepEqual(balances(restored),{bank:4_815_000,cash:145_000,card:40_000});
  assert.equal(figures(restored,'2026-11').netWorth,4_920_000);
  assert.equal(C.summary(restored,'2026-10').net,200_000);
});

test('0.4.0 golden: rejected JSON variants cannot mutate the accepted in-memory wallet',()=>{
  const {november} = referenceWallets();
  const baseline = C.backupText(november);
  const changes = [
    s => {s.version = 2;},
    s => {s.transactions[0].account = 'missing-account';},
    s => {s.transactions.push({...s.transactions[0],desc:'Çakışan kimlik'});},
    s => {s.transactions[0].amount = 1.5;},
    s => {s.transactions.find(t=>t.id==='transfer').target = 'missing-account';},
    s => {s.transactions[0].date = '2026-02-30';},
  ];
  for (const corrupt of changes) {
    const candidate = structuredClone(november);
    corrupt(candidate);
    assert.throws(()=>C.readBackup(JSON.stringify(candidate)));
    assert.equal(C.backupText(november),baseline);
  }
  assert.throws(()=>C.readBackup('{truncated'),SyntaxError);
  assert.equal(C.backupText(november),baseline);
});

test('0.4.0 golden: three installments preserve exact cents and month-end dates',()=>{
  const state = C.addInstallmentPlan(base(),tx('plan','card','expense','2026-01-31',10_000),3);
  assert.deepEqual(state.transactions.map(t=>[t.date,t.amount,t.installment]),[
    ['2026-01-31',3333,'1/3'],
    ['2026-02-28',3333,'2/3'],
    ['2026-03-31',3334,'3/3'],
  ]);
  assert.deepEqual(['2026-01','2026-02','2026-03'].map(month=>C.summary(state,month).net),[3333,3333,3334]);
  assert.deepEqual(C.readBackup(C.backupText(state)),state);
});
