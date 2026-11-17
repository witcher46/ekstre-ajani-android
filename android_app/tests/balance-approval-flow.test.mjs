import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import * as C from '../app/src/main/assets/core.mjs';
import * as W from '../app/src/main/assets/wallet.mjs';
import {parseStatement} from '../app/src/main/assets/parser.mjs';
import {parseStatementCsv} from '../app/src/main/assets/csv.mjs';
import {prepareBalanceApproval,saveBalanceApproval} from '../app/src/main/assets/balance-approval-flow.mjs';

const date = '2026-11-10';
const closing = {boundary:'end-of-day',timeZone:'Europe/Istanbul'};
const hash = raw => createHash('sha256').update(raw).digest('hex');

function movement(state,id,kind,amount,target){
  return C.addTransaction(state,{id,account:'bank',date,kind,amount,...(target?{target}:{}),desc:'Sentetik hareket',category:'Diğer'});
}

function fixture(){
  const v1 = {...C.empty(),accounts:[
    {id:'bank',name:'Sentetik banka',type:'bank',opening:50},
    {id:'cash',name:'Sentetik nakit',type:'cash',opening:25},
    {id:'card',name:'Sentetik kart',type:'card',opening:2000},
  ]};
  const seed = {accountId:'bank',observedDate:'2026-11-01',observedAmountCents:10000,sourceKind:'bankDocument'};
  let v2 = C.addBalanceObservation(v1,{...seed,role:'anchor'});
  v2 = C.addBalanceObservation(v2,{...seed,observedDate:'2026-11-15',observedAmountCents:9500});
  v2 = movement(movement(v2,'income','income',1500),'payment','payment',2000,'card');
  const [anchor,observation] = v2.balanceReconciliation.observations;
  const options = {anchorId:anchor.id,observationClosing:closing,anchorReview:{
    anchorId:anchor.id,accountId:'bank',date:anchor.observedDate,amountCents:anchor.observedAmountCents,
    sourceKind:'bankDocument',sourceType:'bankClosingRecord',sourceRef:'Kapanış-1',closing,
  },coverageReview:{
    accountId:'bank',fromExclusive:anchor.observedDate,throughInclusive:observation.observedDate,closing,
    sourceKind:'bankStatement',sourceRef:'Dönem-1',complete:true,rows:[
      {sourceRowId:'Satır-1',movementId:'income',date,effectCents:1500},
      {sourceRowId:'Satır-2',movementId:'payment',date,effectCents:-2000},
    ],
  }};
  return {v1,v2,observation,options};
}

function storage(wallet){
  let current = C.backupText(wallet);
  let previous = null;
  let attempts = 0;
  let reads = 0;
  const android = {
    onSave:null,
    loadForCompare(){reads++;return hash(current)+'\n'+current;},
    saveIfUnchanged(token,raw){
      attempts++;
      const beforeWrite = this.onSave;
      this.onSave = null;
      if(beforeWrite?.()===false||token!==hash(current))return false;
      previous = current;
      current = raw;
      return true;
    },
  };
  return {
    android,
    replace: state => {current = C.backupText(state);},
    read: () => C.readBackup(current),
    get raw(){return current;},
    get previous(){return previous;},
    get attempts(){return attempts;},
    get reads(){return reads;},
  };
}

test('requires an independently reviewed anchor, source coverage, and explicit final consent',()=>{
  const {v2,observation,options} = fixture();
  const {android,read} = storage(v2);
  for(const incomplete of [{},{...options,anchorReview:undefined},
    {...options,coverageReview:undefined},{...options,coverageReview:{...options.coverageReview,complete:false}},
    {...options,coverageReview:{...options.coverageReview,rows:[]}}]){
    const review = prepareBalanceApproval(android,observation.id,incomplete);
    assert.equal(review.status,'review-required');
    assert.equal(saveBalanceApproval(android,review,true).status,'review-required');
  }
  const ready = prepareBalanceApproval(android,observation.id,options);
  assert.equal(ready.status,'prepared');
  assert.equal(saveBalanceApproval(android,ready,'true').status,'review-required');
  assert.equal(saveBalanceApproval(android,{...ready},true).status,'review-required');
  assert.deepEqual(read(),v2);
});

