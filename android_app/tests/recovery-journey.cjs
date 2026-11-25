const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const digest=raw=>raw===null?'':createHash('sha256').update(raw).digest('hex');
const wallet={format:'ekstre-android',version:1,accounts:[{id:'bank',type:'bank',name:'Sentetik hesap',opening:74325}],transactions:[],statements:[],subscriptions:[],categories:['Diğer'],budgets:{}};
const good=JSON.stringify(wallet,null,2),broken='okunamayan sentetik kayıt';

module.exports=async function recoveryJourney(browser,url){
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
