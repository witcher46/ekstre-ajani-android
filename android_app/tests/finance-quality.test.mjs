import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/src/main/assets/core.mjs';
import * as W from '../app/src/main/assets/wallet.mjs';
import {parseStatement} from '../app/src/main/assets/parser.mjs';

const base = () => ({
  ...C.empty(),
  accounts: [
    {id:'bank', name:'Sentetik banka', type:'bank', opening:100000},
    {id:'card', name:'Sentetik kart', type:'card', opening:0},
  ],
});
const expense = overrides => ({
  account:'card', date:'2026-01-31', kind:'expense', desc:'Sentetik mağaza',
  amount:10000, category:'Diğer', ...overrides,
});

test('four supported amount formats produce the same integer cents', () => {
  for (const input of ['1234,56','1.234,56','1234.56','1,234.56']) {
    assert.equal(C.money(input), 123456, input);
  }
  assert.equal(C.money(' -9.876.543.210,07 '), -987654321007);
  assert.equal(C.money('0.1'), 10);
});

test('ambiguous separators get an actionable error', () => {
  for (const input of ['1.234','1,234','1.234.567','12.34,56','1,234.567','1 234,56']) {
    assert.throws(() => C.money(input), /ayraç.*1234,56/i, input);
  }
});

test('manual installments distribute exact cents across months and preserve the billing day', () => {
  const s = C.addInstallmentPlan(base(), expense(), 3);
  assert.deepEqual(s.transactions.map(t => [t.date,t.installment,t.amount]), [
    ['2026-01-31','1/3',3333], ['2026-02-28','2/3',3333], ['2026-03-31','3/3',3334],
  ]);
  assert.deepEqual(['2026-01','2026-02','2026-03','2026-04'].map(p => W.overview(s,p).netExpense), [3333,3333,3334,0]);
  assert.equal(C.cardStatus(s,'card',{asOf:'2026-02-01'}).current, 3333);
  assert.equal(W.installmentOverview(s,'card',{asOf:'2026-02-01'}).plannedFutureLiability, 6667);
  assert.deepEqual(C.readBackup(C.backupText(s)), s);
  assert.throws(() => C.addInstallmentPlan(base(), expense({account:'bank'}), 3));
  assert.throws(() => C.addInstallmentPlan(base(), expense({amount:1}), 3));
});

test('PDF installments follow the statement month when the bank repeats the purchase date', () => {
  const first = parseStatement('QNB\nHesap Kesim Tarihi: 05/02/2026\n31/01/2026 SENTETIK 33.33 1/3');
  const second = parseStatement('QNB\nHesap Kesim Tarihi: 05/03/2026\n31/01/2026 SENTETIK 33.33 2/3');
  const s = C.importStatement(C.importStatement(base(),first,'card'),second,'card');
  assert.deepEqual(['2026-01','2026-02','2026-03'].map(p => C.summary(s,p).net), [0,3333,3333]);
  assert.equal(W.installmentOverview(s,'card').items.length, 1);
});

test('a dated planned installment and a PDF showing the purchase date can be reviewed as one movement', () => {
  const planned = C.addInstallmentPlan(base(), expense({date:'2026-02-01'}), 3);
  const pdf = parseStatement('QNB\nHesap Kesim Tarihi: 05/02/2026\n31/01/2026 SENTETIK 33.33 1/3');
  const next = C.importStatement(planned,pdf,'card');
  const row = next.transactions.find(t => t.source === 'pdf');
  assert.equal(row.matchStatus, 'pending');
  const linked = C.resolveCandidate(next,row.id,'link',row.matchCandidates[0]);
  assert.equal(C.summary(linked,'2026-02').net, 3333);
  assert.equal(W.installmentOverview(linked,'card',{asOf:'2026-02-05'}).plannedFutureLiability, 6667);
});

