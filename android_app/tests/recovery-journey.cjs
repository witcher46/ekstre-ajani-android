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
 const upload=async()=>page.locator('#backup-file').setInputFiles({name:'sentetik.json',mimeType:'application/json',buffer:Buffer.from(good)});
 try{
  await page.addInitScript(()=>{
   const {slots={},unreadable}=JSON.parse(sessionStorage.getItem('recoveryFixture')||'{}');
   const io=window.io={slots,exports:[],recoveries:[],restores:[],saves:0,confirmations:[],accept:true,fail:false};
   window.confirm=text=>{io.confirmations.push(text);return io.accept;};
   window.Android={
    load:()=>slots[1]??'',
    snapshotSlot(index){if(unreadable===index)throw Error('okuma hatası');return slots[index];},
    exportBackup(raw){io.exports.push(raw);},
    save(){io.saves++;return true;},
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
 }finally{await page.close();}
};
