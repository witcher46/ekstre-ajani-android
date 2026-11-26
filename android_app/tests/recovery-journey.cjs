const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const digest=raw=>raw===null?'':createHash('sha256').update(raw).digest('hex');
const wallet={format:'ekstre-android',version:1,accounts:[{id:'bank',type:'bank',name:'Sentetik hesap',opening:74325}],transactions:[],statements:[],subscriptions:[],categories:['Diğer'],budgets:{}};
const good=JSON.stringify(wallet,null,2),broken='okunamayan sentetik kayıt';

async function startupJourney(browser,url){
 const cases=[
  {name:'structuredClone missing with a bridge',missingClone:true,withBridge:true},
  {name:'structuredClone missing without a bridge',missingClone:true},
  {name:'wallet module unavailable',missingModule:true,withBridge:true},
  {name:'valid wallet',withBridge:true},
  {name:'invalid reminder bridge results',withBridge:true,invalidReminders:true},
  {name:'corrupt wallet',withBridge:true,corrupt:true},
 ];
 for(const scenario of cases){
  const {name,missingClone,missingModule,withBridge,corrupt,invalidReminders}=scenario;
  const page=await browser.newPage({viewport:{width:360,height:780}});
  const slots={1:corrupt?broken:good,3:good};
  const appRequests=[],pageErrors=[];
  page.on('request',request=>{
   if(new URL(request.url()).pathname==='/app.mjs')appRequests.push(request.url());
  });
  page.on('pageerror',error=>pageErrors.push(error.message));
  try{
   if(missingModule)await page.route('**/wallet.mjs',route=>route.abort());
   await page.addInitScript(({missingClone,withBridge,invalidReminders,slots})=>{
    if(missingClone)delete window.structuredClone;
    const io=window.startupIO={reads:[],reminderReads:[],writes:[],storageWrites:[],slots};
    if(withBridge){
     window.Android=new Proxy({
      snapshotSlot(slot){io.reads.push(slot);return slots[slot];},
      load(){io.reads.push(1);return slots[1];},
      reminderStatus(){io.reminderReads.push('reminderStatus');return invalidReminders?false:'off';},
      takeReminderLaunch(){io.reminderReads.push('takeReminderLaunch');return invalidReminders?'true':false;},
     },{
      get(target,method){
       return target[method]||((...args)=>{io.writes.push([method,...args]);return false;});
      },
     });
    }
    for(const method of ['setItem','removeItem','clear']){
     const original=Storage.prototype[method];
     Storage.prototype[method]=function(...args){
      if(this===window.localStorage)io.storageWrites.push([method,...args]);
      return original.apply(this,args);
     };
    }
   },{missingClone,withBridge,invalidReminders,slots});
   await page.goto(url+'/index.html');
   const guidance=page.getByText(/Google Play Store/);
   if(missingClone||missingModule){
    assert.equal(await guidance.isVisible(),true,
     name+': expected visible update instructions; page errors: '+pageErrors.join(', '));
    const instructions=await page.locator('main').innerText();
    for(const step of [/Android System WebView/,/Google Chrome/,/Güncelle/,/yeniden aç/]){
     assert.match(instructions,step,name);
    }
    assert.equal(await page.locator('#settings').isVisible(),false,name);
    if(missingClone)assert.deepEqual(appRequests,[],name+': app module must not load');
    assert.deepEqual((await page.evaluate(()=>window.startupIO)).reads,[],name);
   }else if(corrupt){
    await page.getByRole('heading',{name:'Cüzdan kurtarma'}).waitFor({timeout:4000});
    assert.equal(await page.locator('[data-action=recover][data-slot="3"]').isVisible(),true);
    assert.equal(await guidance.isVisible(),false,name);
    assert.deepEqual((await page.evaluate(()=>window.startupIO)).reads,[1,3,2],name);
   }else{
    await page.getByRole('heading',{name:'Parana genel bakış'}).waitFor({timeout:4000});
    assert.equal(await guidance.isVisible(),false,name);
    await page.locator('nav [data-page=wallet]').click({timeout:4000});
    assert.equal(await page.getByRole('button',{name:/^Sentetik hesap/}).isVisible(),true,name);
    assert.deepEqual((await page.evaluate(()=>window.startupIO)).reads,[1],name);
   }
   assert.deepEqual(pageErrors,[],name);
   const io=await page.evaluate(()=>window.startupIO);
   assert.deepEqual(io.reminderReads,withBridge&&!missingClone&&!missingModule&&!corrupt?
    ['reminderStatus','takeReminderLaunch']:[],name);
   assert.deepEqual(io.writes,[],name);
   assert.deepEqual(io.storageWrites,[],name);
   assert.deepEqual(io.slots,slots,name);
  }finally{await page.close();}
 }
 console.log('Startup capability and recovery scenarios passed');
}

