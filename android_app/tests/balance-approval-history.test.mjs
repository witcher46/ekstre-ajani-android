import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import * as C from '../app/src/main/assets/core.mjs';
import * as W from '../app/src/main/assets/wallet.mjs';
import {parseStatement} from '../app/src/main/assets/parser.mjs';
import {parseStatementCsv} from '../app/src/main/assets/csv.mjs';
import {compareBalanceObservation} from '../app/src/main/assets/balance-reconciliation.mjs';
import {balanceApprovalHistory,evaluateStoredBalanceApproval} from '../app/src/main/assets/balance-approval-history.mjs';

const closing = {boundary:'end-of-day',timeZone:'Europe/Istanbul'};
const now = '2026-11-20T09:00:00.000Z';
const date = '2026-11-10';
function seal(evidence,id='approval-1',approvedAt=now,previousApprovalId=null){
  const evidenceJson = JSON.stringify(evidence);
  return {id,approvedAt,previousApprovalId,evidenceJson,
    evidenceSha256:createHash('sha256').update(evidenceJson).digest('hex')};
}
function movement(wallet,id,kind,amount,target){
  return C.addTransaction(wallet,{id,account:'bank',date,kind,amount,
    ...(target?{target}:{}),desc:'Sentetik',category:'Diğer'});
}
function fixture(){
  const v1 = {...C.empty(),accounts:[
    {id:'bank',name:'Sentetik banka',type:'bank',opening:100},
    {id:'cash',name:'Sentetik nakit',type:'cash',opening:200},
    {id:'cash-other',name:'Diğer nakit',type:'cash',opening:0},
    {id:'card',name:'Sentetik kart',type:'card',opening:5000},
  ]};
  const seed = {accountId:'bank',observedDate:'2026-11-01',observedAmountCents:10000,sourceKind:'bankDocument'};
  let v2 = C.addBalanceObservation(v1,{...seed,role:'anchor'},{now});
  v2 = C.addBalanceObservation(v2,{...seed,observedDate:'2026-11-15',observedAmountCents:10400},{now});
  v2 = movement(movement(v2,'income','income',1000),'transfer','transfer',500,'cash');
  const [anchor,observation] = v2.balanceReconciliation.observations;
  const options = {anchorId:anchor.id,observationClosing:closing,anchorReview:{
    anchorId:anchor.id,accountId:'bank',date:anchor.observedDate,amountCents:10000,
    sourceKind:'bankDocument',sourceType:'bankClosingRecord',sourceRef:'Sentetik kapanış',closing,
  },coverageReview:{
    accountId:'bank',fromExclusive:anchor.observedDate,throughInclusive:observation.observedDate,closing,
    sourceKind:'bankStatement',sourceRef:'Sentetik döküm',complete:true,rows:[
      {sourceRowId:'Banka-Satır-1',movementId:'income',date,effectCents:1000},
      {sourceRowId:'Banka-Satır-2',movementId:'transfer',date,effectCents:-500},
    ],
  }};
  const evidence = compareBalanceObservation(v2,observation.id,options).evidence;
  const approval = seal(evidence);
  const v3 = C.validate({...v2,version:3,balanceReconciliation:{...v2.balanceReconciliation,approvals:[approval]}});
  return {v1,v2,v3,approval,evidence,options,observation,anchor};
}

test('restores saved source review and distinguishes current evidence from its nonzero balance difference',()=>{
  const {v3,approval,evidence} = fixture();
  const before = C.backupText(v3);
  const result = evaluateStoredBalanceApproval(v3,approval);
  assert.equal(result.status,'current');
  assert.equal(result.canReview,true);
  assert.equal(evidence.differenceCents,'-100');
  assert.equal(C.backupText(v3),before);
  const [history] = balanceApprovalHistory(v3,'bank');
  assert.deepEqual(history.evidence,evidence);
  assert.deepEqual(history.approval,approval);
  assert.equal(history.evaluation.status,'current');
});

test('sorts approvals newest first with a deterministic append-order tie break and isolates accounts',()=>{
  const {v3,approval,evidence} = fixture();
  const other = seal({...evidence,accountId:'cash',accountType:'cash',
    anchor:{...evidence.anchor,sourceKind:'cashCount',sourceType:'cashCountRecord'},
    observation:{...evidence.observation,sourceKind:'cashCount',amountCents:'10000'},
    calculatedCents:'10000',differenceCents:'0',movements:[],
    coverage:{status:'source-supported',sourceKind:'cashJournal',sourceRef:'Sayım günlüğü',matches:[]},
  },'cash-approval');
  const second = seal(evidence,'approval-2',now,approval.id);
  const third = seal(evidence,'approval-3','2026-11-20T10:00:00.000Z',second.id);
  const state = C.validate({...v3,balanceReconciliation:{...v3.balanceReconciliation,approvals:[approval,other,second,third]}});
  assert.deepEqual(balanceApprovalHistory(state,'bank').map(row=>row.approval.id),['approval-3','approval-2','approval-1']);
  assert.deepEqual(balanceApprovalHistory(state,'cash').map(row=>row.approval.id),['cash-approval']);
  assert.deepEqual(balanceApprovalHistory(state,'card'),[]);
  assert.deepEqual(balanceApprovalHistory(state,'nonexistent'),[]);
});

