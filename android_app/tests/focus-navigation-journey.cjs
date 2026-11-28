const openRoute=require('./journey-navigation.cjs');
const checkFinalMotion=require('./final-motion-journey.cjs');
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

async function checkTouchFeedback(browser){
  const wallet=require('./fixtures/android-0.2.0.json');
  for(const [width,scale,reducedMotion] of [[390,100,'no-preference'],[320,200,'reduce']]){
    const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion});
    try{
      page.setDefaultTimeout(5000);
      await serveWallet(page);
      await page.addInitScript(wallet=>localStorage.setItem('ekstre-android-v1',JSON.stringify(wallet)),wallet);
      await page.goto('https://wallet.test/');
      await page.evaluate(scale=>{document.documentElement.style.fontSize=scale+'%';},scale);
      assert.equal(await page.evaluate(()=>matchMedia('(any-pointer:coarse)').matches),true);
      const main=page.getByRole('main');
      const nav=page.getByRole('navigation',{name:'Ana menü'});
      const walletTab=nav.getByRole('button',{name:'Cüzdan',exact:true});
      const quickHeader=page.getByRole('button',{name:'Hızlı Ekle',exact:true});
      const touch=await page.context().newCDPSession(page);
      const walletBytes=()=>page.evaluate(()=>localStorage.getItem('ekstre-android-v1'));
      const before=await walletBytes();
      const sample=control=>control.evaluate(node=>{
        const css=getComputedStyle(node);
        return {
          tapHighlight:css.webkitTapHighlightColor,backgroundImage:css.backgroundImage,
          focusVisible:node.matches(':focus-visible'),outlineStyle:css.outlineStyle,outlineWidth:css.outlineWidth,
        };
      });
      const defaultHighlight=await page.locator('body').evaluate(node=>getComputedStyle(node).webkitTapHighlightColor);
      const evidence={};
      async function touchPress(name,control){
        await control.evaluate(node=>node.scrollIntoView({block:'center'}));
        await settle(page);
        const bounds=await control.boundingBox();
        const resting=await sample(control);
        const x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
        assert.equal(await control.evaluate((node,point)=>node.contains(document.elementFromPoint(point.x,point.y)),{x,y}),true,
          name+' is reachable by touch');
        const target=await control.elementHandle();
        await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
        try{
          const contact=await sample(control);
          evidence[name]={tapHighlight:contact.tapHighlight,outline:contact.outlineStyle,focusVisible:contact.focusVisible};
          assert.equal(contact.tapHighlight,'rgba(0, 0, 0, 0)',name+' uses no Blink tap overlay');
          await page.waitForFunction(node=>node.hasAttribute('data-touch-pressed'),target);
          const pressed=await sample(control);
          evidence[name]={tapHighlight:pressed.tapHighlight,outline:pressed.outlineStyle,focusVisible:pressed.focusVisible,
            pressFill:pressed.backgroundImage!==resting.backgroundImage};

          assert.equal(pressed.focusVisible,false,name+' tap does not request a keyboard indicator');
          assert.equal(pressed.outlineStyle,resting.outlineStyle,name+' press adds no outline');
          assert.notEqual(pressed.backgroundImage,resting.backgroundImage,name+' press has a visible fill');
          assert.deepEqual(await control.boundingBox(),bounds,name+' press preserves the touch target');
          assert(bounds.width>=48&&bounds.height>=48,name+' keeps a 48px target');
        }catch(error){
          console.log('Synthetic touch evidence',JSON.stringify({width,scale,reducedMotion,defaultHighlight,evidence}));
          throw error;
        }finally{
          await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
          await target.dispose();
        }
        assert.equal((await sample(control)).backgroundImage,resting.backgroundImage,name+' fill clears on cancel');
      }
      async function keyboardFocus(control){
        await page.keyboard.press('Tab');
        await control.focus();
        const state=await sample(control);
        assert.equal(state.focusVisible,true);
        assert.equal(state.outlineStyle,'solid');
        assert(Number.parseFloat(state.outlineWidth)>=2);
      }

      await walletTab.tap();
      assert.equal(await walletTab.getAttribute('aria-current'),'page');
      assert.equal(await page.evaluate(()=>document.activeElement.matches('main h1')),true);
      const account=main.locator('[data-account-view=synthetic-bank]');
      await touchPress('wallet account',account);
      await touchPress('selected nav tab',walletTab);
      assert.equal(await walletTab.getAttribute('aria-current'),'page');
      await keyboardFocus(account);
      await keyboardFocus(walletTab);

      await quickHeader.tap();
      const dialog=page.getByRole('dialog',{name:'Hızlı Ekle',exact:true});
      assert.equal(await page.evaluate(()=>document.activeElement.id),'dialog-title');
      const choice=dialog.getByRole('button',{name:'Gider',exact:true});
      await dialog.evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
      await touchPress('dialog row',choice);
      await keyboardFocus(choice);
      await page.keyboard.press('Escape');
      assert.equal(await quickHeader.evaluate(node=>node===document.activeElement),true);

      await quickHeader.tap();
      await choice.tap();
      const form=page.getByRole('dialog',{name:'Gider ekle'});
      const input=form.getByLabel('Açıklama',{exact:true});
      await touchPress('dialog submit',form.getByRole('button',{name:'Kaydet',exact:true}));
      assert.equal((await sample(input)).tapHighlight,defaultHighlight,'form input keeps the native highlight');
      await keyboardFocus(input);
      assert.equal(await page.evaluate(()=>window.handleBack()),true);

      await page.getByRole('button',{name:'Ayarlar',exact:true}).tap();
      const expense=main.locator('#settings-expense-disclosure');
      const summary=expense.locator('summary');
      assert.equal(await expense.evaluate(node=>node.open),false);
      await touchPress('disclosure summary',summary);
      assert.equal(await expense.evaluate(node=>node.open),false);
      await summary.tap();
      assert.equal(await expense.evaluate(node=>node.open),true);
      assert.equal((await sample(summary)).backgroundImage,'none','disclosure fill clears on touch release');
      await keyboardFocus(summary);
      await page.keyboard.press('Enter');
      assert.equal(await expense.evaluate(node=>node.open),false);
      assert.equal(await walletBytes(),before,'touch and focus checks write no wallet data');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);

      await page.emulateMedia({forcedColors:'active'});
      assert.equal((await sample(summary)).tapHighlight,defaultHighlight,'forced colors keep the UA tap feedback');
      assert.equal((await sample(summary)).focusVisible,true);
      console.log('Synthetic touch evidence',JSON.stringify({width,scale,reducedMotion,defaultHighlight,evidence}));
    }finally{
      await page.close();
    }
  }
}

