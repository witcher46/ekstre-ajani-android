import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStatementCsv, summarize } from './model.mjs';
import { sample } from './sample.mjs';

test('masaüstü CSV başlıkları, BOM, satır sonu, çok satırlı ve kaçışlı açıklama', () => {
  const csv = '\uFEFF' + sample.replaceAll('\n', '\r\n')
    .replace('"Market, alışveriş"', '"Market, ""alışveriş""\r\nşubesi"');
  const rows = parseStatementCsv(csv);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].desc, 'Market, "alışveriş"\r\nşubesi');
});
test('dönem, kuruş toplamı, ödeme ve iade ayrımı', () => {
  const rows = parseStatementCsv(sample).filter(row => row.period === '2026-10');
  assert.deepEqual(summarize(rows), {
    spent: 33050, refunds: 4550, payments: 30000, net: 28500,
    categories: [['Market', 20000], ['Yeme-İçme', 8500]]
  });
});
test('uyumsuz başlık, geçersiz tarih, bozuk tutar ve tırnak reddedilir', () => {
  for (const csv of [
    sample.replace('amount_cents', 'amount'), sample.replace('2026-10-04', '2026-02-30'),
    sample.replace('-4550', '4550'), sample.replace('24550', '24.550'),
    sample.replace('"Market, alışveriş"', '"Market, alışveriş')
  ]) assert.throws(() => parseStatementCsv(csv));
});
