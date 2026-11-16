import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as C from '../app/src/main/assets/core.mjs';
import {parseStatement} from '../app/src/main/assets/parser.mjs';
import {parseStatementCsv} from '../app/src/main/assets/csv.mjs';
import * as R from '../app/src/main/assets/balance-reconciliation.mjs';

const closing = {boundary:'end-of-day', timeZone:'Europe/Istanbul'};
const now = '2026-11-16T09:00:00.000Z';
const anchorDate = '2026-11-01', observedDate = '2026-11-15';
const bank = {id:'bank',name:'Sentetik banka',type:'bank',opening:123456};
const otherBank = {id:'other-bank',name:'Sentetik ikinci banka',type:'bank',opening:0};
const cash = {id:'cash',name:'Sentetik nakit',type:'cash',opening:0};
const card = {id:'card',name:'Sentetik kart',type:'card',opening:0};

const wallet = () => ({...C.empty(),accounts:[bank,otherBank,cash,card]});
const add = (state, data) => C.addBalanceObservation(state, {
  accountId:'bank', observedDate, observedAmountCents:795000, sourceKind:'bankDocument', ...data,
}, {now});
const movement = (state, id, changes={}) => C.addTransaction(state,{
  id, account:'bank', date:'2026-11-10', kind:'expense', amount:200000,
  desc:'Sentetik işlem', category:'Diğer', ...changes,
});
const records = state => state.balanceReconciliation.observations;
function fixture({state=wallet(), accountId='bank', anchorAmount=1000000, observedAmount=795000}={}){
  const info = {accountId,sourceKind:accountId==='cash'?'cashCount':'bankDocument'};
  state = add(add(state,{...info,role:'anchor',observedDate:anchorDate,observedAmountCents:anchorAmount}),{
    ...info,observedAmountCents:observedAmount,
  });
  const [anchor,observation] = records(state);
  const options = {anchorId:anchor.id,observationClosing:closing,anchorReview:{
    anchorId:anchor.id, accountId, date:anchor.observedDate, amountCents:anchor.observedAmountCents,
    sourceKind:info.sourceKind, sourceRef:'synthetic-opening', closing,
  }};
  return {state,options,anchor,observation,compare:(changes={},current=state)=>
    R.compareBalanceObservation(current,observation.id,{...options,...changes})};
}
const review = (rows=[],changes={}) => ({
  accountId:'bank', fromExclusive:anchorDate, throughInclusive:observedDate, closing,
  sourceKind:'bankStatement', sourceRef:'synthetic-statement', complete:true, rows, ...changes,
});
const sourceRow = (movementId, effectCents, date='2026-11-10', sourceRowId='source-'+movementId) =>
  ({movementId, effectCents, date, sourceRowId});

test('compares the exact account window and reports a negative difference without independent rows', () => {
  let state = movement(wallet(),'at-anchor',{date:anchorDate, amount:70000});
  state = movement(state,'before-anchor',{date:'2026-10-31', amount:9000});
  state = movement(state,'at-target',{date:observedDate});
  state = movement(state,'after-target',{date:'2026-11-16', amount:30000});
  const result = fixture({state}).compare();
  assert.equal(result.status,'calculated');
  assert.equal(result.calculatedCents,800000);
  assert.equal(result.observedCents,795000);
  assert.equal(result.differenceCents,-5000);
  assert.deepEqual(result.coverage,{status:'unverified',reason:'missing-source-review'});
  assert.deepEqual(result.evidence.movements.map(row=>row.id),['at-target']);
});

test('zero and positive differences keep their signs and a source review is a separate result', () => {
  const state = movement(wallet(),'expense');
  const coverageReview = review([sourceRow('expense',-200000)]);
  const zero = fixture({state,observedAmount:800000});
  assert.equal(zero.compare().differenceCents,0);
  assert.equal(zero.compare().coverage.status,'unverified');
  assert.equal(zero.compare({coverageReview}).coverage.status,'source-supported');
  const positive = fixture({state,observedAmount:800001}).compare({coverageReview});
  assert.equal(positive.differenceCents,1);
  assert.equal(positive.coverage.status,'source-supported');
  assert.equal(positive.evidence.differenceCents,'1');
});

