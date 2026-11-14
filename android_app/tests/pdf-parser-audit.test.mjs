import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStatement } from '../app/src/main/assets/parser.mjs';
import { backupText, empty, importStatement, updateTransaction } from '../app/src/main/assets/core.mjs';

const fixture = name => readFileSync(new URL('./fixtures/pdf-parser-audit/' + name, import.meta.url), 'utf8');
const qnb = fixture('qnb.synthetic.txt');
const yapi = fixture('yapi-kredi.synthetic.txt');
const wallet = () => ({
  ...empty(),
  accounts: [{ id: 'card', name: 'Sentetik kart', type: 'card', opening: 0 }],
});
const movements = statement => statement.rows.map(row => [row.kind, row.amount, row.installment]);
const expected = [
  ['expense', 10000, ''],
  ['expense', 8500, '2/6'],
  ['refund', 1000, ''],
  ['cardPayment', 2000, ''],
];

test('synthetic bank layouts preserve order, amount, installment, and reconciliation', () => {
  const multipageYapi = yapi.replace(
    '04.10.2026 ODEME TESEKKUR 20,00',
    '\f\nİşlem Tarihi Açıklama Tutar (TL) Kalan Tutar/Taksit Worldpuan\n04 Ekim 2026 ÖDEME TEŞEKKÜR +20,00',
  );
  for (const text of [qnb, multipageYapi]) {
    const parsed = parseStatement(text);
    assert.deepEqual(movements(parsed), expected);
    assert.equal(parsed.cut, '2026-10-05');
    assert.equal(parsed.due, '2026-10-15');
    assert.equal(parsed.reconciliation.previousDebt, 10000);
    assert.equal(parsed.reconciliation.statementDebt, 25500);
    assert.equal(parsed.reconciliation.difference, 0);
    assert.equal(parsed.reconciliation.status, 'verified');
  }
});

test('Yapı Kredi keeps the interest row after a repeated column heading', () => {
  const text = yapi.replace('255,00', '256,55').replace(
    'Worldpuan Detayları',
    '\f\nİşlem Tarihi Açıklama Tutar (TL) Kalan Tutar/Taksit Worldpuan\n' +
    '05 Ekim 2026 DÖNEM FAİZİ 1,55 99,99\nWorldpuan Detayları',
  );
  const parsed = parseStatement(text);
  assert.deepEqual(movements(parsed), [...expected, ['expense', 155, '']]);
  assert.equal(parsed.rows.at(-1).sourceDesc, 'DÖNEM FAİZİ');
  assert.equal(parsed.reconciliation.difference, 0);
});

test('synthetic PDF replay preserves edits and mismatched statements preserve the wallet', () => {
  const parsed = parseStatement(qnb);
  const initial = importStatement(wallet(), parsed, 'card');
  const changed = updateTransaction(initial, {
    ...initial.transactions[1],
    desc: 'Sentetik kullanıcı açıklaması',
    category: 'Ulaşım',
    note: 'Sentetik kullanıcı notu',
  });
  const repeated = importStatement(changed, parsed, 'card');
  assert.equal(repeated.transactions.length, changed.transactions.length);
  assert.deepEqual(new Map(repeated.transactions.map(row => [row.id, row])),
    new Map(changed.transactions.map(row => [row.id, row])));
  const before = backupText(repeated);
  const mismatch = parseStatement(qnb.replace('255.00', '255.01'));
  assert.equal(mismatch.reconciliation.difference, 1);
  assert.throws(() => importStatement(repeated, mismatch, 'card'), /uyuşmuyor/);
  assert.equal(backupText(repeated), before);
});

test('missing headers yield unverified state and unknown or malformed statements throw', () => {
  const missing = parseStatement(qnb.replace(/^Dönem Borcu: .+\r?\n/m, ''));
  assert.equal(missing.reconciliation.status, 'unverified');
  assert.deepEqual(missing.reconciliation.missing, ['statementDebt']);
  assert.throws(() => parseStatement(qnb.replace(/^Hesap Kesim Tarihi: .+\r?\n/m, '')), /Kesim tarihi/);
  assert.throws(() => parseStatement(qnb.replace('QNB', 'SENTETIK BANKA')), /destekler/);
  assert.throws(() => parseStatement(qnb.replace('SENTETIK MARKET 100.00', 'SENTETIK MARKET BEDEL OKUNAMADI')), /kısmi kayıt/);
});

test('QNB decodes PDFBox glyphs and excludes a split reward section', () => {
  const text = fixture('qnb-pdfbox-layout.synthetic.txt')
    .replace(/\\x([\da-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\f/g, '\f');
  const parsed = parseStatement(text);
  assert.deepEqual(movements(parsed), [
    ['cardPayment', 2000, ''],
    ['expense', 6000, '2/6'],
    ['refund', 1000, ''],
    ['expense', 9500, ''],
  ]);
  assert.equal(parsed.rows.some(row => row.sourceDesc.includes('ORNEK-A12')), false);
  assert.equal(parsed.cut, '2026-10-05');
  assert.equal(parsed.due, '2026-10-15');
  assert.equal(parsed.reconciliation.previousDebt, 10000);
  assert.equal(parsed.debt, 22500);
  assert.deepEqual(parsed.reconciliation.totals, { expenses: 15500, payments: 2000, refunds: 1000 });
  assert.equal(parsed.reconciliation.status, 'verified');
});

test('Yapı Kredi excludes dated Worldpuan section rows', () => {
  const parsed = parseStatement(fixture('yapi-kredi-points-boundary.synthetic.txt'));
  assert.deepEqual(movements(parsed), expected);
  assert.equal(parsed.reconciliation.status, 'verified');
});

test('QNB rejects a dated purchase lacking an amount before a separate footnote', () => {
  const text = qnb.replace('SENTETIK MARKET 100.00', 'SENTETIK MARKET\nSentetik Siparis Kodu: REF 100.00');
  assert.throws(() => parseStatement(text), /kısmi kayıt/);
});

test('Yapı Kredi does not infer an installment from a merchant reference', () => {
  const text = yapi.replace('SENTETIK MARKET 100,00', 'SENTETIK MARKET REF 1/2 100,00');
  assert.equal(parseStatement(text).rows[0].installment, '');
});
