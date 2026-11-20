import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import * as C from '../app/src/main/assets/core.mjs';
import {parseStatement} from '../app/src/main/assets/parser.mjs';
import {parseStatementCsv} from '../app/src/main/assets/csv.mjs';
import {compareBalanceObservation,evaluateBalanceComparisonEvidence} from '../app/src/main/assets/balance-reconciliation.mjs';

const closing = {boundary:'end-of-day',timeZone:'Europe/Istanbul'};
const now = '2026-11-16T09:00:00.000Z';
const bank = {id:'bank',name:'Sentetik banka',type:'bank',opening:0};
const start = '2026-11-01', end = '2026-11-15', date = '2026-11-10';

function fixture(){
  const v1 = {...C.empty(),accounts:[bank]};
  const seed = {accountId:'bank',observedDate:start,observedAmountCents:9007199254740991,sourceKind:'bankDocument'};
  const withAnchor = C.addBalanceObservation(v1,{...seed,role:'anchor'},{now});
  let v2 = C.addBalanceObservation(withAnchor,{...seed,observedDate:end,observedAmountCents:-9007199254740991},{now});
  v2 = movement(v2,'income','income',200);
  v2 = movement(v2,'expense','expense',100);
  const [anchor,observation] = v2.balanceReconciliation.observations;
  const options = {anchorId:anchor.id,observationClosing:closing,anchorReview:{
    anchorId:anchor.id,accountId:'bank',date:start,amountCents:seed.observedAmountCents,
    sourceKind:'bankDocument',sourceType:'bankClosingRecord',sourceRef:'sentetik-kapanış',closing,
  },coverageReview:{
    accountId:'bank',fromExclusive:start,throughInclusive:end,closing,
    sourceKind:'bankStatement',sourceRef:'sentetik-dönem',complete:true,rows:[
      {sourceRowId:'income-source',movementId:'income',date,effectCents:200},
      {sourceRowId:'expense-source',movementId:'expense',date,effectCents:-100},
    ],
  }};
  const comparison = compareBalanceObservation(v2,observation.id,options);
  assert.equal(comparison.coverage.status,'source-supported');
  const approval = {id:'approval-1',approvedAt:now,previousApprovalId:null,...seal(comparison.evidence)};
  const v3 = {...v2,version:3,balanceReconciliation:{...v2.balanceReconciliation,approvals:[approval]}};
  return {v1,v2,v3,approval,observation,anchor,options,comparison};
}
function seal(evidence){
  const evidenceJson = JSON.stringify(evidence);
  return {evidenceJson,evidenceSha256:createHash('sha256').update(evidenceJson).digest('hex')};
}
function movement(state,id,kind,amount){
  return C.addTransaction(state,{id,account:'bank',date,kind,amount,desc:'Sentetik hareket',category:'Diğer'});
}
function replaceApprovals(wallet,approvals){
  return {...wallet,balanceReconciliation:{...wallet.balanceReconciliation,approvals}};
}

test('normal saves preserve v1 and v2 while v3 round-trips the exact historical proof',()=>{
  const {v1,v2,v3,observation,options,comparison} = fixture();
  for(const old of [v1,v2]){
    const backup = C.backupText(old);
    assert.equal(C.backupText(C.readBackup(backup)),backup);
    assert.equal(movement(old,'later','income',50).version,old.version);
  }
  const backup = C.backupText(v3);
  const restored = C.readBackup(backup);
  assert.equal(C.backupText(restored),backup);
  assert.deepEqual(compareBalanceObservation(restored,observation.id,options),comparison);
  assert.equal(C.balance(restored,bank),C.balance(v2,bank));
  assert.equal(comparison.evidence.calculatedCents,'9007199254741091');
  assert.equal(comparison.evidence.differenceCents,'-18014398509482082');
});

test('historical evidence does not require the live observation or movement to remain',()=>{
  const {v3,approval,observation} = fixture();
  const changed = C.removeBalanceObservation(v3,observation.id);
  assert.equal(changed.version,3);
  assert.deepEqual(C.readBackup(C.backupText(changed)).balanceReconciliation.approvals,[approval]);
  const emptyHistory = replaceApprovals(changed,[]);
  assert.equal(C.removeBalanceObservation(emptyHistory,emptyHistory.balanceReconciliation.observations[0].id).version,3);
});

