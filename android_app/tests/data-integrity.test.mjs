import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/src/main/assets/core.mjs';
import * as W from '../app/src/main/assets/wallet.mjs';
import {parseStatementCsv} from '../app/src/main/assets/csv.mjs';
import {parseStatement,parseStatementWithIdentity} from '../app/src/main/assets/parser.mjs';

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
const identityKey=async()=>({id:crypto.randomUUID(),secret:await crypto.subtle.generateKey({name:'HMAC',hash:'SHA-256'},false,['sign'])});

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
  const repeated=importCsv(s,[rows[0],rows[0]]);
  assert.equal(repeated.transactions.at(-1).matchStatus,'pending');
  assert.deepEqual(importCsv(repeated,[rows[0],rows[0]]),repeated);
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
  const snapshot=C.backupText(linked);
  assert.throws(()=>C.importStatement(linked,parseStatement('QNB\nHesap Kesim Tarihi: 25/12/2026\n10/11/2026 SENTETIK PLAN 75.00 1/3'),'card'),/tekrar aktarımı inceleme/);
  assert.equal(C.backupText(linked),snapshot);
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

test('legacy PDF payment links without a statement reference still restore',()=>{
  const state=wallet();
  state.transactions=[
    {id:'legacy-bank',source:'manual',account:'bank',target:'card',date:'2026-10-03',
     period:'2026-11',kind:'payment',desc:'Sentetik banka',category:'Kart ödemesi',amount:5000},
    {id:'legacy-pdf',source:'pdf',account:'card',date:'2026-10-03',period:'2026-11',
     kind:'cardPayment',desc:'Sentetik PDF',category:'Kart ödemesi',amount:5000,linkedTo:'legacy-bank'},
  ];
  const restored=W.normalizeWallet(C.reviewLegacy(C.readBackup(JSON.stringify(state))));
  assert.deepEqual(restored,state);
  assert.equal(C.balance(restored,restored.accounts[1]),95000);
  assert.equal(C.cardStatus(restored,'card').current,-5000);
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

test('legacy PDF backup restores masked rows and keeps edits when ambiguous replay is blocked',()=>{
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
  assert.throws(()=>C.importStatement(restored,pdf,'card'),/tekrar aktarımı inceleme/);
  assert.deepEqual(restored.transactions.map(({id,importKey,desc,category,note,reviewed,amount})=>({id,importKey,desc,category,note,reviewed,amount})),
    [{id:t.id,importKey:t.importKey,desc:t.desc,category:t.category,note:t.note,reviewed:true,amount:5000}]);
  assert.deepEqual(C.summary(restored,'2026-10'),C.summary(first,'2026-10'));
});


test('legacy PDF masks colliding card numbers and blocks replay without reliable row identity',async()=>{
  const left=pan.replaceAll(' ',' - ');
  const right=['4000','0000','0006','1111'].join(' - ');
  const line=number=>'01/10/2026 SENTETIK KART '+number+' 50.00';
  const text=[pdfText('SENTETIK KART '+left).replace('Donem Borcu: 50.00','Donem Borcu: 100.00'),line(right)].join('\n');
  const parsed=parseStatement(text);
  assert.ok(!JSON.stringify(parsed).includes(left));
  assert.ok(!JSON.stringify(parsed).includes(right));
  assert.equal(new Set(parsed.rows.map(r=>r.importKey)).size,2);
  const first=C.importStatement(wallet(),parsed,'card');
  const legacy=structuredClone(first);
  for(const [index,number] of [left,right].entries()){
    const row=legacy.transactions[index];
    row.importKey=JSON.stringify(['QNB','2026-10','2026-10-01','SENTETIK KART '+number,5000,''])+'|1';
    row.sourceDesc='SENTETIK KART '+number;
    row.desc='Sentetik düzenleme '+index;
  }
  legacy.transactions.reverse();
  const migrated=C.readBackup(JSON.stringify(legacy));
  const modern=await parseStatementWithIdentity(text,identityKey);
  assert.throws(()=>C.importStatement(migrated,modern,'card'),/tekrar aktarımı inceleme/);
  assert.deepEqual(migrated.transactions.map(t=>[t.id,t.desc]).reverse(),first.transactions.map((t,i)=>[t.id,'Sentetik düzenleme '+i]));
  assert.equal(C.summary(migrated,'2026-10').net,10000);
  assert.ok(!C.backupText(migrated).includes(left));
  assert.ok(!C.backupText(migrated).includes(right));
});

test('a 50 TL to 75 TL PDF replacement with a masked card rejects without losing edits or links',async()=>{
  const key=await identityKey();
  const parse=text=>parseStatementWithIdentity(text,async()=>key);
  const original=pdfText('SENTETIK ALISVERIS '+pan)
    .replace('Donem Borcu: 50.00','Donem Borcu: 40.00')+'\n02/10/2026 ODEME 10.00';
  let state=C.importStatement(wallet(),await parse(original),'card');
  const expense=state.transactions.find(row=>row.kind==='expense');
  const payment=state.transactions.find(row=>row.kind==='cardPayment');
  state=C.updateTransaction(state,{...expense,desc:'Sentetik kullanıcı açıklaması',category:'Sağlık',note:'Sentetik not',reviewed:true});
  state=W.attachPaymentSource(state,payment.id,'bank',{paidOn:'2026-10-02'});
  const after=C.readBackup(C.backupText(state));
  const snapshot=structuredClone(after),serialized=C.backupText(after);
  const replacement=original.replace('40.00','65.00').replace('50.00','75.00');
  const sameCard=await parse(replacement);
  const masked=await parse(replacement.replace(pan,'**** 1111'));
  assert.equal(sameCard.rows[0].amount,7500);
  assert.notEqual(sameCard.rows[0].importKey,expense.importKey);
  for(const candidate of [sameCard,masked]){
    assert.equal(candidate.reconciliation.status,'verified');
    assert.throws(()=>C.importStatement(after,candidate,'card'),/tekrar aktarımı inceleme/);
    assert.deepEqual(after,snapshot);
    assert.equal(C.backupText(after),serialized);
    assert.equal(after.transactions.find(row=>row.id===payment.id).linkedTo,
      snapshot.transactions.find(row=>row.id===payment.id).linkedTo);
  }
  const replay=C.importStatement(after,await parse(original),'card');
  assert.deepEqual(new Map(replay.transactions.map(row=>[row.id,row])),
    new Map(snapshot.transactions.map(row=>[row.id,row])));
});

test('PDF replay preserves edits through distinct additions and reordering, and rejects missing rows',async()=>{
  const key=await identityKey();
  const a=pan.replaceAll(' ',' - '),b=['4000','0000','0006','1111'].join(' - ');
  const statement=async numbers=>{
    const [first,...rest]=numbers;
    const text=[pdfText('SENTETIK KART '+first).replace('Donem Borcu: 50.00','Donem Borcu: '+(numbers.length*50)+'.00'),
      ...rest.map(number=>'01/10/2026 SENTETIK KART '+number+' 50.00')].join('\n');
    const parsed=await parseStatementWithIdentity(text,async()=>key);
    assert.ok(!JSON.stringify(parsed).includes(a));
    assert.ok(!JSON.stringify(parsed).includes(b));
    return parsed;
  };
  let s=C.importStatement(wallet(),await statement([a]),'card');
  const id=s.transactions[0].id;
  s=C.updateTransaction(s,{...s.transactions[0],desc:'Sentetik düzenleme',category:'Sağlık',note:'Sentetik not'});
  s=C.readBackup(C.backupText(s));
  for(const numbers of [[a,b],[b,a]]){
    s=C.importStatement(s,await statement(numbers),'card');
    const row=s.transactions[numbers.indexOf(a)];
    assert.deepEqual([row.id,row.desc,row.category,row.note],[id,'Sentetik düzenleme','Sağlık','Sentetik not']);
    assert.equal(C.summary(s,'2026-10').net,numbers.length*5000);
  }
  const formatted=C.importStatement(s,await statement([a.replaceAll(' - ',''),b]),'card');
  assert.equal(formatted.transactions[0].id,id);
  const fromOtherDevice=await parseStatementWithIdentity(pdfText('SENTETIK KART '+a)
    .replace('Donem Borcu: 50.00','Donem Borcu: 100.00')+'\n01/10/2026 SENTETIK KART '+b+' 50.00',identityKey);
  const changedDescription=await parseStatementWithIdentity(pdfText('SENTETIK FARKLI '+a)
    .replace('Donem Borcu: 50.00','Donem Borcu: 100.00')+'\n01/10/2026 SENTETIK KART '+b+' 50.00',async()=>key);
  const numberUnavailable=parseStatement(pdfText('SENTETIK KART **** 1111')
    .replace('Donem Borcu: 50.00','Donem Borcu: 100.00')+'\n01/10/2026 SENTETIK KART **** 2222 50.00');
  const snapshot=C.backupText(s);
  for(const candidate of [await statement([a]),await statement([b]),await statement([a,b,a]),
    changedDescription,numberUnavailable,fromOtherDevice]){
    assert.throws(()=>C.importStatement(s,candidate,'card'),/tekrar aktarımı inceleme/);
    assert.equal(C.backupText(s),snapshot);
  }
  const november=await parseStatementWithIdentity(pdfText('SENTETIK KART '+b).replaceAll('/10/','/11/'),async()=>key);
  const newMonth=C.importStatement(s,november,'card');
  assert.equal(newMonth.transactions.find(row=>row.period==='2026-11').amount,5000);
  assert.deepEqual(newMonth.transactions.filter(row=>row.period==='2026-10'),s.transactions);
});

test('PDF replay rejects reused keys with unequal terms or duplicate occurrences',()=>{
  const original=parseStatement(pdfText('SENTETIK ALISVERIS'));
  const s=C.importStatement(wallet(),original,'card');
  const row=original.rows[0];
  for(const rows of [
    [{...row,date:'2026-10-02'}],
    [{...row,installment:'1/2'}],
    [{...row,sourceDesc:'SENTETIK DIGER ALISVERIS'}],
    [row,row],
    [row,{...row,importKey:row.importKey.replace(/\|1$/,'|2')}],
  ]){
    const snapshot=structuredClone(s);
    assert.throws(()=>C.importStatement(s,{...original,rows},'card'),/tekrar aktarımı inceleme/);
    assert.deepEqual(s,snapshot);
  }
});

test('equal rows sharing a CSV source ID are reviewed and replay preserves the decision',()=>{
  const row=csv({transactionId:'synthetic-collision'});
  const once=importCsv(wallet(),[row]);
  const twice=importCsv(once,[row,row]);
  assert.equal(twice.transactions.length,2);
  const candidate=twice.transactions.find(t=>t.matchStatus==='pending');
  assert.ok(candidate);
  assert.equal(C.summary(twice,'2026-10','statement').net,5000);
  assert.deepEqual(importCsv(twice,[row,row]),twice);
  const accepted=C.resolveCandidate(twice,candidate.id,'distinct');
  assert.equal(C.summary(accepted,'2026-10','statement').net,10000);
  assert.deepEqual(importCsv(C.readBackup(C.backupText(accepted)),[row,row]),accepted);
  const dismissed=C.removeTransaction(twice,candidate.id);
  assert.equal(C.summary(dismissed,'2026-10','statement').net,5000);
  assert.deepEqual(importCsv(C.readBackup(C.backupText(dismissed)),[row,row]),dismissed);
  assert.equal(importCsv(dismissed,[row,row,row]).transactions.filter(t=>t.matchStatus==='pending').length,1);
});

test('a manual bank payment does not bridge unrelated PDF and CSV payment dates',()=>{
  const p=parseStatement('QNB\nHesap Kesim Tarihi: 05/10/2026\n01/10/2026 ODEME 50.00');
  let s=C.importStatement(wallet(),p,'card');
  s=W.attachPaymentSource(s,s.transactions[0].id,'bank',{paidOn:'2026-11-30'});
  assert.deepEqual(C.readBackup(C.backupText(s)),s);
  const other=csv({date:'2026-11-30',period:'2026-11',desc:'ODEME',kind:'odeme',category:'Kart ödemesi'});
  s=importCsv(s,[other]);
  const csvRow=s.transactions.find(t=>t.source==='csv'),manual=s.transactions.find(t=>t.kind==='payment');
  const bad=structuredClone(s),badRow=bad.transactions.find(t=>t.id===csvRow.id);
  delete badRow.matchCandidates;
  Object.assign(badRow,{linkedTo:manual.id,matchStatus:'linked'});
  assert.throws(()=>C.readBackup(JSON.stringify(bad)),/PDF.*CSV.*tarih/);
  assert.equal(csvRow.matchStatus,undefined);
  assert.equal(C.cardStatus(s,'card').current,-10000);
  const pending=structuredClone(s);
  Object.assign(pending.transactions.find(t=>t.id===csvRow.id),{matchStatus:'pending',matchCandidates:[manual.id]});
  assert.throws(()=>C.resolveCandidate(pending,csvRow.id,'link',manual.id),/PDF.*CSV.*tarih/);
  const nearby=importCsv(C.removeTransaction(s,csvRow.id),[{...other,date:'2026-10-04',period:'2026-10'}]);
  const nearbyCsv=nearby.transactions.find(t=>t.source==='csv');
  const linked=C.resolveCandidate(nearby,nearbyCsv.id,'link',manual.id);
  assert.deepEqual(C.readBackup(C.backupText(linked)),linked);
  assert.equal(C.cardStatus(linked,'card').current,-5000);
  assert.equal(C.balance(linked,linked.accounts.find(account=>account.id==='bank')),95000);
});
