import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as C from '../app/src/main/assets/core.mjs';
import * as W from '../app/src/main/assets/wallet.mjs';
import {parseStatement} from '../app/src/main/assets/parser.mjs';

// Synthetic wallets exported by the archived 0.1.0 and 0.1.1 modules and 0.2.0 main.
const statement = parseStatement('QNB\nHesap Kesim Tarihi: 05/10/2026\nOnceki Donem Hesap Ozeti Borcu: 0.00\nDonem Borcu: 80.00\n02/10/2026 SENTETIK BIMEKS 100.00\n03/10/2026 ODEME 20.00');
for (const version of ['0.1.0','0.1.1','0.2.0']) {
  test('restores and reimports a synthetic Android '+version+' backup', () => {
    const raw = readFileSync(new URL('./fixtures/android-'+version+'.json',import.meta.url),'utf8');
    const original = JSON.parse(raw);
    const restored = W.normalizeWallet(C.reviewLegacy(C.readBackup(raw)));
    const reimported = C.importStatement(restored,statement,'synthetic-card');
    assert.deepEqual(C.readBackup(C.backupText(reimported)),reimported);
    assert.deepEqual(reimported.accounts,original.accounts);
    assert.deepEqual(reimported.categories,original.categories);
    assert.deepEqual(reimported.transactions.map(t => t.id).sort(),original.transactions.map(t => t.id).sort());
    const expense = reimported.transactions.find(t => t.id === 'synthetic-spend');
    assert.equal(expense.desc,'Sentetik düzenleme');
    assert.equal(expense.category,'Sentetik özel kategori');
    assert.equal(expense.note,'Sentetik not');
    assert.equal(expense.reviewed,true);
    assert.equal(C.cardStatus(reimported,'synthetic-card').current,8000);
    assert.equal(W.overview(reimported,'2026-10').netExpense,10000);
    assert.equal(W.overview(reimported,'2026-11').plannedIncome,version==='0.2.0'?20000:0);
  });
}