async function checkTabMotion(browser){
  const wallet=require('./fixtures/android-0.2.0.json');
  for(const [width,scale,reducedMotion] of [[390,100,'no-preference'],[320,200,'reduce']]){
    const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion});
    try{
      page.setDefaultTimeout(5000);
      await serveWallet(page);
      await page.addInitScript(wallet=>localStorage.setItem('ekstre-android-v1',JSON.stringify(wallet)),wallet);
      await page.goto('https://wallet.test/');
      await page.evaluate(scale=>{document.documentElement.style.fontSize=scale+'%';},scale);
      await page.getByRole('heading',{level:1,name:'Özet'}).waitFor();
      const steps=await page.evaluate(()=>{
        const main=document.querySelector('#main');
        const nav=document.querySelector('#nav');
        const sample=()=>{
          const content=main.firstElementChild;
          const selected=nav.querySelector('[aria-current="page"]');
          const style=node=>{
            const css=getComputedStyle(node);
            return [css.animationName,css.animationDuration,css.transform];
          };
          return {
            selected:selected?.dataset.page,heading:main.querySelector('h1').textContent,
            focus:document.activeElement===main.querySelector('h1')?'heading':document.activeElement.dataset.page||document.activeElement.id,
            content:style(content),indicator:style(selected.querySelector('.nav-icon')),
            scroll:scrollY,net:main.querySelector('[data-stat=netExpense]')?.textContent,
          };
        };
        const click=tab=>{
          const outgoing=main.firstElementChild;
          nav.querySelector('[data-page='+tab+']').click();
          return {...sample(),outgoingDetached:!outgoing.isConnected,outgoingAnimations:outgoing.getAnimations().length};
        };
        const before=localStorage.getItem('ekstre-android-v1');
        const startup=sample();
        const wallet=click('wallet');
        const reports=click('reports');
        const period=document.querySelector('#period');
        period.value='2026-10';
        period.dispatchEvent(new Event('change',{bubbles:true}));
        const filter=sample();
        const same=click('reports');
        window.scrollTo(0,180);
        const savedScroll=scrollY;
        const home=click('home');
        const handled=window.handleBack();
        const back=sample();
        return {startup,wallet,reports,filter,same,home,back,handled,savedScroll,unchanged:before===localStorage.getItem('ekstre-android-v1')};
      });
      const still=['none','0s','none'];
      const reduced=reducedMotion==='reduce';
      const entered=reduced?still:['tab-content-in','0.17s','none'];
      const indicator=reduced?still:['tab-indicator-in','0.17s','none'];
      assert.deepEqual(steps.startup.content,still);
      assert.deepEqual(steps.startup.indicator,still);
      for(const [step,tab,heading,focus] of [
        ['wallet','wallet','Cüzdan','heading'],['reports','reports','Raporlar','heading'],
        ['home','home','Özet','heading'],['back','reports','Raporlar','home'],
      ]){
        const snapshot=steps[step];
        assert.equal(snapshot.selected,tab);
        assert.equal(snapshot.heading,heading);
        assert.equal(snapshot.focus,focus);
        assert.deepEqual(snapshot.content,entered,step+' content entry');
        assert.deepEqual(snapshot.indicator,indicator,step+' selected pill entry');
      }
      for(const step of ['wallet','reports','home','same']){
        assert.equal(steps[step].outgoingDetached,true);
        assert.equal(steps[step].outgoingAnimations,0);
      }
      for(const step of ['filter','same']){
        assert.deepEqual(steps[step].content,still,step+' must not animate content');
        assert.deepEqual(steps[step].indicator,still,step+' must not animate selection');
        assert.equal(steps[step].net,'₺100,00');
      }
      assert.equal(steps.filter.focus,'period');
      assert.equal(steps.home.scroll,0);
      assert.equal(steps.handled,true);
      assert(steps.savedScroll>0);
      assert.equal(steps.back.scroll,steps.savedScroll);
      assert.equal(steps.back.net,'₺100,00');
      assert.equal(steps.unchanged,true);

      const nav=page.getByRole('navigation',{name:'Ana menü'});
      await nav.getByRole('button',{name:'Cüzdan',exact:true}).press('Enter');
      assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Cüzdan');
      const account=page.locator('main [data-account-view=synthetic-bank]');
      await account.tap();
      const main=page.getByRole('main');
      const content=main.locator(':scope > :first-child');
      const currentAnimations=()=>content.evaluate(node=>node.getAnimations().length);
      assert.equal(await main.getByRole('heading',{level:1,name:'Sentetik banka'}).isVisible(),true);
      assert.equal(await content.evaluate(node=>node.getAnimations().some(animation=>animation.animationName==='tab-content-in')),
        false,'account entry does not use fixed-tab motion');
      assert.equal(await page.evaluate(()=>window.handleBack()),true);
      assert.equal(await account.evaluate(node=>node===document.activeElement),true);
      assert.equal(await currentAnimations(),0,'return from account stays still');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      assert(await nav.getByRole('button').evaluateAll(buttons=>buttons.every(button=>{
        const r=button.getBoundingClientRect();return r.width>=48&&r.height>=48;
      })));

      if(!reduced){
        const started=await page.evaluate(()=>{
          document.querySelector('#nav [data-page=home]').click();
          return document.querySelector('#main > :first-child').getAnimations().length;
        });
        assert.equal(started,1,'the first preference flip exercises an existing animation');
        await page.emulateMedia({reducedMotion:'reduce'});
        await settle(page);
        assert.equal(await currentAnimations(),0,'a preference change interrupts an active entry');
        await page.emulateMedia({reducedMotion:'no-preference'});
        await settle(page);
        assert.equal(await currentAnimations(),0,'restoring the preference does not replay the old entry');
        assert.equal(await nav.locator('.tab-entry').count(),0);

        // Hide both targets to exercise the case where the markers exist before any CSS animation is created.
        const unpainted=await page.evaluate(()=>{
          document.querySelectorAll('#main,#nav').forEach(node=>{node.style.display='none';});
          document.querySelector('#nav [data-page=wallet]').click();
          const markers=[...document.querySelectorAll('.tab-entry')];
          const animations=markers.flatMap(node=>node.getAnimations());
          return {markers:markers.length,animations:animations.length};
        });
        assert.deepEqual(unpainted,{markers:2,animations:0});
        await page.emulateMedia({reducedMotion:'reduce'});
        await settle(page);
        await page.evaluate(()=>document.querySelectorAll('#main,#nav').forEach(node=>node.style.removeProperty('display')));
        const duringReduce={markers:await page.locator('.tab-entry').count(),animations:await currentAnimations()};
        assert.equal(duringReduce.animations,0,'the unpainted entry is still while reduced');
        await page.emulateMedia({reducedMotion:'no-preference'});
        await settle(page);
        assert.equal(await currentAnimations(),0,'an unpainted entry must not start when restoring the preference (reduced state: '+JSON.stringify(duringReduce)+')');
        assert.equal(await nav.locator('.tab-entry').count(),0);
        assert.equal(duringReduce.markers,0,'reduction clears both markers even without an animationcancel event');
      }
      console.log('Fixed tab motion',JSON.stringify({width,scale,reducedMotion,content:steps.wallet.content,indicator:steps.wallet.indicator,backScroll:steps.back.scroll}));
    }finally{
      await page.close();
    }
  }
}

