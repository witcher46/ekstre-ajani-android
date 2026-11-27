const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const openRoute=require('./journey-navigation.cjs');
const digest=raw=>raw===null?'':createHash('sha256').update(raw).digest('hex');
const wallet={format:'ekstre-android',version:1,accounts:[{id:'bank',type:'bank',name:'Sentetik hesap',opening:74325}],transactions:[],statements:[],subscriptions:[],categories:['Diğer'],budgets:{}};
const good=JSON.stringify(wallet,null,2),broken='okunamayan sentetik kayıt';
const screenOutput=process.env.SETTINGS_SCREENSHOTS;

async function settingsLayoutJourney(browser,url,width,scale){
 const page=await browser.newPage({viewport:{width,height:844}});
 const main=page.getByRole('main');
 const dialog=page.getByRole('dialog');
 const focused=locator=>locator.evaluate(node=>node===document.activeElement);
 const back=()=>page.evaluate(()=>window.handleBack());
 const stored=()=>page.evaluate(()=>localStorage.getItem('ekstre-android-v1'));
 const checkGeometry=async scope=>{
  const result=await scope.evaluate(root=>{
   const controls=[...root.querySelectorAll('button,input:not([type=radio]),select,.category-rule-choice')].filter(node=>node.getClientRects().length);
   return {
    overflow:document.documentElement.scrollWidth>innerWidth+1||root.scrollWidth>root.clientWidth+1,
    undersized:controls.filter(node=>node.offsetWidth<48||node.offsetHeight<48).map(node=>node.id||node.textContent.trim()),
   };
  });
  assert.deepEqual(result,{overflow:false,undersized:[]},`${width}px / ${scale}%`);
 };
 const screenshot=async name=>{
  if(!screenOutput)return;
  await page.evaluate(()=>document.querySelector('#toast').classList.remove('visible'));
  await page.screenshot({path:path.join(screenOutput,`${name}-${width}-${scale}.png`),fullPage:!(await dialog.count())});
 };
 const selectFile=async (button,raw)=>{
  const [chooser]=await Promise.all([page.waitForEvent('filechooser'),button.click()]);
  await chooser.setFiles({name:'sentetik.json',mimeType:'application/json',buffer:Buffer.from(raw)});
 };
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  page.setDefaultTimeout(4000);
  await page.goto(url);
  const settings=page.getByRole('button',{name:'Ayarlar',exact:true});
  await settings.waitFor();
  await page.evaluate(({good,wallet})=>{
   localStorage.setItem('ekstre-android-v1',JSON.stringify({...wallet,categories:['Diğer','Sentetik gider kategorisi']}));
   localStorage.setItem('ekstre-android-v1-recovery',good);
  },{good,wallet});
  await page.reload();
  await page.evaluate(scale=>{document.documentElement.style.fontSize=scale+'%';},scale);
  await settings.click();
  const heading=main.getByRole('heading',{level:1});
  assert.equal(await focused(heading),true);
  assert.equal(await main.getByRole('region',{name:'Gizlilik'}).isVisible(),true);
  assert.equal(await main.getByRole('region',{name:'Yedek dışa aktarma'}).getByRole('button',{name:'Yedek dışa aktar'}).count(),1);
  const replace=main.getByRole('region',{name:'Cüzdanı geri yükleme'});
  const restore=replace.getByRole('button',{name:'Yedek yükle',exact:true});
  await checkGeometry(main);
  await screenshot('ayarlar');
  const before=await stored();
  await selectFile(restore,broken);
  await main.getByRole('heading',{name:'Yedekleme işlemi tamamlanamadı'}).waitFor();
  assert.equal(await focused(restore),true);
  assert.equal(await stored(),before);
  await checkGeometry(main);
  await screenshot('yedek-hatasi');
  await selectFile(restore,good);
  assert.equal(await focused(dialog.getByRole('heading',{name:'JSON yedeğini incele'})),true);
  assert.equal(await stored(),before);
  assert.match(await dialog.innerText(),/1 hesap · 0 işlem/);
  assert.doesNotMatch(await dialog.innerText(),/Sentetik hesap|sentetik\.json/);
  await checkGeometry(dialog);
  await screenshot('yedek-onizleme');
  assert.equal(await back(),true);
  assert.equal(await focused(restore),true);
  assert.equal(await stored(),before);

  await selectFile(restore,good);
  await dialog.getByRole('heading',{name:'JSON yedeğini incele'}).waitFor();
  const newer=await page.evaluate(before=>{
   const next=JSON.stringify({...JSON.parse(before),budgets:{'2026-10|Toplam':12345}});
   localStorage.setItem('ekstre-android-v1',next);
   return next;
  },before);
  await dialog.getByRole('button',{name:'Cüzdanı değiştir',exact:true}).click();
  assert.match(await dialog.getByRole('alert').textContent(),/Cüzdan değişti/);
  assert.equal(await focused(dialog.getByRole('alert')),true);
  assert.equal(await stored(),newer);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ekstre-android-v1-recovery')),good);
  assert.equal(await back(),true);
  assert.equal(await focused(restore),true);

  await openRoute(page,'categories');
  assert.equal(await focused(heading),true);
  const addRule=main.getByRole('button',{name:'+ Satıcı kuralı',exact:true});
  await addRule.click();
  await checkGeometry(dialog);
  await dialog.getByLabel('Satıcı adı').fill('Sentetik uzun satıcı kuralı');
  await dialog.getByLabel('Önerilecek kategori').selectOption('Sentetik gider kategorisi');
  await dialog.getByRole('button',{name:'Kaydet',exact:true}).click();
  assert.equal(await focused(addRule),true);
  await checkGeometry(main);
  await screenshot('kategoriler');
  const edit=main.getByRole('button',{name:'Kuralı düzenle',exact:true});
  await edit.click();
  await dialog.getByRole('button',{name:'Kuralı sil',exact:true}).click();
  assert.equal(await focused(dialog.getByRole('heading',{name:'Bu satıcı kuralı silinsin mi?'})),true);
  assert.equal(await back(),true);
  assert.equal(await focused(edit),true);
  await edit.click();
  await dialog.getByRole('button',{name:'Kuralı sil',exact:true}).click();
  await dialog.getByRole('button',{name:'Kuralı sil',exact:true}).click();
  await main.getByText('Henüz kaydedilmiş satıcı kuralı yok.').waitFor();
  assert.equal(await focused(heading),true);
  assert.equal(await back(),true);
  assert.equal(await heading.textContent(),'Ayarlar');

  await page.evaluate(broken=>localStorage.setItem('ekstre-android-v1',broken),broken);
  await page.reload();
  await page.evaluate(scale=>{document.documentElement.style.fontSize=scale+'%';},scale);
  await main.getByRole('heading',{name:'Cüzdan kurtarma',exact:true}).waitFor();
  await checkGeometry(main);
  await screenshot('cuzdan-kurtarma');
  const recover=main.getByRole('button',{name:/Geri yükleme öncesi kopya/});
  await recover.click();
  assert.equal(await focused(dialog.getByRole('heading',{name:'Kurtarma kopyasını incele'})),true);
  await checkGeometry(dialog);
  await screenshot('kurtarma-onizleme');
  assert.equal(await back(),true);
  assert.equal(await focused(recover),true);
  assert.equal(await stored(),broken);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
}

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
    await page.getByRole('main').getByRole('heading',{level:1,name:'Özet',exact:true}).waitFor({timeout:4000});
    assert.equal(await guidance.isVisible(),false,name);
    await page.locator('nav [data-page=wallet]').click({timeout:4000});
    assert.equal(await page.getByRole('button',{name:/^Sentetik hesap Banka hesabı/}).isVisible(),true,name);
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
 if(screenOutput)fs.mkdirSync(screenOutput,{recursive:true});
 await settingsLayoutJourney(browser,url,390,100);
 await settingsLayoutJourney(browser,url,320,200);
 console.log('Settings, Categories, and backup previews passed at 390px/100% and 320px/200%');
 const page=await browser.newPage();
 page.setDefaultTimeout(4000);
 const configure=async (slots,unreadable)=>{
  await page.evaluate(config=>{sessionStorage.setItem('recoveryFixture',JSON.stringify(config));},{slots,unreadable});
  await page.reload();
  await page.locator('#settings').click();
 };
 const details=()=>page.evaluate(()=>window.io);
 const upload=async(raw=good)=>page.locator('#backup-file').setInputFiles({name:'sentetik.json',mimeType:'application/json',buffer:Buffer.from(raw)});
 const recoveryPreview=page.getByRole('dialog',{name:'Kurtarma kopyasını incele'});
 const restorePreview=page.getByRole('dialog',{name:'JSON yedeğini incele'});
 const acceptReplacement=preview=>preview.getByRole('button',{name:'Cüzdanı değiştir',exact:true}).click();
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
  await acceptReplacement(recoveryPreview);
  assert.deepEqual((await details()).recoveries,[[3,digest(good),'']]);
  for(const slot of [3,2]){
   const slots={1:broken,3:'{}',[slot]:good};
   await configure(slots);
   const recover=page.locator('[data-action=recover]').first();
   await recover.click();
   await recoveryPreview.waitFor();
   let io=await details();
   assert.match(await recoveryPreview.innerText(),/1 hesap/);
   assert.match(await recoveryPreview.innerText(),/743,25/);
   assert.match(await recoveryPreview.innerText(),slot===3?/geri yükleme öncesi/i:/son kayıt öncesi/i);
   assert.equal(await page.evaluate(()=>window.handleBack()),true);
   assert.equal(await recover.evaluate(button=>button===document.activeElement),true);
   assert.deepEqual(io.recoveries,[]);
   assert.deepEqual(io.slots,slots);
   await page.evaluate(()=>{window.io.fail=true;});
   await recover.click();
   await acceptReplacement(recoveryPreview);
   assert.deepEqual((await details()).slots,slots);
   assert.match(await page.locator('main').innerText(),/dışa aktarma kapalı/i);
   assert.match(await recoveryPreview.getByRole('alert').innerText(),/Kurtarma kaydedilemedi/);
   assert.equal(await page.locator('#status-announcement').textContent(),'');
   await page.evaluate(()=>window.io.fail=false);
   await acceptReplacement(recoveryPreview);
   io=await details();
   assert.deepEqual(io.recoveries.at(-1),[slot,digest(good),digest(broken)]);
   assert.equal(io.slots[1],good);
   assert.equal(await page.locator('#status-announcement').textContent(),'Cüzdan kurtarıldı.');
   assert.equal(io.saves,0);
   await page.locator('#settings').click();
   await page.locator('[data-action=backup]').click();
   assert.deepEqual(JSON.parse((await details()).exports[0]).accounts,wallet.accounts);
  }
  await configure({1:broken,3:'{}',2:good});
  await upload();
  await restorePreview.waitFor();
  assert.deepEqual((await details()).restores,[]);
  await restorePreview.getByRole('button',{name:'Vazgeç',exact:true}).click();
  assert.deepEqual((await details()).restores,[]);
  await upload();
  await page.evaluate(()=>{window.io.fail=true;});
  await acceptReplacement(restorePreview);
  assert.match(await restorePreview.getByRole('alert').innerText(),/Geri yükleme kaydedilemedi/);
  assert.equal(await page.locator('#status-announcement').textContent(),'');
  assert.deepEqual((await details()).slots,{1:broken,3:'{}',2:good});
  await page.evaluate(()=>{window.io.fail=false;});
  await acceptReplacement(restorePreview);
  assert.deepEqual((await details()).restores.at(-1).slice(0,3),[digest(broken),2,digest(good)]);
  assert.equal(await page.locator('#status-announcement').textContent(),'Yedek geri yüklendi.');
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
  assert.equal(await restorePreview.count(),0);

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
