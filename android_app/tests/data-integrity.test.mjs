import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/src/main/assets/core.mjs';
import * as W from '../app/src/main/assets/wallet.mjs';
import {parseStatementCsv} from '../app/src/main/assets/csv.mjs';
import {parseStatement} from '../app/src/main/assets/parser.mjs';

const wallet=()=>W.normalizeWallet({...C.empty(),accounts:[
  {id:'card',type:'card',name:'Sentetik kart',opening:0},
  {id:'bank',type:'bank',name:'Sentetik banka',opening:100000},
  {id:'cash',type:'cash',name:'Sentetik nakit',opening:10000},
]});
const csv=(changes={})=>({
  date:'2026-09-15',period:'2026-10',desc:'SENTETIK ALISVERIS',
  cents:5000,kind:'harcama',category:'Diğer',...changes,
});
const importCsv=(s,rows)=>C.importCsv(s,rows,'card');
const pdfText=desc=>[
  'QNB','Hesap Kesim Tarihi: 05/10/2026','Onceki Donem Hesap Ozeti Borcu: 0.00',
  'Donem Borcu: 50.00','01/10/2026 '+desc+' 50.00',
].join('\n');
const pan=['4111','1111','1111','1111'].join(' ');
const ref=['4012','8888','8888','1881'].join('');

test('separate CSV imports retain equal rows in distinct statement periods and replay each idempotently',()=>{
  const oct=csv(),nov=csv({period:'2026-11'});
  let s=importCsv(wallet(),[oct]);
  s=C.updateTransaction(s,{...s.transactions[0],desc:'Sentetik kişisel açıklama',note:'Sentetik not'});
  s=importCsv(s,[nov]);
  assert.equal(C.summary(s,'2026-10','statement').net,5000);
  assert.equal(C.summary(s,'2026-11','statement').net,5000);
  assert.deepEqual(importCsv(importCsv(s,[oct]),[nov]),s);
  assert.equal(s.transactions[0].desc,'Sentetik kişisel açıklama');
});

test('CSV source IDs distinguish equal real transactions and detect conflicting versions for review',()=>{
  const header='period,date,desc,amount_cents,category,tur,bank,kart,transaction_id';
  const lines=['oct-1','oct-2'].map(id=>'2026-10,2026-09-15,SENTETIK ALISVERIS,5000,Diğer,harcama,QNB,Sentetik kart,'+id);
  const rows=parseStatementCsv([header,...lines].join('\n'));
  assert.deepEqual(rows.map(r=>r.transactionId),['oct-1','oct-2']);
  let s=importCsv(wallet(),[rows[0]]);
  s=importCsv(s,[rows[1]]);
  assert.equal(C.summary(s,'2026-10','statement').net,10000);
  assert.deepEqual(importCsv(s,[...rows].reverse()),s);
  assert.deepEqual(importCsv(s,[rows[0],rows[0]]),s);
  const conflict={...rows[0],cents:7500};
  s=importCsv(s,[conflict]);
  assert.equal(s.transactions.at(-1).matchStatus,'pending');
  assert.equal(C.summary(s,'2026-10','statement').net,10000);
  assert.deepEqual(importCsv(s,[conflict]),s);
});

test('repeated ID-less CSV rows are kept in review and exact file replays keep the decisions',()=>{
  const row=csv(),other=csv({desc:'SENTETIK FARKLI'});
  let s=importCsv(wallet(),[row,other,row]);
  assert.equal(s.transactions.length,3);
  const candidate=s.transactions.find(t=>t.matchStatus==='pending');
  assert.equal(candidate?.matchCandidates.length,1);
  assert.equal(C.summary(s,'2026-10','statement').net,10000);
  assert.deepEqual(importCsv(s,[row,row,other]),s);
  s=C.resolveCandidate(s,candidate.id,'distinct');
  assert.equal(C.summary(s,'2026-10','statement').net,15000);
  assert.deepEqual(importCsv(s,[row,other,row]),s);
});

test('overlapping ID-less CSV files retain ambiguous rows for review without multiplying them on replay',()=>{
  const row=csv(),first=csv({desc:'SENTETIK BIR'}),second=csv({desc:'SENTETIK IKI'});
  let s=importCsv(wallet(),[row,first]);
  s=importCsv(s,[row,second]);
  assert.equal(s.transactions.length,4);
  assert.equal(s.transactions.filter(t=>t.matchStatus==='pending').length,1);
  assert.equal(C.summary(s,'2026-10','statement').net,15000);
  assert.deepEqual(importCsv(s,[second,row]),s);
});

