import * as C from './core.mjs';
import {sha256} from './sha256.mjs';

const order = {statement:0, subscription:1, income:2, goal:3};

export function dueItems(wallet, asOf = C.today()) {
  const payments = C.upcomingPayments(wallet, asOf);
  const income = (wallet.incomePlans ?? []).map(row => ({
    type:'income', id:row.id, name:row.name, date:row.next, amount:row.amount,
  }));
  const goals = C.savingsGoals(wallet).filter(row => row.reserved < row.target).map(row => ({
    type:'goal', id:row.id, name:row.name, date:row.due, amount:row.target,
  }));
  return [...payments, ...income, ...goals].map(row => ({
    ...row,
    days:(Date.parse(row.date) - Date.parse(asOf)) / 86400000,
    occurrence:sha256(JSON.stringify([row.type, row.id, row.date])),
  })).sort((a, b) => a.date.localeCompare(b.date) || order[a.type] - order[b.type]);
}

export function notificationPlan(wallet, snoozes, asOf = C.today()) {
  return dueItems(wallet, asOf).flatMap(row => {
    const day = [row.date, snoozes[row.occurrence] ?? row.date, asOf].sort().at(-1);
    // Future-dated manual card payments already in the snapshot can settle a
    // statement between projection and notification.
    if (row.type === 'statement' && day !== asOf &&
        !C.statementPayment(wallet, row.account, day)) return [];
    return [{occurrence:row.occurrence, day}];
  });
}

export function readSnoozes(raw) {
  try {
    const saved = JSON.parse(raw);
    return Object.fromEntries(Object.entries(saved).filter(([id, date]) =>
      /^[a-f0-9]{64}$/.test(id) && C.validDate(date)));
  } catch {
    return {};
  }
}
