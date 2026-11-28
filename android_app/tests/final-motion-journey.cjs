const assert=require('node:assert/strict');
const fixture=require('./fixtures/android-0.2.0.json');

const wallet={...fixture,transactions:[...fixture.transactions,{
  id:'synthetic-motion-row',account:'synthetic-bank',date:'2026-11-20',period:'2026-11',
  kind:'expense',amount:1234,category:'Diğer',desc:'Sentetik hareket',
}]};

const settled=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const motion=node=>{
  const css=getComputedStyle(node);
  return [css.animationName,css.animationDuration,css.transform];
};
const still=['none','0s','none'];
const isFocused=locator=>locator.evaluate(node=>node===document.activeElement);

async function openQuickChoice(page,action){
  await page.locator('#quick-add').press('Enter');
  const menu=page.locator('#quick-add-options');
  await menu.waitFor();
  return menu.locator('[data-action='+action+']');
}

async function checkManualForm(page,reduced){
  const before=await page.evaluate(()=>localStorage.getItem('ekstre-android-v1'));
  const expense=await openQuickChoice(page,'addTransaction');
  const opening=await expense.evaluate(button=>{
    button.click();
    const dialog=document.querySelector('#modal');
    const fields=dialog.querySelector('#fields');
    const css=getComputedStyle(fields);
    const entry=fields.getAnimations()[0];
    const kind=dialog.querySelector('#f-kind');
    kind.value='income';
    kind.dispatchEvent(new Event('change',{bubbles:true}));
    const targets=[dialog.querySelector('#close'),dialog.querySelector('#submit')];
    return {open:dialog.open,focus:document.activeElement.id,outer:getComputedStyle(dialog).animationName,
      motion:[css.animationName,css.animationDuration,css.transform],
      sameAnimation:fields.getAnimations()[0]===entry,
      fits:targets.every(button=>{const rect=button.getBoundingClientRect();return rect.width>=48&&rect.height>=48;})};
  });
  assert.deepEqual(opening,{open:true,focus:'dialog-title',outer:'none',
    motion:reduced?still:['manual-form-in','0.16s','none'],sameAnimation:true,fits:true});
  await page.keyboard.press('Escape');
  assert(await isFocused(page.locator('#quick-add')));
  assert.equal(await page.locator('#modal[open]').count(),0);

  const income=await openQuickChoice(page,'addIncome');
  const back=await income.evaluate(button=>{
    button.click();
    const fields=document.querySelector('#fields');
    const heading=document.querySelector('#dialog-title').textContent;
    const started=getComputedStyle(fields).animationName;
    return {heading,started,back:window.handleBack(),closed:!document.querySelector('#modal').open,
      focus:document.activeElement.id,marker:fields.classList.contains('manual-form-entry')};
  });
  assert.deepEqual(back,{heading:'Gelir ekle',started:reduced?'none':'manual-form-in',back:true,
    closed:true,focus:'quick-add',marker:false});
  const transfer=await openQuickChoice(page,'transfer');
  await transfer.click();
  assert.equal(await page.getByRole('dialog',{name:'Transfer kaydet'}).isVisible(),true);
  if(!reduced){
    await page.emulateMedia({reducedMotion:'reduce'});
    await settled(page);
    assert.deepEqual(await page.locator('#fields').evaluate(motion),still);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await settled(page);
    assert.deepEqual(await page.locator('#fields').evaluate(motion),still);
  }
  assert.equal(await page.evaluate(()=>window.handleBack()),true);
  await page.locator('main [data-edit=synthetic-motion-row]').click();
  assert.deepEqual(await page.locator('#fields').evaluate(motion),still,'an existing transaction stays still');
  assert.equal(await page.evaluate(()=>window.handleBack()),true);
  await page.locator('#backup-file').setInputFiles({name:'synthetic-wallet.json',mimeType:'application/json',buffer:Buffer.from(before)});
  const restore=page.getByRole('dialog',{name:'JSON yedeğini incele'});
  assert.deepEqual(await restore.evaluate(motion),still,'restore confirmation stays still');
  assert.deepEqual(await restore.locator('#fields').evaluate(motion),still);
  assert.equal(await page.evaluate(()=>window.handleBack()),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ekstre-android-v1')),before);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
}

async function checkWalletEntry(page,reduced){
  const active=await page.evaluate(()=>localStorage.getItem('ekstre-android-v1'));
  await page.locator('#nav [data-page=wallet]').click();
  const entry=reduced?still:['wallet-detail-in','0.17s','none'];
  const wallet=page.getByRole('main');
  const card=wallet.locator('[data-card-view=synthetic-card]');
  const bank=wallet.locator('[data-account-view=synthetic-bank]');
  const open=async(button,stat)=>button.evaluate((opener,key)=>{
    const old=document.querySelector('#main > :first-child');
    opener.click();
    const detail=document.querySelector('#main > .wallet-detail');
    const css=getComputedStyle(detail);
    const values=detail.querySelectorAll('[data-stat='+key+']');
    return {motion:[css.animationName,css.animationDuration,css.transform],oldDetached:!old.isConnected,
      focus:document.activeElement.textContent,amount:values[0].textContent,headings:detail.querySelectorAll('h1').length,
      amountCount:values.length,scroll:scrollY};
  },stat);
  const snapshot=(focus,amount)=>({motion:entry,oldDetached:true,focus,amount,headings:1,amountCount:1,scroll:0});
  assert.deepEqual(await open(card,'cardDebt'),snapshot('Sentetik kart','₺80,00'));
  assert.equal(await page.evaluate(()=>window.handleBack()),true);
  assert(await isFocused(card));
  const root=wallet.locator(':scope > :first-child');
  assert.deepEqual(await root.evaluate(motion),still,'wallet Back stays still');

  assert.deepEqual(await open(bank,'accountBalance'),snapshot('Sentetik banka','₺967,66'));
  const period=wallet.locator('#period');
  await period.fill('2026-10');
  assert(await isFocused(period));
  assert.deepEqual(await root.evaluate(motion),still,'month changes do not replay the entrance');
  assert.equal(await wallet.locator('[data-stat=accountBalance]').innerText(),'₺967,66');
  assert.equal(await page.evaluate(()=>window.handleBack()),true);
  assert(await isFocused(bank));
  assert.deepEqual(await root.evaluate(motion),still);

  if(!reduced){
    await open(card,'cardDebt');
    await page.emulateMedia({reducedMotion:'reduce'});
    await settled(page);
    assert.deepEqual(await root.evaluate(motion),still);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await settled(page);
    assert.deepEqual(await root.evaluate(motion),still);
    assert.equal(await page.evaluate(()=>window.handleBack()),true);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ekstre-android-v1')),active);
}

async function checkManualSave(page){
  const snapshot=()=>page.evaluate(()=>localStorage.getItem('ekstre-android-v1'));
  const before=await snapshot();
  const status=page.locator('#status-announcement');
  const toast=page.locator('#toast');
  assert.equal(await status.getAttribute('role'),'status');
  const nativeBridge=await page.evaluate(()=>{
    const status=document.querySelector('#status-announcement');
    const text=Object.getOwnPropertyDescriptor(Node.prototype,'textContent');
    window.saveAnnouncements=[];
    Object.defineProperty(status,'textContent',{
      get(){return text.get.call(this);},
      set(message){
        if(message)window.saveAnnouncements.push({message,dialogOpen:document.querySelector('#modal').open,
          saved:JSON.parse(localStorage.getItem('ekstre-android-v1')).transactions.at(-1).desc});
        text.set.call(this,message);
      },
    });
    return !!window.syntheticWrites;
  });
  const history=()=>page.evaluate(()=>window.saveAnnouncements);
  const submit=page.locator('#submit');
  const error=page.locator('#form-error');
  const fillExpense=async amount=>{
    await (await openQuickChoice(page,'addTransaction')).click();
    const form=page.getByRole('dialog',{name:'Gider ekle'});
    await form.getByLabel('Açıklama',{exact:true}).fill('Sentetik kayıt');
    await form.locator('#f-account').selectOption('synthetic-bank');
    await form.getByLabel('Tutar (TL)',{exact:true}).fill(amount);
  };

  await fillExpense('geçersiz');
  await submit.click();
  assert(await error.isVisible());
  assert(await isFocused(error));
  assert.equal(await snapshot(),before);
  assert.deepEqual(await history(),[]);
  if(nativeBridge){
    await page.locator('#f-amount').fill('12,34');
    await page.evaluate(()=>{window.syntheticWrites.reject=true;});
    await submit.click();
    assert.match(await error.innerText(),/Kayıt kaydedilemedi/);
    assert.equal(await page.evaluate(()=>window.syntheticWrites.attempts),1);
    assert.equal(await snapshot(),before);
    assert.deepEqual(await history(),[]);
    await page.evaluate(()=>{window.syntheticWrites.reject=false;});
  }
  await page.keyboard.press('Escape');
  assert(await isFocused(page.locator('#quick-add')));
  assert.deepEqual(await history(),[]);
  assert.equal(await snapshot(),before);

  await fillExpense('12,34');
  await page.locator('#form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
  const saved=JSON.parse(await snapshot());
  assert.equal(saved.transactions.length,wallet.transactions.length+1);
  assert.equal(saved.transactions.at(-1).amount,1234);
  assert.equal(saved.transactions.at(-1).desc,'Sentetik kayıt');
  assert.equal(await page.locator('#modal[open]').count(),0);
  assert(await isFocused(page.locator('#quick-add')));
  assert.deepEqual(await history(),[{message:'İşlem kaydedildi.',dialogOpen:false,saved:'Sentetik kayıt'}]);
  assert.equal(await status.textContent(),'İşlem kaydedildi.');
  assert.equal(await toast.getAttribute('data-tone'),'success');
  assert.equal(await toast.innerText(),'İşlem kaydedildi.');
  assert(await toast.isVisible());

  await (await openQuickChoice(page,'quickPayCard')).click();
  const payment=page.getByRole('dialog',{name:'Kart ödemesi kaydet'});
  assert.deepEqual(await payment.locator('#fields').evaluate(motion),still);
  assert.equal(await toast.isVisible(),false,'a new manual form clears the previous save feedback');
  await payment.locator('#f-account').selectOption('synthetic-bank');
  await payment.locator('#f-amount').fill('1,00');
  await submit.click();
  assert.equal(JSON.parse(await snapshot()).transactions.at(-1).kind,'payment');
  assert.equal(await status.textContent(),'Kart ödemesi kaydedildi.');
  assert.equal((await history()).length,2);

  await page.locator('main [data-edit=synthetic-motion-row]').click();
  await page.locator('#f-desc').fill('Sentetik hareket güncellendi');
  await submit.click();
  assert.equal(JSON.parse(await snapshot()).transactions.find(row=>row.id==='synthetic-motion-row').desc,'Sentetik hareket güncellendi');
  assert.equal(await status.textContent(),'İşlem güncellendi.');
  assert.equal((await history()).length,3);

  await page.locator('#nav [data-page=wallet]').click();
  await page.locator('main [data-account=synthetic-bank]').click();
  await page.locator('#f-name').fill('Sentetik banka güncellendi');
  await submit.click();
  assert.equal(JSON.parse(await snapshot()).accounts.find(a=>a.id==='synthetic-bank').name,'Sentetik banka güncellendi');
  assert.equal((await history()).length,3,'an unrelated account save adds no manual success announcement');
}

async function checkReportSelection(page,reduced){
  await page.locator('#nav [data-page=reports]').click();
  const trend=page.getByRole('region',{name:'Aylık değişim'});
  const columns=()=>trend.locator('[data-trend-month]').evaluateAll(rows=>rows.map(row=>({
    month:row.dataset.trendMonth,amount:row.querySelector('.report-column-value').innerText,
    bar:[...row.querySelectorAll('progress')].map(bar=>[bar.value,bar.max,bar.classList.contains('negative')]),
  })));
  const before=await columns();
  assert.equal(before.find(row=>row.month==='2026-10').amount,'₺100,00');
  assert.equal(before.find(row=>row.month==='2026-11').amount,'-₺7,66');
  assert(before.find(row=>row.month==='2026-11').bar[0][2]);
  const selected=trend.locator('[aria-current=date] time');
  const selectMonth=month=>page.locator('#period').evaluate((field,value)=>{
    field.value=value;
    field.dispatchEvent(new Event('change',{bubbles:true}));
    const mark=document.querySelector('.report-chart [aria-current=date] time');
    const css=getComputedStyle(mark);
    return {month:mark.dateTime,focus:document.activeElement.id,amountMotion:getComputedStyle(mark.nextElementSibling).animationName,
      motion:[css.animationName,css.animationDuration,css.transform]};
  },month);
  assert.deepEqual(await selected.evaluate(motion),still);
  assert.deepEqual(await selectMonth('2026-10'),{
    month:'2026-10',focus:'period',amountMotion:'none',motion:reduced?still:['report-month-in','0.15s','none'],
  });
  assert.deepEqual(await columns(),before,'selection does not change amounts or signed progress values');
  assert.deepEqual((await selectMonth('2026-10')).motion,still,'same month does not replay');
  if(!reduced){
    await selectMonth('2026-11');
    await page.emulateMedia({reducedMotion:'reduce'});
    await settled(page);
    assert.deepEqual(await selected.evaluate(motion),still);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await settled(page);
    assert.deepEqual(await selected.evaluate(motion),still);
  }
  assert.deepEqual(await columns(),before);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
}

const checks={form:checkManualForm,wallet:checkWalletEntry,save:checkManualSave,chart:checkReportSelection};

module.exports=async function checkFinalMotion(browser,serveWallet,only){
  const selected=only?[[only,checks[only]]]:Object.entries(checks);
  for(const [name,check] of selected){
    if(!check)throw Error('Unknown final motion check: '+name);
    for(const [width,scale,reducedMotion] of [[390,100,'no-preference'],[320,200,'reduce']]){
      const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion});
      try{
        page.setDefaultTimeout(5000);
        const errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await serveWallet(page);
        const reportWallet=name==='chart'?{...wallet,transactions:[...wallet.transactions,{
          id:'synthetic-motion-refund',account:'synthetic-bank',date:'2026-11-21',period:'2026-11',
          kind:'refund',amount:2000,category:'Diğer',desc:'Sentetik iade',
        }]}:wallet;
        await page.addInitScript(({wallet,nativeBridge})=>{
          const key='ekstre-android-v1';
          localStorage.setItem(key,JSON.stringify(wallet));
          if(!nativeBridge)return;
          window.syntheticWrites={reject:false,attempts:0};
          window.Android={
            snapshotSlot:slot=>slot===1?localStorage.getItem(key):null,
            save(raw){
              window.syntheticWrites.attempts++;
              if(window.syntheticWrites.reject)return false;
              localStorage.setItem(key,raw);
              return true;
            },
          };
        },{wallet:reportWallet,nativeBridge:name==='save'&&width===390});
        await page.goto('https://wallet.test/');
        await page.evaluate(scale=>{document.documentElement.style.fontSize=scale+'%';},scale);
        await check(page,reducedMotion==='reduce');
        assert.deepEqual(errors,[]);
        console.log('Final motion '+name+' passed at '+width+'px / '+scale+'% ('+reducedMotion+')');
      }finally{await page.close();}
    }
  }
};
