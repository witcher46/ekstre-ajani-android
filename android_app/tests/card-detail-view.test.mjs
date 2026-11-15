import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/src/main/assets/core.mjs';
import * as W from '../app/src/main/assets/wallet.mjs';
import * as V from '../app/src/main/assets/views.mjs';
import {escapeHtml} from '../app/src/main/assets/ui/form-controls.mjs';

const base=(name='Sentetik kart',opening=0)=>W.normalizeWallet({
  ...C.empty(),
  accounts:[
    {id:'bank',name:'Sentetik banka',type:'bank',opening:2_000_000},
    {id:'card',name,type:'card',opening},
  ],
});
const statement=(period,cut,due,debt,extra={})=>({
  id:'card|'+period,account:'card',period,cut,due,debt,bank:'Sentetik banka',...extra,
});
const movement=(id,kind,date,amount,extra={})=>({
  id,kind,date,amount,account:'card',period:date.slice(0,7),
  desc:'Sentetik '+id,category:'Diğer',note:'',...extra,
});
const htmlFor=s=>V.accountView({
  state:s,esc:escapeHtml,fmt:n=>'<span class="money">'+escapeHtml(C.formatMoney(n))+'</span>',
  transactionList:()=>'<p>Sentetik hareket listesi</p>',period:'2026-10',periodControl:'',
},'card');

test('known statement: payment is not an expense; refund and post-cut purchases stay separate',()=>{
  let s=base();
  s.statements=[statement('2026-10','2026-10-05','2026-10-20',200_000,{reconciliationStatus:'verified'})];
  s=C.addTransaction(s,movement('payment','payment','2026-10-10',100_000,{account:'bank',target:'card'}));
  s=C.addTransaction(s,movement('purchase','expense','2026-10-12',50_000));
  s=C.addTransaction(s,movement('refund','refund','2026-10-13',10_000));
  const before=JSON.stringify(s);
  const d=W.cardDetail(s,'card');
  assert.deepEqual([d.current,d.debt,d.credit,d.statementDebt,d.paidAfterCut,d.statementRemaining,d.postCutExpenses,d.postCutRefunds],
    [140_000,140_000,0,200_000,100_000,100_000,50_000,10_000]);
  const html=htmlFor(s);
  assert.equal(JSON.stringify(s),before,'rendering must never mutate saved financial data');
  assert.equal(C.summary(s,'2026-10').net,40_000,'bank payment must not be another expense');
  assert.match(html,/data-stat="cardDebt"/);
  assert.match(html,/data-stat="cardCredit"/);
  assert.match(html,/data-stat="cardStatementDebt"/);
  assert.match(html,/data-stat="cardPaidAfterCut"/);
  assert.match(html,/data-stat="cardStatementRemaining"/);
  assert.match(html,/Belgedeki dönem borcu/);
  assert.match(html,/Ödemelere göre kalan dönem borcu/);
  assert.match(html,/Gerçekleşen iadeler/);
  assert.match(html,/Bu kartın borcunu öde/);
  assert.match(html,/Ekstre toplamları doğrulandı/);
  assert.match(html,/data-statement-view="card\|2026-10"/);
  assert.ok(html.includes(C.formatMoney(140_000)));
});

test('latest statement without debt: shows Unknown instead of a manufactured 0, and labels older anchor',()=>{
  let s=base('<img src=x onerror=alert(1)>');
  s.statements=[
    statement('2026-10','2026-10-05','2026-10-20',200_000),
    statement('2026-11','2026-11-05',null,null,{reconciliationStatus:'unverified'}),
  ];
  s=C.addTransaction(s,movement('purchase','expense','2026-11-10',70_000));
  s=C.addTransaction(s,movement('refund','refund','2026-11-12',20_000));
  const d=W.cardDetail(s,'card');
  assert.equal(d.current,250_000);
  assert.equal(d.statementDebt,null);
  assert.equal(d.statementRemaining,null);
  assert.equal(d.paidAfterCut,0);
  const html=htmlFor(s);
  assert.match(html,/Güncel borç tahmini/);
  assert.match(html,/Son ekstrede dönem borcu okunamadı/);
  assert.match(html,/önceki bilinen ekstreye dayanıyor/);
  assert.match(html,/data-stat="cardStatementRemaining"><span class="muted">Bilinmiyor<\/span>/);
  assert.match(html,/data-stat="cardPaidAfterCut"><span class="muted">Bilinmiyor<\/span>/);
  assert.match(html,/Ekstre toplamları doğrulanamadı/);
  assert.ok(html.includes(C.formatMoney(250_000)));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'card names are never raw HTML');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('without statements, due date and statement debt are not shown as zero or invented',()=>{
  const s=base();
  const html=htmlFor(s);
  assert.match(html,/Henüz ekstre aktarılmadı/);
  assert.match(html,/Dönem borcu, kalan ekstre borcu ve son ödeme tarihi bilinmiyor/);
  assert.match(html,/Son ekstre kesim tarihi olmadığı için/);
  assert.ok(!html.includes('data-stat="cardStatementRemaining"'));
  assert.ok(!html.includes('data-stat="postCutExpenses"'));
  assert.equal(C.cardStatus(s,'card').current,0);
});

test('overpayment is shown as card credit rather than a negative debt',()=>{
  let s=base();
  s=C.addTransaction(s,movement('payment','payment','2026-10-11',20_000,{account:'bank',target:'card'}));
  const d=W.cardDetail(s,'card');
  assert.equal(d.debt,0);
  assert.equal(d.credit,20_000);
  const html=htmlFor(s);
  assert.match(html,/Kart artı bakiyesi/);
  assert.ok(html.includes(C.formatMoney(20_000)));
  assert.equal(C.balance(s,s.accounts[0]),1_980_000);
});

test('future installments remain separate from today’s balance and expense',()=>{
  let s=base();
  s=C.addInstallmentPlan(s,movement('future','expense','2099-01-31',10_000),3);
  assert.equal(C.cardStatus(s,'card').current,0);
  assert.equal(W.installmentOverview(s,'card').plannedFutureLiability,10_000);
  const html=htmlFor(s);
  assert.match(html,/Gelecek taksitler/);
  assert.match(html,/kayıtlı plan/);
  assert.match(html,/Gelecek ayların taksitleri güncel kart borcuna/);
  assert.equal(C.summary(s,'2026-10').net,0);
});