test('first explicit approval appends v3 canonical proof, with all financial data unchanged',()=>{
  const {v1,v2,observation,options} = fixture();
  const db = storage(v2);
  const review = prepareBalanceApproval(db.android,observation.id,structuredClone(options));
  const shown = JSON.stringify(review.comparison.evidence);
  assert.ok(Object.isFrozen(review.comparison.evidence.coverage.matches[0]));
  assert.equal(review.comparison.coverage.status,'source-supported');
  const accepted = saveBalanceApproval(db.android,review,true);
  assert.equal(accepted.status,'saved');
  assert.equal(db.reads,2);
  assert.equal(db.attempts,1);
  const reopened = db.read();
  const {approvals,...reconciliation} = reopened.balanceReconciliation;
  const [record] = approvals;
  assert.equal(reopened.version,3);
  assert.deepEqual(reopened,accepted.state);
  assert.deepEqual({...reopened,version:2,balanceReconciliation:reconciliation},v2);
  assert.deepEqual(Object.keys(record),['id','approvedAt','previousApprovalId','evidenceJson','evidenceSha256']);
  assert.match(record.id,/^[0-9a-f-]{36}$/);
  assert.equal(record.approvedAt,new Date(record.approvedAt).toISOString());
  assert.equal(record.previousApprovalId,null);
  assert.equal(record.evidenceJson,shown);
  assert.equal(record.evidenceSha256,hash(shown));
  assert.deepEqual(W.overview(reopened,'2026-11'),W.overview(v2,'2026-11'));
  for(const account of v2.accounts)assert.equal(C.balance(reopened,account),C.balance(v2,account));
  for(const state of [v1,v2,reopened])assert.deepEqual(C.readBackup(C.backupText(state)),state);
});

test('nonzero source-supported difference is kept with its sign and no ledger correction',()=>{
  const {v2,observation,options} = fixture();
  const changed = C.updateBalanceObservation(v2,observation.id,{observedAmountCents:9425});
  const db = storage(changed);
  const review = prepareBalanceApproval(db.android,observation.id,options);
  assert.equal(review.comparison.differenceCents,-75);
  assert.equal(saveBalanceApproval(db.android,review,true).status,'saved');
  assert.equal(JSON.parse(db.read().balanceReconciliation.approvals[0].evidenceJson).differenceCents,'-75');
  assert.deepEqual(db.read().transactions,changed.transactions);
});

test('rejects added, deleted, edited and offsetting movements shown in an earlier review',()=>{
  const {v2,observation,options} = fixture();
  const edit = C.updateTransaction(v2,{...v2.transactions[0],amount:1499});
  const added = movement(v2,'new','income',50);
  const offset = movement(added,'offset','expense',50);
  assert.equal(C.balance(offset,v2.accounts[0]),C.balance(v2,v2.accounts[0]));
  for(const changed of [added,offset,edit,{...v2,transactions:v2.transactions.slice(1)}]){
    const db = storage(v2);
    const review = prepareBalanceApproval(db.android,observation.id,options);
    db.replace(changed);
    assert.equal(saveBalanceApproval(db.android,review,true).status,'review-required');
    assert.equal(db.attempts,0);
    assert.deepEqual(db.read(),changed);
  }
});

