const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../app/src/main/assets');
const settle=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));

async function serveWallet(page){
  await page.clock.setFixedTime(new Date('2026-11-26T12:00:00Z'));
  await page.route('https://wallet.test/**',route=>{
    const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
    const file=path.join(root,name);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
    const contentType=name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html';
    return route.fulfill({body:fs.readFileSync(file),contentType});
  });
}

async function checkTransactionEmptyStates(browser){
  const fixture=require('./fixtures/android-0.2.0.json');
  const row={id:'u06-bank-expense',account:'synthetic-bank',date:'2026-11-02',
    period:'2026-11',kind:'expense',amount:100,category:'Sentetik özel kategori',desc:'Sentetik market'};
  const wallet={...fixture,transactions:[row],statements:[]};
  const page=await browser.newPage({timezoneId:'UTC',viewport:{width:360,height:640}});
  try{
    page.setDefaultTimeout(5000);
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await serveWallet(page);
    const goToTransactions=async()=>{
      await page.goto('https://wallet.test/');
      await page.locator('nav [data-page=transactions]').click();
    };
    const list=page.locator('#transactions-list');
    const search=page.getByRole('searchbox');
    const transaction=list.getByRole('button',{name:/Sentetik market/});
    async function expectEmpty(title,context){
      assert.equal(await list.locator('.empty b').textContent(),title,context);
      assert.equal(await list.getByRole('button').count(),0,context);
    }

    await goToTransactions();
    await expectEmpty('Buradan başlayalım','fresh wallet');
    assert.equal(await list.locator('.empty p').textContent(),
      'Henüz işlem yok. Hesap ekleyebilir veya bir ekstre aktarabilirsin.');

    await page.addInitScript(wallet=>localStorage.setItem('ekstre-android-v1',JSON.stringify(wallet)),wallet);
    await goToTransactions();
    assert.equal(await search.inputValue(),'');
    await transaction.waitFor();

    await search.focus();
    for(const [key,value] of [['x','x'],['y','xy']]){
      await page.keyboard.press(key);
      assert.equal(await search.inputValue(),value,'typing continues after the list rerenders');
      assert.equal(await search.evaluate(el=>el===document.activeElement),true,'search retains keyboard focus');
    }
    await expectEmpty('Eşleşen işlem bulunamadı','search with no matches');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await transaction.waitFor();
    assert.equal(await search.evaluate(el=>el===document.activeElement),true,'clearing search retains keyboard focus');
    await page.keyboard.press('Space');
    assert.equal(await search.inputValue(),' ');
    await transaction.waitFor();
    await page.keyboard.press('Backspace');

    const kind=page.locator('#f-kind-filter');
    await kind.selectOption('income');
    await expectEmpty('Eşleşen işlem bulunamadı','transaction type with no matches');
    await kind.selectOption('');
    await transaction.waitFor();

    const period=page.locator('#period');
    await period.fill('2026-10');
    await expectEmpty('Bu kapsamda işlem yok','month without transactions');
    await search.fill('market');
    await expectEmpty('Bu kapsamda işlem yok','search within an empty month');
    await search.clear();
    await period.fill('2026-11');
    await transaction.waitFor();

    const scope=page.locator('#f-view-mode');
    await scope.selectOption('statement');
    await expectEmpty('Bu kapsamda işlem yok','statement scope excludes the bank transaction');
    await scope.selectOption('calendar');
    await transaction.waitFor();
    assert.deepEqual(errors,[]);
    console.log('U06 first-use copy, period and statement scope, search and filter no-match, and keyboard recovery passed');
  }finally{
    await page.close();
  }
}