test('discarding ambiguous CSV rows preserves the review decision on a later replay',()=>{
  const row=csv(),other=csv({desc:'SENTETIK FARKLI'});
  let s=importCsv(wallet(),[row,other,row]);
  s=C.removeTransaction(s,s.transactions.find(t=>t.matchStatus==='pending').id);
  const restored=C.readBackup(C.backupText(s));
  assert.equal(C.summary(restored,'2026-10','statement').net,10000);
  assert.deepEqual(importCsv(restored,[row,row,other]),restored);
  const initial=csv({transactionId:'known'});
  const conflict=csv({transactionId:'known',cents:7500});
  let withConflict=importCsv(wallet(),[initial,conflict]);
  withConflict=C.removeTransaction(withConflict,withConflict.transactions.find(t=>t.matchStatus==='pending').id);
  assert.deepEqual(importCsv(withConflict,[initial,conflict]),withConflict);
});

test('removing a PDF bridge reopens only dependent CSV aliases and preserves the installment amount',()=>{
  const plan=C.addInstallmentPlan(wallet(),{
    id:'plan',account:'card',date:'2026-12-15',desc:'Sentetik plan',amount:15000,kind:'expense',category:'Diğer',
  },3);
  const statement=parseStatement('QNB\nHesap Kesim Tarihi: 25/12/2026\n10/11/2026 SENTETIK PLAN 50.00 1/3');
  const withPdf=C.importStatement(plan,statement,'card');
  const pdf=withPdf.transactions.find(t=>t.source==='pdf');
  const confirmed=C.resolveCandidate(withPdf,pdf.id,'link','plan');
  const imported=importCsv(confirmed,[csv({date:'2026-11-10',period:'2026-12',desc:'SENTETIK PLAN'})]);
  const incoming=imported.transactions.find(t=>t.source==='csv');
  const linked=C.resolveCandidate(imported,incoming.id,'link','plan');
  const withoutPdf=C.removeTransaction(linked,pdf.id);
  const reopened=C.resolveCandidate(linked,pdf.id,'unlink');
  for(const state of [withoutPdf,reopened]){
    const csvRow=state.transactions.find(t=>t.id===incoming.id);
    assert.equal(csvRow.linkedTo,undefined);
    assert.equal(csvRow.matchStatus,'pending');
    assert.equal(C.summary(state,'2026-12').net,5000);
    assert.deepEqual(C.readBackup(C.backupText(state)),state);
  }
  const revised=C.importStatement(linked,parseStatement('QNB\nHesap Kesim Tarihi: 25/12/2026\n10/11/2026 SENTETIK PLAN 75.00 1/3'),'card');
  assert.equal(revised.transactions.find(t=>t.id===incoming.id).matchStatus,'pending');
  assert.equal(C.summary(revised,'2026-12').net,7500);
});

test('different PDF and CSV statement periods are not linked as one purchase',()=>{
  const pdf=parseStatement('QNB\nHesap Kesim Tarihi: 25/12/2026\n10/11/2026 SENTETIK PLAN 50.00 1/3');
  const s=importCsv(C.importStatement(wallet(),pdf,'card'),[csv({
    date:'2026-11-10',period:'2027-01',desc:'SENTETIK PLAN',
  })]);
  const imported=s.transactions.find(t=>t.source==='csv');
  assert.equal(imported.matchStatus,undefined);
  assert.equal(C.summary(s,'2027-01','statement').net,5000);
  const corrupted=structuredClone(s);
  Object.assign(corrupted.transactions.find(t=>t.id===imported.id),{
    linkedTo:corrupted.transactions[0].id,matchStatus:'linked',
  });
  delete corrupted.transactions.find(t=>t.id===imported.id).matchCandidates;
  assert.throws(()=>C.readBackup(JSON.stringify(corrupted)),/ekstre dönem/i);
});

test('large sets of ambiguous CSV rows retain one review reference each and remain exportable',()=>{
  const rows=Array.from({length:1300},()=>csv());
  const s=importCsv(wallet(),rows);
  assert.equal(s.transactions.length,1300);
  assert.equal(s.transactions.filter(t=>t.matchStatus==='pending'&&t.matchCandidates.length===1).length,1299);
  assert.equal(C.readBackup(C.backupText(s)).transactions.length,1300);
});

