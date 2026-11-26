const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../app/src/main/assets');
const settle=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));

async function serveWallet(page,appSuffix=''){
  await page.clock.setFixedTime(new Date('2026-11-26T12:00:00Z'));
  await page.route('https://wallet.test/**',route=>{
    const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
    const file=path.join(root,name);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
    const contentType=name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html';
    const body=fs.readFileSync(file);
    return route.fulfill({
      body:name==='app.mjs'&&appSuffix?Buffer.concat([body,Buffer.from(appSuffix)]):body,
      contentType,
    });
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

async function checkBackNavigation(browser){
  const C=await import('../app/src/main/assets/core.mjs');
  const fixture=structuredClone(require('./fixtures/android-0.2.0.json'));
  fixture.accounts[0].name='Sentetik <kart> & kredi';
  fixture.transactions.push({
    ...fixture.transactions[2],id:'u08-pending',matchStatus:'pending',matchCandidates:[],matchReason:'sourceChanged',
  });
  const wallet=C.addBalanceObservation(fixture,{
    accountId:'synthetic-bank',observedDate:'2026-10-15',observedAmountCents:100000,sourceKind:'bankDocument',
  });
  const page=await browser.newPage({timezoneId:'UTC',viewport:{width:360,height:640}});
  try{
    page.setDefaultTimeout(5000);
    const errors=[],failures=[];
    page.on('pageerror',error=>errors.push(error.message));
    // The app starts at home and its child routes normally have an opener.
    // Empty only the stack to exercise the production Back click with no opener.
    await serveWallet(page,'\nwindow.clearBackHistoryForTest=()=>{history.length=0;render();};\n');
    await page.addInitScript(wallet=>localStorage.setItem('ekstre-android-v1',JSON.stringify(wallet)),wallet);
    const home=()=>page.goto('https://wallet.test/');
    const tab=route=>page.locator('nav [data-page="'+route+'"]').click();
    const button=selector=>page.locator('main button'+selector);
    const heading=()=>page.locator('main h1').innerText();
    const nativeBack=()=>page.evaluate(()=>window.handleBack());
    const scroll=()=>page.evaluate(()=>window.scrollY);
    const focused=locator=>locator.evaluateAll(elements=>elements.includes(document.activeElement));
    const check=(name,actual,expected)=>{
      if(actual!==expected)failures.push({name,actual,expected});
    };
    const statement='QNB · 2026-10',card='Sentetik <kart> & kredi',renamedCard=card+' yeni',bank='Sentetik banka';
    const back=button('.back-link');
    const deferReview=page.getByRole('button',{name:'Sonra incele'});
    async function checkBack(control,destination,expectedName=destination){
      const visible=expectedName===destination?'← '+destination:expectedName;
      check('visible Back label to '+destination,await control.innerText(),visible);
      const accessible=await control.ariaSnapshot();
      check('accessible Back name to '+destination,accessible,'- button "'+expectedName+'"');
      await control.click();
      check('Back destination',await heading(),destination);
    }
    async function checkFallback(control,destination,expectedName){
      await page.evaluate(()=>window.clearBackHistoryForTest());
      await checkBack(control,destination,expectedName);
      check('native Back after fallback to '+destination,await nativeBack(),false);
      check('repeated native Back after fallback to '+destination,await nativeBack(),false);
      check('fallback did not revisit the abandoned view',await heading(),destination);
    }

    await home();
    await tab('import');
    const importedStatement=button('[data-statement-view]');
    await importedStatement.click();
    assert.equal(await heading(),statement);
    await checkBack(back,'Ekstreler');
    check('statement list opener restored',await focused(importedStatement),true);
    await importedStatement.click();
    const openCard=button('[data-card-view="synthetic-card"]');
    await openCard.click();
    assert.equal(await heading(),card);
    await checkBack(back,statement);
    check('statement card opener restored',await focused(openCard),true);

    await home();
    await tab('wallet');
    const walletCard=button('[data-card-view="synthetic-card"]');
    await walletCard.click();
    const lastStatement=button('.card-statement-link');
    await lastStatement.evaluate(element=>element.scrollIntoView({block:'center'}));
    const cardScroll=await scroll();
    assert(cardScroll>0,'synthetic card opener should be below the fold');
    await lastStatement.click();
    assert.equal(await heading(),statement);
    const quickAdd=page.locator('#quick-add');
    await quickAdd.click();
    assert.equal(await page.locator('#modal[open]').count(),1);
    check('native Back closes the modal',await nativeBack(),true);
    check('modal closed',await page.locator('#modal[open]').count(),0);
    check('native Back leaves statement open after closing the modal',await heading(),statement);
    check('modal opener restored',await focused(quickAdd),true);
    await openCard.click();
    await button('[data-account="synthetic-card"]').click();
    await page.locator('#modal [name=name]').fill(renamedCard);
    await page.locator('#submit').click();
    assert.equal(await heading(),renamedCard);
    await checkBack(back,statement);
    await checkBack(back,renamedCard);
    check('card statement opener restored',await focused(lastStatement),true);
    check('card source scroll restored',await scroll(),cardScroll);

    const historyPanel=page.locator('main details').filter({has:page.getByText(/^Ekstre geçmişi ·/)});
    const historyStatement=historyPanel.locator('button[data-statement-view]');
    await historyPanel.locator('summary').click();
    await historyStatement.evaluate(element=>element.scrollIntoView({block:'center'}));
    const historyScroll=await scroll();
    await historyStatement.click();
    assert.equal(await heading(),statement);
    await checkBack(back,renamedCard);
    check('card history opener restored',await focused(historyStatement),true);
    check('card history scroll restored',await scroll(),historyScroll);
    await checkBack(back,'Cüzdanım');
    check('wallet card opener restored',await focused(walletCard),true);
    check('native Back unwinds normal history',await nativeBack(),true);
    check('normal history returns to home',await heading(),'Parana genel bakış');
    check('native Back yields at the root',await nativeBack(),false);

    await home();
    await tab('transactions');
    await page.locator('#search').fill('Sentetik');
    const openReview=button('[data-page=review]');
    await openReview.click();
    assert.equal(await deferReview.count(),1,'quality journey review deferral locator is unique');
    await checkBack(deferReview,'İşlemler','Sonra incele · İşlemler');
    check('transaction query restored',await page.locator('#search').inputValue(),'Sentetik');
    check('review opener restored',await focused(openReview),true);
    await openReview.click();
    await checkFallback(deferReview,'Ekstreler','Sonra incele · Ekstreler');

    await home();
    await tab('import');
    await importedStatement.click();
    await checkFallback(back,'Ekstreler');

    for(const [route,action] of [['balance-review','balanceBack'],['balance-history','balanceHistoryBack']]){
      await home();
      await tab('wallet');
      const walletBank=button('[data-account-view="synthetic-bank"]');
      await walletBank.click();
      const opener=button('[data-'+route+']');
      await opener.click();
      const balanceBack=button('[data-action="'+action+'"]');
      assert.equal(await balanceBack.count(),1,'existing '+action+' selector finds the Back button');
      await checkBack(balanceBack,bank);
      check(route+' opener restored',await focused(opener),true);
      await opener.click();
      await checkFallback(balanceBack,'Cüzdanım');
    }

    assert.deepEqual(errors,[]);
    assert.deepEqual(failures,[],'U08 Back labels, destinations, and history');
    console.log('U08 Back destinations, legacy balance actions, unique review deferral, empty history, opener/scroll/query restoration, and modal-first native Back passed');
  }finally{
    await page.close();
  }
}

async function checkIncomePlansHeading(browser){
  const page=await browser.newPage({viewport:{width:360,height:640}});
  try{
    page.setDefaultTimeout(5000);
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await serveWallet(page,'\nwindow.readBackTitleForTest=backDestinationTitle;\n');
    await page.goto('https://wallet.test/');
    const main=page.getByRole('main');
    const plans=main.getByRole('region',{name:'Gelir planları'});
    const panels=['Planlanan gelir bakiye değildir','Alındı onayı bekleyen planlar',
      'Gelir kategorileri','Alınmış planlı gelirler'];
    const routeHeading=()=>main.locator('h1').evaluateAll(headings=>({
      titles:headings.map(heading=>heading.textContent),
      tabIndex:headings[0]?.getAttribute('tabindex'),
      focused:headings.includes(document.activeElement),
    }));

    await main.getByRole('button',{name:'Gelir planları',exact:true}).click();
    assert.deepEqual(await routeHeading(),{titles:['Gelir planları'],tabIndex:'-1',focused:true},
      'standalone income plans must have one focusable and focused h1');
    assert.deepEqual(await plans.getByRole('heading',{level:2}).allTextContents(),panels);

    await page.locator('nav [data-page=plan]').click();
    assert.deepEqual(await routeHeading(),{titles:['Planlama'],tabIndex:'-1',focused:true},
      'Planlama must keep its sole h1 and receive route focus');
    assert.deepEqual(await plans.getByRole('heading',{level:2}).allTextContents(),['Gelir planları']);
    assert.deepEqual(await plans.getByRole('heading',{level:3}).allTextContents(),panels);
    assert.equal(await page.evaluate(()=>window.readBackTitleForTest()),'Gelir planları');
    assert.deepEqual(errors,[]);
    console.log('U09 standalone and embedded income plan headings, route focus, and Back destination title passed');
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

async function checkReviewCheckbox(browser){
  const fixture=require('./fixtures/android-0.2.0.json');
  const row={id:'u10-review',account:'synthetic-bank',date:'2026-11-02',period:'2026-11',
    kind:'expense',amount:100,category:'Sentetik özel kategori',desc:'Sentetik inceleme'};
  const wallet={...fixture,transactions:[row],statements:[]};
  const page=await browser.newPage({timezoneId:'UTC',viewport:{width:390,height:844}});
  try{
    page.setDefaultTimeout(5000);
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',confirmation=>{
      errors.push('Unexpected browser dialog: '+confirmation.type());
      return confirmation.dismiss();
    });
    await serveWallet(page);
    await page.addInitScript(wallet=>localStorage.setItem('ekstre-android-v1',JSON.stringify(wallet)),wallet);
    await page.goto('https://wallet.test/');
    await page.locator('nav [data-page=transactions]').click();

    const transaction=page.getByRole('button',{name:/Sentetik inceleme/});
    const dialog=page.getByRole('dialog',{name:'İşlem ayrıntısı'});
    const checkbox=dialog.getByRole('checkbox',{name:'İncelendi',exact:true});
    const label=checkbox.locator('..');
    const note=dialog.locator('[name=note]');
    const remove=dialog.getByRole('button',{name:'İşlemi sil'});
    const failures=[];
    for(const [width,scale] of [[390,1],[320,2],[280,4]]){
      await page.setViewportSize({width,height:844});
      await transaction.click();
      const scaledText=scale===4?label.locator('xpath=self::* | .//*'):dialog.locator('*');
      await scaledText.evaluateAll((elements,scale)=>{
        if(scale===1)return;
        const sizes=elements.map(element=>parseFloat(getComputedStyle(element).fontSize));
        elements.forEach((element,index)=>element.style.fontSize=sizes[index]*scale+'px');
      },scale);
      assert.equal(await checkbox.getAttribute('name'),'reviewed');
      assert.equal(await checkbox.isChecked(),false);
      await checkbox.evaluate(element=>{
        element.form.dataset.reviewChanges='0';
        element.addEventListener('change',()=>element.form.dataset.reviewChanges=Number(element.form.dataset.reviewChanges)+1);
      });
      await label.evaluate(element=>element.scrollIntoView({block:'center'}));
      const bounds=await label.boundingBox();
      const field=await note.boundingBox();
      const x=field.x+field.width-3;
      const y=bounds.y+bounds.height/2;
      await page.mouse.click(x,y);
      assert.equal(await dialog.isVisible(),true,'The gutter click must keep the edit dialog open');
      const clicked=await checkbox.isChecked();
      const pointerChanges=await dialog.locator('form').getAttribute('data-review-changes');
      assert.equal(await note.inputValue(),'');
      await note.focus();
      await page.keyboard.press('Tab');
      assert.equal(await checkbox.evaluate(element=>element===document.activeElement&&element.matches(':focus-visible')),true);
      assert.equal(await checkbox.evaluate(element=>getComputedStyle(element).outlineStyle),'solid');
      await page.keyboard.press('Space');
      assert.equal(await checkbox.isChecked(),!clicked);
      assert.equal(Number(await dialog.locator('form').getAttribute('data-review-changes')),Number(pointerChanges)+1);
      await page.keyboard.press('Tab');
      assert.equal(await remove.evaluate(element=>element===document.activeElement),true);

      const textLines=await label.evaluate(element=>{
        const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
        while(walker.nextNode()){
          if(!walker.currentNode.textContent.trim())continue;
          const range=document.createRange();
          range.selectNodeContents(walker.currentNode);
          return range.getClientRects().length;
        }
        return 0;
      });
      const result={width,scale,labelWidth:bounds.width,labelHeight:bounds.height,fieldWidth:field.width,
        textLines,clicked,pointerChanges:Number(pointerChanges)};
      console.log('U10 transaction detail',result);
      if(bounds.height<48||Math.abs(bounds.x-field.x)>1||Math.abs(bounds.width-field.width)>1||
        !clicked||pointerChanges!=='1'||(scale===4&&textLines<2))failures.push(result);
      await page.keyboard.press('Escape');
      await dialog.waitFor({state:'hidden'});
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(failures,[],'The review label must span the form and provide a 48px touch target, including with wrapped text');

    await transaction.click();
    await note.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await dialog.locator('#submit').click();
    await dialog.waitFor({state:'hidden'});
    await transaction.getByText('İncelendi',{exact:true}).waitFor();
    await transaction.click();
    assert.equal(await checkbox.isChecked(),true);
  }finally{
    await page.close();
  }
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
    if(process.argv.includes('--u10')){
      await checkReviewCheckbox(browser);
      return;
    }
    const onlyIncomePlans=process.argv.includes('--u09');
    if(!onlyIncomePlans){
      await checkBackNavigation(browser);
      if(process.argv.includes('--u08'))return;
    }
    await checkIncomePlansHeading(browser);
    if(onlyIncomePlans)return;
    await checkTransactionEmptyStates(browser);
    await checkShowMore(browser);
    await checkReviewCheckbox(browser);
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
