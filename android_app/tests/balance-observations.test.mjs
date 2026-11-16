import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as C from '../app/src/main/assets/core.mjs';
import * as W from '../app/src/main/assets/wallet.mjs';

const created = '2026-11-14T20:00:00.000Z';
const edited = '2026-11-16T09:00:00.000Z';
const value = {
  accountId:'synthetic-bank', observedDate:'2026-11-14',
  observedAmountCents:-12345, sourceKind:'manualBank',
};
const legacyRaw = readFileSync(new URL('./fixtures/android-0.2.0.json',import.meta.url),'utf8');
const legacy = () => C.readBackup(legacyRaw);
const add = (state, changes={}) => C.addBalanceObservation(state,{...value,...changes},{now:created});
const observations = state => state.balanceReconciliation.observations;

test('v1 import and ordinary v1 writes keep their original format and foreign fields', () => {
  const old = legacy();
  assert.equal(old.version,1);
  assert.equal(Object.hasOwn(old,'balanceReconciliation'),false);
  assert.equal(JSON.parse(C.backupText(W.normalizeWallet(old))).version,1);
  const extra = {...old,balanceReconciliation:{foreign:true}};
  assert.deepEqual(C.readBackup(C.backupText(extra)).balanceReconciliation,{foreign:true});
  assert.throws(()=>add(extra),/balanceReconciliation/);
});

test('creation keeps separate anchor and observation roles and same-date observations have distinct IDs', () => {
  const old = legacy();
  const a = add(old,{role:'anchor',sourceKind:'bankDocument',observedDate:'2026-11-01'});
  const b = add(add(a));
  assert.equal(a.version,2);
  assert.equal(observations(a).length,1);
  assert.deepEqual(observations(b).map(x=>x.role),['anchor','observation','observation']);
  assert.equal(new Set(observations(b).map(x=>x.id)).size,3);
  assert.equal(observations(b)[1].observedDate,observations(b)[2].observedDate);
  assert.equal(observations(b)[0].createdAt,created);
  assert.equal(observations(b)[0].updatedAt,created);
  assert.equal(old.version,1);
});

test('safe cents at both bounds and HTML-like notes round-trip as inert data', () => {
  const note = '<img src=x onerror="throw Error(1)"> & veri';
  const s = add(add(legacy(),{observedAmountCents:Number.MAX_SAFE_INTEGER,note}),{observedAmountCents:-Number.MAX_SAFE_INTEGER});
  const raw = C.backupText(W.normalizeWallet(s));
  const restored = C.readBackup(raw);
  assert.equal(observations(restored)[0].note,note);
  assert.deepEqual(observations(restored).map(x=>x.observedAmountCents),[9007199254740991,-9007199254740991]);
  assert.deepEqual(C.readBackup(C.backupText(restored)),restored);
});

test('rejects nonexistent and wrong-type accounts, inconsistent source, calendar and numeric errors', () => {
  const old = legacy();
  const cash = {...old,accounts:[...old.accounts,{id:'cash',name:'Sentetik nakit',type:'cash',opening:0}]};
  assert.equal(observations(add(cash,{accountId:'cash',sourceKind:'cashCount'}))[0].accountId,'cash');
  for(const change of [
    {accountId:'missing'}, {accountId:'synthetic-card'}, {sourceKind:'cashCount'},
    {observedDate:'2026-02-29'}, {observedDate:'2026-11-14T00:00:00Z'},
    {observedAmountCents:0.1}, {observedAmountCents:9007199254740992},
    {observedAmountCents:'100'}, {role:'verified'}, {note:3}, {note:'x'.repeat(2001)},
  ]) assert.throws(()=>add(old,change),Error,JSON.stringify(change));
  assert.throws(()=>C.addBalanceObservation(old,value,{now:'yesterday'}),/zaman/i);
  assert.equal(old.version,1);
});

test('edit keeps ID, account, role and creation time, and delete retains v2 protection', () => {
  const s = add(legacy(),{note:'old'});
  const row = observations(s)[0];
  const changed = C.updateBalanceObservation(s,row.id,{observedDate:'2026-11-15',observedAmountCents:82,note:''},{now:edited});
  assert.deepEqual(observations(changed)[0],{...row,observedDate:'2026-11-15',observedAmountCents:82,note:'',updatedAt:edited});
  assert.deepEqual(observations(s)[0],row);
  assert.throws(()=>C.updateBalanceObservation(s,row.id,{role:'anchor'},{now:edited}),Error);
  assert.throws(()=>C.updateBalanceObservation(s,row.id,{accountId:'other'},{now:edited}),Error);
  assert.throws(()=>C.updateBalanceObservation(changed,row.id,{note:'stale'},{now:created}),/zaman/i);
  assert.throws(()=>C.removeBalanceObservation(changed,'unknown'),Error);
  const removed = C.removeBalanceObservation(changed,row.id);
  assert.deepEqual(observations(removed),[]);
  assert.equal(removed.version,2);
  assert.equal(observations(changed).length,1);
});

test('restore rejects malformed observation data and orphaned, duplicate or retyped account records', () => {
  const state = add(legacy());
  const original = C.backupText(state);
  const invalid = [
    s=>{s.version=3;},
    s=>{delete s.balanceReconciliation;},
    s=>{s.balanceReconciliation.observations={};},
    s=>{observations(s).push({...observations(s)[0]});},
    s=>{observations(s)[0].updatedAt='2020-01-01T00:00:00.000Z';},
    s=>{observations(s)[0].observedAmountCents=9007199254740992;},
    s=>{s.accounts=s.accounts.filter(a=>a.id!==value.accountId);},
    s=>{s.accounts.find(a=>a.id===value.accountId).type='card';},
  ];
  for(const mutate of invalid){
    const bad = JSON.parse(original);
    mutate(bad);
    assert.throws(()=>C.readBackup(JSON.stringify(bad)),Error);
  }
  assert.throws(()=>C.readBackup('{bad-json'),SyntaxError);
  assert.equal(C.backupText(state),original);
});

test('observations and their removal never change accounting results or transactions', () => {
  const old = legacy();
  const anchor={accountId:'synthetic-bank',date:'2026-10-01',amountCents:100000};
  const read = s => ({
    accounts:s.accounts,transactions:s.transactions,
    current:s.accounts.map(a=>C.balance(s,a)),
    at:C.balanceAt(s,'synthetic-bank','2026-10-31',{anchor}),
    card:C.cardStatus(s,'synthetic-card'),
    figures:W.overview(s,'2026-10'),
  });
  const next = add(old);
  assert.deepEqual(read(next),read(old));
  assert.deepEqual(read(C.removeBalanceObservation(next,observations(next)[0].id)),read(old));
});

test('ordinary wallet edits and normalization preserve observations in the saved backup', () => {
  const next = add(legacy());
  const changed = C.addTransaction(next,{
    account:'synthetic-bank', date:'2026-11-15', kind:'expense',
    amount:123, desc:'Sentetik harcama', category:'Diğer',
  });
  const reopened = C.readBackup(C.backupText(W.normalizeWallet(C.reviewLegacy(changed))));
  assert.equal(reopened.version,2);
  assert.deepEqual(observations(reopened),observations(next));
  assert.equal(reopened.transactions.length,next.transactions.length+1);
});