test('approval history rejects damaged evidence and invalid links',()=>{
  const {v3,approval,comparison} = fixture();
  const next = {...approval,id:'approval-2',previousApprovalId:approval.id};
  const differentlyCased = seal({...comparison.evidence,interval:{...comparison.evidence.interval,timeZone:'europe/istanbul'}});
  assert.doesNotThrow(()=>C.readBackup(JSON.stringify(replaceApprovals(v3,[{...approval,...differentlyCased}]))));
  assert.deepEqual(C.readBackup(JSON.stringify(replaceApprovals(v3,[approval,next]))).balanceReconciliation.approvals,[approval,next]);
  const broken = [
    [{...approval,evidenceSha256:'0'.repeat(64)}],
    [{...approval,approvedAt:'2026-02-30T09:00:00.000Z'}],
    [{...approval,...seal({...comparison.evidence,version:2})}],
    [{...approval,...seal({...comparison.evidence,differenceCents:'-01'})}],
    [{...approval,...seal({...comparison.evidence,coverage:{status:'unverified'}})}],
    [{...approval,...seal({...comparison.evidence,interval:{...comparison.evidence.interval,timeZone:'Imaginary/Unknown'}})}],
    ...[{date:'2000-01-01'},{accountId:'unrelated'},{kind:'expense'},{matchStatus:'linked'}].map(changes=>{
      const movements = comparison.evidence.movements.map(row=>row.id==='income'?{...row,...changes}:row);
      return [{...approval,...seal({...comparison.evidence,movements})}];
    }),
    [approval,{...next,previousApprovalId:null}],
    [approval,{...next,id:approval.id}],
    [next],
  ];
  for(const approvals of broken)assert.throws(()=>C.readBackup(JSON.stringify(replaceApprovals(v3,approvals))));
  assert.throws(()=>C.readBackup(JSON.stringify({...v3,version:4})));
  assert.throws(()=>C.readBackup(JSON.stringify({...v3,balanceReconciliation:{observations:[]}})));
});

test('recomputing approved evidence detects offsetting writes, edits and removals',()=>{
  const {v3,approval,observation,options,comparison} = fixture();
  const checked = state=>evaluateBalanceComparisonEvidence(state,observation.id,JSON.parse(approval.evidenceJson),options);
  assert.equal(checked(v3).status,'current');
  const added = movement(movement(v3,'offset-in','income',50),'offset-out','expense',50);
  const edited = C.updateTransaction(v3,{...v3.transactions.find(t=>t.id==='income'),amount:199});
  const deleted = C.validate({...v3,transactions:v3.transactions.filter(t=>t.id!=='expense')});
  assert.equal(checked(added).comparison.calculatedCents,comparison.calculatedCents);
  for(const changed of [added,edited,deleted]){
    assert.equal(checked(changed).status,'review-required');
    assert.deepEqual(changed.balanceReconciliation.approvals,[approval]);
  }
});

test('native synthetic v3 fixture is valid in the JavaScript backup reader',()=>{
  const raw = readFileSync(new URL('../app/src/androidTest/assets/synthetic-reconciliation-v3.json',import.meta.url),'utf8');
  assert.equal(C.backupText(C.readBackup(raw)),raw);
});

test('stored proof survives reopened PDF and CSV matches',()=>{
  const {v2,approval,observation,options} = fixture();
  const state = C.addTransaction({...v2,accounts:[...v2.accounts,{id:'card',name:'Sentetik kart',type:'card',opening:0}]},{
    id:'pay',account:'bank',target:'card',date,kind:'payment',amount:10000,desc:'Sentetik ödeme',category:'Diğer',
  });
  options.coverageReview.rows.push({sourceRowId:'pay-source',movementId:'pay',date,effectCents:-10000});
  const pdf = parseStatement('QNB\nHesap Kesim Tarihi: 30/11/2026\n09/11/2026 ODEME 100.00');
  const withPdf = C.importStatement(state,pdf,'card');
  const pdfId = withPdf.transactions.find(row=>row.source==='pdf').id;
  const linkedPdf = C.resolveCandidate(withPdf,pdfId,'link','pay');
  const csv = parseStatementCsv('period,date,desc,amount_cents,category,tur,bank,kart\n2026-11,2026-11-09,ODEME,10000,Kart ödemesi,odeme,QNB,Sentetik\n');
  const withCsv = C.importCsv(linkedPdf,csv,'card');
  const csvId = withCsv.transactions.find(row=>row.source==='csv').id;
  const linked = C.resolveCandidate(withCsv,csvId,'link','pay');
  const reviewed = compareBalanceObservation(linked,observation.id,options);
  assert.equal(reviewed.coverage.status,'source-supported');
  const stored = {...approval,...seal(reviewed.evidence)};
  const restored = C.readBackup(C.backupText(replaceApprovals({...linked,version:3},[stored])));
  for(const id of [pdfId,csvId]){
    const movements = reviewed.evidence.movements.map(row=>row.id===id?{...row,amountCents:'10001'}:row);
    const inconsistent = {...stored,...seal({...reviewed.evidence,movements})};
    assert.throws(()=>C.readBackup(JSON.stringify(replaceApprovals(restored,[inconsistent]))),/kanıtı geçersiz/);
  }
  for(const id of [pdfId,csvId]){
    const changed = C.resolveCandidate(restored,id,'unlink');
    const result = evaluateBalanceComparisonEvidence(changed,observation.id,JSON.parse(stored.evidenceJson),options);
    assert.equal(result.status,'review-required');
    assert.deepEqual(result.comparison.coverage,{status:'insufficient',reason:'pending-match'});
    assert.equal(result.comparison.calculatedCents,reviewed.calculatedCents);
    assert.deepEqual(changed.balanceReconciliation.approvals,[stored]);
  }
});
