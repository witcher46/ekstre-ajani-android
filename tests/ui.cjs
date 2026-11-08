const { chromium }=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../app/src/main/assets'),out=path.resolve(__dirname,'../test-output');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.join(root,req.url==='/'?'index.html':req.url);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-background-networking']});try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});let errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('https://wallet.test/**',route=>{const rel=new URL(route.request().url()).pathname;const file=path.join(root,rel==='/'?'index.html':rel);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});});
 await page.goto('https://wallet.test/');await page.getByRole('heading',{name:'Parana genel bakış'}).waitFor();
 await page.getByRole('button',{name:'Örnek cüzdan',exact:true}).click();await page.getByText('Market alışverişi',{exact:true}).waitFor();
 await page.screenshot({path:path.join(out,'overview.png'),fullPage:true});
 await page.reload();await page.getByText('Market alışverişi',{exact:true}).waitFor();
 await page.locator('nav [data-page="transactions"]').click();await page.locator('[data-edit]').first().click();await page.locator('[name=note]').fill('Mobil deneme');await page.getByRole('button',{name:'Kaydet',exact:true}).click();
 await page.locator('nav [data-page="plan"]').click();await page.getByRole('button',{name:'+ Bütçe',exact:true}).click();await page.locator('[name=amount]').fill('5000');await page.getByRole('button',{name:'Kaydet',exact:true}).click();assert(await page.getByText('Toplam',{exact:true}).count());
 for(const name of ['wallet','transactions','plan','import']){await page.locator(`nav [data-page="${name}"]`).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow: '+name);}
 await page.locator('nav [data-page="home"]').click();await page.getByRole('button',{name:'Raporlar ↗'}).click();await page.getByRole('heading',{name:'Kategori dağılımı'}).waitFor();
 await page.setViewportSize({width:320,height:640});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'reports-small.png'),fullPage:true});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'ui-result.json'),JSON.stringify({passed:true,checks:['first launch','demo','reload persistence','edit note','budget','navigation','390px layout','320px layout','no JS exceptions']},null,2));console.log('UI checks passed');
 }finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