async function checkMoreNavigation(browser){
  const fixture=require('./fixtures/android-0.2.0.json');
  const page=await browser.newPage({viewport:{width:390,height:680},isMobile:true,hasTouch:true});
  try{
    page.setDefaultTimeout(5000);
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await serveWallet(page);
    const transactions=Array.from({length:25},(_,i)=>({
      id:'slice1-'+i,account:'synthetic-bank',date:'2026-11-02',period:'2026-11',
      kind:'expense',amount:12500,category:'Sentetik özel kategori',desc:'Sentetik uzun işlem açıklaması '+i,
    }));
    await page.addInitScript(wallet=>localStorage.setItem('ekstre-android-v1',JSON.stringify(wallet)),
      {...fixture,transactions});
    await page.goto('https://wallet.test/');
    const nav=page.getByRole('navigation',{name:'Ana menü'});
    const main=page.getByRole('main');
    const more=nav.getByRole('button',{name:'Diğer',exact:true});
    const menu=page.getByRole('dialog',{name:'Diğer',exact:true});
    const heading=main.getByRole('heading',{level:1});
    const focused=locator=>locator.evaluate(el=>el===document.activeElement);
    const nativeBack=()=>page.evaluate(()=>window.handleBack());
    const selectRoute=async name=>{
      await more.click();
      await menu.getByRole('button',{name:new RegExp('^'+name)}).click();
    };
    const snapshot=()=>page.evaluate(()=>({
      scroll:scrollY,query:document.querySelector('#search')?.value,
      account:document.querySelector('#f-account-filter')?.value,
      kind:document.querySelector('#f-kind-filter')?.value,
      data:localStorage.getItem('ekstre-android-v1'),
    }));
    const current=nav.locator('[aria-current=page]');
    assert.deepEqual((await nav.getByRole('button').allTextContents()).map(text=>text.trim()),
      ['Özet','Cüzdan','Raporlar','Diğer'],'four fixed controls in the approved order');
    assert.equal(await more.getAttribute('aria-haspopup'),'dialog');
    assert.equal(await current.getAttribute('data-page'),'home');
    assert.equal(await main.getByRole('button',{name:/^Raporlar/}).count(),0,'Raporlar is available only in the fixed navigation');
    const amount=main.locator('[data-stat=netExpense]');
    const headerAdd=page.getByRole('button',{name:'Hızlı Ekle',exact:true});
    const bodyAdd=main.getByRole('button',{name:'İşlem ekle',exact:true});
    const quickAdd=page.getByRole('dialog',{name:'Hızlı Ekle',exact:true});
    const beforeMotion=await snapshot();
    const motionEvidence={};
    for(const [preference,width,scale] of [['no-preference',390,100],['reduce',320,200]]){
      const reduced=preference==='reduce';
      await page.emulateMedia({reducedMotion:preference});
      await page.setViewportSize({width,height:680});
      await page.evaluate(scale=>{document.documentElement.style.fontSize=scale+'%';},scale);
      assert.equal(await amount.innerText(),'₺3.125,00');
      const button=await more.boundingBox();
      assert(button.width>=48&&button.height>=48);
      await page.mouse.move(button.x+button.width/2,button.y+button.height/2);
      await page.mouse.down();
      assert.deepEqual(await more.boundingBox(),button,'press feedback must preserve the whole touch target');
      const press=await more.locator('.nav-icon').evaluate(icon=>{
        const style=getComputedStyle(icon);
        return {shadow:style.boxShadow,property:style.transitionProperty,duration:style.transitionDuration,transform:style.transform};
      });
      assert.notEqual(press.shadow,'none','a held press must remain visible without motion');
      assert.equal(press.duration,reduced?'0s':'0.09s');
      if(reduced)assert.equal(press.transform,'none');
      else assert.equal(press.property,'transform');
      await page.mouse.up();
      const sheet=await menu.evaluate(node=>{
        const backdrop=getComputedStyle(node,'::backdrop');
        const row=getComputedStyle(node.querySelector('.menu-row .row-icon'));
        return {
          animation:backdrop.animationName,duration:backdrop.animationDuration,
          panel:getComputedStyle(node).animationName,panelDuration:getComputedStyle(node).animationDuration,row:row.transitionDuration,
          fits:node.scrollWidth<=node.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1,
        };
      });
      assert.deepEqual(sheet,{
        animation:reduced?'none':'navigation-backdrop-in',duration:reduced?'0s':'0.12s',
        panel:reduced?'none':'menu-sheet-in',panelDuration:reduced?'0s':'0.14s',
        row:reduced?'0s':'0.09s',fits:true,
      });
      assert(await focused(menu.getByRole('heading',{name:'Diğer'})));
      assert.equal(await amount.innerText(),'₺3.125,00');
      assert.deepEqual(await amount.evaluate(node=>{
        const styles=getComputedStyle(node);
        return [styles.animationName,styles.transitionDuration];
      }),['none','0s']);
      assert.equal(await nativeBack(),true);
      assert(await focused(more));
      const immediate=await more.evaluate(button=>{
        button.click();
        const dialog=document.querySelector('#modal');
        const opened=dialog.open&&document.activeElement.id==='dialog-title';
        return {opened,back:window.handleBack(),closed:!dialog.open,focused:document.activeElement===button};
      });
      assert.deepEqual(immediate,{opened:true,back:true,closed:true,focused:true},'Back can close and restore focus in the opening turn');

      await more.tap();
      const plan=menu.getByRole('button',{name:/^Plan/});
      await plan.scrollIntoViewIfNeeded();
      const action=await plan.boundingBox();
      for(let i=0;i<2;i++)await page.touchscreen.tap(action.x+action.width/2,action.y+action.height/2);
      assert.equal(await heading.textContent(),'Planlama');
      assert(await focused(heading));
      assert.equal(await nativeBack(),true);
      assert.equal(await heading.textContent(),'Özet','two rapid touch taps create one history entry');
      assert(await focused(more));
      assert.equal(await nativeBack(),false,'the repeated tap must not create another history entry');
      assert.equal(await amount.innerText(),'₺3.125,00');
      assert.deepEqual(await snapshot(),beforeMotion);
      const quickOpening=await bodyAdd.evaluate(button=>{
        button.click();
        const dialog=document.querySelector('#modal');
        const style=getComputedStyle(dialog);
        const animation=dialog.getAnimations().find(item=>item.animationName==='menu-sheet-in');
        const frames=animation?.effect.getKeyframes().map(frame=>({
          opacity:Number(frame.opacity),y:new DOMMatrixReadOnly(frame.transform).m42,
        }))??[];
        const opened=dialog.open&&document.activeElement.id==='dialog-title';
        const result={name:style.animationName,duration:style.animationDuration,frames,opened};
        return {...result,back:window.handleBack(),closed:!dialog.open,focused:document.activeElement===button};
      });
      assert.deepEqual(quickOpening,{
        name:sheet.panel,duration:sheet.panelDuration,frames:reduced?[]:[{opacity:.86,y:6},{opacity:1,y:0}],
        opened:true,back:true,closed:true,focused:true,
      },'Quick Add opens from Özet and can close in the same turn');
      await bodyAdd.click();
      assert(await focused(quickAdd.getByRole('heading',{name:'Hızlı Ekle'})));
      await page.keyboard.press('Escape');
      assert.equal(await quickAdd.count(),0);
      assert(await focused(bodyAdd));

      await headerAdd.click();
      assert.equal(await quickAdd.evaluate(node=>getComputedStyle(node).animationName),sheet.panel);
      await quickAdd.evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)));
      const payment=quickAdd.getByRole('button',{name:'Kart Borcu Ödemesi',exact:true});
      const bounds=await payment.boundingBox();
      await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
      await page.mouse.down();
      const quickPress=await payment.locator('.row-icon').evaluate(node=>{
        const style=getComputedStyle(node);
        return {duration:style.transitionDuration,visible:style.boxShadow!=='none'};
      });
      assert.deepEqual(quickPress,{duration:reduced?'0s':'0.09s',visible:!reduced});
      assert.deepEqual(await payment.boundingBox(),bounds,'press feedback leaves the action target in place');
      await page.mouse.up();
      const paymentForm=page.getByRole('dialog',{name:'Kart ödemesi kaydet',exact:true});
      assert.equal(await paymentForm.evaluate(node=>getComputedStyle(node).animationName),'none');
      assert(await focused(paymentForm.getByRole('heading',{name:'Kart ödemesi kaydet'})));
      assert.equal(await nativeBack(),true);
      assert(await focused(headerAdd));

      await page.getByRole('button',{name:'Ayarlar',exact:true}).click();
      const expense=main.locator('#settings-expense-disclosure');
      const summary=expense.locator('summary');
      const chevron=await summary.locator('.ui-icon').evaluate(node=>{
        const style=getComputedStyle(node);
        return {property:style.transitionProperty,duration:style.transitionDuration};
      });
      assert.equal(chevron.duration,reduced?'0s':'0.14s');
      if(!reduced)assert.equal(chevron.property,'rotate');
      assert.equal(await summary.evaluate(node=>getComputedStyle(node).transitionDuration),'0s');
      await summary.press('Enter');
      assert.equal(await expense.evaluate(node=>node.open),true);
      assert(await focused(summary));
      assert.equal(await nativeBack(),true);
      assert.deepEqual(await snapshot(),beforeMotion);
      motionEvidence[preference]={press:press.duration,backdrop:sheet.duration,sheet:sheet.panelDuration,chevron:chevron.duration,width,scale};
    }
    console.log('Diğer motion and immediate route/Back/focus checks',JSON.stringify(motionEvidence));
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.setViewportSize({width:390,height:680});
    await page.evaluate(()=>document.documentElement.style.fontSize='');

    await main.getByRole('button',{name:'İşlem ekle',exact:true}).click();
    await page.getByRole('dialog',{name:'Hızlı Ekle'}).waitFor();
    assert.equal(await nativeBack(),true);
    await main.getByRole('button',{name:'Ekstre yükle',exact:true}).click();
    assert.equal(await heading.textContent(),'Ekstreler');
    assert.equal(await nativeBack(),true);
    await nav.getByRole('button',{name:'Raporlar',exact:true}).click();
    assert.equal(await current.getAttribute('data-page'),'reports');
    assert(await focused(heading));

    await selectRoute('İşlemler');
    assert.equal(await heading.textContent(),'İşlemler');
    assert(await focused(heading));
    assert.equal(await current.count(),0);
    await page.locator('#search').fill('Sentetik uzun');
    await page.locator('#f-account-filter').selectOption('synthetic-bank');
    await page.locator('#f-kind-filter').selectOption('expense');
    await page.evaluate(()=>scrollTo(0,700));
    const before=await snapshot();
    assert(before.scroll>0);
    const checkDismiss=async dismiss=>{
      await more.focus();
      await page.keyboard.press('Enter');
      await menu.waitFor();
      assert.equal(await current.count(),0);
      assert(await focused(menu.getByRole('heading',{name:'Diğer'})));
      assert.equal(await menu.getByRole('button').count(),5);
      await page.mouse.move(12,24);
      await page.mouse.wheel(0,300);
      await settle(page);
      assert.equal(await page.evaluate(()=>scrollY),before.scroll,'the modal blocks background scroll');
      const last=menu.getByRole('button',{name:/^Kategoriler/});
      await page.keyboard.press('Shift+Tab');
      assert(await focused(last),'reverse tab wraps from the title');
      await page.keyboard.press('Tab');
      assert(await focused(menu.getByRole('button',{name:'Kapat'})),'tab stays in the panel');
      await dismiss();
      await menu.waitFor({state:'hidden'});
      assert(await focused(more));
      assert.deepEqual(await snapshot(),before);
    };
    await checkDismiss(()=>menu.getByRole('button',{name:'Kapat'}).dblclick());
    await checkDismiss(()=>page.keyboard.press('Escape'));
    await checkDismiss(async()=>assert.equal(await nativeBack(),true));
    await more.click();
    await menu.getByRole('button',{name:/^Kategoriler/}).dblclick();
    assert.equal(await heading.textContent(),'Kategoriler');
    assert(await focused(heading));
    assert.equal(await current.count(),0);
    assert.equal(await nativeBack(),true);
    assert.equal(await heading.textContent(),'İşlemler','double tap creates one history entry');
    assert(await focused(more),'Back restores the persistent navigation opener');
    assert.deepEqual(await snapshot(),before);

    await selectRoute('Kategoriler');
    const categoryTitles=['Gider kategorileri','Satıcı kategori kuralları','Gelir kategorileri'];
    for(const name of categoryTitles)assert.equal(await main.getByRole('heading',{name,exact:true}).count(),1);
    await main.getByRole('button',{name:'+ Gelir kategorisi'}).click();
    await page.locator('#modal [name=name]').fill('Sentetik ek gelir');
    await page.locator('#submit').click();
    await main.getByText(/Sentetik ek gelir/).waitFor();
    await page.getByRole('button',{name:'Ayarlar',exact:true}).click();
    await main.getByText(/Sentetik ek gelir/).waitFor();

    await more.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    assert(await focused(menu.getByRole('button',{name:/^Plan/})));
    await page.keyboard.press('Enter');
    assert.equal(await heading.textContent(),'Planlama');
    assert(await focused(heading));
    assert.equal(await current.count(),0);

    await selectRoute('Ekstre');
    assert.equal(await heading.textContent(),'Ekstreler');
    assert(await focused(heading));
    assert.equal(await current.count(),0);
    assert.deepEqual(errors,[]);
    console.log('Slice 1 fixed navigation, Diğer dismissal and selection, route focus, filters, scroll and shared category settings passed');
  }finally{
    await page.close();
  }
}