test('reopening a PDF or CSV link invalidates the pending review without changing the ledger effect',()=>{
  const {v2,observation,options} = fixture();
  const pdf = parseStatement('QNB\nHesap Kesim Tarihi: 30/11/2026\n10/11/2026 ODEME 20.00');
  const csv = parseStatementCsv('period,date,desc,amount_cents,category,tur,bank,kart\n2026-11,2026-11-10,ODEME,2000,Kart ödemesi,odeme,QNB,Sentetik\n');
  for(const [kind,imported] of [['pdf',C.importStatement(v2,pdf,'card')],['csv',C.importCsv(v2,csv,'card')]]){
    const id = imported.transactions.find(row=>row.source===kind).id;
    const linked = C.resolveCandidate(imported,id,'link','payment');
    const db = storage(linked);
    const review = prepareBalanceApproval(db.android,observation.id,options);
    assert.equal(review.status,'prepared');
    const changed = C.resolveCandidate(linked,id,'unlink');
    assert.equal(C.balance(changed,v2.accounts[0]),C.balance(linked,v2.accounts[0]));
    db.replace(changed);
    assert.equal(saveBalanceApproval(db.android,review,true).status,'review-required');
    assert.equal(db.attempts,0);
  }
});

test('snapshot binding covers human-readable changes that are outside evidence v1',()=>{
  const {v2,observation,options} = fixture();
  const db = storage(v2);
  const review = prepareBalanceApproval(db.android,observation.id,options);
  assert.equal(review.movementLabels.income,'Sentetik hareket');
  const changed = C.updateTransaction(v2,{...v2.transactions[0],desc:'Yeni açıklama'});
  db.replace(changed);
  const fresh = prepareBalanceApproval(db.android,observation.id,options);
  assert.deepEqual(fresh.comparison.evidence,review.comparison.evidence);
  assert.equal(saveBalanceApproval(db.android,review,true).status,'review-required');
  assert.equal(db.attempts,0);
});

test('captures the reviewed source inputs independently of subsequent form changes',()=>{
  const {v2,observation,options} = fixture();
  const editable = structuredClone(options);
  const db = storage(v2);
  const review = prepareBalanceApproval(db.android,observation.id,editable);
  editable.coverageReview.rows[0].sourceRowId = 'Değişen satır';
  editable.anchorReview.sourceRef = 'Değişen dayanak';
  assert.equal(saveBalanceApproval(db.android,review,true).status,'saved');
  assert.equal(JSON.parse(db.read().balanceReconciliation.approvals[0].evidenceJson).anchor.sourceRef,options.anchorReview.sourceRef);
});

test('allows one winner from two same-snapshot approvals and consumes repeated submits',()=>{
  const {v2,observation,options} = fixture();
  const db = storage(v2);
  const first = prepareBalanceApproval(db.android,observation.id,options);
  const competitor = prepareBalanceApproval(db.android,observation.id,options);
  const late = prepareBalanceApproval(db.android,observation.id,options);
  db.android.onSave = ()=>{
    assert.equal(saveBalanceApproval(db.android,first,true).status,'review-required');
    assert.equal(saveBalanceApproval(db.android,competitor,true).status,'saved');
  };
  assert.equal(saveBalanceApproval(db.android,first,true).status,'review-required');
  assert.equal(saveBalanceApproval(db.android,late,true).status,'review-required');
  assert.equal(saveBalanceApproval(db.android,competitor,true).status,'review-required');
  assert.equal(db.attempts,2);
  assert.equal(db.read().balanceReconciliation.approvals.length,1);
  assert.equal(db.previous,C.backupText(v2));
});

test('CAS conflict or failed final write consumes the review and preserves history',()=>{
  const {v2,observation,options} = fixture();
  for(const externalWrite of [false,true]){
    const db = storage(v2);
    const review = prepareBalanceApproval(db.android,observation.id,options);
    const changed = movement(v2,'new','income',50);
    db.android.onSave = ()=>{
      if(externalWrite)db.replace(changed);
      else return false;
    };
    assert.equal(saveBalanceApproval(db.android,review,true).status,'review-required');
    assert.equal(saveBalanceApproval(db.android,review,true).status,'review-required');
    assert.equal(db.attempts,1);
    assert.equal(db.previous,null);
    assert.deepEqual(db.read(),externalWrite?changed:v2);
  }
});