test('a cross-month refund reduces that month only and never counts as income', () => {
  const s = C.addTransaction(C.addTransaction(base(),expense()),expense({
    date:'2026-02-01', kind:'refund', amount:4000,
  }));
  assert.equal(W.overview(s,'2026-01').netExpense, 10000);
  assert.equal(W.overview(s,'2026-02').netExpense, -4000);
  assert.equal(W.overview(s,'2026-02').income, 0);
});

test('a second identical PDF payment cannot be linked to a canonical row already linked to that source', () => {
  const bank = C.addTransaction(base(),expense({
    account:'bank', target:'card', kind:'payment', date:'2026-01-03',
  }));
  const pdf = parseStatement('QNB\nHesap Kesim Tarihi: 05/01/2026\n03/01/2026 ODEME 100.00\n03/01/2026 ODEME 100.00');
  const review = C.importStatement(bank,pdf,'card');
  const [first,second] = review.transactions.filter(t => t.matchStatus === 'pending');
  const linked = C.resolveCandidate(review,first.id,'link',bank.transactions[0].id);
  assert.throws(() => C.resolveCandidate(linked,second.id,'link',bank.transactions[0].id), /kaynak/i);
  const distinct = C.resolveCandidate(linked,second.id,'distinct');
  assert.equal(C.balance(distinct,distinct.accounts[0]), 90000);
  assert.equal(W.overview(distinct,'2026-01').netExpense, 0);
  assert.equal(W.overview(distinct,'2026-01').cardPayments, 20000);
});


test('editing a manual payment into an existing statement payment opens duplicate review', () => {
  const pdf = parseStatement('QNB\nHesap Kesim Tarihi: 05/01/2026\n03/01/2026 ODEME 100.00');
  const s = C.addTransaction(C.importStatement(base(),pdf,'card'), expense({
    id:'bank-payment', account:'bank', target:'card', kind:'payment', date:'2026-01-03', amount:20000,
  }));
  const original = s.transactions.find(t => t.id === 'bank-payment');
  const edited = C.updateTransaction(s,{...original,amount:10000});
  assert.equal(edited.transactions.find(t => t.id === original.id).matchStatus, 'pending');
  assert.equal(C.cardStatus(edited,'card').current, -10000);
  assert.equal(C.balance(edited,edited.accounts[0]), 90000);
});

test('an imported installment already in review does not hide the rest of its manual plan', () => {
  const pdf = parseStatement('QNB\nHesap Kesim Tarihi: 05/02/2026\n31/01/2026 SENTETIK 33.33 1/3');
  const s = C.addInstallmentPlan(C.importStatement(base(),pdf,'card'),expense({date:'2026-02-01'}),3);
  const details = W.installmentOverview(s,'card',{asOf:'2026-02-05'});
  const plan = details.items.find(t => !t.estimated);
  assert.equal(plan.total, 3);
  assert.equal(plan.remaining, 2);
  assert.equal(details.plannedFutureLiability, 6667);
  assert.equal(C.summary(s,'2026-02').net, 3333);
});


test('confirming a bank payment keeps a pending CSV candidate linkable to the new canonical payment', () => {
  const pdf = parseStatement('QNB\nHesap Kesim Tarihi: 05/01/2026\n03/01/2026 ODEME 100.00');
  const imported = C.importCsv(C.importStatement(base(),pdf,'card'),[{
    date:'2026-01-03', period:'2026-01', desc:'ODEME', cents:10000, kind:'odeme', category:'Kart ödemesi',
  }],'card');
  const pdfId=imported.transactions.find(t=>t.source==='pdf').id;
  const csvId=imported.transactions.find(t=>t.source==='csv').id;
  const bank = expense({id:'bank-outflow',account:'bank',target:'card',kind:'payment',date:'2026-01-03'});
  const reviewed = C.resolveCandidate(C.addTransaction(imported,bank),bank.id,'link',pdfId);
  const attached = W.attachPaymentSource(imported,pdfId,'bank',{paidOn:'2026-01-15'});
  for (const state of [reviewed,attached]) {
    const canonical=state.transactions.find(t=>t.kind==='payment');
    const csv=state.transactions.find(t=>t.id===csvId);
    assert.deepEqual(csv.matchCandidates,[canonical.id]);
    const linked=C.resolveCandidate(state,csvId,'link',canonical.id);
    assert.equal(C.cardStatus(linked,'card').current,-10000);
    assert.equal(C.balance(linked,linked.accounts[0]),90000);
    assert.equal(W.overview(linked,'2026-01').cardPayments,10000);
  }
});

