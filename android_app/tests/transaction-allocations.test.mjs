import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as C from '../app/src/main/assets/core.mjs';
import {overview} from '../app/src/main/assets/wallet.mjs';
import {advancedReports, reportRows} from '../app/src/main/assets/reports.mjs';

const card = {id:'card', name:'Synthetic card', type:'card', opening:0};
const base = () => ({...C.empty(), accounts:[card], categories:['Food','Travel','Other']});
const expense = {
  id:'purchase', account:'card', date:'2026-10-07', period:'2026-10',
  desc:'Synthetic purchase', amount:100_000, kind:'expense', category:'Other',
};
const allocations = [
  {category:'Food', amount:60_000},
  {category:'Travel', amount:40_000},
];

test('splitting one purchase changes only the category view of its 100000 kurus', () => {
  const wallet = C.addTransaction(base(), expense, {allocations});
  assert.equal(wallet.version, 4);
  assert.deepEqual(wallet.transactions.map(({id, amount, account}) => ({id, amount, account})), [
    {id:'purchase', amount:100_000, account:'card'},
  ]);
  assert.deepEqual(C.summary(wallet, '2026-10').categories, [['Food', 60_000], ['Travel', 40_000]]);
  const figures = overview(wallet, '2026-10');
  assert.equal(figures.cardDebt, 100_000);
  assert.equal(figures.netExpense, 100_000);
  assert.deepEqual(figures.categories, [['Food', 60_000], ['Travel', 40_000]]);
  const report = advancedReports(wallet, '2026-10', {months:1, accountId:'card'});
  assert.deepEqual(report.categories.map(({name, net}) => [name, net]), figures.categories);
  assert.deepEqual(reportRows(wallet, ['2026-10'], {category:'Food'}).map(({id, amount}) => [id, amount]), [['purchase', 60_000]]);
  assert.equal(reportRows(wallet, ['2026-10'])[0].amount, 100_000);
});

test('invalid splits and duplicate parent writes are rejected without mutating the wallet', () => {
  const wallet = base();
  for (const invalid of [
    [], [allocations[0]], [allocations[0], {category:'Travel', amount:39_999}],
    [{category:'Food', amount:100_000}, {category:'Travel', amount:0}],
    [{category:'Food', amount:100_001}, {category:'Travel', amount:-1}],
    [{category:'Food', amount:60_000.5}, {category:'Travel', amount:39_999.5}],
    [allocations[0], {category:'Unknown', amount:40_000}],
  ]) {
    assert.throws(() => C.addTransaction(wallet, expense, {allocations:invalid}), /bölüm/i);
    assert.deepEqual(wallet.transactions, []);
    assert.equal(wallet.version, 1);
  }
  const saved = C.addTransaction(wallet, expense, {allocations});
  assert.throws(() => C.addTransaction(saved, expense, {allocations}));
  assert.deepEqual(saved.transactions.map(row => row.id), [expense.id]);
});

test('rename, edit and remove allocations without relabeling or reposting the parent', () => {
  let wallet = C.addTransaction(base(), expense, {allocations});
  const parent = wallet.transactions[0];
  wallet = C.renameExpenseCategory(wallet, 'Food', 'Groceries');
  assert.deepEqual(C.summary(wallet, '2026-10').categories, [['Groceries', 60_000], ['Travel', 40_000]]);
  assert.throws(() => C.removeExpenseCategory(wallet, 'Groceries'), /bölüm/i);
  wallet = C.updateTransaction(wallet, parent, {allocations:[
    {category:'Travel', amount:25_000}, {category:'Other', amount:75_000},
  ]});
  assert.deepEqual(wallet.transactions, [parent]);
  wallet = C.removeExpenseCategory(wallet, 'Groceries');
  assert.throws(() => C.updateTransaction(wallet, {...parent, amount:200_000}, {allocations:null}), /bölüm/i);
  assert.throws(() => C.updateTransaction(wallet, {...parent, source:'pdf'}, {allocations:null}), /bölüm/i);
  wallet = C.updateTransaction(wallet, parent, {allocations:null});
  assert.equal(wallet.version, 4);
  assert.deepEqual(C.summary(wallet, '2026-10').categories, [['Other', 100_000]]);
  assert.deepEqual(wallet.transactions, [parent]);
  assert.deepEqual(C.removeTransaction(C.addTransaction(base(), expense, {allocations}), expense.id).expenseAllocations, {});
});

