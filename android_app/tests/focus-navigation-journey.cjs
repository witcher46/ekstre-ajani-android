const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../app/src/main/assets');
const settle=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));

async function checkWalletFocus(page,scale){
  await page.locator('nav [data-page=wallet]').click();
  await settle(page);
  const failures=[];
  const counts={Tab:0,'Shift+Tab':0,oversized:0};
  for(const direction of ['Tab','Shift+Tab']){
    for(let step=0;step<20;step++){
      await page.keyboard.press(direction);
      await settle(page);
      const focused=await page.evaluate(()=>{
        const element=document.activeElement;
        if(!element.closest('main'))return null;
        const {top,bottom,height}=element.getBoundingClientRect();
        const navTop=document.querySelector('nav').getBoundingClientRect().top;
        const style=getComputedStyle(element);
        const outline=style.outlineStyle==='none'?0:parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset);
        const name=Object.keys(element.dataset)[0]||element.id;
        return {top,bottom,height,navTop,outline,name};
      });
      if(!focused){
        if(counts[direction])break;
        continue;
      }
      counts[direction]++;
      const {top,bottom,height,navTop,outline,name}=focused;
      const oversized=height>navTop-2*(outline+1);
      if(oversized)counts.oversized++;
      const visible=top>=outline&&(oversized?top<=outline+2:bottom+outline<=navTop);
      if(!outline||!visible)failures.push({direction,name,top,bottom,navTop,outline,oversized});
    }
    assert(counts[direction]>0,scale+'% wallet had no '+direction+' focus observations');
  }
  console.log(scale+'% wallet focus',counts);
  return failures;
}

async function checkDialog(page,opener,expectedTitle){
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog=page.locator('#modal[open]');
  await dialog.waitFor();
  assert.equal(await dialog.locator('#dialog-title').textContent(),expectedTitle);
  const scroll=await page.evaluate(()=>scrollY);
  for(const key of ['Tab','Tab','Shift+Tab']){
    await page.keyboard.press(key);
    await settle(page);
    assert.equal(await dialog.locator(':focus-visible').count(),1,key+' must keep visible focus in the dialog');
    assert.equal(await page.evaluate(()=>scrollY),scroll,key+' must keep the background at its original scroll position');
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  assert(await opener.evaluate(element=>element===document.activeElement),'Escape must restore focus to the opener');
}

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
  try{
    const failures=[];
    for(const scale of [100,200]){
      const page=await browser.newPage({viewport:{width:320,height:640}});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.clock.setFixedTime(new Date('2026-11-26T12:00:00Z'));
      await page.route('https://wallet.test/**',route=>{
        const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
        const file=path.join(root,name);
        if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
        const contentType=name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html';
        return route.fulfill({body:fs.readFileSync(file),contentType});
      });
      await page.goto('https://wallet.test/');
      await page.evaluate(scale=>{document.documentElement.style.fontSize=scale+'%';},scale);
      await page.locator('[data-action=demo]').click();
      failures.push(...(await checkWalletFocus(page,scale)).map(failure=>({scale,...failure})));
      await checkDialog(page,page.locator('#quick-add'),'Hızlı Ekle');
      await page.locator('nav [data-page=transactions]').click();
      await checkDialog(page,page.locator('[data-edit]').first(),'İşlem ayrıntısı');
      assert.deepEqual(errors,[]);
      await page.close();
    }
    assert.deepEqual(failures,[],'Keyboard focus or its outline was obscured');
    console.log('Quick add and edit dialogs retained keyboard focus and restored their openers');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