test('an empty reviewed interval needs explicit source coverage even when the difference is zero', () => {
  const f = fixture({observedAmount:1000000});
  assert.equal(f.compare().coverage.status,'unverified');
  assert.equal(f.compare({coverageReview:review([], {complete:false})}).coverage.status,'insufficient');
  assert.equal(f.compare({coverageReview:review()}).coverage.status,'source-supported');
});

test('incomplete range, false matches, duplicates and offsetting source rows cannot support a zero difference', () => {
  const f = fixture({state:movement(wallet(),'expense'),observedAmount:800000});
  const correct = sourceRow('expense',-200000);
  const wrongCases = [
    review([correct],{fromExclusive:'2026-11-02'}),
    review([correct],{throughInclusive:'2026-11-14'}),
    review([correct],{accountId:'cash'}),
    review([correct],{sourceRef:''}),
    review([correct],{complete:false}),
    review([correct],{closing:{...closing,timeZone:'UTC'}}),
    review([{...correct,date:'2026-11-09'}]),
    review([{...correct,effectCents:-199999}]),
    review([correct,correct]),
    review([correct,sourceRow('missing-rebate',4000),sourceRow('missing-cost',-4000)]),
    review([]),
  ];
  for(const coverageReview of wrongCases){
    const result = f.compare({coverageReview});
    assert.equal(result.differenceCents,0);
    assert.equal(result.coverage.status,'insufficient');
  }
});

test('selection is explicit with several anchors and rejects self, same or later day and cross-account pairs', () => {
  const f = fixture();
  let state = add(f.state,{role:'anchor',observedDate:anchorDate,observedAmountCents:600000});
  const selected = records(state).at(-1);
  assert.equal(f.compare({anchorId:undefined},state).reason,'missing-anchor');
  const bySecond = f.compare({anchorId:selected.id,anchorReview:{
    ...f.options.anchorReview, anchorId:selected.id, amountCents:600000,
  }},state);
  assert.equal(bySecond.calculatedCents,600000);
  assert.equal(f.compare({anchorId:f.observation.id},state).reason,'invalid-anchor');
  for(const data of [
    {observedDate}, {observedDate:'2026-11-16'},
    {accountId:'cash',observedDate:anchorDate,sourceKind:'cashCount'},
  ]){
    state = add(state,{role:'anchor',...data});
    assert.equal(f.compare({anchorId:records(state).at(-1).id},state).reason,'invalid-anchor');
  }
  assert.equal(f.compare({anchorId:'absent'},state).reason,'missing-anchor');
  assert.equal(f.compare({anchorReview:undefined},state).reason,'unconfirmed-anchor');
  assert.equal(f.compare({anchorReview:{...f.options.anchorReview,amountCents:900000}},state).reason,'unconfirmed-anchor');
});

test('intraday, different or invalid closing calendars make a comparison unavailable', () => {
  const f = fixture();
  for(const observationClosing of [
    undefined,
    {boundary:'intraday',timeZone:'Europe/Istanbul'},
    {boundary:'end-of-day',timeZone:'UTC'},
    {boundary:'end-of-day',timeZone:'unknown-zone'},
  ]){
    const result = f.compare({observationClosing});
    assert.equal(result.status,'unavailable');
    assert.equal(result.reason,'closing-mismatch');
    assert.equal(result.differenceCents,undefined);
  }
});

test('a transfer uses a different signed effect on each account and a credit card payment debits once', () => {
  let state = movement(wallet(),'transfer',{kind:'transfer',target:'other-bank',amount:30000});
  state = movement(state,'payment',{kind:'payment',target:'card',amount:50000});
  const from = fixture({state,observedAmount:920000}).compare({coverageReview:review([
    sourceRow('payment',-50000),sourceRow('transfer',-30000),
  ])});
  assert.equal(from.calculatedCents,920000);
  assert.equal(from.coverage.status,'source-supported');
  const to = fixture({state,accountId:'other-bank',anchorAmount:100,observedAmount:30100}).compare({
    coverageReview:review([sourceRow('transfer',30000)],{accountId:'other-bank'}),
  });
  assert.equal(to.calculatedCents,30100);
  assert.equal(to.coverage.status,'source-supported');
  assert.deepEqual(to.evidence.movements.map(row=>row.effectCents),['30000']);
});

