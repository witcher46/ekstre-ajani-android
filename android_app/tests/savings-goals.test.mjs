import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as C from '../app/src/main/assets/core.mjs';
import {overview} from '../app/src/main/assets/wallet.mjs';
import {advancedReports} from '../app/src/main/assets/reports.mjs';

const initial = () => ({...C.empty(), accounts:[
  {id:'bank', name:'Banka', type:'bank', opening:100_000},
  {id:'other', name:'Diğer banka', type:'bank', opening:50_000},
  {id:'card', name:'Kart', type:'card', opening:0},
]});
const goal = (id, account, reserved) => ({id, name:id, account, target:200_000, due:'2026-12-31', reserved});

test('manual allocations warn about aggregate reservations on each account only', () => {
  const original = initial();
  assert.equal(typeof C.saveSavingsGoal, 'function');
  let wallet = C.saveSavingsGoal(original, goal('First', 'bank', 60_000));
  wallet = C.saveSavingsGoal(wallet, goal('Second', 'bank', 50_000));
  wallet = C.saveSavingsGoal(wallet, goal('Other', 'other', 50_000));
  assert.deepEqual(C.savingsGoalWarnings(wallet).map(({account, excess}) => [account.id, excess]), [['bank', 10_000]]);
  wallet = C.saveSavingsGoal(wallet, goal('Second', 'bank', 40_000));
  assert.deepEqual(C.savingsGoalWarnings(wallet), []);
  assert.deepEqual(overview(wallet, '2026-11'), overview(original, '2026-11'));
  assert.deepEqual(advancedReports(wallet, '2026-11'), advancedReports(original, '2026-11'));
  assert.deepEqual(wallet.transactions, []);
});

test('first goal creates v5, retaining splits, and the v5 boundary is sticky', () => {
  const original = initial();
  const split = C.addTransaction(original, {
    id:'purchase', account:'card', date:'2026-11-01', period:'2026-11',
    desc:'Synthetic', amount:1000, kind:'expense', category:original.categories[0],
  }, {allocations:[{category:original.categories[0], amount:600}, {category:original.categories[1], amount:400}]});
  const saved = C.saveSavingsGoal(split, goal('First', 'bank', 0));
  const restored = C.readBackup(C.backupText(saved));
  assert.equal(split.version, 4);
  assert.equal(saved.version, 5);
  assert.deepEqual(restored.savingsGoals, [goal('First', 'bank', 0)]);
  assert.deepEqual(overview(restored, '2026-11'), overview(split, '2026-11'));
  assert.deepEqual(advancedReports(restored, '2026-11'), advancedReports(split, '2026-11'));
  assert.equal(C.readBackup(C.backupText(split)).version, 4);
  assert.deepEqual(C.allocationsFor(restored, restored.transactions[0]), split.expenseAllocations.purchase);
  assert.equal(C.removeSavingsGoal(restored, 'First').version, 5);
  assert.throws(() => C.readBackup(JSON.stringify({...saved, version:6})), /sürümü desteklenmiyor/);
  assert.throws(() => C.readBackup(JSON.stringify({...saved, savingsGoals:[saved.savingsGoals[0], saved.savingsGoals[0]]})), /hedef/i);
  const edited = C.updateTransaction(restored, restored.transactions[0], {allocations:null});
  assert.deepEqual(edited.expenseAllocations, {});
  assert.deepEqual(edited.savingsGoals, restored.savingsGoals);
});

test('rejects invalid goals and preserves legacy data at reserved names', () => {
  const original = initial();
  for (const change of [{account:'card'}, {account:'missing'}, {target:0}, {reserved:-1}, {reserved:1.5}, {due:'2026-02-30'}, {name:'   '}]) {
    assert.throws(() => C.saveSavingsGoal(original, {...goal('First', 'bank', 0), ...change}), /hedef/i);
  }
  const legacy = {...original, savingsGoals:{opaque:true}};
  assert.deepEqual(C.validate(legacy).savingsGoals, {opaque:true});
  assert.throws(() => C.saveSavingsGoal(legacy, goal('First', 'bank', 0)), /hedef/i);
});
