import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/src/main/assets/core.mjs';
import {categorize,parseStatement} from '../app/src/main/assets/parser.mjs';

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


test('renaming an expense category updates related labels and rules without changing money', () => {
  const state = C.saveMerchantRule({
    ...C.empty(), categories:['Diğer','Ev alışverişi'],
    accounts:[{id:'bank',name:'Sentetik banka',type:'bank',opening:100000}],
    transactions:[
      {id:'expense',account:'bank',date:'2026-10-01',period:'2026-10',desc:'Sentetik gider',kind:'expense',amount:3333,category:'Ev alışverişi'},
      {id:'refund',account:'bank',date:'2026-10-02',period:'2026-10',desc:'Sentetik iade',kind:'refund',amount:100,category:'Ev alışverişi'},
      {id:'income',account:'bank',date:'2026-10-02',period:'2026-10',desc:'Sentetik gelir',kind:'income',amount:500,category:'Ev alışverişi'},
    ],
    budgets:{'2026-10|Ev alışverişi':5000,'2026-10|Toplam':9000},
    subscriptions:[{id:'sub',name:'Sentetik abonelik',account:'bank',next:'2026-11-05',amount:2500,category:'Ev alışverişi'}],
  },'Sentetik mağaza','Ev alışverişi');
  const original = structuredClone(state);
  const next = C.renameExpenseCategory(state,'Ev alışverişi','  Ev giderleri  ');
  assert.deepEqual(next.categories,['Diğer','Ev giderleri']);
  assert.deepEqual(next.transactions.map(t=>t.category),['Ev giderleri','Ev giderleri','Ev alışverişi']);
  assert.equal(next.subscriptions[0].category,'Ev giderleri');
  assert.deepEqual(next.budgets,{'2026-10|Ev giderleri':5000,'2026-10|Toplam':9000});
  assert.equal(C.suggestCategory(next,'Sentetik mağaza'),'Ev giderleri');
  assert.deepEqual(next.transactions.map(({category,...t})=>t),original.transactions.map(({category,...t})=>t));
  assert.deepEqual(next.accounts,original.accounts);
  assert.equal(C.balance(next,next.accounts[0]),C.balance(original,original.accounts[0]));
  assert.equal(C.summary(next,'2026-10').net,C.summary(original,'2026-10').net);
  assert.deepEqual(C.readBackup(C.backupText(next)),next);
  assert.throws(()=>C.renameExpenseCategory(state,'Ev alışverişi','Diğer'),/zaten/i);
  assert.throws(()=>C.renameExpenseCategory({
    ...state,budgets:{...state.budgets,'2026-10|Ev giderleri':8000},
  },'Ev alışverişi','Ev giderleri'),/bütçe/i);
  assert.deepEqual(state,original);
});

test('deleting a category requires resolving its rules and preserves historical labels', () => {
  const state = C.saveMerchantRule({
    ...C.empty(), categories:['Diğer','Ev alışverişi'],
    accounts:[{id:'bank',name:'Sentetik banka',type:'bank',opening:100000}],
    transactions:[{id:'expense',account:'bank',date:'2026-10-01',period:'2026-10',desc:'Sentetik gider',kind:'expense',amount:3333,category:'Ev alışverişi'}],
    budgets:{'2026-10|Ev alışverişi':5000},
  },'Sentetik mağaza','Ev alışverişi');
  const original = structuredClone(state);
  assert.throws(()=>C.removeExpenseCategory(state,'Ev alışverişi'),/kural/i);
  assert.throws(()=>C.removeExpenseCategory(state,'Ev alışverişi',{moveRulesTo:'Ev alışverişi'}),/kategori/i);
  assert.throws(()=>C.removeExpenseCategory(state,'Ev alışverişi',{moveRulesTo:'Eksik'}),/kategori/i);
  const moved = C.removeExpenseCategory(state,'Ev alışverişi',{moveRulesTo:'Diğer'});
  const removed = C.removeExpenseCategory(state,'Ev alışverişi',{removeRules:true});
  for (const next of [moved,removed]) {
    assert.deepEqual(next.categories,['Diğer']);
    assert.deepEqual(next.transactions,state.transactions);
    assert.deepEqual(next.budgets,state.budgets);
    assert.deepEqual(C.readBackup(C.backupText(next)),next);
  }
  assert.equal(moved.merchantCategoryRules[0].id,state.merchantCategoryRules[0].id);
  assert.equal(C.suggestCategory(moved,'Sentetik mağaza'),'Diğer');
  assert.equal(C.suggestCategory(removed,'Sentetik mağaza'),null);
  assert.deepEqual(state,original);
});