test('PDF and CSV matching changes evidence without duplicating the bank debit and reimport preserves evidence', () => {
  const base = movement(wallet(),'pay',{kind:'payment',target:'card',amount:10000});
  const f = fixture({state:base,observedAmount:990000});
  const coverageReview = review([sourceRow('pay',-10000)]);
  const pdf = parseStatement('QNB\nHesap Kesim Tarihi: 30/11/2026\n09/11/2026 ODEME 100.00');
  const {state} = f;
  const pending = C.importStatement(state,pdf,'card');
  const pdfRow = pending.transactions.find(row=>row.source==='pdf');
  const unresolved = f.compare({coverageReview},pending);
  assert.equal(unresolved.calculatedCents,990000);
  assert.deepEqual(unresolved.coverage,{status:'insufficient',reason:'pending-match'});
  const linkedPdf = C.resolveCandidate(pending,pdfRow.id,'link','pay');
  const csv = parseStatementCsv('period,date,desc,amount_cents,category,tur,bank,kart\n2026-11,2026-11-09,ODEME,10000,Kart ödemesi,odeme,QNB,Sentetik\n');
  const withCsv = C.importCsv(linkedPdf,csv,'card');
  const csvRow = withCsv.transactions.find(row=>row.source==='csv');
  const linked = C.resolveCandidate(withCsv,csvRow.id,'link','pay');
  const linkedResult = f.compare({coverageReview},linked);
  assert.equal(linkedResult.calculatedCents,990000);
  assert.equal(linkedResult.coverage.status,'source-supported');
  assert.equal(linkedResult.evidence.movements.filter(row=>row.included).length,1);
  assert.equal(linkedResult.evidence.movements.length,3);
  assert.notDeepEqual(linkedResult.evidence,f.compare({coverageReview}).evidence);
  assert.deepEqual(f.compare({coverageReview},C.importCsv(C.importStatement(linked,pdf,'card'),csv,'card')).evidence,linkedResult.evidence);
});

test('refund credits exact cents on its movement date and can leave a negative cash balance', () => {
  let state = movement(wallet(),'cash-cost',{account:'cash',amount:300});
  state = movement(state,'cash-refund',{account:'cash',kind:'refund',date:observedDate,amount:20});
  const result = fixture({state,accountId:'cash',anchorAmount:100,observedAmount:-181}).compare({
    coverageReview:review([sourceRow('cash-cost',-300),sourceRow('cash-refund',20,observedDate)],{
      accountId:'cash',sourceKind:'cashJournal',
    }),
  });
  assert.equal(result.calculatedCents,-180);
  assert.equal(result.differenceCents,-1);
  assert.equal(result.coverage.status,'source-supported');
});

test('changes within the interval alter the canonical evidence even when the total stays the same', () => {
  const f = fixture({state:movement(wallet(),'expense'),observedAmount:800000});
  const reviewForOld = review([sourceRow('expense',-200000)]);
  const original = f.compare({coverageReview:reviewForOld});
  const oldRow = f.state.transactions[0];
  const edited = C.updateTransaction(f.state,{...oldRow,amount:150000});
  const dropped = C.removeTransaction(f.state,'expense');
  const backdated = movement(f.state,'past',{date:'2026-11-03',amount:1});
  const offset = movement(movement(f.state,'new-refund',{kind:'refund',amount:30}),'new-cost',{amount:30});
  for(const [state, cents] of [[edited,850000],[dropped,1000000],[backdated,799999],[offset,800000]]){
    const compared = f.compare({coverageReview:reviewForOld},state);
    assert.equal(compared.calculatedCents,cents);
    assert.equal(compared.coverage.status,'insufficient');
    assert.notDeepEqual(compared.evidence,original.evidence);
  }
});

