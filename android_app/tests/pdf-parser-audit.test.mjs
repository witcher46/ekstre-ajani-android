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

test('QNB rejects unrecognized dates even when the omitted rows cancel out', () => {
  const withRows = date => qnb.replace(
    'ParaPuan', date + ' SENTETIK ALISVERIS 40.00\n' + date + ' SENTETIK IADE -40.00\nParaPuan',
  );
  const supported = parseStatement(withRows('05/10/2026'));
  assert.deepEqual(movements(supported), [...expected, ['expense', 4000, ''], ['refund', 4000, '']]);
  assert.deepEqual(supported.rows.slice(-2).map(row => row.date), ['2026-10-05', '2026-10-05']);
  assert.equal(supported.reconciliation.status, 'verified');

  for (const date of ['2026-10-05', '05-10-2026', '05/10/26']) {
    assert.throws(() => parseStatement(withRows(date)), /işlem tarihi biçimi.*kısmi kayıt/);
  }
});

test('QNB cannot take the amount of an unrecognized date row for the preceding movement', () => {
  const text = qnb.replace(
    'SENTETIK MARKET 100.00',
    'SENTETIK MARKET\n2026-10-05 SENTETIK BASKA ALISVERIS 100.00',
  );
  assert.throws(() => parseStatement(text), /işlem tarihi biçimi.*kısmi kayıt/);
});

