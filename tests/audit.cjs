const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(process.env.AUDIT_ASSETS||path.join(__dirname,'../app/src/main/assets')),before=process.argv.includes('--before'),out=path.resolve(__dirname,'../test-output',before?'before':'after');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-background-networking']});const results=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('https://wallet.test/**',route=>{const rel=new URL(route.request().url()).pathname;const f=path.join(root,rel==='/'?'index.html':rel);if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return route.abort();return route.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.mjs')?'text/javascript':f.endsWith('.css')?'text/css':'text/html'});});
 await page.goto('https://wallet.test/');await page.locator('[data-action=addAccount]').first().waitFor();
 async function addAccount(name,type,opening){await page.locator('[data-action=addAccount]').first().click();await page.locator('[name=name]').fill(name);await page.locator('[name=type]').selectOption(type);await page.locator('[name=opening]').fill(opening);await page.locator('#submit').click();}
 await addAccount('Maaş ve günlük banka hesabım','bank','50000');
 await page.locator('nav [data-page=wallet]').click();await addAccount('Nakit cüzdan','cash','500');await addAccount('QNB günlük kredi kartım','card','0');await addAccount('Yapı Kredi ek kartım','card','0');
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ekstre-android-v1')));
 const accounts=(await saved()).accounts;
 async function transaction(kind,index,amount,desc,target){await page.locator('nav [data-page=home]').click();await page.locator('[data-action=addTransaction]').first().click();await page.locator('[name=kind]').selectOption(kind);await page.locator('[name=account]').selectOption(accounts[index].id);if(target!==undefined)await page.locator('[name=target]').selectOption(accounts[target].id);await page.locator('[name=desc]').fill(desc);await page.locator('[name=amount]').fill(amount);await page.locator('[name=date]').fill('2026-09-30');await page.locator('#submit').click();}
 await transaction('income',0,'30000','Maaş');await transaction('expense',0,'1000','Market');await transaction('expense',1,'100','Nakit ulaşım');await transaction('expense',2,'2000','Kart alışverişi');await transaction('refund',2,'500','Kart iadesi');await transaction('payment',0,'1500','Kart borcu ödemesi',2);await transaction('transfer',0,'300','Nakit çekim',1);
 const flowState=await saved();assert.equal(flowState.transactions.length,7);await page.reload();assert.equal((await saved()).transactions.length,7);fs.writeFileSync(path.join(out,'journey-state.json'),JSON.stringify(flowState,null,2));
 const seed=structuredClone(flowState);seed.accounts[0].opening=999999999999;seed.accounts[2].opening=999999999999;seed.transactions.push({id:'long',account:seed.accounts[2].id,date:'2026-09-30',period:'2026-09',desc:'Çok uzun mağaza açıklaması '.repeat(12),category:'Özel çok uzun kategori adı '.repeat(4),amount:999999999999,kind:'expense',note:''});seed.categories.push(seed.transactions.at(-1).category);seed.budgets['2026-09|Toplam']=999999999999;seed.subscriptions.push({id:'sub',name:'Uzun isimli aylık internet ve dijital içerik aboneliği',account:seed.accounts[0].id,amount:999999999999,next:'2026-09-25'});
 await page.evaluate(s=>localStorage.setItem('ekstre-android-v1',JSON.stringify(s)),seed);
 for(const width of [320,360,390,412])for(const scale of [1,1.5]){
  await page.setViewportSize({width,height:844});await page.reload();
  for(const name of ['home','wallet','transactions','plan','reports','import','settings',...(!before?['bankDetail','cardDetail','incomePlans','importPreview','transactionModal','paymentModal']:[])]){
   if(await page.locator('dialog[open]').count())await page.evaluate(()=>window.handleBack());
   if(['bankDetail','cardDetail'].includes(name)){await page.locator('nav [data-page=wallet]').click();await page.locator(name==='cardDetail'?'[data-card-view]':'[data-account-view]').first().click();}
   else if(name==='incomePlans'){await page.locator('nav [data-page=home]').click();await page.locator('[data-page=incomePlans]').first().click();}
   else if(name==='importPreview'){await page.evaluate(()=>window.onPdfText('QNB\nHesap Kesim Tarihi: 05/10/2026\n04/10/2026 SENTETIK UZUN MAGAZA PEN 4.ndirim 9999999999.99'));}
   else if(['transactionModal','paymentModal'].includes(name)){await page.locator('nav [data-page=home]').click();await page.locator(name==='paymentModal'?'[data-action=payCard]':'[data-action=addTransaction]').first().click();}
   else if(name==='settings')await page.locator('#settings').click();else if(name==='reports'){await page.locator('nav [data-page=home]').click();await page.locator('[data-page=reports]').click();}else await page.locator(`nav [data-page=${name}]`).click();
   if(!await page.locator('dialog[open]').count()&&await page.locator('#period').count())await page.locator('#period').fill('2026-09');
   await page.evaluate(scale=>{if(scale===1)return;const all=[...document.querySelectorAll('main *,nav *,header *,dialog *')].map(e=>{const size=Number(e.dataset.auditBaseFont)||parseFloat(getComputedStyle(e).fontSize);e.dataset.auditBaseFont=size;return [e,size];});for(const [e,n]of all)e.style.fontSize=(n*scale)+'px';},scale);
   await page.waitForTimeout(30);
   const findings=await page.evaluate(()=>{const result=[];const rect=e=>e.getBoundingClientRect(),intersects=(a,b)=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1;
    if(document.documentElement.scrollWidth>innerWidth+1)result.push('page-overflow');
    for(const row of document.querySelectorAll('main .row,main .chart-label,main .grid,main .summary-grid,main .comparison-values,main .quick-actions,main .compact-totals>div,main .card-details>div')){const children=[...row.children];for(let i=0;i<children.length;i++)for(let j=i+1;j<children.length;j++){const a=rect(children[i]),b=rect(children[j]);if(intersects(a,b))result.push('sibling-overlap:'+row.className);}}
    for(const e of document.querySelectorAll('main .money,dialog .money')){const r=document.createRange();r.selectNodeContents(e);const box=e.getBoundingClientRect(),text=r.getBoundingClientRect();if(text.left<box.left-1||text.right>box.right+1||text.right>innerWidth+1)result.push('money-clipped');if(text.height>parseFloat(getComputedStyle(e).fontSize)*1.8)result.push('money-wrapped');}
    for(const e of document.querySelectorAll('button'))if(e.closest('main')&&e.getBoundingClientRect().width<44)result.push('small-target');return [...new Set(result)];});
   results.push({width,scale,page:name,findings});if((width===320||width===390)&&scale===1.5&&['home','wallet','transactions','plan','reports','cardDetail','bankDetail','incomePlans','importPreview','transactionModal','paymentModal'].includes(name)){await page.evaluate(()=>document.querySelector('#toast').classList.remove('visible'));await page.screenshot({path:path.join(out,`${name}-${width}-150.png`),fullPage:true});}
  }
 }
 fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify({cases:results,errors},null,2));console.log(JSON.stringify({before,cases:results.length,failed:results.filter(r=>r.findings.length).length,errors}));if(!before){assert.deepEqual(errors,[]);assert.equal(results.filter(r=>r.findings.length).length,0);}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
