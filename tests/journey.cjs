const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../app/src/main/assets'),out=path.resolve(__dirname,'../test-output/journey');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-background-networking']});try{
 const page=await browser.newPage({viewport:{width:360,height:780}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('https://wallet.test/**',route=>{const p=path.join(root,new URL(route.request().url()).pathname.replace(/^\/$/,'/index.html'));if(!p.startsWith(root+path.sep)||!fs.existsSync(p))return route.abort();route.fulfill({body:fs.readFileSync(p),contentType:p.endsWith('.mjs')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'});});
 await page.addInitScript(()=>{const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.__exportedBlob=blob;return create(blob);};});
 await page.goto('https://wallet.test/');await page.locator('[data-action=demo]').click();
 const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ekstre-android-v1')));
 let s=await read(),card=s.accounts.find(a=>a.type==='card').id,bank=s.accounts.find(a=>a.type==='bank').id;
 // A manual payment must preserve both bank and card sides through PDF matching.
 await page.locator('[data-action=addTransaction]').click();await page.locator('[name=kind]').selectOption('payment');await page.locator('[name=account]').selectOption(bank);await page.locator('[name=target]').selectOption(card);await page.locator('[name=amount]').fill('100');await page.locator('[name=desc]').fill('Manuel kart ödemesi');await page.locator('[name=date]').fill('2026-10-04');await page.locator('#submit').click();
 assert.equal((await read()).transactions.length,4);
 const pdf='QNB\nHesap Kesim Tarihi: 05/10/2026\n04/10/2026 ODEME INTERNET +100.00';
 await page.evaluate(text=>window.onPdfText(text),pdf);await page.locator('#import-account').selectOption(card);await page.locator('#acknowledge-import').check();await page.locator('[data-action=confirmImport]').click();
 s=await read();assert.equal(s.transactions.length,5);assert.equal(s.transactions.filter(t=>t.matchStatus==='pending').length,1);
 await page.evaluate(text=>window.onPdfText(text),pdf);await page.locator('#import-account').selectOption(card);await page.locator('#acknowledge-import').check();await page.locator('[data-action=confirmImport]').click();assert.equal((await read()).transactions.length,5);
 await page.locator('nav [data-page=home]').click();await page.locator('[data-page=review]').click();await page.locator('[data-link]').click();s=await read();assert.equal(s.transactions.filter(t=>t.linkedTo).length,1);
 // CSV repeated in another order must not duplicate transactions.
 const header='bank,kart,period,date,desc,amount_cents,category,tur\n',csvrows=['QNB,Kart,2026-10,2026-10-01,Sentetik market,10000,Market,harcama','QNB,Kart,2026-10,2026-10-02,Sentetik iade,-2000,Market,indirim'];
 async function csv(rows){await page.locator('#csv-file').setInputFiles({name:'sentetik.csv',mimeType:'text/csv',buffer:Buffer.from(header+rows.join('\n'))});await page.locator('[name=card-0]').selectOption(card);await page.locator('#submit').click();}
 await csv(csvrows);const count=(await read()).transactions.length;await csv([...csvrows].reverse());assert.equal((await read()).transactions.length,count);
 // Planned and paid dates are deliberately different.
 await page.locator('nav [data-page=plan]').click();await page.locator('[data-action=subscription]').click();await page.locator('[name=name]').fill('Sentetik internet');await page.locator('[name=amount]').fill('50');await page.locator('[name=next]').fill('2026-10-15');await page.locator('[name=account]').selectOption(bank);await page.locator('#submit').click();await page.locator('[data-pay]').click();await page.locator('[name=paidOn]').fill('2026-10-20');await page.locator('#submit').click();
 s=await read();assert.equal(s.transactions.at(-1).date,'2026-10-20');assert.equal(s.transactions.at(-1).subscriptionDue,'2026-10-15');assert.equal(s.subscriptions[0].next,'2026-11-15');
 // Native backup I/O has its own Android tests; exercise the real browser download and file input here.
 await page.locator('#settings').click();const downloaded=page.waitForEvent('download');await page.locator('[data-action=backup]').click();const download=await downloaded;const backupPath=path.join(out,'synthetic-backup.json');let downloadSaved=true;try{await download.saveAs(backupPath);}catch{downloadSaved=false;fs.writeFileSync(backupPath,await page.evaluate(()=>window.__exportedBlob.text()));}const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));assert.deepEqual(backup,s);
 await page.locator('nav [data-page=home]').click();await page.locator('[data-action=addTransaction]').click();await page.locator('[name=desc]').fill('Yedek sonrası kayıt');await page.locator('[name=amount]').fill('3');await page.locator('#submit').click();const beforeRestore=await read();assert.equal(beforeRestore.transactions.length,s.transactions.length+1);
 await page.locator('#backup-file').setInputFiles(backupPath);await page.waitForFunction(expected=>localStorage.getItem('ekstre-android-v1')===JSON.stringify(expected),backup);assert.deepEqual(await read(),backup);
 await page.locator('#settings').click();await page.locator('[data-action=recover]').click();assert.deepEqual(await read(),beforeRestore);
 const validRaw=JSON.stringify(await read());await page.locator('#backup-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":9}')});assert.equal(JSON.stringify(await read()),validRaw);
 await page.reload();assert.deepEqual(await read(),beforeRestore);
 // A short viewport stands in for the visible area above the software keyboard.
 await page.setViewportSize({width:320,height:390});await page.locator('nav [data-page=home]').click();await page.locator('[data-action=addTransaction]').click();await page.locator('[name=note]').fill('Klavye açıkken erişilebilir not');await page.locator('#submit').scrollIntoViewIfNeeded();assert(await page.locator('#submit').isVisible());await page.screenshot({path:path.join(out,'modal-short-viewport.png')});await page.evaluate(()=>window.handleBack());assert.equal(await page.locator('dialog[open]').count(),0);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,downloadSaved,checks:['manual payment','PDF preview','PDF repeat','explicit match','CSV reorder','subscription actual date','backup export payload','restore','recovery','invalid backup atomicity','reload','short modal','back button'],errors},null,2));console.log('13 extended UI journey checks passed; browser download saved: '+downloadSaved);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