test('links to the previous approval for the same observation and never rewrites earlier evidence',()=>{
  const {v2,observation,options} = fixture();
  const other = C.addBalanceObservation(v2,{accountId:'bank',observedDate:observation.observedDate,
    observedAmountCents:observation.observedAmountCents,sourceKind:'bankDocument'});
  const otherId = other.balanceReconciliation.observations.at(-1).id;
  const db = storage(other);
  const approve = (id,source)=>saveBalanceApproval(db.android,prepareBalanceApproval(db.android,id,source),true);
  assert.equal(approve(observation.id,options).status,'saved');
  const original = db.read().balanceReconciliation.approvals[0];
  assert.equal(approve(otherId,options).status,'saved');
  const earlier = db.read().balanceReconciliation.approvals;
  assert.equal(earlier[1].previousApprovalId,null);
  const changed = C.updateBalanceObservation(db.read(),observation.id,{observedAmountCents:1234});
  db.replace(changed);
  const nextOptions = {...options,coverageReview:{...options.coverageReview,sourceRef:'Dönem Yedek-2'}};
  assert.equal(approve(observation.id,nextOptions).status,'saved');
  const approvals = db.read().balanceReconciliation.approvals;
  assert.deepEqual(approvals.slice(0,-1),earlier);
  assert.equal(approvals.at(-1).previousApprovalId,original.id);
  assert.notEqual(approvals.at(-1).evidenceJson,original.evidenceJson);
});

test('missing or malformed native snapshot never reaches a write',()=>{
  const {observation,options} = fixture();
  assert.equal(prepareBalanceApproval(undefined,observation.id,options).status,'storage-unavailable');
  for(const raw of [null,'bad','0'.repeat(64)+'\n{}']){
    const android = {loadForCompare:()=>raw,saveIfUnchanged:()=>assert.fail('unexpected CAS')};
    assert.equal(prepareBalanceApproval(android,observation.id,options).status,'storage-unavailable');
  }
});

test('legacy imports with a missing pending marker still need payment matching review',()=>{
  const {v2,observation,options} = fixture();
  const legacy = {...v2,transactions:[...v2.transactions,{
    id:'legacy-card-payment',account:'card',date,period:'2026-11',
    kind:'cardPayment',amount:2000,desc:'Sentetik eski PDF ödemesi',category:'Diğer',source:'pdf',
  }]};
  const db = storage(legacy);
  const review = prepareBalanceApproval(db.android,observation.id,options);
  assert.equal(review.status,'review-required');
  assert.deepEqual(review.comparison.coverage,{status:'insufficient',reason:'pending-match'});
  assert.equal(saveBalanceApproval(db.android,review,true).status,'review-required');
  assert.equal(db.attempts,0);
  assert.deepEqual(db.read(),legacy);
});

test('review amount fields accept the supported exact kuruş range without widening ordinary entry',()=>{
  assert.equal(C.money('90.071.992.547.409,91',{wide:true}),Number.MAX_SAFE_INTEGER);
  assert.equal(C.money('-90071992547409.91',{wide:true}),-Number.MAX_SAFE_INTEGER);
  assert.throws(()=>C.money('90071992547409.92',{wide:true}),/kuruş sınırı/);
  assert.throws(()=>C.money('90071992547409.91'));
});

test('the final preview rejects same-total changes since the user started source matching',()=>{
  const {v2,observation,options} = fixture();
  const db = storage(v2);
  const openingToken = hash(db.raw);
  db.replace(C.updateTransaction(v2,{...v2.transactions[0],desc:'Açıklama değişti'}));
  const review = prepareBalanceApproval(db.android,observation.id,options,openingToken);
  assert.deepEqual(review,{status:'review-required',reason:'snapshot-changed'});
  assert.equal(saveBalanceApproval(db.android,review,true).status,'review-required');
  assert.equal(db.attempts,0);
});
