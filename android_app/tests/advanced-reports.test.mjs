import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import * as C from '../app/src/main/assets/core.mjs';
import {parseStatement} from '../app/src/main/assets/parser.mjs';
import {advancedReports, reportRows} from '../app/src/main/assets/reports.mjs';
import {addIncomePlan} from '../app/src/main/assets/wallet.mjs';
import {reportCategoryView, reportsView} from '../app/src/main/assets/views.mjs';
import {escapeHtml} from '../app/src/main/assets/ui/form-controls.mjs';

const base = () => ({
  ...C.empty(),
  accounts: [
    {id:'bank', name:'Sentetik banka', type:'bank', opening:100_000},
    {id:'cash', name:'Sentetik nakit', type:'cash', opening:10_000},
    {id:'card', name:'Sentetik kredi kartı', type:'card', opening:0},
  ],
});

const movement = (id, account, kind, date, amount, category, extra = {}) => ({
  id, account, kind, date, period:date.slice(0, 7), amount,
  desc:`Sentetik ${id}`, category, note:'', ...extra,
});

function reportWallet() {
  const rows = [
    movement('salary', 'bank', 'income', '2026-10-03', 30_000, 'Maaş'),
    movement('freelance', 'cash', 'income', '2026-10-04', 2_000, 'Serbest çalışma'),
    movement('card-spend', 'card', 'expense', '2026-10-05', 12_000, 'Market / Gıda'),
    movement('bank-spend', 'bank', 'expense', '2026-10-06', 3_000, 'Market / Gıda'),
    movement('cash-spend', 'cash', 'expense', '2026-10-08', 1_000, 'Ulaşım'),
    movement('bank-payment', 'bank', 'payment', '2026-10-10', 5_000, 'Kart ödemesi', {target:'card'}),
    movement('cash-transfer', 'bank', 'transfer', '2026-10-11', 6_000, 'Market / Gıda', {target:'cash'}),
    movement('card-refund', 'card', 'refund', '2026-11-01', 4_000, 'Market / Gıda'),
    movement('bank-refund', 'bank', 'refund', '2026-11-02', 1_000, 'Market / Gıda'),
    movement('november-spend', 'bank', 'expense', '2026-11-03', 1_000, 'Ulaşım'),
  ];
  const withMovements = rows.reduce((state, row) => C.addTransaction(state, row), base());
  return addIncomePlan(withMovements, {
    id:'unreceived', name:'Sentetik beklenen gelir', account:'bank',
    amount:90_000, category:'Maaş', next:'2026-11-10',
  });
}

const numericFields = [
  'income', 'spent', 'refunds', 'netExpense', 'margin', 'cashIn', 'cashOut',
  'cardPayments', 'cardCashPayments', 'cardSpent', 'transfers',
];
const figures = row => Object.fromEntries(numericFields.map(key => [key, row[key]]));
const categoryFigures = rows => Object.fromEntries(rows.map(({name, spent, refunds, net}) => [
  name, {spent, refunds, net},
]));

test('an empty report includes six calendar months across the year boundary', () => {
  const report = advancedReports(C.empty(), '2027-02');
  assert.deepEqual(report.months.map(row => row.month), [
    '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02',
  ]);
  assert.deepEqual(figures(report.current), {
    income:0, spent:0, refunds:0, netExpense:0, margin:0, cashIn:0, cashOut:0,
    cardPayments:0, cardCashPayments:0, cardSpent:0, transfers:0,
  });
  assert.equal(report.previous.month, '2027-01');
  assert.equal(report.changes.netExpense, 0);
  assert.deepEqual(report.categories, []);
  assert.deepEqual(reportRows(C.empty(), ['2027-02']), []);
});

