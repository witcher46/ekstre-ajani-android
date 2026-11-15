import * as C from './core.mjs';
import {paymentRows,periodFigures} from './wallet.mjs';

const amountFields = [
  'income', 'spent', 'refunds', 'netExpense', 'margin', 'cashIn', 'cashOut',
  'cardPayments', 'cardCashPayments', 'cardSpent', 'transfers',
];
const byGrossExpense = (a, b) => C.compareCents(b.spent, a.spent);

function calendarMonths(endMonth, months) {
  if (typeof endMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth)) {
    throw Error('Geçerli bir rapor ayı seç.');
  }
  if (!Number.isSafeInteger(months) || months < 1) throw Error('Geçerli bir rapor aralığı seç.');
  const [year, month] = endMonth.split('-').map(Number);
  const first = year * 12 + month - 1 - months;
  if (first < 0) throw Error('Geçerli bir rapor aralığı seç.');
  // Include the month immediately before the displayed range for the first delta.
  return Array.from({length: months + 1}, (_, index) => {
    const ordinal = first + index;
    const bucketYear = String(Math.floor(ordinal / 12)).padStart(4, '0');
    const bucketMonth = String(ordinal % 12 + 1).padStart(2, '0');
    return `${bucketYear}-${bucketMonth}`;
  });
}

export function advancedReports(state, endMonth, {months = 6, accountId = ''} = {}) {
  const account = state.accounts.find(account => account.id === accountId);
  if (accountId && !account) throw Error('Hesap bulunamadı.');

  const [baseline, ...rows] = calendarMonths(endMonth, months).map(month => {
    const figures = periodFigures(state, month, account);
    const amounts = Object.fromEntries(amountFields.map(field => [field, figures[field]]));
    return {
      month,
      ...amounts,
      incomeByCategory: figures.incomeByCategory,
      categoryBreakdown: figures.categoryBreakdown.sort(byGrossExpense),
    };
  });
  const totals = Object.fromEntries(amountFields.map(field => [field, 0]));
  const categoryTotals = new Map();
  let prior = baseline;
  for (const row of rows) {
    row.changes = Object.fromEntries(amountFields.map(field => [field, C.addCents(row[field], -prior[field])]));
    prior = row;
    for (const field of amountFields) totals[field] = C.addCents(totals[field], row[field]);
    for (const {name, spent, refunds} of row.categoryBreakdown) {
      const category = categoryTotals.get(name) ?? {name, spent: 0, refunds: 0};
      category.spent = C.addCents(category.spent, spent);
      category.refunds = C.addCents(category.refunds, refunds);
      categoryTotals.set(name, category);
    }
  }
  const categories = [...categoryTotals.values()]
    .map(category => ({...category, net: C.addCents(category.spent, -category.refunds)}))
    .sort(byGrossExpense);
  const current = rows.at(-1);
  const previous = rows.at(-2) ?? baseline;
  return {months: rows, totals, current, previous, changes: current.changes, categories};
}

export function reportRows(state, periods, {accountId = '', category} = {}) {
  const months = new Set(periods);
  const calendarRows = [...months].flatMap(period => C.rowsForPeriod(state, period));
  if (category !== undefined) {
    return calendarRows.filter(row => (!accountId || row.account === accountId) &&
      row.category === category && (row.kind === 'expense' || row.kind === 'refund'));
  }
  // Match the payment totals, including a known bank outflow awaiting linkage.
  const rows = [
    ...calendarRows.filter(row => row.kind !== 'payment' && row.kind !== 'cardPayment'),
    ...paymentRows(state).filter(row => months.has(row.date.slice(0,7))),
  ];
  return rows.filter(row => {
    const belongsToAccount = !accountId || row.account === accountId;
    return belongsToAccount || (row.target === accountId && (row.kind === 'transfer' || row.kind === 'payment'));
  });
}
