import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/src/main/assets/core.mjs';
import {categorize} from '../app/src/main/assets/parser.mjs';

test('built-in categories use whole words and leave competing matches for review', () => {
  assert.equal(categorize('BİM / Ankara'), 'Market / Gıda');
  assert.equal(categorize('BIMEKS'), 'Diğer');
  assert.equal(categorize('HEPSIBURADA'), 'Online alışveriş');
  assert.equal(categorize('BİM ECZANE'), 'Diğer');
});

test('a merchant rule preserves custom categories and suggests only an exact normalized merchant', () => {
  const initial = {...C.empty(), categories:['Diğer','Ev alışverişi']};
  const saved = C.saveMerchantRule(initial, '  BİM/Şube 4  ', 'Ev alışverişi');
  assert.equal(C.suggestCategory(saved,'bim – şube 4'), 'Ev alışverişi');
  assert.equal(C.suggestCategory(saved,'BİM / Şube 5'), null);
  assert.equal(C.suggestCategory(saved,'BIMEKS / Şube 4'), null);
  assert.equal(C.suggestCategory(initial,'BİM / Şube 4'), null);
  const restored = C.readBackup(C.backupText(saved));
  assert.deepEqual(restored.categories, initial.categories);
  const edited = C.saveMerchantRule(restored,'BİM / Şube 4','Diğer',saved.merchantCategoryRules[0].id);
  assert.equal(C.suggestCategory(edited,'BİM Şube 4'), 'Diğer');
  assert.equal(C.suggestCategory(C.removeMerchantRule(edited,edited.merchantCategoryRules[0].id),'BİM Şube 4'), null);
});

test('invalid or competing rules are rejected without modifying the wallet', () => {
  const state = C.saveMerchantRule(C.empty(),'BİM','Diğer');
  assert.throws(() => C.saveMerchantRule(state,'bim','Giyim'), /zaten/i);
  assert.throws(() => C.saveMerchantRule(state,'BIMEKS','Olmayan kategori'), /kategori/i);
  assert.equal(state.merchantCategoryRules.length, 1);
  assert.equal(C.suggestCategory(state,'bim'), 'Diğer');
});