test('added, removed, date, amount, and transfer direction changes require review',()=>{
  const {v3,approval} = fixture();
  const changes = [
    movement(v3,'later-income','income',1),
    C.validate({...v3,transactions:v3.transactions.filter(row=>row.id!=='income')}),
    C.updateTransaction(v3,{...v3.transactions[0],date:'2026-11-11'}),
    C.updateTransaction(v3,{...v3.transactions[0],amount:999}),
    C.updateTransaction(v3,{...v3.transactions[1],target:'cash-other'}),
    C.updateTransaction(v3,{...v3.transactions[1],account:'cash',target:'bank'}),
  ];
  for(const state of changes){
    const before = C.backupText(state);
    const result = evaluateStoredBalanceApproval(state,approval);
    assert.equal(result.status,'review-required');
    assert.equal(result.canReview,true);
    assert.equal(C.backupText(state),before);
    assert.deepEqual(state.balanceReconciliation.approvals,[approval]);
  }
});

test('different movements with the same total cannot reuse archived source-row matches',()=>{
  const {v3,approval} = fixture();
  const added = movement(movement(v3,'offset-credit','income',50),'offset-debit','expense',50);
  const replaced = C.validate({...v3,transactions:v3.transactions.map(row=>row.id==='income'?{...row,id:'replacement'}:row)});
  const balance = state => C.balance(state,state.accounts[0]);
  for(const state of [added,replaced]){
    assert.equal(balance(state),balance(v3));
    assert.equal(evaluateStoredBalanceApproval(state,approval).status,'review-required');
  }
});

test('live observation and anchor edits are review-required while missing records are unavailable',()=>{
  const {v3,approval,observation,anchor,evidence} = fixture();
  for(const changes of [{observedAmountCents:10401},{observedDate:'2026-11-16'},{sourceKind:'manualBank'}]){
    assert.equal(evaluateStoredBalanceApproval(C.updateBalanceObservation(v3,observation.id,changes,{now}),approval).status,'review-required');
  }
  for(const changes of [{observedAmountCents:9999},{observedDate:'2026-10-31'},{sourceKind:'manualBank'}]){
    assert.equal(evaluateStoredBalanceApproval(C.updateBalanceObservation(v3,anchor.id,changes,{now}),approval).status,'review-required');
  }
  for(const [id,reason] of [[observation.id,'missing-observation'],[anchor.id,'missing-anchor']]){
    const changed = C.removeBalanceObservation(v3,id);
    const [archived] = balanceApprovalHistory(changed,'bank');
    assert.deepEqual(archived.evidence,evidence);
    assert.deepEqual(archived.approval,approval);
    assert.equal(archived.evaluation.status,'unavailable');
    assert.equal(archived.evaluation.reason,reason);
    assert.equal(archived.evaluation.canReview,false);
  }
});

test('deleted live movements remain visible in archived history and cannot be silently refreshed',()=>{
  const {v3,approval,evidence} = fixture();
  const changed = C.validate({...v3,transactions:[]});
  const [archived] = balanceApprovalHistory(changed,'bank');
  assert.deepEqual(archived.evidence.movements,evidence.movements);
  assert.deepEqual(archived.evidence.coverage.matches,evidence.coverage.matches);
  assert.equal(archived.evaluation.status,'review-required');
  assert.deepEqual(changed.balanceReconciliation.approvals,[approval]);
});

test('untrusted, unsupported, or incomplete stored review inputs are never current',()=>{
  const {v3,approval,evidence} = fixture();
  for(const version of [0,2,99]){
    const result = evaluateStoredBalanceApproval(v3,seal({...evidence,version}));
    assert.equal(result.status,'unavailable');
    assert.equal(result.reason,'unsupported-evidence');
  }
  const incomplete = [
    {...approval,evidenceSha256:'0'.repeat(64)},
    {...approval,evidenceJson:'broken'},
    seal({...evidence,policy:'future-policy'}),
    seal({...evidence,coverage:{...evidence.coverage,sourceRef:''}}),
    seal({...evidence,coverage:{...evidence.coverage,matches:[]}}),
    seal({...evidence,movements:[]}),
  ];
  for(const item of incomplete)assert.equal(evaluateStoredBalanceApproval(v3,item).status,'unavailable');
  assert.equal(evaluateStoredBalanceApproval(null,approval).reason,'storage-unavailable');
  const [archived] = balanceApprovalHistory(v3,'bank',null);
  assert.equal(archived.evaluation.status,'unavailable');
  assert.deepEqual(archived.evidence,evidence);
});

test('a valid archive hash alone cannot establish current evidence',()=>{
  const {v3,approval} = fixture();
  const changed = movement(v3,'new-credit','income',500);
  assert.equal(evaluateStoredBalanceApproval(changed,approval).status,'review-required');
  assert.equal(approval.evidenceSha256,createHash('sha256').update(approval.evidenceJson).digest('hex'));
});