test('a 12-month report includes January through December and excludes adjacent years', () => {
  const state = [
    movement('prior', 'bank', 'income', '2025-12-31', 7_000, 'Maaş'),
    movement('first', 'bank', 'income', '2026-01-01', 1_100, 'Maaş'),
    movement('last', 'bank', 'income', '2026-12-31', 2_200, 'Maaş'),
    movement('next', 'bank', 'income', '2027-01-01', 8_000, 'Maaş'),
  ].reduce((wallet, row) => C.addTransaction(wallet, row), base());
  const year = advancedReports(state, '2026-12', {months:12});

  assert.deepEqual(year.months.map(row => row.month), [
    '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
    '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  ]);
  assert.equal(year.months[0].income, 1_100);
  assert.equal(year.current.income, 2_200);
  assert.equal(year.totals.income, 3_300);
  assert.equal(advancedReports(state, '2026-12').totals.income, 2_200);
});

test('cash and spending totals distinguish purchases, card payments, transfers and refunds', () => {
  const state = reportWallet();
  const original = structuredClone(state);
  const report = advancedReports(state, '2026-11');

  assert.deepEqual(figures(report.previous), {
    income:32_000, spent:16_000, refunds:0, netExpense:16_000, margin:16_000,
    cashIn:32_000, cashOut:9_000, cardPayments:5_000, cardCashPayments:5_000,
    cardSpent:12_000, transfers:6_000,
  });
  assert.deepEqual(figures(report.current), {
    income:0, spent:1_000, refunds:5_000, netExpense:-4_000, margin:4_000,
    cashIn:1_000, cashOut:1_000, cardPayments:0, cardCashPayments:0,
    cardSpent:0, transfers:0,
  });
  assert.deepEqual(figures(report.totals), {
    income:32_000, spent:17_000, refunds:5_000, netExpense:12_000, margin:20_000,
    cashIn:33_000, cashOut:10_000, cardPayments:5_000, cardCashPayments:5_000,
    cardSpent:12_000, transfers:6_000,
  });
  assert.deepEqual(figures(report.changes), {
    income:-32_000, spent:-15_000, refunds:5_000, netExpense:-20_000, margin:-12_000,
    cashIn:-31_000, cashOut:-8_000, cardPayments:-5_000, cardCashPayments:-5_000,
    cardSpent:-12_000, transfers:-6_000,
  });
  assert.deepEqual(Object.fromEntries(report.previous.incomeByCategory), {
    'Maaş':30_000, 'Serbest çalışma':2_000,
  });
  assert.deepEqual(categoryFigures(report.current.categoryBreakdown), {
    'Market / Gıda':{spent:0, refunds:5_000, net:-5_000},
    'Ulaşım':{spent:1_000, refunds:0, net:1_000},
  });
  assert.deepEqual(categoryFigures(report.categories), {
    'Market / Gıda':{spent:15_000, refunds:5_000, net:10_000},
    'Ulaşım':{spent:2_000, refunds:0, net:2_000},
  });
  assert.deepEqual(state, original);
});

test('account filters include cash transfers on their respective inflow and outflow sides', () => {
  const state = reportWallet();
  const bank = advancedReports(state, '2026-10', {accountId:'bank'}).current;
  const cash = advancedReports(state, '2026-10', {accountId:'cash'}).current;
  const card = advancedReports(state, '2026-10', {accountId:'card'}).current;

  assert.deepEqual(figures(bank), {
    income:30_000, spent:3_000, refunds:0, netExpense:3_000, margin:27_000,
    cashIn:30_000, cashOut:14_000, cardPayments:5_000, cardCashPayments:5_000,
    cardSpent:0, transfers:6_000,
  });
  assert.deepEqual(figures(cash), {
    income:2_000, spent:1_000, refunds:0, netExpense:1_000, margin:1_000,
    cashIn:8_000, cashOut:1_000, cardPayments:0, cardCashPayments:0,
    cardSpent:0, transfers:6_000,
  });
  assert.deepEqual(figures(card), {
    income:0, spent:12_000, refunds:0, netExpense:12_000, margin:-12_000,
    cashIn:0, cashOut:0, cardPayments:5_000, cardCashPayments:5_000,
    cardSpent:12_000, transfers:0,
  });
});

test('drilldown uses an exact expense category and matches transfer and payment targets by account', () => {
  const state = reportWallet();
  const rowIds = (periods, options) => reportRows(state, periods, options).map(row => row.id).sort();

  assert.deepEqual(rowIds(['2026-10'], {accountId:'cash'}), ['cash-spend', 'cash-transfer', 'freelance']);
  assert.deepEqual(rowIds(['2026-10'], {accountId:'card'}), ['bank-payment', 'card-spend']);
  assert.deepEqual(rowIds(['2026-10', '2026-11'], {category:'Market / Gıda'}), [
    'bank-refund', 'bank-spend', 'card-refund', 'card-spend',
  ]);
  assert.deepEqual(rowIds(['2026-10', '2026-11'], {accountId:'card', category:'Market / Gıda'}), [
    'card-refund', 'card-spend',
  ]);
  assert.deepEqual(rowIds(['2026-10'], {category:'Market'}), []);
});

test('legacy JSON keeps an unmatched statement payment separate from cash movement', () => {
  const fixture = new URL('./fixtures/android-0.1.0.json', import.meta.url);
  const state = C.readBackup(readFileSync(fixture, 'utf8'));
  const report = advancedReports(state, '2026-10');
  const bank = advancedReports(state, '2026-10', {accountId:'synthetic-bank'}).current;
  const card = advancedReports(state, '2026-10', {accountId:'synthetic-card'}).current;

  assert.deepEqual(figures(report.current), {
    income:0, spent:10_000, refunds:0, netExpense:10_000, margin:-10_000,
    cashIn:0, cashOut:0, cardPayments:2_000, cardCashPayments:0, cardSpent:10_000, transfers:0,
  });
  assert.equal(bank.cardPayments, 0);
  assert.equal(card.cardPayments, 2_000);
  assert.equal(card.cardCashPayments, 0);
  assert.deepEqual(categoryFigures(report.categories), {
    'Sentetik özel kategori':{spent:10_000, refunds:0, net:10_000},
  });
});

test('a bank payment across the month boundary is counted once before and after matching', t => {
  t.mock.timers.enable({apis:['Date'],now:new Date(2027,0,1,12)});
  const pdf = parseStatement([
    'QNB', 'Hesap Kesim Tarihi: 05/01/2027', '31/12/2026 ODEME 50.00',
  ].join('\n'));
  const statement = C.importStatement(base(), pdf, 'card');
  const payment = movement('actual-payment', 'bank', 'payment', '2027-01-01', 5_000, 'Kart ödemesi', {target:'card'});
  const pending = C.addTransaction(statement, payment);
  assert.equal(pending.transactions.find(row => row.id === payment.id).matchStatus, 'pending');
  const linked = C.resolveCandidate(pending, payment.id, 'link', statement.transactions[0].id);

  for (const [state, prior] of [[pending,0],[linked,5_000]]) {
    const {current, previous, totals} = advancedReports(state, '2027-01');
    assert.equal(previous.cardPayments, prior);
    assert.equal(current.cardPayments, 5_000-prior);
    assert.equal(current.cardCashPayments, 5_000);
    assert.equal(current.cashOut, 5_000);
    assert.equal(totals.spent, 0);
    assert.equal(totals.cardPayments, 5_000);
  }
  const reportIds = (state,month,accountId) => reportRows(state,[month],{accountId}).map(row=>row.id);
  assert.deepEqual(reportIds(pending,'2026-12','card'),[]);
  assert.deepEqual(reportIds(pending,'2027-01','card'),[payment.id]);
  assert.deepEqual(reportIds(linked,'2026-12','card'),[statement.transactions[0].id]);
  assert.deepEqual(reportIds(linked,'2027-01','card'),[]);
  for(const state of [pending,linked]){
    for(const accountId of ['', 'bank']){
      assert.deepEqual(reportIds(state,'2027-01',accountId),[payment.id]);
    }
  }
});


test('F-B1 preserves both statement payments while the bank match is pending', t => {
  t.mock.timers.enable({apis:['Date'], now:new Date(2026,10,25,12)});
  const pdf = parseStatement([
    'QNB', 'Hesap Kesim Tarihi: 05/11/2026', 'Onceki Donem Hesap Ozeti Borcu: 180.00',
    'Donem Borcu: 100.00', '03/11/2026 ODEME 40.00', '04/11/2026 ODEME 40.00',
  ].join('\n'));
  const statement = C.importStatement(base(), pdf, 'card');
  const documentIds = statement.transactions.map(row => row.id);
  assert.equal(new Set(documentIds).size, 2);
  const payment = movement('actual-payment', 'bank', 'payment', '2026-11-06', 4_000, 'Kart', {target:'card'});
  const pending = C.addTransaction(statement, payment);
  const candidate = pending.transactions.find(row => row.id === payment.id);
  assert.equal(candidate.matchStatus, 'pending');
  assert.deepEqual(candidate.matchCandidates, documentIds);

  const linked = C.resolveCandidate(pending, payment.id, 'link', documentIds[0]);
  assert.equal(linked.transactions.find(row => row.id === documentIds[0]).linkedTo, payment.id);
  const distinct = C.resolveCandidate(pending, payment.id, 'distinct');

  for (const [state, cardPaid, cardDebt, pendingCount, cardIds] of [
    [pending, 8_000, 10_000, 1, documentIds],
    [linked, 8_000, 10_000, 0, [payment.id, documentIds[1]]],
    [distinct, 12_000, 6_000, 0, [...documentIds, payment.id]],
  ]) {
    const month = '2026-11';
    const {cardPayments, cardCashPayments, cashOut, netExpense} = advancedReports(state, month).current;
    assert.deepEqual({cardPayments, cardCashPayments, cashOut, netExpense}, {
      cardPayments:cardPaid, cardCashPayments:4_000, cashOut:4_000, netExpense:0,
    });
    assert.equal(advancedReports(state, month, {accountId:'card'}).current.cardPayments, cardPaid);
    const bank = advancedReports(state, month, {accountId:'bank'}).current;
    assert.deepEqual([bank.cardPayments, bank.cashOut, C.balance(state,state.accounts[0])], [4_000, 4_000, 96_000]);
    const card = C.cardStatus(state, 'card');
    assert.deepEqual([card.current, card.statementRemaining, card.paidAfterCut, card.pending],
      [cardDebt, cardDebt, 10_000-cardDebt, pendingCount]);

    const rows = accountId => reportRows(state, [month], {accountId}).map(row => row.id).sort();
    assert.deepEqual(rows('card'), [...cardIds].sort());
    assert.deepEqual(rows('bank'), [payment.id]);
    assert.deepEqual(rows(''), [...new Set([...cardIds, payment.id])].sort());

    const documents = state.transactions.filter(row => row.statement === statement.statements[0].id);
    assert.deepEqual(documents.map(row => row.id), documentIds);
    assert.equal(documents.reduce((sum, row) => sum + row.amount, 0), 8_000);
  }
});

test('F-B1 bank-first import retains every candidate through replay and backup', t => {
  t.mock.timers.enable({apis:['Date'], now:new Date(2026,9,25,12)});
  const initial = base();
  initial.accounts[0].opening = 70_000;
  const pdf = parseStatement([
    'QNB', 'Hesap Kesim Tarihi: 05/10/2026', 'Onceki Donem Hesap Ozeti Borcu: 150.00',
    'Donem Borcu: 70.00', '03/10/2026 ODEME 40.00', '04/10/2026 ODEME 40.00',
  ].join('\n'));
  const payment = movement('actual-payment', 'bank', 'payment', '2026-10-06', 4_000, 'Kart', {target:'card'});
  const imported = C.importStatement(C.addTransaction(initial, payment), pdf, 'card');
  const documents = imported.transactions.filter(row => row.kind === 'cardPayment');
  const documentIds = documents.map(row => row.id);
  assert.equal(new Set(documentIds).size, 2);

  const [first, other] = documents;
  // Previously the cut-date preference left a PDF row pointing to another PDF from this statement.
  const old = {...imported, transactions:[
    {...payment, source:'manual', matchStatus:'pending', matchCandidates:[first.id]},
    {...first, matchStatus:undefined, matchCandidates:undefined},
    {...other, matchStatus:'pending', matchCandidates:[first.id]},
  ]};
  const replay = state => C.importStatement(state, pdf, 'card');
  const restore = state => C.reviewLegacy(C.readBackup(C.backupText(state)));
  const month = '2026-10';
  const figures = state => {
    const {cardPayments, cardCashPayments, cashOut, netExpense} = advancedReports(state, month).current;
    const {current, statementRemaining, paidAfterCut, pending} = C.cardStatus(state, 'card');
    return [cardPayments, cardCashPayments, cashOut, netExpense, C.balance(state,initial.accounts[0]),
      current, statementRemaining, paidAfterCut, pending];
  };

  for (const state of [imported, replay(imported), restore(imported), replay(old), restore(old)]) {
    assert.deepEqual(figures(state), [8_000,4_000,4_000,0,66_000,7_000,7_000,0,1]);
    assert.deepEqual(state.transactions.filter(row => row.matchStatus === 'pending').map(row => row.id), [payment.id]);
    assert.deepEqual(state.transactions.find(row => row.id === payment.id).matchCandidates, documentIds);
    const rows = state.transactions.filter(row => row.statement === first.statement);
    assert.deepEqual(rows.map(row => row.id), documentIds);
    assert.equal(rows.reduce((sum,row) => sum + row.amount, 0), 8_000);
    assert.ok(rows.every(C.effective));
    assert.deepEqual(reportRows(state, [month], {accountId:'card'}).map(row => row.id), documentIds);
  }

  for (const id of documentIds) {
    const linked = C.resolveCandidate(restore(imported), payment.id, 'link', id);
    assert.deepEqual(figures(restore(replay(linked))), [8_000,4_000,4_000,0,66_000,7_000,7_000,0,0]);
    assert.deepEqual(linked.transactions.filter(row => row.linkedTo === payment.id).map(row => row.id), [id]);
  }
  const separate = C.resolveCandidate(restore(imported), payment.id, 'distinct');
  assert.deepEqual(figures(restore(replay(separate))), [12_000,4_000,4_000,0,66_000,3_000,3_000,4_000,0]);
});

test('an earlier linked PDF or CSV payment keeps its card month after the bank date arrives', t => {
  const november30 = new Date(2026,10,30,12), december1 = new Date(2026,11,1,12);
  t.mock.timers.enable({apis:['Date'], now:november30});
  const october = {bank:'QNB', period:'2026-10', cut:'2026-10-05', due:null, debt:10_000, rows:[]};
  const initial = C.importStatement(base(), october, 'card');
  const november = parseStatement('QNB\nHesap Kesim Tarihi: 30/11/2026\n30/11/2026 ODEME 40.00');
  const settled = C.importStatement(initial, {...november,debt:6_000,rows:[]}, 'card');
  const posted = [
    C.importStatement(initial, november, 'card'),
    C.importCsv(settled, [{date:'2026-11-30', period:'2026-11', desc:'Sentetik ödeme', cents:4_000,
      kind:'odeme', category:'Kart ödemesi', transactionId:'synthetic-month-boundary'}], 'card'),
  ];
  const bank = initial.accounts.find(account => account.id === 'bank');
  const payment = movement('legacy-bank', 'bank', 'payment', '2026-12-01', 4_000, 'Kart ödemesi', {target:'card'});
  const values = (state,accountId,field) => {
    const {previous,current,totals} = advancedReports(state,'2026-12',{accountId});
    return [previous[field],current[field],totals[field]];
  };
  const ids = (state,month,accountId) => reportRows(state,[month],{accountId}).map(row => row.id);
  for (const imported of posted) {
    t.mock.timers.setTime(november30.getTime());
    const [source] = imported.transactions;
    const legacy = C.readBackup(C.backupText(C.resolveCandidate(
      C.addTransaction(imported,payment),payment.id,'link',source.id)));
    assert.equal(C.balance(legacy,bank),100_000);
    assert.equal(C.cardStatus(legacy,'card').current,6_000);
    assert.deepEqual(values(legacy,'card','cardPayments'),[4_000,0,4_000]);
    assert.deepEqual(values(legacy,'bank','cashOut'),[0,0,0]);

    t.mock.timers.setTime(december1.getTime());
    assert.deepEqual(values(legacy,'card','cardPayments'),[4_000,0,4_000]);
    assert.deepEqual(values(legacy,'','cardPayments'),[4_000,0,4_000]);
    assert.deepEqual(values(legacy,'bank','cardPayments'),[0,4_000,4_000]);
    assert.deepEqual(values(legacy,'','cardCashPayments'),[0,4_000,4_000]);
    assert.deepEqual(values(legacy,'bank','cashOut'),[0,4_000,4_000]);
    assert.deepEqual(values(legacy,'','netExpense'),[0,0,0]);
    assert.equal(C.balance(legacy,bank),96_000);
    const card = C.cardStatus(legacy,'card');
    assert.equal(card.current,6_000);
    assert.equal(card.statementRemaining,source.source==='csv'?6_000:null);
    assert.equal(C.cardEffectDate(legacy,source),'2026-11-30');
    assert.deepEqual(ids(legacy,'2026-11','card'),[source.id]);
    assert.deepEqual(ids(legacy,'2026-12','card'),[]);
    assert.deepEqual(ids(legacy,'2026-11','bank'),[]);
    assert.deepEqual(ids(legacy,'2026-12','bank'),[payment.id]);
    assert.deepEqual(ids(legacy,'2026-12',''),[payment.id]);
  }
});

test('replaying both PDF and CSV preserves economic amounts and skips unresolved duplicate rows', () => {
  const pdf = parseStatement([
    'QNB', 'Hesap Kesim Tarihi: 05/11/2026',
    '29/10/2026 SENTETIK MARKET 75.00',
  ].join('\n'));
  const csv = [
    {date:'2026-10-29', period:'2026-11', desc:'SENTETIK MARKET', cents:7_500,
      kind:'harcama', category:'Market / Gıda', transactionId:'csv-duplicate'},
    {date:'2026-11-02', period:'2026-11', desc:'SENTETIK GIYIM', cents:2_500,
      kind:'harcama', category:'Giyim', transactionId:'csv-new'},
  ];
  const imported = C.importCsv(C.importStatement(base(), pdf, 'card'), csv, 'card');
  const replayed = C.importCsv(C.importStatement(imported, pdf, 'card'), csv, 'card');
  assert.equal(replayed.transactions.filter(row => row.matchStatus === 'pending').length, 1);

  const {current, previous, totals} = advancedReports(replayed, '2026-11');
  assert.equal(previous.spent, 7_500);
  assert.equal(current.spent, 2_500);
  assert.equal(totals.netExpense, 10_000);
  assert.deepEqual(reportRows(replayed, ['2026-10', '2026-11']).map(row => row.amount).sort((a,b) => a - b), [
    2_500, 7_500,
  ]);
});

test('manual installments use their monthly dates and imported installments use the statement period', () => {
  const manual = C.addInstallmentPlan(base(), movement(
    'manual-plan', 'card', 'expense', '2026-01-31', 10_000, 'Giyim',
  ), 3);
  const pdf = parseStatement([
    'QNB', 'Hesap Kesim Tarihi: 05/03/2026', '20/02/2026 SENTETIK KURULUS 50.00 2/3',
  ].join('\n'));
  const state = C.importStatement(manual, pdf, 'card');
  const report = advancedReports(state, '2026-03');

  assert.deepEqual(report.months.slice(-3).map(row => [row.month, row.spent]), [
    ['2026-01', 3_333], ['2026-02', 3_333], ['2026-03', 8_334],
  ]);
  assert.deepEqual(categoryFigures(report.categories), {
    'Giyim':{spent:10_000, refunds:0, net:10_000},
    'Diğer':{spent:5_000, refunds:0, net:5_000},
  });
  assert.deepEqual(reportRows(state, ['2026-03'], {category:'Diğer'}).map(row => row.date), ['2026-02-20']);
  assert.deepEqual(reportRows(state, ['2026-02'], {category:'Diğer'}), []);
});

test('aggregated kuruş remain exact above Number.MAX_SAFE_INTEGER', () => {
  const state = C.validate({
    ...base(),
    transactions: [
      ...Array.from({length:9_008}, (_, index) => movement(
        `large-${index}`, 'bank', 'income', '2026-10-02', 1_000_000_000_000, 'Maaş',
      )),
      movement('single-cent', 'bank', 'income', '2026-11-01', 1, 'Maaş'),
    ],
  });
  const report = advancedReports(state, '2026-11');

  assert.equal(report.previous.income, 9_008_000_000_000_000n);
  assert.equal(report.totals.income, 9_008_000_000_000_001n);
  assert.equal(report.totals.margin, 9_008_000_000_000_001n);
  assert.equal(report.changes.income, -9_007_999_999_999_999n);
});

test('the selected report month ranks gross category share and keeps refund-only categories reachable', () => {
  const state = base();
  state.transactions = [
    movement('market-spend', 'bank', 'expense', '2026-10-04', 60_000, 'Market'),
    movement('market-refund', 'bank', 'refund', '2026-10-08', 10_000, 'Market'),
    movement('other-spend', 'bank', 'expense', '2026-10-04', 40_000, 'Ulaşım'),
    movement('refund-only', 'bank', 'refund', '2026-10-09', 2_000, 'Giyim'),
    movement('other-month', 'bank', 'expense', '2026-09-04', 90_000, 'Eski gider'),
    movement('other-account', 'card', 'expense', '2026-10-04', 90_000, 'Kart gideri'),
  ];
  const html = reportsView({
    state, period:'2026-10', reportFilters:{months:6,accountId:'bank',reveal:false},
    fmt:C.formatMoney, esc:escapeHtml, periodControl:'',
  });
  const categories = [...html.matchAll(/<button[^>]+data-report-category="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(categories.map(([,name])=>name), ['Market','Ulaşım','Giyim']);
  assert.match(categories[0][2], /%60/);
  assert.match(categories[0][2], /₺600,00[\s\S]*₺100,00[\s\S]*₺500,00/);
  assert.match(categories[2][2], /%0/);
  assert.match(categories[2][2], /-₺20,00/);
});

for (const [surface, render] of [
  ['Reports', reportsView],
  ['category', ctx => reportCategoryView(ctx, 'Diğer')],
]) {
  test(`${surface} trend renders exact signed kuruş above Number.MAX_SAFE_INTEGER`, () => {
    const current = C.today().slice(0, 7);
    const [year, month] = current.split('-').map(Number);
    const monthAt = offset => new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
    const previous = monthAt(-1);
    const zero = monthAt(-2);
    const largeRows = (count, kind, period) => Array.from({length:count}, (_, index) =>
      movement(`${kind}-${index}`, 'bank', kind, period+'-01', 1_000_000_000_000, 'Diğer'));
    const state = C.validate({
      ...base(),
      transactions: [
        ...largeRows(9_008, 'expense', current),
        movement('extra-expense', 'bank', 'expense', current+'-01', 1, 'Diğer'),
        ...largeRows(11_260, 'refund', previous),
        movement('extra-refund', 'bank', 'refund', previous+'-01', 3, 'Diğer'),
        movement('zero-expense', 'bank', 'expense', zero+'-01', 100, 'Diğer'),
        movement('zero-refund', 'bank', 'refund', zero+'-01', 100, 'Diğer'),
      ],
    });
    const html = render({
      state, period:current, reportFilters:{months:6,accountId:'bank',reveal:false},
      fmt:C.formatMoney, esc:escapeHtml, periodControl:'', transactionList:() => '', listLimit:150,
    });
    const columns = Object.fromEntries([...html.matchAll(/<li data-trend-month="([\d-]+)"[^>]*>([\s\S]*?)<\/li>/g)]
      .map(([, period, column]) => [period, column]));
    assert.match(columns[current], /class="report-column-value">₺90\.080\.000\.000\.000,01</);
    assert.match(columns[previous], /class="report-column-value">-₺112\.600\.000\.000\.000,03</);
    assert.match(columns[current], /<progress max="1000" value="800" class="report-column">/);
    assert.match(columns[previous], /<progress max="1000" value="1000" class="report-column negative">/);
    assert.match(columns[zero], /class="report-column-value">₺0,00</);
    assert.match(columns[monthAt(-3)], /Kayıt yok/);
  });
}