test('QNB keeps wrapped movements across pages and ignores unrecognized dates in rewards', () => {
  const text = qnb.replace('SENTETIK MARKET 100.00', 'SENTETIK MARKET\n100.00')
    .replace('04/10/2026 ODEME', '\f\nİşlem Tarihi Açıklama Tutar\n04/10/2026 ODEME')
    .replace('05/10/2026 SENTETIK PUAN', '2026-10-05 SENTETIK PUAN');
  const parsed = parseStatement(text);
  assert.deepEqual(movements(parsed), expected);
  assert.equal(parsed.rows[0].sourceDesc, 'SENTETIK MARKET');
  assert.equal(parsed.reconciliation.status, 'verified');
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

test('Yapı Kredi accepts a TRY-suffixed amount followed by decimal Worldpuan', () => {
  const text = yapi.replace('100,00 0,00', '100,00 TL 0,00');
  const parsed = parseStatement(text);
  assert.deepEqual(movements(parsed), expected);
  assert.equal(parsed.rows[0].sourceDesc, 'SENTETIK MARKET');
  assert.equal(parsed.rows[0].importKey, '["Yapı Kredi","2026-10","2026-10-01","SENTETIK MARKET",10000,""]|1');
  assert.equal(parsed.reconciliation.status, 'verified');
  assert.equal(parsed.reconciliation.statementDebt, 25500);
});

test('Yapı Kredi still rejects foreign or ambiguously labeled amounts next to Worldpuan', () => {
  for (const amountAndPoints of ['100,00 USD 0,00', '100,00 0,00 TL', '100,00 TL 0,00 USD']) {
    const text = yapi.replace('100,00 0,00', amountAndPoints);
    assert.throws(() => parseStatement(text), /para birimi.*kısmi kayıt/, amountAndPoints);
  }
});

test('Yapı Kredi preserves movements, identities, and totals with commentary after the final movement', () => {
  const baseline = parseStatement(yapi);
  assert.equal(baseline.reconciliation.status, 'verified');
  for (const footer of [
    'Ekstre bilgilerine bu bölümde yer verilmiştir.',
    'Ekstre açıklaması: USD ve döviz işlemleri hakkında genel bilgi.',
    'Tutar bilgisine bu bölümde yer verilmiştir.',
  ]) {
    const text = yapi.replace('Worldpuan Detayları', footer + '\nWorldpuan Detayları');
    assert.deepEqual(parseStatement(text), baseline, footer);
  }
});

test('Yapı Kredi still rejects foreign currency evidence after the final movement', () => {
  for (const heading of [
    'Ekstre Para Birimi: USD',
    'USD',
    'Hesap Özeti Borcu (USD): 255,00',
    'Hesap Özeti (USD)',
    'USD Ekstre',
    'Ekstre tutarları USD cinsindendir.',
    'Hesap Özeti USD cinsindendir.',
    'İşlem Tarihi Açıklama Tutar (USD) Tutar (TL)',
    'İşlem Tarihi | Açıklama | USD',
    'Tutar (TL) Tutar (USD)',
    'Tutar USD Worldpuan',
    'Tutar (TL): 255,00 / 100,00 USD',
    'Toplam Tutar: 255,00 USD',
    'Toplam Tutar: USD 255,00',
  ]) {
    const text = yapi.replace('Worldpuan Detayları', heading + '\nWorldpuan Detayları');
    assert.throws(() => parseStatement(text), /para birimi.*kısmi kayıt/, heading);
  }
});

test('Yapı Kredi movement lines and QNB footer lines retain the existing currency cues', () => {
  const commentary = 'Ekstre açıklaması: USD ve döviz işlemleri hakkında genel bilgi.\n';
  const yapiBetweenRows = yapi.replace('04.10.2026 ODEME', commentary + '04.10.2026 ODEME');
  const yapiWrappedRow = yapi.replace('20,00 0,00', '\nDöviz tutar bilgisi 20,00 0,00');
  const qnbAfterRows = qnb.replace('ParaPuan', commentary + 'ParaPuan');
  for (const text of [yapiBetweenRows, yapiWrappedRow, qnbAfterRows]) {
    assert.throws(() => parseStatement(text), /para birimi.*kısmi kayıt/);
  }
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

test('reimporting equivalent QNB amount spellings retains the original transaction and edits', () => {
  const original = parseStatement(qnb.replace('SENTETIK MARKET 100.00', 'SENTETIK MARKET 100.00 01/03'));
  const initial = importStatement(wallet(), original, 'card');
  const edited = updateTransaction(initial, {
    ...initial.transactions[0], desc: 'Sentetik düzenleme', category: 'Ulaşım', note: 'Sentetik not',
  });
  const priorRows = new Map(edited.transactions.map(row => [row.id, row]));
  const mixed = qnb.replace('Borcu: 100.00', 'Borcu (TL): 100.00').replace('Borcu: 255.00', 'Borcu (TL): 255.00')
    .replace('85.00 2/6', '85.00 TL 2/6').replace('-10.00', '-10.00 TL').replace('TESEKKUR 20.00', 'TESEKKUR 20.00 TL');
  for (const [text, amount] of [
    [qnb, '100.00 TL'], [qnb, 'TL 100.00'],
    [mixed, '100.00 USD / TL karşılığı: 100.00'], [mixed, 'TL 100.00 / USD 100.00'],
  ]) {
    const parsed = parseStatement(text.replace('SENTETIK MARKET 100.00', 'SENTETIK MARKET '+amount+' 01/03'));
    assert.equal(parsed.reconciliation.status, 'verified');
    const replay = importStatement(edited, parsed, 'card');
    assert.equal(replay.transactions.length, edited.transactions.length);
    assert.deepEqual(new Map(replay.transactions.map(row => [row.id, row])), priorRows, amount);
  }
});

test('a historical QNB identity with a currency label in the saved description still requires review', () => {
  const corrected = parseStatement(qnb.replace('SENTETIK MARKET 100.00', 'SENTETIK MARKET TL 100.00 01/03'));
  const historical = structuredClone(corrected);
  Object.assign(historical.rows[0], {
    desc: 'SENTETIK MARKET TL',
    sourceDesc: 'SENTETIK MARKET TL',
    importKey: '["QNB","2026-10","2026-10-01","SENTETIK MARKET TL",10000,"01/03"]|1',
  });
  const state = importStatement(wallet(), historical, 'card');
  const before = backupText(state);
  assert.throws(() => importStatement(state, corrected, 'card'), /tekrar aktarımı inceleme/);
  assert.equal(backupText(state), before);
});