async function checkDashboardLayouts(browser){
  const fixture=require('./fixtures/android-0.2.0.json');
  const shots=process.env.EA06_SCREENSHOTS;
  if(shots)fs.mkdirSync(shots,{recursive:true});
  const row=(id,account,date,kind,amount,category,desc,extra={})=>
    ({id,account,date,period:date.slice(0,7),kind,amount,category,desc,...extra});
  for(const width of [390,320]){
    const narrow=width===320;
    const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,locale:'tr-TR'});
    try{
      page.setDefaultTimeout(5000);
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await serveWallet(page);
      const wallet={...fixture,
        accounts:[
          {id:'synthetic-bank',name:narrow?'Sentetik Uzun Banka Hesabı '.repeat(3).trim():'Sentetik maaş hesabı',type:'bank',opening:narrow?987654321123:3543050},
          {id:'synthetic-cash',name:'Sentetik nakit',type:'cash',opening:284500},
          {id:'synthetic-card',name:narrow?'Sentetik Çok Uzun Kredi Kartı '.repeat(2).trim():'Sentetik günlük kart',type:'card',opening:0},
        ],
        statements:[{...fixture.statements[0],id:'synthetic-card|2026-11',period:'2026-11',cut:'2026-11-01',due:'2026-11-28',debt:570000}],
        subscriptions:[{id:'late-subscription',name:'Sentetik geciken abonelik',account:'synthetic-bank',amount:5900,next:'2026-11-25',category:'Abonelik'}],
        incomePlans:narrow?[{id:'test-income',name:'Sentetik gelir planı',account:'synthetic-bank',amount:120000,next:'2026-11-27',category:'Maaş'}]:[],
        transactions:[
          row('october-income','synthetic-bank','2026-10-03','income',24680,'Maaş','Sentetik ekim geliri'),
          row('october-expense','synthetic-bank','2026-10-08','expense',24680,'Eğitim','Sentetik ekim gideri'),
          row('pending','synthetic-card','2026-11-04','expense',318000,'Giyim','Sentetik inceleme',{source:'pdf',matchStatus:'pending',matchCandidates:['card-expense']}),
          row('payment','synthetic-bank','2026-11-03','payment',246000,'Kart ödemesi','Sentetik kart ödemesi',{target:'synthetic-card'}),
          row('card-expense','synthetic-card','2026-11-04','expense',318000,'Giyim','Sentetik kart alışverişi'),
          row('coffee','synthetic-cash','2026-11-25','expense',14500,'Dışarıda yeme','Sentetik kahve'),
          row('market','synthetic-bank','2026-11-26','expense',82050,'Market / Gıda',
            narrow?'Sentetik Uzun İşlem Açıklaması '.repeat(4).trim():'Sentetik market alışverişi'),
        ],
      };
      await page.addInitScript(wallet=>localStorage.setItem('ekstre-android-v1',JSON.stringify(wallet)),wallet);
      await page.goto('https://wallet.test/');
      const main=page.getByRole('main');
      const nav=page.getByRole('navigation',{name:'Ana menü'});
      const more=nav.getByRole('button',{name:'Diğer',exact:true});
      const screenshot=async name=>{
        if(shots)await page.screenshot({path:path.join(shots,name+'-'+width+'.png')});
      };
      const checkFit=async selector=>{
        await settle(page);
        const issues=await page.locator(selector).evaluateAll(elements=>elements.flatMap(el=>{
          const bounds=el.getBoundingClientRect();
          const label=el.textContent.trim().slice(0,100);
          const issues=[];
          if(bounds.left<0||bounds.right>innerWidth+1||el.scrollWidth>el.clientWidth+1)issues.push(label+' overflows');
          if(el.matches('button')&&(bounds.width<48||bounds.height<48))issues.push(label+' has a small target');
          return issues;
        }));
        assert.deepEqual(issues,[],width+'px '+selector);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      };
      const moreSheet=page.getByRole('dialog',{name:'Diğer',exact:true});
      const checkMoreFit=async()=>{
        // Measure stable bounds after the entrance transform.
        await moreSheet.evaluate(async sheet=>{
          await sheet.getAnimations().find(animation=>animation.animationName==='menu-sheet-in')?.finished;
        });
        await checkFit('#modal[open] button:not([hidden])');
      };
      await main.getByRole('heading',{name:'Özet',exact:true}).waitFor();
      if(!narrow){
        assert.match(await main.locator('[data-stat=cash]').textContent(),/34\.850,00/);
        assert.match(await main.locator('[data-stat=netWorth]').textContent(),/28\.430,00/);
      }
      const summary=main.getByRole('region',{name:'Aylık özet',exact:true});
      const categorySummary=main.getByRole('region',{name:'Kategori bazlı gider dağılımı'});
      const upcoming=main.getByRole('region',{name:'Yaklaşan / geciken ödemeler'});
      const paymentPlan=upcoming.getByRole('button',{name:'Ödeme planı',exact:true});
      const reports=nav.getByRole('button',{name:'Raporlar',exact:true});
      const home=nav.getByRole('button',{name:'Özet',exact:true});
      const reportMonth=main.getByLabel('Seçili ay',{exact:true});
      const walletBytes=()=>page.evaluate(()=>localStorage.getItem('ekstre-android-v1'));
      const initialBytes=await walletBytes();
      const nativeBack=()=>page.evaluate(()=>window.handleBack());
      const assertMonth=async(month,label,values,category)=>{
        assert.equal(await summary.locator('time').getAttribute('datetime'),month);
        assert.equal(await summary.locator('time').textContent(),label);
        assert.deepEqual(await summary.locator('[data-stat]').allTextContents(),values);
        assert.equal(await categorySummary.getByRole('button',{name:category}).count(),1);
      };
      if(narrow)await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
      await checkFit('#nav button, main .panel, main .dashboard-actions button, main .section-link, main .expense-category');
      await screenshot(narrow?'ozet-200':'ozet');
      const bodyAdd=main.getByRole('button',{name:'İşlem ekle',exact:true});
      assert.equal(await main.locator('[data-action=addIncome],[data-action=addTransaction],[data-action=transfer],[data-action=payCard]').count(),0,
        'Özet has one body transaction entry instead of duplicate direct buttons');
      assert.equal(await page.getByRole('button',{name:'Hızlı Ekle',exact:true}).isVisible(),true);
      await bodyAdd.click();
      const quickAdd=page.getByRole('dialog',{name:'Hızlı Ekle',exact:true});
      const choices=quickAdd.locator('#quick-add-options');
      assert.deepEqual(await choices.getByRole('button').evaluateAll(buttons=>buttons.map(button=>button.dataset.action)),
        ['addTransaction','addIncome','transfer','quickPayCard']);
      await checkFit('#quick-add-options button');
      assert.equal(await nativeBack(),true);
      assert.equal(await bodyAdd.evaluate(button=>button===document.activeElement),true);
      const incomePlans=main.getByRole('button',{name:'Gelir planları',exact:true});
      assert.equal(await incomePlans.count(),1,'one income plans entry with or without planned income');
      if(narrow)assert.match(await main.locator('.planned-income').innerText(),/1.200,00/);
      await incomePlans.click();
      assert.equal(await main.getByRole('heading',{level:1,name:'Gelir planları'}).isVisible(),true);
      assert.equal(await nativeBack(),true);
      assert.equal(await incomePlans.evaluate(button=>button===document.activeElement),true);
      assert.equal(await main.getByText('Kayıtlarına göre',{exact:true}).count(),0,'Özet drops the generic qualifier');
      assert.equal(await upcoming.getByText('Takvim bankadaki ödeme durumunu doğrulamaz.',{exact:true}).count(),0);
      assert.equal(await summary.locator('input,button').count(),0,'month context is not a control or duplicate shortcut');
      assert.equal(await main.getByRole('button',{name:/^Raporlar/}).count(),0);
      await assertMonth('2026-11','Kasım 2026',['₺0,00','₺4.145,50','-₺4.145,50'],/Giyim/);
      assert.match(await upcoming.innerText(),/2026-11-28 · Yaklaşıyor · Kalan dönem borcu tahmini/);
      assert.match(await upcoming.innerText(),/2026-11-25 · Vadesi geçti/);
      assert.equal(await main.getByText('1 kayıt inceleme bekliyor',{exact:true}).count(),1);
      await paymentPlan.click();
      const calendar=main.getByRole('region',{name:'Ekstre ödeme takvimi'});
      assert.match(await calendar.innerText(),/Ödeme durumunu bankandan kontrol et\./);
      assert.match(await calendar.innerText(),/2026-11-28 · Yaklaşıyor/);
      assert.equal(await main.getByRole('region',{name:'Abonelikler'}).getByRole('heading',{name:'Sentetik geciken abonelik'}).isVisible(),true);
      assert.equal(await nativeBack(),true);
      assert.equal(await paymentPlan.evaluate(button=>button===document.activeElement),true);

      await reports.click();
      assert.equal(await reportMonth.inputValue(),'2026-11');
      await reportMonth.fill('2026-10');
      assert.equal(await main.getByRole('heading',{name:'Gelir ve gider · Ekim 2026',exact:true}).count(),1);
      assert.equal(await main.locator('[data-stat=netExpense]').innerText(),'₺246,80');
      assert.equal(await nativeBack(),true);
      assert.equal(await reports.evaluate(button=>button===document.activeElement),true);
      await assertMonth('2026-10','Ekim 2026',['₺246,80','₺246,80','₺0,00'],/Eğitim/);
      assert.equal(await walletBytes(),initialBytes,'navigating and selecting a month writes no wallet data');
      await screenshot(narrow?'ozet-ekim-200':'ozet-ekim');
      await reports.click();
      await reportMonth.fill('2026-11');
      await home.click();
      if(narrow)await page.evaluate(()=>{document.documentElement.style.fontSize='';});

      await nav.getByRole('button',{name:'Cüzdan',exact:true}).click();
      const walletActions=main.locator('h1 + .dashboard-actions');
      assert.deepEqual(await walletActions.getByRole('button').evaluateAll(buttons=>buttons.map(button=>button.textContent.trim())),
        ['Hesap ekle','Ekstre yükle'],'wallet actions sit directly below the title');
      const cards=main.getByRole('region',{name:'Kredi kartları'});
      const liquid=main.getByRole('region',{name:'Banka ve nakit bakiyesi'});
      assert.equal(await cards.getByRole('heading',{level:2,name:'Kredi kartları'}).isVisible(),true);
      assert.equal(await cards.locator('[data-card-view]').count(),1);
      assert.equal(await liquid.locator('[data-account-view]').count(),2);
      await walletActions.getByRole('button',{name:'Hesap ekle'}).click();
      assert.equal(await page.getByRole('dialog',{name:'Hesap / kart ekle'}).isVisible(),true);
      assert.equal(await nativeBack(),true);
      await walletActions.getByRole('button',{name:'Ekstre yükle'}).click();
      assert.equal(await main.getByRole('heading',{level:1,name:'Ekstreler'}).isVisible(),true);
      assert.equal(await nativeBack(),true);
      assert.equal(await walletBytes(),initialBytes);
      assert.match(await main.getByRole('button',{name:/Güncel kart borcu tahmini/}).textContent(),/6\.420,00/);
      assert.match(await main.locator('.dashboard-row',{hasText:'Dönem borcu'}).first().textContent(),/5\.700,00/);
      assert.match(await main.locator('.dashboard-row',{hasText:'Kalan dönem borcu'}).textContent(),/3\.240,00/);
      await checkFit('#nav button, main .panel, main .dashboard-actions button, main [data-account-view]');
      await screenshot('cuzdan');
      await main.getByRole('button',{name:'Ödeme kaydet',exact:true}).click();
      const payment=page.getByRole('dialog',{name:'Kart ödemesi kaydet',exact:true});
      assert.equal(await payment.locator('[name=target]').inputValue(),'synthetic-card');
      await page.keyboard.press('Escape');
      await more.click();
      await moreSheet.waitFor();
      assert.equal(await nav.locator('[aria-current=page]').getAttribute('data-page'),'wallet');
      await checkMoreFit();
      await screenshot('diger');
      await page.keyboard.press('Escape');
      if(narrow){
        await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
        await checkFit('#nav button, main .panel, main .dashboard-actions button, main [data-account-view]');
        await more.click();
        await checkMoreFit();
        await page.keyboard.press('Escape');
      }
      assert.deepEqual(errors,[]);
      console.log(width+'px synthetic Özet, Cüzdan and Diğer fit with accessible targets');
    }finally{
      await page.close();
    }
  }
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
      await openRoute(page,'transactions');
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
    async function expand(name,list,key,ids,shown,tabTarget,checkIntermediateTab){
      const more=list.getByRole('button',{name:'Daha fazla göster',exact:true});
      const renderedIds=()=>list.locator('button[data-edit]').evaluateAll(buttons=>buttons.map(button=>button.dataset.edit));
      assert.deepEqual(await renderedIds(),ids.slice(0,shown),name+' before expanding');
      await more.focus();
      await page.keyboard.press(key);
      assert.deepEqual(await renderedIds(),ids.slice(0,shown+150),name+' after expanding');
      assert.equal(await more.count(),ids.length>shown+150?1:0,name+' continuation');
      const focused=await activeIn(list);
      await page.keyboard.press('Tab');
      if(checkIntermediateTab)await checkIntermediateTab(ids[shown]);
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
    await openRoute(page,'transactions');
    const more=transactionView.locator('#transaction-show-more');
    await page.locator('#search').fill('Eşleşmeyen sentetik arama');
    assert.equal(await more.count(),0,'no pagination control is rendered without another page');
    await page.locator('#search').fill('Sentetik U05');
    assert.equal(await more.count(),1,'a matching search restores the pagination control');
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
      await openRoute(page,'reports');
      if(scope==='#report-category-transactions')await page.locator('[data-report-category]').filter({hasText:category}).click();
      else await page.locator('#report-movements-toggle').click();
      await expand(name,page.locator(scope),key,ids,150);
    }

    await goHome();
    await openRoute(page,'import');
    await page.locator('[data-statement-view]').click();
    const statementRows=page.locator('#statement-transactions');
    await expand('statement detail',transactionView,'Enter',rowIds,150,undefined,async rowId=>{
      const row=statementRows.locator('article').filter({has:page.locator(`button[data-edit="${rowId}"]`)});
      const disclosure=row.locator('details');
      const summary=disclosure.locator('summary');
      assert.equal(await summary.textContent(),'Orijinal banka açıklaması');
      assert.equal(await summary.evaluate(element=>element===document.activeElement),true,
        'Tab from the first newly revealed edit button focuses that row’s source disclosure');
      assert.equal(await disclosure.evaluate(element=>element.open),false);
      await page.keyboard.press('Enter');
      assert.equal(await disclosure.evaluate(element=>element.open),true,'Enter opens the focused source disclosure');
      assert.equal(await disclosure.getByText('SENTETIK MARKET',{exact:true}).isVisible(),true);
      await page.keyboard.press('Tab');
    });
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
    const tab=route=>openRoute(page,route);
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
    await checkBack(back,'Cüzdan');
    check('wallet card opener restored',await focused(walletCard),true);
    check('native Back unwinds normal history',await nativeBack(),true);
    check('normal history returns to home',await heading(),'Özet');
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
      await checkFallback(balanceBack,'Cüzdan');
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

    await openRoute(page,'plan');
    assert.deepEqual(await routeHeading(),{titles:['Planlama'],tabIndex:'-1',focused:true},
      'Planlama must keep its sole h1 and receive route focus');
    assert.match(await main.locator('.lead').first().textContent(),/kaydedilen para/i,
      'Planlama explains the distinction between estimates and recorded money');
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
    await openRoute(page,'transactions');

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