test('legacy PDF and CSV match projections and reopened links invalidate saved evidence',()=>{
  const {v2,observation,options} = fixture();
  const state = movement(v2,'payment','payment',2000,'card');
  const sourceOptions = {...options,coverageReview:{...options.coverageReview,rows:[
    ...options.coverageReview.rows,{sourceRowId:'Ödeme-Satır-1',movementId:'payment',date,effectCents:-2000},
  ]}};
  const pdf = parseStatement('QNB\nHesap Kesim Tarihi: 30/11/2026\n10/11/2026 ODEME 20.00');
  const csv = parseStatementCsv('period,date,desc,amount_cents,category,tur,bank,kart\n2026-11,2026-11-10,ODEME,2000,Kart ödemesi,odeme,QNB,Sentetik\n');
  for(const [source,imported] of [['pdf',C.importStatement(state,pdf,'card')],['csv',C.importCsv(state,csv,'card')]]){
    const id = imported.transactions.find(row=>row.source===source).id;
    const linked = C.resolveCandidate(imported,id,'link','payment');
    const evidence = compareBalanceObservation(linked,observation.id,sourceOptions).evidence;
    const approval = seal(evidence);
    const stored = C.validate({...linked,version:3,balanceReconciliation:{...linked.balanceReconciliation,approvals:[approval]}});
    assert.equal(evaluateStoredBalanceApproval(stored,approval).status,'current');
    const reopened = C.resolveCandidate(stored,id,'unlink');
    assert.equal(evaluateStoredBalanceApproval(reopened,approval).status,'review-required');
    const legacy = C.validate({...stored,transactions:stored.transactions.map(row=>row.id===id?
      Object.fromEntries(Object.entries(row).filter(([key])=>!['linkedTo','matchStatus'].includes(key))):row)});
    assert.equal(evaluateStoredBalanceApproval(legacy,approval).status,'review-required');
  }
});

test('read-only history preserves all backup versions and financial outputs across repeated reopen',()=>{
  const {v1,v2,v3,approval} = fixture();
  for(const wallet of [v1,v2,v3]){
    const before = C.backupText(wallet);
    const overview = W.overview(W.normalizeWallet(wallet),'2026-11');
    for(let iteration=0;iteration<3;iteration++){
      const restored = C.readBackup(before);
      const rows = balanceApprovalHistory(restored,'bank');
      assert.equal(rows.length,wallet.version===3?1:0);
      assert.equal(C.backupText(restored),before);
      assert.deepEqual(W.overview(W.normalizeWallet(restored),'2026-11'),overview);
      for(const account of wallet.accounts)assert.equal(C.balance(restored,account),C.balance(wallet,account));
    }
    if(wallet.version===3)assert.deepEqual(wallet.balanceReconciliation.approvals,[approval]);
  }
});

test('unrelated changes stay current because freshness is about the archived financial scope',()=>{
  const {v3,approval} = fixture();
  const changed = C.validate({
    ...v3,
    accounts:v3.accounts.map(account=>({...account,name:account.name+' yeni',opening:account.opening+1})),
    transactions:v3.transactions.map(row=>({...row,desc:'Yeni açıklama',category:'Market / Gıda'})),
  });
  assert.equal(evaluateStoredBalanceApproval(changed,approval).status,'current');
});

test('history pages and selected details only return their requested account approvals',()=>{
  const {v3,approval,evidence} = fixture();
  const second = seal(evidence,'approval-2',now,approval.id);
  const third = seal(evidence,'approval-3',now,second.id);
  const state = C.validate({...v3,balanceReconciliation:{...v3.balanceReconciliation,approvals:[approval,second,third]}});
  assert.deepEqual(balanceApprovalHistory(state,'bank',state,{offset:1,limit:1}).map(row=>row.approval.id),['approval-2']);
  assert.deepEqual(balanceApprovalHistory(state,'bank',state,{approvalId:'approval-1'}).map(row=>row.approval.id),['approval-1']);
  assert.deepEqual(balanceApprovalHistory(state,'cash',state,{approvalId:'approval-1'}),[]);
});

test('a supported empty source interval remains current and never invents source rows',()=>{
  const {v2,observation,options} = fixture();
  const empty = C.validate({...v2,transactions:[]});
  const emptyOptions = {...options,coverageReview:{...options.coverageReview,rows:[]}};
  const evidence = compareBalanceObservation(empty,observation.id,emptyOptions).evidence;
  const approval = seal(evidence);
  const stored = C.validate({...empty,version:3,balanceReconciliation:{...empty.balanceReconciliation,approvals:[approval]}});
  const [entry] = balanceApprovalHistory(stored,'bank');
  assert.equal(entry.evaluation.status,'current');
  assert.deepEqual(entry.evidence.movements,[]);
  assert.deepEqual(entry.evidence.coverage.matches,[]);
});