async function checkShowMore(browser){
  const fixture=require('./fixtures/android-0.2.0.json');
  const sample=fixture.transactions[0],statement=fixture.statements[0];
  const category=sample.category,statementId=sample.account+'|2026-11';
  const rows=Array.from({length:302},(_,i)=>({
    id:'u05-'+i,account:sample.account,statement:statementId,source:'pdf',
    date:'2026-11-02',period:'2026-11',kind:'expense',amount:100,category,
    desc:'Sentetik U05 hareket '+i,...(i===150?{sourceDesc:'SENTETIK MARKET'}:{}),
  }));
  const other={id:'u05-other',account:sample.account,date:'2026-11-03',period:'2026-11',
    kind:'expense',amount:100,category:'Diğer',desc:'Kapsam dışı sentetik hareket'};
  const wallet={...fixture,transactions:[...rows,other],
    statements:[{...statement,id:statementId,period:'2026-11',cut:'2026-11-05',imported:'2026-11-05'}],
    merchantCategoryRules:[{id:'u05-rule',merchant:'SENTETIK MARKET',category:'Diğer'}]};
  const rowIds=rows.map(row=>row.id);
  const page=await browser.newPage({timezoneId:'UTC',viewport:{width:360,height:640}});
  try{
    page.setDefaultTimeout(5000);
    const errors=[],failures=[];
    page.on('pageerror',error=>errors.push(error.message));
    await serveWallet(page);
    await page.addInitScript(wallet=>localStorage.setItem('ekstre-android-v1',JSON.stringify(wallet)),wallet);
    const stored=()=>page.evaluate(()=>localStorage.getItem('ekstre-android-v1'));
    const activeIn=list=>list.evaluate(scope=>{
      const active=document.activeElement;
      const {dataset,tagName}=active;
      if(!scope.contains(active))return 'outside list ('+tagName+')';
      return dataset.edit??[dataset.action,dataset.transactionId].filter(Boolean).join(':');
    });
    async function expand(name,list,key,ids,shown,tabTarget){
      const more=list.getByRole('button',{name:'Daha fazla göster',exact:true});
      const renderedIds=()=>list.locator('button[data-edit]').evaluateAll(buttons=>buttons.map(button=>button.dataset.edit));
      assert.deepEqual(await renderedIds(),ids.slice(0,shown),name+' before expanding');
      await more.focus();
      await page.keyboard.press(key);
      assert.deepEqual(await renderedIds(),ids.slice(0,shown+150),name+' after expanding');
      assert.equal(await more.count(),ids.length>shown+150?1:0,name+' continuation');
      const focused=await activeIn(list);
      await page.keyboard.press('Tab');
      const tab=await activeIn(list);
      const expectedFocus=ids[shown],expectedTab=tabTarget??ids[shown+1];
      if(focused!==expectedFocus||tab!==expectedTab)failures.push({name,key,focused,expectedFocus,tab,expectedTab});
      assert.equal(await stored(),original,name+' preserves the stored wallet');
    }
    const goHome=()=>page.goto('https://wallet.test/');
    const transactionView=page.locator('main');
    const suggestionTab='applyCategorySuggestion:u05-150';

    await goHome();
    const original=await stored();
    await page.locator('nav [data-page=transactions]').click();
    await page.locator('#search').fill('Sentetik U05');
    await expand('transactions with search',transactionView,'Enter',rowIds,150,suggestionTab);
    await expand('transactions final page',transactionView,'Space',rowIds,300);

    await goHome();
    await page.locator('[data-expense-category]').filter({hasText:category}).click();
    await expand('expense category drilldown',transactionView,'Space',rowIds,150,suggestionTab);

    for(const [name,scope,ids,key] of [
      ['report category','#report-category-transactions',rowIds,'Enter'],
      ['report movements','#report-movements',[other.id,...rowIds],'Space'],
    ]){
      await goHome();
      await page.locator('[data-page=reports]').click();
      await page.locator('#f-report-category').selectOption('category:'+category);
      await page.locator('#report-movements-toggle').click();
      await expand(name,page.locator(scope),key,ids,150);
    }

    await goHome();
    await page.locator('nav [data-page=import]').click();
    await page.locator('[data-statement-view]').click();
    await expand('statement detail',transactionView,'Enter',rowIds,150);
    assert.deepEqual(errors,[]);
    assert.deepEqual(failures,[],'U05 must focus the first new primary control and continue from it with Tab');
    console.log('U05 Enter/Space and Tab passed in transactions, category drilldown, both report lists, and statement detail');
  }finally{
    await page.close();
  }
}

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
    await checkTransactionEmptyStates(browser);
    await checkShowMore(browser);
    const failures=[];
    for(const scale of [100,200]){
      const page=await browser.newPage({viewport:{width:320,height:640}});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await serveWallet(page);
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