test('source, installment, non-expense and unresolved review exclusions are enforced', () => {
  for (const extra of [
    {source:'pdf', statement:'statement'}, {source:'csv', csvKey:'csv'},
    {kind:'refund'}, {kind:'transfer', target:'bank'}, {kind:'cardPayment'},
    {installment:'1/2'}, {installmentPlan:'plan'}, {subscriptionId:'subscription'},
    {currency:'USD'},
  ]) {
    assert.throws(() => C.addTransaction(base(), {...expense, ...extra}, {allocations}));
  }
  const excluded = {...expense, source:'csv', csvKey:'csv'};
  const split = C.addTransaction(base(), expense, {allocations});
  const review = C.importCsv(split, [{date:expense.date, period:expense.period, desc:expense.desc, cents:-expense.amount, kind:'harcama', category:'Other'}], 'card');
  const imported = review.transactions.find(row => row.source==='csv');
  assert.equal(imported.matchStatus, 'pending');
  assert.throws(() => C.resolveCandidate(review, imported.id, 'link', expense.id), /bölüm/i);
  const pending = C.addTransaction(C.addTransaction(base(), {...excluded, id:'import'}), expense);
  const parent = pending.transactions.find(row => row.id===expense.id);
  assert.equal(parent.matchStatus, 'pending');
  assert.throws(() => C.updateTransaction(pending, parent, {allocations}), /bölüm/i);
  const unsplit = C.updateTransaction(review, review.transactions[0], {allocations:null});
  const linked = C.resolveCandidate(unsplit, imported.id, 'link', expense.id);
  assert.throws(() => C.updateTransaction(linked, linked.transactions.find(row=>row.id===expense.id), {allocations}), /bölüm/i);
});

test('v1-v3 retain their stored version and migrate only on a first split', () => {
  for (const version of [1, 2, 3]) {
    const wallet = {...base(), version};
    if (version>=2) wallet.balanceReconciliation = {observations:[]};
    if (version===3) wallet.balanceReconciliation.approvals = [];
    const read = C.readBackup(C.backupText(wallet));
    assert.deepEqual(read, wallet);
    assert.equal(C.addTransaction(read, expense).version, version);
    const upgraded = C.addTransaction(read, expense, {allocations});
    assert.equal(upgraded.version, 4);
    assert.deepEqual(C.readBackup(C.backupText(upgraded)), upgraded);
    assert.deepEqual(upgraded.balanceReconciliation, {observations:[], approvals:[]});
    const invalid = structuredClone(upgraded);
    delete invalid.expenseAllocations[expense.id];
    invalid.expenseAllocations.missing = allocations;
    assert.throws(() => C.readBackup(JSON.stringify(invalid)), /bölüm/i);
  }
});

test('shared category totals combine split and ordinary expenses and refunds once', () => {
  const wallet = C.addTransaction(base(), expense, {allocations:[
    {category:'Food', amount:50_000}, {category:'Food', amount:10_000}, allocations[1],
  ]});
  const withSpend = C.addTransaction(wallet, {...expense, id:'other-purchase', amount:25_000, category:'Food'});
  const mixed = C.addTransaction(withSpend, {...expense, id:'refund', kind:'refund', amount:5_000, category:'Food'});
  const figures = overview(mixed, '2026-10');
  assert.equal(figures.spent,125_000);
  assert.equal(figures.netExpense,120_000);
  assert.deepEqual(C.summary(mixed, '2026-10').categories,[['Food',80_000],['Travel',40_000]]);
  assert.deepEqual(figures.categories,[['Food',80_000],['Travel',40_000]]);
  assert.deepEqual(reportRows(mixed, ['2026-10'], {category:'Food'}).map(({id, amount}) => [id, amount]), [
    ['purchase',60_000],['other-purchase',25_000],['refund',5_000],
  ]);
  const edited = C.updateTransaction(mixed, mixed.transactions[0], {allocations});
  assert.deepEqual(edited.transactions,mixed.transactions);
});

test('reserved legacy fields are carried through reads and rule out conflicting promotion', () => {
  for (const wallet of [
    {...base(), expenseAllocations:{old:'unknown'}},
    {...base(), balanceReconciliation:{old:'unknown'}},
    {...base(), version:2, balanceReconciliation:{observations:[], approvals:['reserved']}},
  ]) {
    const original = C.readBackup(C.backupText(wallet));
    assert.deepEqual(original, wallet);
    assert.throws(() => C.addTransaction(original, expense, {allocations}), /bölüm/i);
    assert.deepEqual(original, wallet);
  }
});