test('a confirmed statement posting date moves a planned installment out of future liability', () => {
  const s = C.addInstallmentPlan(base(),expense({date:'2026-02-25'}),2);
  const pdf = parseStatement('QNB\nHesap Kesim Tarihi: 05/02/2026\n05/02/2026 SENTETIK 50.00 1/2');
  const review = C.importStatement(s,pdf,'card');
  const row = review.transactions.find(t=>t.source==='pdf');
  const linked = C.resolveCandidate(review,row.id,'link',row.matchCandidates[0]);
  assert.equal(C.cardStatus(linked,'card',{asOf:'2026-02-06'}).current,5000);
  const figures=W.installmentOverview(linked,'card',{asOf:'2026-02-06'});
  assert.equal(figures.postedExpense,5000);
  assert.equal(figures.plannedFutureLiability,5000);
});


test('an unresolved installment match cannot charge the same verified statement amount twice across cut', () => {
  const plan=C.addInstallmentPlan(base(),expense({date:'2026-02-25'}),2);
  const pdf=parseStatement('QNB\nHesap Kesim Tarihi: 05/02/2026\nOnceki Donem Hesap Ozeti Borcu: 0.00\nDonem Borcu: 50.00\n31/01/2026 SENTETIK 50.00 1/2');
  const review=C.importStatement(plan,pdf,'card');
  assert.equal(review.transactions.filter(t=>t.matchStatus==='pending').length,1);
  assert.equal(C.cardStatus(review,'card',{asOf:'2026-02-26'}).current,5000);
  assert.equal(C.summary(review,'2026-02').net,5000);
});

test('an installment refund retains its actual month even when posted on a later statement', () => {
  const pdf=parseStatement('QNB\nHesap Kesim Tarihi: 05/03/2026\n28/02/2026 SENTETIK IADE -50.00 1/2');
  const s=C.importStatement(base(),pdf,'card');
  assert.equal(C.summary(s,'2026-02').net,-5000);
  assert.equal(C.summary(s,'2026-03').net,0);
});

test('a user-confirmed distinct card payment stays separate after loading a backup', () => {
  const pdf=parseStatement('QNB\nHesap Kesim Tarihi: 05/01/2026\n03/01/2026 ODEME 100.00');
  const bank=expense({id:'distinct-bank-payment',account:'bank',target:'card',kind:'payment',date:'2026-01-03'});
  const review=C.addTransaction(C.importStatement(base(),pdf,'card'),bank);
  const distinct=C.resolveCandidate(review,bank.id,'distinct');
  const restored=C.reviewLegacy(C.readBackup(C.backupText(distinct)));
  assert.equal(C.cardStatus(restored,'card').current,-20000);
  assert.equal(W.overview(restored,'2026-01').cardPayments,20000);
  assert.equal(restored.transactions.filter(t=>t.matchStatus==='pending').length,0);
});


test('a pending PDF and CSV payment on opposite sides of cut preserve verified debt', () => {
  const csv=C.importCsv(base(),[{
    date:'2026-02-06',period:'2026-02',desc:'ODEME',cents:10000,kind:'odeme',category:'Kart ödemesi',
  }],'card');
  const pdf=parseStatement('QNB\nHesap Kesim Tarihi: 05/02/2026\nOnceki Donem Hesap Ozeti Borcu: 200.00\nDonem Borcu: 100.00\n04/02/2026 ODEME 100.00');
  const s=C.importStatement(csv,pdf,'card');
  assert.equal(s.transactions.filter(t=>t.matchStatus==='pending').length,1);
  assert.equal(C.cardStatus(s,'card').current,10000);
  assert.equal(C.cardStatus(s,'card').statementRemaining,10000);
});