test('restore rejects unrelated, wrong-source and wrong-direction links before computing balances',()=>{
  let s=C.addTransaction(wallet(),{id:'bank-out',account:'bank',target:'card',date:'2026-10-01',amount:5000,kind:'payment',category:'Kart ödemesi',desc:'Sentetik banka'});
  s=C.importStatement(s,parseStatement(pdfText('ODEME').replace('Donem Borcu: 50.00','Donem Borcu: -50.00')),'card');
  const candidate=s.transactions.find(t=>t.matchStatus==='pending');
  const linked=C.resolveCandidate(s,candidate.id,'link','bank-out');
  const canonical=linked.transactions.find(t=>t.id==='bank-out');
  const alias=linked.transactions.find(t=>t.linkedTo===canonical.id);
  assert.deepEqual(C.readBackup(C.backupText(linked)),linked);
  for(const change of [
    {amount:7500},{source:'manual'},{source:'csv',statement:undefined},{kind:'expense'},{target:'cash'},
    {matchStatus:'distinct'},{matchStatus:'pending',matchCandidates:['bank-out']},{period:'2026-11'},
  ]){
    const corrupted={...linked,transactions:linked.transactions.map(t=>t.id===alias.id?{...t,...change}:t)};
    assert.throws(()=>C.readBackup(JSON.stringify(corrupted)),/bağlantı|eşleşme|dönem/i);
  }
  const wrongTarget={...linked,transactions:linked.transactions.map(t=>t.id===canonical.id?{...t,kind:'expense',target:undefined}:t)};
  assert.throws(()=>C.readBackup(JSON.stringify(wrongTarget)),/bağlantı|eşleşme/i);
  const reversed={...linked,transactions:[{...canonical,linkedTo:alias.id,matchStatus:'linked'},{...alias,linkedTo:undefined,matchStatus:undefined}]};
  assert.throws(()=>C.readBackup(JSON.stringify(reversed)),/bağlantı|eşleşme/i);
});

test('restore rejects a linked CSV row whose period disagrees with its recorded source',()=>{
  const imported=importCsv(C.importStatement(wallet(),parseStatement(pdfText('SENTETIK ALISVERIS')),'card'),[csv({date:'2026-10-01'})]);
  const candidate=imported.transactions.find(t=>t.source==='csv');
  const linked=C.resolveCandidate(imported,candidate.id,'link',candidate.matchCandidates[0]);
  const wrong=structuredClone(linked);
  wrong.transactions.find(t=>t.id===candidate.id).period='2026-11';
  assert.throws(()=>C.readBackup(JSON.stringify(wrong)),/CSV.*dönem/i);
  assert.deepEqual(C.readBackup(C.backupText(linked)),linked);
});

test('valid manually attached payment with a different bank date survives current JSON round-trip',()=>{
  const pdf=parseStatement('QNB\nHesap Kesim Tarihi: 05/10/2026\n03/10/2026 ODEME 50.00');
  const s=C.importStatement(wallet(),pdf,'card');
  const linked=W.attachPaymentSource(s,s.transactions[0].id,'bank',{paidOn:'2026-11-02'});
  const restored=W.normalizeWallet(C.reviewLegacy(C.readBackup(C.backupText(linked))));
  assert.equal(C.balance(restored,restored.accounts[1]),95000);
  assert.equal(C.cardStatus(restored,'card').current,-5000);
  assert.deepEqual(restored,linked);
});

test('PDF masks payment identifiers in preview, persisted fields and export while retaining unrelated reference IDs',()=>{
  const pdf=parseStatement(pdfText('SENTETIK KART '+pan+' REF '+ref));
  assert.ok(!JSON.stringify(pdf).includes(pan));
  assert.ok(pdf.rows[0].sourceDesc.includes('[kart]'));
  assert.ok(pdf.rows[0].sourceDesc.includes(ref));
  assert.ok(pdf.rows[0].desc.includes(ref));
  const s=C.importStatement(wallet(),pdf,'card');
  assert.ok(!C.backupText(s).includes(pan));
  assert.equal(C.summary(s,'2026-10').net,5000);
});

test('PDF masks grouped and contiguous payment numbers next to numeric reference values',()=>{
  const compact=pan.replaceAll(' ','');
  for(const number of [pan,compact]){
    const parsed=parseStatement(pdfText('SENTETIK '+number+' 1234567890'));
    assert.ok(!parsed.rows[0].sourceDesc.includes(number));
    assert.ok(parsed.rows[0].sourceDesc.includes('1234567890'));
  }
});

test('legacy PDF backup masking preserves row identity, amounts and user edits on reimport',()=>{
  const pdf=parseStatement(pdfText('SENTETIK KART '+pan));
  const first=C.importStatement(wallet(),pdf,'card');
  const t=first.transactions[0];
  t.sourceDesc='SENTETIK KART '+pan;
  t.merchantName='SENTETIK KART '+pan;
  t.desc='Sentetik özel açıklama';
  t.category='Ulaşım';t.note='Sentetik not';t.reviewed=true;
  const raw=JSON.stringify(first);
  const restored=C.readBackup(raw);
  assert.ok(!JSON.stringify(restored).includes(pan));
  assert.ok(!C.backupText(first).includes(pan));
  assert.ok(raw.includes(pan));
  const repeated=C.importStatement(restored,pdf,'card');
  assert.deepEqual(repeated.transactions.map(({id,importKey,desc,category,note,reviewed,amount})=>({id,importKey,desc,category,note,reviewed,amount})),
    [{id:t.id,importKey:t.importKey,desc:t.desc,category:t.category,note:t.note,reviewed:true,amount:5000}]);
  assert.deepEqual(C.summary(repeated,'2026-10'),C.summary(first,'2026-10'));
});
