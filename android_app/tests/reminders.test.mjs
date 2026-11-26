import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../app/src/main/assets/core.mjs';

test('statement due uses the explicit civil date even when the device date differs', context => {
  const wallet = C.empty();
  wallet.accounts = [
    {id:'bank', name:'Synthetic bank', type:'bank', opening:10000},
    {id:'card', name:'Synthetic card', type:'card', opening:0},
  ];
  wallet.statements = [{
    id:'card|2026-11', account:'card', period:'2026-11',
    cut:'2026-11-20', due:'2026-11-30', debt:10000, bank:'Synthetic',
  }];
  const paid = C.addTransaction(wallet, {
    id:'payment', kind:'payment', account:'bank', target:'card', amount:10000,
    date:'2026-11-27', period:'2026-11', desc:'Synthetic payment', category:'Other', note:'',
  });
  context.mock.timers.enable({apis:['Date'],now:new Date(2026,10,27,12)});
  assert.deepEqual(C.upcomingPayments(paid,'2026-11-26').map(row=>row.amount),[10000]);
  context.mock.timers.setTime(new Date(2026,10,26,12).getTime());
  assert.deepEqual(C.upcomingPayments(paid,'2026-11-27'),[]);
});

test('unified reminders use the latest statement and preserve unknown amounts', async () => {
  const {dueItems} = await import('../app/src/main/assets/reminders.mjs');
  let wallet = {...C.empty(), accounts:[
    {id:'bank',name:'Synthetic bank',type:'bank',opening:0},
    {id:'card',name:'Synthetic card',type:'card',opening:0},
  ]};
  wallet.statements = [
    {id:'oct',account:'card',period:'2026-10',cut:'2026-10-20',due:'2026-11-01',debt:5000},
    {id:'nov',account:'card',period:'2026-11',cut:'2026-11-20',due:'2026-11-30',debt:null},
  ];
  wallet.subscriptions = [{id:'same',account:'bank',name:'Synthetic subscription',next:'2026-11-30',amount:3000}];
  wallet.incomePlans = [{id:'same',account:'bank',name:'Synthetic income',next:'2026-11-30',amount:4000}];
  wallet = C.saveSavingsGoal(wallet,{id:'same',name:'Synthetic goal',account:'bank',due:'2026-11-30',target:5000,reserved:0});
  const before = JSON.stringify(wallet);
  const items = dueItems(wallet,'2026-11-26');
  assert.deepEqual(items.map(({type,amount,days})=>[type,amount,days]),[
    ['statement',null,4],['subscription',3000,4],['income',4000,4],['goal',5000,4],
  ]);
  assert.equal(new Set(items.map(row=>row.occurrence)).size,4);
  assert.equal(JSON.stringify(wallet),before);
  const rescheduled = {...wallet,subscriptions:[{...wallet.subscriptions[0],next:'2026-12-30'}]};
  assert.notEqual(dueItems(rescheduled,'2026-11-26').find(row=>row.type==='subscription').occurrence,items[1].occurrence);
});

test('native plan omits a statement already fully paid by the planned notification date', async () => {
  const {dueItems,notificationPlan} = await import('../app/src/main/assets/reminders.mjs');
  const wallet = {...C.empty(), accounts:[
    {id:'bank',name:'Synthetic bank',type:'bank',opening:10000},
    {id:'card',name:'Synthetic card',type:'card',opening:0},
  ], statements:[{id:'nov',account:'card',period:'2026-11',cut:'2026-11-20',due:'2026-11-26',debt:10000}]};
  const paid = C.addTransaction(wallet,{
    id:'payment',kind:'payment',account:'bank',target:'card',amount:10000,
    date:'2026-11-27',period:'2026-11',desc:'Synthetic payment',category:'Other',note:'',
  });
  const [item] = dueItems(paid,'2026-11-26');
  assert.deepEqual(notificationPlan(paid,{},'2026-11-26'),[{occurrence:item.occurrence,day:'2026-11-26'}]);
  assert.deepEqual(notificationPlan(paid,{[item.occurrence]:'2026-11-27'},'2026-11-26'),[]);
  assert.deepEqual(notificationPlan(paid,{},'2026-11-27'),[]);
});