module.exports=async function recoveryJourney(browser,url){
 await startupJourney(browser,url);
 const page=await browser.newPage();
 const configure=async (slots,unreadable)=>{
  await page.evaluate(config=>{sessionStorage.setItem('recoveryFixture',JSON.stringify(config));},{slots,unreadable});
  await page.reload();
  await page.locator('#settings').click();
 };
 const details=()=>page.evaluate(()=>window.io);
 const upload=async(raw=good)=>page.locator('#backup-file').setInputFiles({name:'sentetik.json',mimeType:'application/json',buffer:Buffer.from(raw)});
 try{
  await page.addInitScript(()=>{
   const {slots={},unreadable}=JSON.parse(sessionStorage.getItem('recoveryFixture')||'{}');
   const io=window.io={slots,exports:[],recoveries:[],restores:[],saves:0,confirmations:[],accept:true,fail:false};
   window.confirm=text=>{io.confirmations.push(text);return io.accept;};
   window.Android={
    load:()=>slots[1]??'',
    snapshotSlot(index){if(unreadable===index)throw Error('okuma hatası');return slots[index];},
    exportBackup(raw){io.exports.push(raw);},
    save(raw){io.saves++;slots[1]=raw;return true;},
    recoverSnapshot(slot,sourceToken,currentToken){
     io.recoveries.push([slot,sourceToken,currentToken]);
     if(io.fail)return false;
     slots[1]=slots[slot];return true;
    },
    restoreChecked(current,slot,source,raw){
     io.restores.push([current,slot,source,raw]);
     if(io.fail)return false;
     slots[1]=raw;return true;
    },
   };
  });
  await page.goto(url);
  await configure({});
  assert.equal(await page.locator('[data-action=backup]').count(),1,'Missing SQLite rows return undefined in WebView and must open the empty wallet');
  for(const invalid of [broken,'',JSON.stringify({...wallet,version:99})]){
   await configure({1:invalid,3:good});
   const backup=page.locator('[data-action=backup]');
   if(await backup.count()&&await backup.isEnabled())await backup.click();
   assert.deepEqual((await details()).exports,[],'An unreadable primary must never open the file provider');
   assert.match(await page.locator('main').innerText(),/dışa aktarma kapalı/i);
  }
  for(const slot of [1,3,2]){
   await configure({},slot);
   assert.match(await page.locator('main').innerText(),/dışa aktarma kapalı/i);
   assert.equal(await page.locator('[data-action=backup]').count(),0);
   assert.deepEqual((await details()).exports,[]);
  }
  await configure({3:good});
  assert.match(await page.locator('main').innerText(),/dışa aktarma kapalı/i);
  await page.locator('[data-action=recover][data-slot="3"]').click();
  assert.deepEqual((await details()).recoveries,[[3,digest(good),'']]);
  for(const slot of [3,2]){
   const slots={1:broken,3:'{}',[slot]:good};
   await configure(slots);
   const recover=page.locator('[data-action=recover]').first();
   await page.evaluate(()=>window.io.accept=false);
   await recover.click();
   let io=await details();
   assert.match(io.confirmations.at(-1),/1 hesap/);
   assert.match(io.confirmations.at(-1),/743,25/);
   assert.match(io.confirmations.at(-1),slot===3?/geri yükleme öncesi/i:/son kayıt öncesi/i);
   assert.deepEqual(io.recoveries,[]);
   assert.deepEqual(io.slots,slots);
   await page.evaluate(()=>{window.io.accept=true;window.io.fail=true;});
   await recover.click();
   assert.deepEqual((await details()).slots,slots);
   assert.match(await page.locator('main').innerText(),/dışa aktarma kapalı/i);
   await page.evaluate(()=>window.io.fail=false);
   await recover.click();
   io=await details();
   assert.deepEqual(io.recoveries.at(-1),[slot,digest(good),digest(broken)]);
   assert.equal(io.slots[1],good);
   assert.equal(io.saves,0);
   await page.locator('#settings').click();
   await page.locator('[data-action=backup]').click();
   assert.deepEqual(JSON.parse((await details()).exports[0]).accounts,wallet.accounts);
  }
  await configure({1:broken,3:'{}',2:good});
  await upload();
  await page.waitForFunction(()=>window.io.restores.length===1);
  assert.deepEqual((await details()).restores[0].slice(0,3),[digest(broken),2,digest(good)]);
  await configure({1:good});
  await page.evaluate(()=>window.io.slots[1]='bozuk');
  await page.locator('[data-action=backup]').click();
  assert.deepEqual((await details()).exports,[]);
  for(const slots of [{},{1:null,2:null,3:null}]){
   await configure(slots);
   await page.locator('[data-action=backup]').click();
   assert.deepEqual(JSON.parse((await details()).exports[0]).accounts,[]);
  }
  await configure({1:JSON.stringify({...wallet,accounts:[]})});
  await page.locator('[data-action=backup]').click();
  assert.deepEqual(JSON.parse((await details()).exports[0]).accounts,[]);

  await configure({1:good});
  await page.locator('[data-action=incomeCategory]').click();
  await page.locator('#fields [name=name]').fill('Sentetik eski düzenleme');
  const newer=await page.evaluate(async()=>{
   const {sha256}=await import('/sha256.mjs');
   const originalSave=Android.save;
   Android.save=(raw,expected)=>expected===undefined||expected===sha256(window.io.slots[1])?originalSave(raw):false;
   window.io.slots[1]=JSON.stringify({...JSON.parse(window.io.slots[1]),budgets:{'2026-10|Toplam':12345}});
   sessionStorage.setItem('recoveryFixture',JSON.stringify({slots:window.io.slots}));
   window.io.accept=false;
   return window.io.slots[1];
  });
  await page.locator('#form').evaluate(form=>form.requestSubmit());
  assert.equal((await details()).slots[1],newer,'A normal save must preserve the newer budget and reject the stale edit');
  assert.match(await page.locator('#form-error').innerText(),/cüzdan .*değişti/i);
  assert.match((await details()).confirmations.at(-1),/güncel cüzdanı aç/i);
  await page.evaluate(()=>{window.io.accept=true;});
  await Promise.all([page.waitForEvent('framenavigated'),page.locator('#submit').click()]);
  assert.equal((await details()).slots[1],newer);
  assert.equal(await page.locator('dialog[open]').count(),0);

  const settingsOnly=JSON.stringify({...wallet,accounts:[],categories:['Sentetik özel kategori'],
   budgets:{'2026-10|Sentetik özel kategori':12345},incomeCategories:['Sentetik gelir'],
   syntheticPreferences:{marker:'Yalnız ayarlar'}});
  await configure({1:settingsOnly});
  await page.locator('[data-action=demo]').click();
  assert.equal((await details()).slots[1],settingsOnly,'Demo must preserve all persisted settings in a wallet with no accounts');
  assert.equal((await details()).saves,0);
  assert.match(await page.locator('#error-announcement').innerText(),/henüz kayıt/i);

  await configure({1:good,2:broken,3:settingsOnly});
  const backupSlots=(await details()).slots;
  const subscription={id:'sub',name:'Sentetik abonelik',account:'bank',next:'2026-10-15',amount:1500};
  const statement={id:'statement',account:'bank',cut:'2026-10-05',period:'2026-10',debt:8000,due:null};
  await upload(JSON.stringify({...wallet,subscriptions:[subscription,{...subscription,amount:2500}]}));
  await page.waitForFunction(()=>document.querySelector('#error-announcement').textContent.includes('Abonelik kimliği'));
  await upload(JSON.stringify({...wallet,statements:[statement,{...statement,debt:18000}]}));
  await page.waitForFunction(()=>document.querySelector('#error-announcement').textContent.includes('Ekstre kimliği'));
  assert.deepEqual((await details()).slots,backupSlots);
  assert.deepEqual((await details()).restores,[]);
  assert.deepEqual((await details()).confirmations,[]);

  const expense={id:'bad-expense',account:'bank',target:'cash',kind:'expense',date:'2026-10-01',
   period:'2026-10',amount:2000,desc:'Sentetik gider',category:'Diğer'};
  await upload(JSON.stringify({...wallet,accounts:[{...wallet.accounts[0],opening:10000},
   {id:'cash',type:'cash',name:'Sentetik nakit',opening:0}],transactions:[expense]}));
  await page.waitForFunction(()=>document.querySelector('#error-announcement').textContent.includes('Hedef hesap bağlantısı'));
  assert.deepEqual((await details()).slots,backupSlots);
  assert.deepEqual((await details()).restores,[]);
  assert.deepEqual((await details()).confirmations,[]);
 }finally{await page.close();}
};
