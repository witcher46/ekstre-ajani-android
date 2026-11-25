import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/src/main/assets/core.mjs';
import * as W from '../app/src/main/assets/wallet.mjs';
import * as V from '../app/src/main/assets/views.mjs';
import {escapeHtml} from '../app/src/main/assets/ui/form-controls.mjs';
import {parseStatement} from '../app/src/main/assets/parser.mjs';

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
const viewContext=s=>({
  state:s,esc:escapeHtml,fmt:n=>'<span class="money">'+escapeHtml(C.formatMoney(n))+'</span>',
  transactionList:()=>'<p>Sentetik hareket listesi</p>',period:'2026-10',periodControl:'',
});
const htmlFor=s=>V.accountView(viewContext(s),'card');

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
  assert.match(html,/Aktarımda belgedeki toplamlar tam doğrulanamadı\./);
  assert.ok(html.includes(C.formatMoney(250_000)));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'card names are never raw HTML');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('card summary and statement detail both require review after an imported movement is deleted',()=>{
  const parsed=parseStatement([
    'QNB', 'Hesap Kesim Tarihi: 05/10/2026',
    '03/10/2026 SENTETIK MAGAZA 123.45', '04/10/2026 SENTETIK MARKET 50.00',
  ].join('\n'));
  assert.equal(parsed.rows.length,2);
  const imported=C.importStatement(base(),{...parsed,reconciliation:{status:'verified'}},'card');
  const [st]=imported.statements;
  assert.match(htmlFor(imported),/Ekstre toplamları doğrulandı/);
  assert.match(V.statementView(viewContext(imported),st.id),/statement-status verified">Doğrulandı/);

  const reduced=C.removeTransaction(imported,imported.transactions[0].id);
  const restored=W.normalizeWallet(C.readBackup(C.backupText(reduced)));
  assert.equal(restored.transactions.filter(row=>row.statement===st.id).length,1);
  assert.equal(restored.statements[0].importedMovementCount,2);
  assert.equal(restored.statements[0].reconciliationStatus,'verified');
  const before=C.backupText(restored);
  const summary=htmlFor(restored);
  const detail=V.statementView(viewContext(restored),st.id);
  for(const html of [summary,detail]){
    assert.match(html,/İnceleme gerekiyor/);
    assert.match(html,/Kayıtlı hareketler aktarımdan sonra değişmiş\./);
  }
  assert.doesNotMatch(summary,/Ekstre toplamları doğrulandı/);
  assert.equal(C.backupText(restored),before);
});

test('legacy statements without reconciliation metadata remain readable',()=>{
  const old=base();
  old.statements=[statement('2026-10','2026-10-05','2026-10-20',200_000)];
  const restored=W.normalizeWallet(C.readBackup(C.backupText(old)));
  for(const html of [htmlFor(restored),V.statementView(viewContext(restored),'card|2026-10')]){
    assert.match(html,/doğrulama bilgisi yok/);
    assert.doesNotMatch(html,/Ekstre toplamları doğrulandı/);
  }
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

test('a QNB purchase already included in statement debt is not a post-cut purchase',()=>{
  const parsed=parseStatement([
    'QNB', 'Hesap Kesim Tarihi: 05/10/2026',
    'Önceki Dönem Borcu: 0.00', 'Dönem Borcu: 100.00',
    '06/10/2026 SENTETIK MARKET 100.00',
  ].join('\n'));
  const imported=C.importStatement(base(),parsed,'card');
  const [row]=imported.transactions;
  assert.equal(row.date,'2026-10-06');
  assert.equal(row.statement,imported.statements[0].id);

  const assertCard=(state,debt,expenses)=>{
    const card=W.cardDetail(state,'card');
    assert.deepEqual([card.current,card.postCutExpenses],[debt,expenses]);
    const html=htmlFor(state);
    for(const [stat,value] of [['cardDebt',debt],['postCutExpenses',expenses]]){
      const metric=html.match(new RegExp('data-stat="'+stat+'">(.*?)</b>'));
      assert.ok(metric?.[1].includes(C.formatMoney(value)),stat);
    }
    assert.match(html,/kesim tarihinden sonra olan/i);
  };
  assertCard(imported,10_000,0);
  assert.match(V.statementView(viewContext(imported),row.statement),/kesim tarihinden sonra olan/i);
  const added=C.addTransaction(imported,movement('new','expense','2026-10-07',2_500));
  assertCard(added,12_500,2_500);
});

test('a confirmed statement purchase keeps its identity through linked manual and CSV rows',()=>{
  const parsed=parseStatement('QNB\nHesap Kesim Tarihi: 05/10/2026\nDönem Borcu: 100.00\n06/10/2026 SENTETIK MARKET 100.00');
  const manual=movement('manual','expense','2026-10-06',10_000,{desc:'SENTETIK MARKET'});
  const imported=C.importStatement(C.addTransaction(base(),manual),parsed,'card');
  const pdf=imported.transactions.find(row=>row.source==='pdf');
  const linked=C.resolveCandidate(imported,pdf.id,'link',manual.id);
  const withCsv=C.importCsv(linked,[{
    date:'2026-10-06',period:'2026-10',desc:'SENTETIK MARKET',cents:10_000,kind:'gider',category:'Market / Gıda',
  }],'card');
  const csv=withCsv.transactions.find(row=>row.source==='csv');
  const restored=W.normalizeWallet(C.readBackup(C.backupText(C.resolveCandidate(withCsv,csv.id,'link',manual.id))));
  const card=W.cardDetail(restored,'card');
  assert.deepEqual([card.current,card.postCutExpenses],[10_000,0]);
  assert.equal(card.movements.length,1);
  assert.equal(card.movements[0].category,manual.category);
  assert.deepEqual(card.movements[0].sources.map(row=>row.id),[pdf.id,csv.id]);
  assert.equal(card.movements[0].sources[0].date,'2026-10-06');
});

test('included post-cut refunds and payments do not change the statement balance again',()=>{
  const parsed=parseStatement([
    'QNB', 'Hesap Kesim Tarihi: 05/10/2026',
    'Önceki Dönem Borcu: 200.00', 'Dönem Borcu: 150.00',
    '06/10/2026 ODEME 35.00', '06/10/2026 SENTETIK IADE -15.00',
  ].join('\n'));
  const bank=movement('bank-payment','payment','2026-10-07',3_500,{account:'bank',target:'card'});
  const imported=C.importStatement(C.addTransaction(base(),bank),parsed,'card');
  assert.equal(parsed.reconciliation.status,'verified');
  const amounts=state=>{
    const card=W.cardDetail(state,'card');
    return [card.current,card.statementRemaining,card.paidAfterCut,card.postCutRefunds];
  };
  assert.deepEqual(amounts(imported),[15_000,15_000,0,0]);
  const payment=imported.transactions.find(row=>row.kind==='cardPayment');
  const linked=C.resolveCandidate(imported,bank.id,'link',payment.id);
  assert.deepEqual(amounts(linked),[15_000,15_000,0,0]);
  const anchor={accountId:'bank',date:'2026-10-05',amountCents:2_000_000};
  assert.equal(C.balanceAt(linked,'bank','2026-10-06',{anchor}).amountCents,2_000_000);
  assert.equal(C.balanceAt(linked,'bank','2026-10-07',{anchor}).amountCents,1_996_500);
});

test('a newer statement without debt does not hide purchases from the older debt estimate',()=>{
  const s=base();
  s.statements=[statement('2026-10','2026-10-05',null,10_000)];
  const parsed=parseStatement('QNB\nHesap Kesim Tarihi: 05/11/2026\n06/11/2026 SENTETIK MARKET 25.00');
  const imported=C.importStatement(s,parsed,'card');
  const card=W.cardDetail(imported,'card');
  assert.equal(card.currentAnchor.id,'card|2026-10');
  assert.deepEqual([card.current,card.statementDebt,card.postCutExpenses],[12_500,null,0]);
});
