import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/src/main/assets/core.mjs';
import {renderReviewCenter,reviewCounts} from '../app/src/main/assets/ui/review-center.mjs';
import {renderBottomNavigation,renderMoreNavigation} from '../app/src/main/assets/ui/navigation.mjs';

const seed=()=>{
  const state=C.empty();
  state.accounts=[
    {id:'bank',name:'Sentetik Banka',type:'bank',opening:100000},
    {id:'card',name:'Sentetik Kredi Kartı',type:'card',opening:0},
  ];
  const cardExpense={
    id:'manual-1',source:'manual',account:'card',kind:'expense',date:'2026-11-10',
    period:'2026-11',desc:'Market alışverişi',amount:12345,category:'Market / Gıda',note:'',
  };
  const pendingPdf={
    ...cardExpense,id:'pdf-1',source:'pdf',matchStatus:'pending',
    matchCandidates:[cardExpense.id],desc:'<img src=x onerror=alert(1)>',
  };
  const bankPayment={
    id:'pay-1',source:'manual',account:'bank',target:'card',kind:'payment',date:'2026-11-11',
    period:'2026-11',desc:'Sentetik kart ödemesi',amount:5000,category:'Kart ödemesi',note:'',
    matchStatus:'pending',matchCandidates:[],matchReason:'sourceChanged',
  };
  const csvConflict={
    ...cardExpense,id:'csv-1',source:'csv',matchStatus:'pending',
    matchCandidates:[],matchReason:'csvRepeatedRow',desc:'CSV mükerrer satır',
  };
  state.transactions=[cardExpense,pendingPdf,bankPayment,csvConflict];
  return state;
};

test('review center escapes untrusted descriptions and preserves the financial ledger',()=>{
  const state=seed();
  const snapshot=JSON.stringify(state);
  const before=C.summary(state,'2026-11');
  const cashBefore=C.balance(state,state.accounts[0]);
  const html=renderReviewCenter(state);
  assert.equal(JSON.stringify(state),snapshot);
  assert.deepEqual(C.summary(state,'2026-11'),before);
  assert.equal(C.balance(state,state.accounts[0]),cashBefore);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.match(html,/data-link="pdf-1"/);
  assert.match(html,/data-distinct="pdf-1"/);
  assert.match(html,/data-action="back">Sonra incele/);
  assert.match(html,/data-delete="csv-1"/);
  assert.match(html,/Bu CSV kaydını kaldır/);
  assert.match(html,/Manuel banka ödemesinin banka bakiyesi etkisi korunur/);
  assert.match(html,/Kaynak bağlantısı değişmiş/);
  assert.match(html,/CSV kaynak çakışması|Tekrar eden CSV satırı/);
  assert.deepEqual(reviewCounts(state.transactions),{pending:3,linked:0});
});

test('review center is honest about candidates and shows confirmed links without extra effects',()=>{
  const state=seed();
  const pending=state.transactions.find(t=>t.id==='pdf-1');
  delete pending.matchStatus;
  delete pending.matchCandidates;
  pending.linkedTo='manual-1';
  const html=renderReviewCenter(state);
  assert.match(html,/Onaylanan kaynak bağlantıları · 1/);
  assert.match(html,/data-unlink="pdf-1"/);
  assert.match(html,/Bağlı ana kayıt: Market alışverişi/);
  assert.ok(!html.includes('data-link="pdf-1"'));
  assert.deepEqual(reviewCounts(state.transactions),{pending:2,linked:1});
});

test('review keeps the Transactions path through Diğer and has no current fixed tab',()=>{
  const nav=renderBottomNavigation('review');
  assert.deepEqual([...nav.matchAll(/data-page="([^"]+)"/g)].map(match=>match[1]),['home','wallet','reports']);
  assert.match(nav,/id="more" data-action="openMore" aria-haspopup="dialog"/);
  assert.match(renderMoreNavigation(),/data-action="selectMorePage" data-destination="transactions"/);
  assert.doesNotMatch(nav,/aria-current/);
  assert.match(renderReviewCenter(seed(),'İşlemler'),/data-action="back">Sonra incele · İşlemler<\/button>/);
});
