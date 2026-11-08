import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/src/main/assets/core.mjs';

const base=()=>({...C.empty(),accounts:[{id:'bank',name:'Synthetic bank',type:'bank',opening:2000000},{id:'cash',name:'Synthetic cash',type:'cash',opening:0},{id:'card',name:'Synthetic card',type:'card',opening:0}]});
const tx=(extra={})=>({id:'spend',account:'card',date:'2026-10-02',period:'2026-10',desc:'Synthetic shop',amount:200000,kind:'expense',category:'Food',note:'',...extra});
const pdf=(rows,extra={})=>({bank:'QNB',period:'2026-10',cut:'2026-10-05',due:'2026-10-15',debt:100000,rows,warning:'',...extra});
const manual=(extra={})=>tx({id:'manual',account:'bank',target:'card',date:'2026-10-06',kind:'payment',amount:100000,...extra});
const imported=(extra={})=>tx({id:undefined,date:'2026-10-04',kind:'cardPayment',amount:100000,importKey:'payment',...extra});
const wallet=()=>import('../app/src/main/assets/wallet.mjs');

test('cross-cut date difference is reviewed without subtracting an anchored payment twice',()=>{
 let s=C.addTransaction(base(),manual());
 s=C.importStatement(s,pdf([imported()]),'card');
 assert.equal(C.cardStatus(s,'card').current,100000);
 assert.equal(C.balance(s,s.accounts[0]),1900000);
 const pending=s.transactions.find(t=>t.matchStatus==='pending');assert.ok(pending);
 assert.equal(pending.id,'manual');
 s=C.resolveCandidate(s,pending.id,'link',pending.matchCandidates[0]);
 assert.equal(C.cardStatus(s,'card').current,100000);
 assert.equal(C.cardStatus(s,'card').paidAfterCut,0);
 assert.equal(C.balance(s,s.accounts[0]),1900000);
 assert.equal(s.transactions.find(t=>t.id==='manual').date,'2026-10-06');
});
test('cross-cut explicit distinct retains two real payments',()=>{
 let s=C.importStatement(C.addTransaction(base(),manual()),pdf([imported()]),'card');
 const p=s.transactions.find(t=>t.matchStatus==='pending');assert.ok(p);
 s=C.resolveCandidate(s,p.id,'distinct');
 assert.equal(C.cardStatus(s,'card').current,0);
 assert.equal(C.balance(s,s.accounts[0]),1900000);
});
test('reopening a confirmed cross-cut payment keeps debt and bank cash stable through relink',()=>{
 let s=C.importStatement(C.addTransaction(base(),manual()),pdf([imported()]),'card');
 let pending=s.transactions.find(t=>t.matchStatus==='pending');s=C.resolveCandidate(s,pending.id,'link',pending.matchCandidates[0]);
 s=C.resolveCandidate(s,s.transactions.find(t=>t.linkedTo).id,'unlink');
 assert.equal(C.cardStatus(s,'card').current,100000);assert.equal(C.balance(s,s.accounts[0]),1900000);
 pending=s.transactions.find(t=>t.matchStatus==='pending');s=C.resolveCandidate(s,pending.id,'link',pending.matchCandidates[0]);
 assert.equal(C.cardStatus(s,'card').current,100000);assert.equal(C.balance(s,s.accounts[0]),1900000);
 s=C.resolveCandidate(s,s.transactions.find(t=>t.linkedTo).id,'unlink');
 pending=s.transactions.find(t=>t.matchStatus==='pending');s=C.resolveCandidate(s,pending.id,'distinct');
 assert.equal(C.cardStatus(s,'card').current,0);assert.equal(C.balance(s,s.accounts[0]),1900000);assert.equal(s.transactions.filter(C.effective).length,2);
});
test('payment candidate tolerance is bounded and never applies to purchases',()=>{
 for(const [date,want] of [['2026-10-01',1],['2026-09-30',0],['2026-10-07',1],['2026-10-08',0]]){
  let s=C.addTransaction(base(),manual({date}));s=C.importStatement(s,pdf([imported()],{debt:null}),'card');
  assert.equal(s.transactions.filter(t=>t.matchStatus==='pending').length,want,date);
 }
 let s=C.addTransaction(base(),tx({date:'2026-10-06'}));s=C.importStatement(s,pdf([tx({id:undefined,date:'2026-10-04',importKey:'expense'})]),'card');
 assert.equal(s.transactions.filter(t=>t.matchStatus==='pending').length,0);
});
test('linked payment notes can change while financial edits on either side are rejected',()=>{
 let s=C.importStatement(base(),pdf([imported()]),'card');s=C.addTransaction(s,manual());
 s=C.resolveCandidate(s,'manual','link',s.transactions.find(t=>t.source==='pdf').id);
 const bank=s.transactions.find(t=>t.id==='manual');
 s=C.updateTransaction(s,{...bank,note:'Reviewed actual bank day'});
 assert.equal(s.transactions.find(t=>t.id==='manual').note,'Reviewed actual bank day');
 for(const row of s.transactions){
  assert.throws(()=>C.updateTransaction(s,{...row,amount:110000}));
  assert.throws(()=>C.updateTransaction(s,{...row,date:'2026-10-05'}));
  assert.throws(()=>C.updateTransaction(s,{...row,period:'2026-11'}));
 }
 assert.equal(C.cardStatus(s,'card').current,100000);
});
test('source raw description survives import and mismatched reconciliation cannot mutate state',()=>{
 const s=base(),p=pdf([imported({sourceDesc:'RAW BANK DESCRIPTION',desc:'Clean display'})]);
 const n=C.importStatement(s,p,'card');assert.equal(n.transactions[0].sourceDesc,'RAW BANK DESCRIPTION');
 assert.throws(()=>C.importStatement(s,{...p,reconciliation:{status:'mismatch'}},'card'));
 assert.equal(s.transactions.length,0);assert.equal(s.statements.length,0);
});
test('legacy automatic PDF descriptions refresh to clean text while custom descriptions and user fields survive',()=>{
 const raw='SENTETIK MAGAZA PEN 4.ndirim',clean='SENTETIK MAGAZA PEŞİN 4.İndirim';
 for(const [oldDescription,want] of [[raw,clean],['My custom refund description','My custom refund description']]){
  let s=C.importStatement(base(),pdf([tx({id:undefined,desc:raw,sourceDesc:raw,amount:7500,importKey:'legacy-discount'})],{debt:null}),'card');
  const old=s.transactions[0];old.desc=oldDescription;old.category='Custom category';old.note='Checked synthetic bank row';old.reviewed=true;
  s=C.importStatement(s,pdf([tx({id:undefined,desc:clean,sourceDesc:raw,amount:7500,kind:'refund',importKey:'legacy-discount'})],{debt:null}),'card');
  assert.equal(s.transactions.length,1);const restored=s.transactions[0];
  assert.equal(restored.desc,want);assert.equal(restored.sourceDesc,raw);assert.equal(restored.id,old.id);assert.equal(restored.category,'Custom category');assert.equal(restored.note,'Checked synthetic bank row');assert.equal(restored.reviewed,true);assert.equal(restored.kind,'refund');assert.equal(restored.amount,7500);
 }
});
test('reimport changing kind under legacy import key does not silently retain an incompatible link',()=>{
 const p=pdf([tx({id:undefined,amount:100000,importKey:'legacy'})],{debt:null});
 let s=C.addTransaction(base(),tx({id:'manual-expense',amount:100000}));s=C.importStatement(s,p,'card');
 s=C.resolveCandidate(s,s.transactions.find(t=>t.matchStatus==='pending').id,'link','manual-expense');
 s=C.importStatement(s,pdf([tx({id:undefined,kind:'refund',amount:100000,importKey:'legacy'})],{debt:null}),'card');
 assert.equal(s.transactions.find(t=>t.source==='pdf').linkedTo,undefined);
 assert.equal(s.transactions.find(t=>t.id==='manual-expense').matchStatus,'pending');
 assert.equal(C.summary(s,'2026-10').net,-100000);
});
test('overview distinguishes cash, earned margin, card liability and transfers',async()=>{
 const W=await wallet();let s=base();
 s=C.addTransaction(s,tx({id:'salary',account:'bank',kind:'income',amount:3000000,category:'Salary'}));
 s=C.addTransaction(s,tx());
 let o=W.overview(s,'2026-10');
 assert.deepEqual([o.cash,o.cardDebt,o.cardCredit,o.netWorth,o.income,o.spent,o.refunds,o.netExpense,o.margin],[5000000,200000,0,4800000,3000000,200000,0,200000,2800000]);
 s=C.addTransaction(s,manual({amount:200000}));s=C.addTransaction(s,tx({id:'transfer',account:'bank',target:'cash',kind:'transfer',amount:50000}));
 o=W.overview(s,'2026-10');
 assert.deepEqual([o.cash,o.cardDebt,o.netWorth,o.cardPayments,o.transfers,o.cashIn,o.cashOut],[4800000,0,4800000,200000,50000,3000000,200000]);
 assert.deepEqual(o.incomeByCategory,[['Salary',3000000]]);assert.deepEqual(o.categories,[['Food',200000]]);
});
test('partial, refund, overpaid and prior-debt cases use independent cents expectations',async()=>{
 const W=await wallet();
 for(const f of [
  {opening:0,pay:100000,refund:0,cash:1900000,debt:100000,credit:0,netWorth:1800000,netExpense:200000},
  {opening:0,pay:100000,refund:50000,cash:1900000,debt:50000,credit:0,netWorth:1850000,netExpense:150000},
  {opening:0,pay:300000,refund:0,cash:1700000,debt:0,credit:100000,netWorth:1800000,netExpense:200000},
  {opening:500000,pay:200000,refund:0,cash:1800000,debt:500000,credit:0,netWorth:1300000,netExpense:200000},
 ]){
  let s=base();s.accounts[2].opening=f.opening;s=C.addTransaction(s,tx());s=C.addTransaction(s,manual({amount:f.pay}));
  if(f.refund)s=C.addTransaction(s,tx({id:'refund',kind:'refund',amount:f.refund}));
  const o=W.overview(s,'2026-10');for(const key of ['cash','debt','credit','netWorth','netExpense'])assert.equal(o[key==='debt'?'cardDebt':key==='credit'?'cardCredit':key],f[key],key);
 }
});
test('pending cross-cut bank payment remains in actual-month cash report after link',async()=>{
 const W=await wallet();let s=C.addTransaction(base(),manual({date:'2026-11-01'}));
 s=C.importStatement(s,pdf([imported({date:'2026-10-30'})],{cut:'2026-10-31'}),'card');
 assert.equal(W.overview(s,'2026-11').cardPayments,100000);assert.equal(W.overview(s,'2026-10').cardPayments,0);
 const p=s.transactions.find(t=>t.matchStatus==='pending');s=C.resolveCandidate(s,p.id,'link',p.matchCandidates[0]);
 assert.equal(W.overview(s,'2026-11').cashOut,100000);assert.equal(W.overview(s,'2026-10').cashOut,0);
 assert.equal(W.overview(s,'2026-11').cardPayments,100000);
});
test('v1 normalization clones, preserves identifiers and unknown values, and defaults only optional fields',async()=>{
 const W=await wallet(),s=base();s.extra={nested:['original',123]};s.accounts[0].custom='account';s.transactions.push(tx({id:'legacy-id',legacy:{a:1}}));
 const before=structuredClone(s),n=W.normalizeWallet(s);assert.deepEqual(s,before);assert.notEqual(n,s);
 assert.equal(n.version,1);assert.equal(n.transactions[0].id,'legacy-id');assert.deepEqual(n.transactions[0].legacy,{a:1});assert.deepEqual(n.extra,{nested:['original',123]});assert.equal(n.accounts[0].custom,'account');
 assert.deepEqual(n.incomePlans,[]);assert.ok(n.incomeCategories.length>0);
 assert.deepEqual(W.normalizeWallet({...s,incomeCategories:['Old custom'],incomePlans:[]}).incomeCategories,['Old custom']);
 assert.deepEqual(C.readBackup(C.backupText(n)),n);
});
test('income plans affect cash only on receipt and preserve 31 to February to 31 with due idempotency',async()=>{
 const W=await wallet(),s=base();let n=W.addIncomePlan(s,{id:'salary-plan',name:'Salary',account:'bank',amount:3000000,next:'2026-01-31',category:'Salary'});
 assert.equal(s.incomePlans,undefined);assert.equal(n.transactions.length,0);assert.equal(W.overview(n,'2026-01').plannedIncome,3000000);assert.equal(W.overview(n,'2026-01').cash,2000000);
 n=W.receiveIncome(n,'salary-plan',{receivedOn:'2026-02-02',expectedDue:'2026-01-31'});
 assert.equal(n.transactions[0].incomePlanId,'salary-plan');assert.equal(n.transactions[0].incomePlanDue,'2026-01-31');assert.equal(n.transactions[0].date,'2026-02-02');assert.equal(n.incomePlans[0].next,'2026-02-28');
 assert.equal(W.overview(n,'2026-01').income,0);assert.equal(W.overview(n,'2026-02').income,3000000);
 assert.throws(()=>W.receiveIncome(n,'salary-plan',{receivedOn:'2026-02-02',expectedDue:'2026-01-31'}));
 n=W.receiveIncome(n,'salary-plan',{receivedOn:'2026-02-28',expectedDue:'2026-02-28'});assert.equal(n.incomePlans[0].next,'2026-03-31');
 assert.throws(()=>W.addIncomePlan(s,{name:'Bad',account:'card',amount:10000,next:'2026-01-01'}));
 assert.throws(()=>W.receiveIncome(n,'salary-plan',{expectedDue:'2026-03-31',receivedOn:'2026-02-30'}));
 assert.throws(()=>C.readBackup(JSON.stringify({...n,incomePlans:[{...n.incomePlans[0],account:'card'}]})));
});
test('bank source attachment preserves PDF date, uses actual cash date and is idempotent',async()=>{
 const W=await wallet();let s=C.importStatement(base(),pdf([imported()]),'card');const tid=s.transactions[0].id;
 assert.equal(W.cardDetail(s,'card').unassignedPayments.length,1);
 s=W.attachPaymentSource(s,tid,'bank',{paidOn:'2026-10-06'});
 assert.equal(C.balance(s,s.accounts[0]),1900000);assert.equal(C.cardStatus(s,'card').current,100000);assert.equal(W.cardDetail(s,'card').unassignedPayments.length,0);
 assert.equal(s.transactions.find(t=>t.id===tid).date,'2026-10-04');assert.equal(s.transactions.find(t=>t.kind==='payment').date,'2026-10-06');
 assert.throws(()=>W.attachPaymentSource(s,tid,'bank',{paidOn:'2026-10-06'}));assert.equal(s.transactions.length,2);
 assert.throws(()=>W.attachPaymentSource(C.importStatement(base(),pdf([imported()]),'card'),tid,'card',{paidOn:'2026-10-06'}));
});
test('explicit actual bank date may exceed suggestion tolerance and still allow note edits',async()=>{
 const W=await wallet();let s=C.importStatement(base(),pdf([imported()]),'card');const tid=s.transactions[0].id;
 s=W.attachPaymentSource(s,tid,'bank',{paidOn:'2026-10-12'});const bank=s.transactions.find(t=>t.kind==='payment');
 s=C.updateTransaction(s,{...bank,note:'Explicit bank receipt date checked'});
 assert.equal(C.cardStatus(s,'card').current,100000);assert.equal(C.balance(s,s.accounts[0]),1900000);assert.equal(s.transactions.find(t=>t.id===bank.id).note,'Explicit bank receipt date checked');
});
test('a confirmed source with an explicit distant bank date can be reopened and relinked',async()=>{
 const W=await wallet();let s=C.importStatement(base(),pdf([imported()]),'card');const tid=s.transactions[0].id;
 s=W.attachPaymentSource(s,tid,'bank',{paidOn:'2026-10-12'});s=C.resolveCandidate(s,tid,'unlink');
 assert.equal(C.cardStatus(s,'card').current,100000);assert.equal(C.balance(s,s.accounts[0]),1900000);
 const pending=s.transactions.find(t=>t.matchStatus==='pending');s=C.resolveCandidate(s,pending.id,'link',pending.matchCandidates[0]);
 assert.equal(C.cardStatus(s,'card').current,100000);assert.equal(C.balance(s,s.accounts[0]),1900000);assert.equal(s.transactions.length,2);
});
test('source attachment refuses to create another outflow when same manual candidate requires review',async()=>{
 const W=await wallet();let s=C.importStatement(C.addTransaction(base(),manual()),pdf([imported()]),'card');const tid=s.transactions.find(t=>t.source==='pdf').id;
 assert.throws(()=>W.attachPaymentSource(s,tid,'bank',{paidOn:'2026-10-06'}));assert.equal(s.transactions.length,2);assert.equal(C.balance(s,s.accounts[0]),1900000);
});
test('explicit distinct payments can each have a bank source without reopening the same decision',async()=>{
 const W=await wallet();let s=C.addTransaction(base(),manual({date:'2026-10-04'}));s=C.importStatement(s,pdf([imported()],{debt:null}),'card');
 const pending=s.transactions.find(t=>t.matchStatus==='pending');s=C.resolveCandidate(s,pending.id,'distinct');
 s=W.attachPaymentSource(s,pending.id,'bank',{paidOn:'2026-10-04'});
 assert.equal(C.balance(s,s.accounts[0]),1800000);assert.equal(C.cardStatus(s,'card').current,-200000);assert.equal(s.transactions.filter(t=>t.kind==='payment').length,2);
});
test('card detail separates statement remainder, refunds, later expense and source-free payments',async()=>{
 const W=await wallet();let s=C.importStatement(base(),pdf([],{debt:300000}),'card');
 s=C.addTransaction(s,tx({date:'2026-10-07',amount:40000}));s=C.addTransaction(s,tx({id:'refund',date:'2026-10-08',kind:'refund',amount:20000}));s=C.addTransaction(s,manual({date:'2026-10-09',amount:100000}));
 const d=W.cardDetail(s,'card');assert.deepEqual([d.debt,d.credit,d.statementDebt,d.statementRemaining,d.postCutExpenses,d.postCutRefunds],[220000,0,300000,200000,40000,20000]);assert.equal(d.movements.length,3);
});
test('installment estimates do not re-post expenses and ambiguous identical purchases remain uncertain',async()=>{
 const W=await wallet();let s=C.addTransaction(base(),tx({id:'first',date:'2026-09-02',period:'2026-09',installment:'1/6',amount:10000}));s=C.addTransaction(s,tx({id:'second',installment:'2/6',amount:10000}));
 let i=W.installmentOverview(s,'card');assert.equal(i.postedExpense,20000);assert.equal(i.estimatedFutureLiability,40000);assert.equal(i.estimated,true);assert.equal(i.items.length,1);assert.equal(i.items[0].remaining,4);
 assert.equal(W.overview(s,'2026-10').spent,10000);assert.equal(C.cardStatus(s,'card').current,20000);
 s=C.addTransaction(s,tx({id:'different-purchase',installment:'2/6',amount:10000}));i=W.installmentOverview(s,'card');assert.ok(i.ambiguous);assert.ok(i.items.some(x=>x.ambiguous));assert.equal(i.postedExpense,30000);
});
test('account overview attributes transfers and payment outflows to the actual account',async()=>{
 const W=await wallet();let s=C.addTransaction(base(),tx({id:'salary',account:'bank',kind:'income',amount:3000000,category:'Salary'}));s=C.addTransaction(s,manual({amount:100000}));s=C.addTransaction(s,tx({id:'transfer',account:'bank',target:'cash',kind:'transfer',amount:50000}));s=C.addTransaction(s,tx({id:'cash-spend',account:'cash',amount:10000}));
 const bank=W.accountOverview(s,'bank','2026-10'),cash=W.accountOverview(s,'cash','2026-10');
 assert.deepEqual([bank.balance,bank.income,bank.spent,bank.cashIn,bank.cashOut,bank.cardPayments,bank.transfers],[4850000,3000000,0,3000000,150000,100000,50000]);
 assert.deepEqual([cash.balance,cash.income,cash.spent,cash.cashIn,cash.cashOut,cash.transfers],[40000,0,10000,50000,10000,50000]);
 assert.throws(()=>W.accountOverview(s,'missing','2026-10'));
});