test('an approved merchant rule suggests a category across numbered branches in different cities', () => {
  const state = C.saveMerchantRule(C.empty(),'MIGROS 5432 ANKARA','Market / Gıda');
  assert.equal(C.suggestCategory(state,'MİGROS 1234 İZMİR'),'Market / Gıda');
  assert.equal(C.suggestCategory(C.readBackup(C.backupText(state)),'MIGROS 9876 VAN'),'Market / Gıda');
  assert.equal(C.suggestCategory(state,'MIGROS 1234 YABANCI ACIKLAMA'),null);
  assert.equal(C.suggestCategory(state,'MIGROS JET 1234 IZMIR'),null);
  const metro = C.saveMerchantRule(state,'METRO MARKET 5432 ANKARA','Market / Gıda');
  assert.equal(C.suggestCategory(metro,'METRO TURIZM 1234 IZMIR'),null);
  assert.equal(C.suggestCategory(metro,'METRO MARKET 1234 IZMIR'),'Market / Gıda');
  assert.equal(C.suggestCategory(C.saveMerchantRule(C.empty(),'MIGROS','Market / Gıda'),'MIGROS 1234 IZMIR'),'Market / Gıda');
  const generic = C.saveMerchantRule(C.empty(),'POS 5432 ANKARA','Diğer');
  assert.equal(C.suggestCategory(generic,'POS 1234 IZMIR'),null);
  assert.equal(C.suggestCategory(generic,'POS 5432 ANKARA'),'Diğer');
});

test('conflicting branch rules leave an unfamiliar branch unresolved and preserve exact rules', () => {
  let state = C.saveMerchantRule(C.empty(),'MIGROS 5432 ANKARA','Market / Gıda');
  state = C.saveMerchantRule(state,'MIGROS 1234 IZMIR','Diğer');
  assert.equal(C.suggestCategory(state,'MIGROS 5678 BURSA'),null);
  assert.equal(C.suggestCategory(state,'MIGROS 1234 IZMIR'),'Diğer');
  assert.equal(C.suggestCategory(state,'MIGROS 5432 ANKARA'),'Market / Gıda');
  assert.deepEqual(C.readBackup(C.backupText(state)),state);
});


test('the overall budget name cannot be assigned to a new expense category', () => {
  const state = {...C.empty(),budgets:{'2026-10|Toplam':10000}};
  assert.throws(()=>C.renameExpenseCategory(state,'Giyim','Toplam'),/bütçe/i);
  assert.throws(()=>C.addExpenseCategory(state,' Toplam '),/bütçe/i);
  assert.deepEqual(C.addExpenseCategory(state,'  Sentetik kategori ').categories,[...state.categories,'Sentetik kategori']);
  assert.deepEqual(state.budgets,{'2026-10|Toplam':10000});
  const legacy={...state,categories:[...state.categories,'Toplam']};
  assert.deepEqual(C.readBackup(C.backupText(legacy)),legacy);
  assert.deepEqual(C.renameExpenseCategory(legacy,'Toplam','Eski etiket').budgets,state.budgets);
});


test('new PDF rows fall back from removed categories while reimport preserves saved labels', () => {
  const state = {...C.empty(),accounts:[{id:'card',name:'Sentetik kart',type:'card',opening:0}]};
  const parse = period => parseStatement([
    'QNB', 'Hesap Kesim Tarihi: 05/'+period+'/2026',
    'Onceki Donem Hesap Ozeti Borcu: 0.00', 'Donem Borcu: 60.00',
    '01/'+period+'/2026 MIGROS 100.00',
    '02/'+period+'/2026 MIGROS IADE -20.00',
    '03/'+period+'/2026 ODEME 20.00',
  ].join('\n'));
  const original = C.importStatement(state,parse('10'),'card');
  assert.deepEqual(original.transactions.map(t=>t.category),['Market / Gıda','Market / Gıda','Kart ödemesi']);
  const removed = C.removeExpenseCategory(original,'Market / Gıda');
  const next = C.importStatement(removed,parse('11'),'card');
  assert.deepEqual(next.transactions.filter(t=>t.period==='2026-11').map(t=>t.category),['Diğer','Diğer','Kart ödemesi']);
  assert.equal(C.summary(next,'2026-11').net,8000);
  const reimported=C.importStatement(next,parse('10'),'card');
  assert.deepEqual(reimported.transactions.filter(t=>t.period==='2026-10').map(t=>[t.id,t.category]),original.transactions.map(t=>[t.id,t.category]));
  const noFallback=C.removeExpenseCategory(removed,'Diğer');
  assert.deepEqual(C.importStatement(noFallback,parse('11'),'card').transactions.filter(t=>t.period==='2026-11').map(t=>t.category),['','','Kart ödemesi']);
});

test('new subscription payments use an active category and preserve the historical plan', () => {
  const state={...C.empty(),accounts:[{id:'bank',name:'Sentetik banka',type:'bank',opening:10000}],
    subscriptions:[
      {id:'old',account:'bank',name:'Sentetik abonelik',next:'2026-10-01',amount:2000,category:'Abonelik'},
      {id:'legacy',account:'bank',name:'Eski abonelik',next:'2026-10-02',amount:3000},
    ]};
  const paid=C.paySubscription(state,'old',{paidOn:'2026-10-01'});
  const removed=C.removeExpenseCategory(paid,'Abonelik');
  const next=C.paySubscription(removed,'old',{paidOn:'2026-11-01'});
  assert.deepEqual(next.transactions.map(t=>[t.category,t.amount]),[['Abonelik',2000],['Diğer',2000]]);
  assert.equal(next.subscriptions[0].category,'Abonelik');
  assert.equal(C.balance(next,next.accounts[0]),6000);
  const legacy=C.paySubscription(C.removeExpenseCategory(removed,'Diğer'),'legacy',{paidOn:'2026-10-02'});
  assert.equal(legacy.transactions.at(-1).category,'');
  assert.deepEqual(C.readBackup(C.backupText(legacy)),legacy);
});