test('canonical evidence ignores insertion order, unrelated accounts, out-of-range dates and labels', () => {
  let state = movement(wallet(),'z',{amount:123, note:'Özel not'});
  state = movement(state,'a',{kind:'refund',amount:50});
  const f = fixture({state});
  const source = [sourceRow('z',-123),sourceRow('a',50)];
  const before = f.compare({coverageReview:review(source)}).evidence;
  let copy = movement(f.state,'outside',{date:'2026-11-16'});
  copy = movement(copy,'other',{account:'cash',amount:123});
  copy = C.updateTransaction(copy,{...copy.transactions.find(r=>r.id==='z'),note:'Başka not',category:'Fatura / İnternet'});
  copy.transactions.reverse();
  const after = f.compare({coverageReview:review([...source].reverse())},copy).evidence;
  assert.equal(JSON.stringify(before),JSON.stringify(after));
  assert.deepEqual(after.movements.map(row=>row.id),['a','z']);
  assert.equal(JSON.stringify(after).includes('Başka not'),false);
  assert.equal(after.version,1);
});

test('large differences and totals stay bigint and the versioned evidence remains JSON-safe', () => {
  const max = Number.MAX_SAFE_INTEGER;
  const state = movement(wallet(),'deposit',{kind:'income',amount:5});
  const result = fixture({state,anchorAmount:max,observedAmount:-max}).compare();
  assert.equal(result.calculatedCents,9007199254740996n);
  assert.equal(result.differenceCents,-18014398509481987n);
  assert.equal(JSON.parse(JSON.stringify(result.evidence)).differenceCents,'-18014398509481987');
});

test('a legacy backup remains v1 and a v2 comparison changes neither the in-memory wallet nor backup', () => {
  const text = readFileSync(new URL('./fixtures/android-0.1.0.json',import.meta.url),'utf8');
  const v1 = C.readBackup(text);
  const previous = C.backupText(v1);
  assert.equal(R.compareBalanceObservation(v1,'missing').reason,'missing-observation');
  assert.equal(C.backupText(v1),previous);
  assert.equal(JSON.parse(previous).version,1);
  const f = fixture({state:movement(wallet(),'expense')});
  const before = C.backupText(f.state);
  const restored = C.readBackup(before);
  const result = f.compare({coverageReview:review([sourceRow('expense',-200000)])},restored);
  assert.equal(result.coverage.status,'source-supported');
  assert.equal(C.backupText(restored),before);
  assert.deepEqual(restored,f.state);
  assert.equal(Object.hasOwn(restored.balanceReconciliation,'evidence'),false);
});

test('legacy optional transaction fields can round-trip without embedding foreign objects in evidence', () => {
  const f = fixture({state:movement(wallet(),'legacy-extra')});
  const state = {...f.state,transactions:[{
    ...f.state.transactions[0],source:{foreign:'private raw value'},target:{foreign:true},
    matchCandidates:{foreign:true},
  }]};
  const raw = C.backupText(state);
  const restored = C.readBackup(raw);
  const result = f.compare({},restored);
  assert.equal(result.calculatedCents,800000);
  assert.equal(result.evidence.movements[0].source,'unknown');
  assert.equal(result.evidence.movements[0].targetId,null);
  assert.deepEqual(result.evidence.movements[0].matchCandidates,[]);
  assert.equal(JSON.stringify(result.evidence).includes('private raw value'),false);
  assert.equal(C.backupText(restored),raw);
});

test('previous evidence requires review after a transfer destination changes even when source rows still match', () => {
  const f = fixture({state:movement(wallet(),'transfer',{kind:'transfer',target:'other-bank',amount:30000})});
  const options = {...f.options,coverageReview:review([sourceRow('transfer',-30000)])};
  const previous = f.compare(options).evidence;
  const evaluate = (state=f.state,evidence=previous) =>
    R.evaluateBalanceComparisonEvidence(state,f.observation.id,evidence,options);
  assert.equal(evaluate().status,'current');
  const changed = C.updateTransaction(f.state,{...f.state.transactions[0],target:'cash'});
  const impression = f.compare(options,changed);
  assert.equal(impression.calculatedCents,970000);
  assert.equal(impression.coverage.status,'source-supported');
  assert.equal(evaluate(changed).status,'review-required');
  assert.equal(evaluate(changed).reason,'comparison-changed');
  assert.equal(evaluate(f.state,{...previous,version:50}).reason,'unsupported-evidence');
  assert.equal(evaluate(f.state,f.compare().evidence).reason,'insufficient-previous-coverage');
});
