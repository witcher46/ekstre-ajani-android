import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/src/main/assets/core.mjs';
import * as W from '../app/src/main/assets/wallet.mjs';

const statement = {id:'statement', account:'card', bank:'Synthetic', period:'2026-11',
  cut:'2026-11-10', due:null, debt:null};
const wallet = transactions => ({...C.empty(), transactions, statements:[statement], accounts:[
  {id:'card', name:'Synthetic card', type:'card', opening:0},
  {id:'other', name:'Other card', type:'card', opening:0},
  {id:'bank', name:'Synthetic bank', type:'bank', opening:100_000},
]});
const row = (id, date, fields={}) => ({
  id, date, period:date.slice(0,7), kind:'expense', account:'card', amount:4_000,
  desc:id, category:'Synthetic category', ...fields,
});
const reopen = state => W.normalizeWallet(C.reviewLegacy(C.readBackup(C.backupText(state))));

test('reopening history preserves payment-window candidates, alias blockers and ledger order', () => {
  const bank = (id, day, fields={}) => row(id, '2026-11-'+day,
    {kind:'payment', account:'bank', target:'card', ...fields});
  const pdf = (id, day, fields={}) => row(id, '2026-11-'+day,
    {kind:'cardPayment', statement:statement.id, importKey:id, ...fields});
  const rows = [
    bank('four-days-away', '06'),
    bank('three-days-away', '05'),
    bank('same-day', '02'),
    bank('linked-bank', '08'),
    bank('manual-distinct', '02', {matchStatus:'distinct'}),
    pdf('linked-pdf', '05', {linkedTo:'linked-bank', matchStatus:'linked'}),
    pdf('sibling-pdf', '08'),
    row('legacy-csv', '2026-11-02', {kind:'cardPayment', csvKey:'legacy-payment'}),
  ];
  for (const order of [rows, [...rows].reverse()]) {
    const projected = reopen(wallet(order));
    const find = id => projected.transactions.find(t=>t.id===id);
    const ordered = ids => order.map(t=>t.id).filter(id=>ids.includes(id));
    assert.deepEqual(projected.transactions.map(t=>t.id), order.map(t=>t.id));
    // The linked bank date is outside the window, but its PDF alias is exactly three days away.
    assert.deepEqual(find('legacy-csv').matchCandidates,
      ordered(['three-days-away','same-day','linked-bank']));
    // The same statement already occupies the linked bank row's PDF slot.
    assert.deepEqual(find('sibling-pdf').matchCandidates, ordered(['four-days-away','three-days-away']));
    assert.equal(find('manual-distinct').matchStatus, 'distinct');
    assert.equal(find('linked-pdf').importKey, 'linked-pdf');
    assert.equal(find('legacy-csv').csvKey, 'legacy-payment');
    assert.equal(find('legacy-csv').category, 'Synthetic category');

    const linked = reopen(C.resolveCandidate(projected, 'legacy-csv', 'link', 'linked-bank'));
    assert.equal(linked.transactions.find(t=>t.id==='legacy-csv').linkedTo, 'linked-bank');
    const unlinked = reopen(C.resolveCandidate(linked, 'legacy-csv', 'unlink'));
    const reopened = unlinked.transactions.find(t=>t.id==='legacy-csv');
    assert.deepEqual([reopened.matchStatus, reopened.previousLinkedTo, reopened.matchCandidates],
      ['pending', 'linked-bank', ['linked-bank']]);
  }
});

test('reopening history keeps exact-date expense matches and uses the statement installment month', () => {
  const rows = [
    row('same-first', '2026-11-02'),
    row('near', '2026-11-03'),
    row('other-card', '2026-11-02', {account:'other'}),
    row('refund', '2026-11-02', {kind:'refund'}),
    row('other-amount', '2026-11-02', {amount:4_001}),
    row('same-second', '2026-11-02'),
    row('pdf-expense', '2026-11-02', {statement:statement.id, importKey:'expense'}),
    row('plan', '2026-11-28', {installment:'1/2', installmentPlan:'plan'}),
    row('plan-2', '2026-12-28', {installment:'2/2', installmentPlan:'plan'}),
    row('pdf-installment', '2026-10-28',
      {period:statement.period, statement:statement.id, importKey:'installment', installment:'1/2'}),
  ];
  const projected = reopen(wallet(rows));
  assert.deepEqual(projected.transactions.filter(t=>t.matchStatus==='pending')
    .map(t=>[t.id,t.matchCandidates]), [
    ['pdf-expense', ['same-first','same-second']],
    ['pdf-installment', ['plan']],
  ]);
});