async function checkTransactionForms(browser){
  const fixture=require('./fixtures/android-0.2.0.json');
  const wallet={...fixture,transactions:[],statements:[]};
  const page=await browser.newPage({timezoneId:'UTC',viewport:{width:390,height:740},hasTouch:true});
  try{
    page.setDefaultTimeout(5000);
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await serveWallet(page);
    await page.addInitScript(wallet=>localStorage.setItem('ekstre-android-v1',JSON.stringify(wallet)),wallet);
    await page.goto('https://wallet.test/');
    await openRoute(page,'transactions');
    const read=()=>page.evaluate(()=>localStorage.getItem('ekstre-android-v1'));
    const before=await read();
    const search=page.getByRole('searchbox',{name:'İşlemlerde ara'});
    await search.fill('Sentetik');
    const add=page.locator('[data-action=addTransaction]');
    const form=page.getByRole('dialog',{name:'Gider ekle'});
    await add.click();
    await form.getByLabel('Açıklama',{exact:true}).fill('Sentetik fiş');
    await form.getByLabel('Tutar (TL)',{exact:true}).fill('geçersiz');
    const save=form.getByRole('button',{name:'Kaydet',exact:true});
    await save.click();
    assert(await form.getByRole('alert').evaluate(el=>el===document.activeElement&&!!el.textContent));
    assert.equal(await read(),before,'invalid amount leaves the snapshot unchanged');
    await form.getByRole('button',{name:'Vazgeç',exact:true}).click();
    assert.equal(await read(),before,'cancel leaves the snapshot unchanged');
    assert.equal(await search.inputValue(),'Sentetik');
    assert(await add.evaluate(el=>el===document.activeElement));

    await add.click();
    await form.getByLabel('Açıklama',{exact:true}).fill('Sentetik fiş');
    await form.getByLabel('Tutar (TL)',{exact:true}).fill('12,37');
    await save.dblclick();
    const saved=await read();
    const rows=JSON.parse(saved).transactions;
    assert.equal(rows.length,1,'double save creates one transaction');
    assert.equal(rows[0].amount,1237);
    assert.equal(rows[0].kind,'expense');
    assert.equal(await search.inputValue(),'Sentetik');
    await page.locator('[data-edit]').click();
    const detail=page.getByRole('dialog',{name:'İşlem ayrıntısı'});
    const confirmation=page.waitForEvent('dialog');
    const deletePress=detail.getByRole('button',{name:'İşlemi sil',exact:true}).click();
    const prompt=await confirmation;
    assert.equal(prompt.type(),'confirm');
    await prompt.dismiss();
    await deletePress;
    assert.equal(await read(),saved,'canceling removal leaves the snapshot unchanged');
    assert(await detail.isVisible());
    await detail.getByRole('button',{name:'Vazgeç',exact:true}).click();

    await page.locator('#quick-add').click();
    await page.getByRole('button',{name:/^Kart Borcu Ödemesi/}).click();
    const payment=page.getByRole('dialog',{name:'Kart ödemesi kaydet',exact:true});
    assert.match(await payment.textContent(),/Daha önce yaptığın ödemeyi/);
    await payment.locator('#f-account').selectOption('synthetic-bank');
    await payment.locator('#f-amount').fill('2,11');
    const savePayment=payment.getByRole('button',{name:'Ödemeyi kaydet',exact:true});
    await savePayment.scrollIntoViewIfNeeded();
    const {x,y,width,height}=await savePayment.boundingBox();
    for(let i=0;i<2;i++)await page.touchscreen.tap(x+width/2,y+height/2);
    await payment.waitFor({state:'hidden'});
    assert.equal(await page.locator('dialog[open]').count(),0,'repeated taps must not reopen a dialog');
    const after=JSON.parse(await read()).transactions;
    assert.equal(after.length,2,'double save creates one payment');
    assert.deepEqual(after.map(({kind,amount})=>[kind,amount]),[['expense',1237],['payment',211]]);
    assert.equal(after[1].account,'synthetic-bank');
    assert.equal(after[1].target,'synthetic-card');

    const screenshots=process.env.SLICE3_SCREENSHOTS;
    if(screenshots)fs.mkdirSync(screenshots,{recursive:true});
    const capture=async(name,width)=>{
      await settle(page);
      const overflow=await page.evaluate(()=>{
        const open=document.querySelector('dialog[open]');
        return [document.documentElement,open].filter(el=>el&&el.scrollWidth>el.clientWidth).map(el=>{
          const {left,right}=el.getBoundingClientRect();
          return {element:el.id||el.tagName,client:el.clientWidth,scroll:el.scrollWidth,
            descendants:Array.from(el.querySelectorAll('*')).filter(child=>{
              const rect=child.getBoundingClientRect();
              return rect.width>0&&(rect.right>right||rect.left<left||child.scrollWidth>child.clientWidth+1);
            }).slice(0,12).map(child=>[child.id||child.tagName,child.clientWidth,child.scrollWidth])};
        });
      });
      if(screenshots)await page.screenshot({path:path.join(screenshots,name+'-'+width+'-200.png')});
      assert.deepEqual(overflow,[],name+' fits at '+width+' CSS pixels with 200% text');
    };
    await search.clear();
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');
    for(const width of [390,320]){
      await page.setViewportSize({width,height:780});
      await page.evaluate(()=>scrollTo(0,0));
      await capture('islemler',width);
      await search.fill('Eşleşmeyen sentetik arama');
      await page.locator('#transactions-list .empty').scrollIntoViewIfNeeded();
      await capture('bos-sonuc',width);
      await search.clear();
      await page.locator('#quick-add').click();
      await capture('hizli-ekle',width);
      await page.keyboard.press('Escape');
      await page.locator('[data-edit="'+rows[0].id+'"]').click();
      await capture('islem-ayrintisi',width);
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors,[]);
    console.log('Transaction forms validated, canceled and saved exact amounts once through the UI');
  }finally{await page.close();}
}

async function checkDialog(page,opener,expectedTitle,{checkAccountLabel=false}={}){
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog=page.locator('#modal[open]');
  await dialog.waitFor();
  assert.equal(await dialog.locator('#dialog-title').textContent(),expectedTitle);
  if(checkAccountLabel){
    const label=dialog.locator('label[for=f-name]');
    assert(await label.evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=.875*parseFloat(getComputedStyle(document.documentElement).fontSize)));
    const nameField=await dialog.getByLabel('Hesap adı',{exact:true}).boundingBox();
    assert(nameField.width>=48&&nameField.height>=48);
  }
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
    async function checkSlice1(){
      await checkMoreNavigation(browser);
      await checkDashboardLayouts(browser);
    }
    const finalMotion=process.argv.find(arg=>arg==='--final-motion'||arg.startsWith('--final-motion='));
    if(finalMotion){
      await checkFinalMotion(browser,serveWallet,finalMotion.split('=')[1]);
      return;
    }
    if(process.argv.includes('--nav-motion')){
      await checkTabMotion(browser);
      return;
    }
    if(process.argv.includes('--touch-foundation')){
      await checkTouchFeedback(browser);
      return;
    }
    if(process.argv.includes('--ux-motion')){
      await checkMoreNavigation(browser);
      return;
    }
    if(process.argv.includes('--ux-layout')){
      await checkDashboardLayouts(browser);
      return;
    }
    if(process.argv.includes('--slice1')){
      await checkSlice1();
      return;
    }
    if(process.argv.includes('--slice3')){
      await checkTransactionForms(browser);
      return;
    }
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
    await checkSlice1();
    await checkTouchFeedback(browser);
    await checkTabMotion(browser);
    await checkFinalMotion(browser,serveWallet);
    await checkTransactionEmptyStates(browser);
    await checkTransactionForms(browser);
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
      await checkDialog(page,page.locator('main [data-action=addAccount]').first(),'Hesap / kart ekle',{checkAccountLabel:true});
      await checkDialog(page,page.locator('#quick-add'),'Hızlı Ekle');
      await openRoute(page,'transactions');
      await checkDialog(page,page.locator('[data-edit]').first(),'İşlem ayrıntısı');
      assert.deepEqual(errors,[]);
      await page.close();
    }
    assert.deepEqual(failures,[],'Keyboard focus or its outline was obscured');
    console.log('Quick add and edit dialogs retained keyboard focus and restored their openers');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
