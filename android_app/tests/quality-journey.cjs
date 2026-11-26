const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname,'../app/src/main/assets');

async function routeWallet(page) {
  await page.route('https://wallet.test/**', route => {
    const name = new URL(route.request().url()).pathname.replace(/^\//,'') || 'index.html';
    const file = path.join(root,name);
    if (!file.startsWith(root+path.sep) || !fs.existsSync(file)) return route.abort();
    const contentType = name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html';
    return route.fulfill({body:fs.readFileSync(file),contentType});
  });
}

async function categorySuggestionsJourney(browser) {
  const page=await browser.newPage({viewport:{width:320,height:720},hasTouch:true});
  page.setDefaultTimeout(4000);
  try {
    await routeWallet(page);
    await page.goto('https://wallet.test/');
    await page.evaluate(async()=>{
      const C=await import('/core.mjs');
      const W=await import('/wallet.mjs');
      const wallet=C.empty(),date=C.today();
      wallet.accounts.push({id:'test-card',name:'Sentetik kart',type:'card',opening:0});
      wallet.transactions.push({id:'test-movement',account:'test-card',date,period:date.slice(0,7),desc:'Sentetik Mağaza 1234 İzmir',kind:'expense',category:'Diğer',amount:4500,note:'Kalsın',reviewed:true,source:'manual'});
      wallet.transactions.push({...wallet.transactions[0],id:'other-movement',desc:'Sentetik Mağaza 5678 Bursa',amount:6700});
      wallet.transactions.push({...wallet.transactions[0],id:'uncategorized',desc:'Sentetik Mağaza 1111 Van',category:''});
      wallet.transactions.push({...wallet.transactions[0],id:'remaining-movement',desc:'Sentetik Mağaza 2222 Bursa'});
      localStorage.setItem('ekstre-android-v1',C.backupText(W.normalizeWallet(C.saveMerchantRule(wallet,'Sentetik Mağaza 5432 Ankara','Giyim'))));
    });
    await page.reload();
    const saved=()=>page.evaluate(()=>localStorage.getItem('ekstre-android-v1'));
    const stats=()=>page.locator('[data-stat]').allTextContents();
    const before=await saved(), totals=await stats();
    await page.locator('nav [data-page=transactions]').click();
    assert.equal(await page.locator('nav button').count(),5);
    const panel=page.locator('.transaction-with-suggestion').filter({has:page.locator('[data-edit=test-movement]')});
    const apply=panel.getByRole('button',{name:/Öneriyi uygula: Sentetik Mağaza/});
    const choose=panel.getByRole('button',{name:/Başka kategori seç: Sentetik Mağaza/});
    const edit=panel.locator('[data-edit=test-movement]');
    const dialog=page.getByRole('dialog',{name:'Kategori seç'});
    await page.getByRole('button',{name:'Başka kategori seç: Sentetik Mağaza 1111 Van'}).click();
    assert.equal(await dialog.getByLabel('Kategori',{exact:true}).inputValue(),'');
    await dialog.getByRole('button',{name:'Kaydet'}).click();
    assert.equal(await saved(),before);
    assert.match(await panel.innerText(),/Mevcut kategori: Diğer[\s\S]*Önerilen kategori: Giyim[\s\S]*numaralı şubeleri/);
    assert.match(await apply.getAttribute('aria-describedby'),/^transaction-category-advice-/);
    assert.equal(await saved(),before);
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.transaction-category-suggestion button')].every(button=>{
      const r=button.getBoundingClientRect();
      return r.left>=0&&r.right<=320&&r.width>=48&&r.height>=48;
    })),true);
    const screenshots=path.resolve(__dirname,'../test-output/category-suggestions');
    fs.mkdirSync(screenshots,{recursive:true});
    await panel.screenshot({path:path.join(screenshots,'category-suggestion-320.png')});
    await edit.focus();
    await page.keyboard.press('Tab');
    assert.equal(await apply.evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('Tab');
    assert.equal(await choose.evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('Enter');
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel('Kategori',{exact:true}).inputValue(),'Diğer');
    await dialog.screenshot({path:path.join(screenshots,'choose-category-320.png')});
    await dialog.getByLabel('Kategori',{exact:true}).selectOption('Eğitim');
    assert.equal(await saved(),before);
    assert.equal(await page.evaluate(()=>window.handleBack()),true);
    await dialog.waitFor({state:'hidden'});
    assert.equal(await choose.evaluate(e=>e===document.activeElement),true);
    assert.equal(await saved(),before);
    await page.locator('#search').fill('Diğer');
    await choose.click();
    await dialog.getByLabel('Kategori',{exact:true}).selectOption('Eğitim');
    await dialog.getByRole('button',{name:'Kaydet'}).click();
    assert.equal(await panel.count(),0);
    assert.equal(await page.locator('main h1').evaluate(e=>e===document.activeElement),true);
    await page.locator('#search').fill('');
    assert.match(await panel.innerText(),/Mevcut kategori: Eğitim/);
    await apply.focus();
    await page.keyboard.press('Space');
    await panel.waitFor({state:'detached'});
    assert.equal(await page.locator('[data-edit=test-movement]').evaluate(e=>e===document.activeElement),true);
    const expected=JSON.parse(before);
    expected.transactions[0].category='Giyim';
    assert.deepEqual(JSON.parse(await saved()),expected);
    await page.locator('#search').fill('Diğer');
    const otherApply=page.locator('[data-action=applyCategorySuggestion][data-transaction-id=other-movement]');
    await otherApply.scrollIntoViewIfNeeded();
    const {x,y,width,height}=await otherApply.boundingBox();
    await page.touchscreen.tap(x+width/2,y+height/2);
    await page.touchscreen.tap(x+width/2,y+height/2);
    await page.touchscreen.tap(x+width/2,y+height/2);
    await page.touchscreen.tap(x+width/2,y+height/2);
    expected.transactions[1].category='Giyim';
    assert.deepEqual(JSON.parse(await saved()),expected);
    await page.locator('nav [data-page=home]').click();
    assert.deepEqual(await stats(),totals);
    await page.locator('#settings').click();
    assert.equal(await page.locator('main .lead').innerText(),'Tarayıcı önizlemesi');
    await page.evaluate(()=>{window.Android={versionName:()=>'<b>9.8.7-test</b>'};});
    await page.locator('#settings').click();
    assert.equal(await page.locator('main .lead').innerText(),'Android sürümü <b>9.8.7-test</b>');
    assert.equal(await page.locator('main .lead b').count(),0);
    await page.evaluate(()=>{window.Android={versionName:()=>{throw Error('Köprü kullanılamıyor');}};});
    await page.locator('#settings').click();
    assert.equal(await page.locator('main .lead').innerText(),'Android sürüm bilgisi kullanılamıyor');
    console.log('Category suggestions: 320px, explicit saves, cancel/keyboard focus, stable totals and version fallbacks passed');
  } finally {
    await page.close();
  }
}

async function csvCategorySuggestionsJourney(browser) {
  const page = await browser.newPage();
  try {
    await routeWallet(page);
    await page.goto('https://wallet.test/');
    const sentinel = 'Sentetik ölçüm kuralı';
    await page.evaluate(async sentinel => {
      const C = await import('/core.mjs');
      const W = await import('/wallet.mjs');
      const wallet = C.empty();
      wallet.accounts.push({id:'synthetic-csv-card',name:'Sentetik kart',type:'card',opening:0});
      wallet.merchantCategoryRules = [
        ['MİGROS','Market / Gıda'], ['MIGROS 1234 İZMİR','Giyim'],
        ['METRO MARKET 5432 ANKARA','Giyim'], ['METRO MARKET 6789 BURSA','Giyim'],
        ['POS 5432 ANKARA','Giyim'], ['SENTETİK 7777 VAN','Giyim'], [sentinel,'Giyim'],
      ].map(([merchant,category],i) => ({id:'rule-'+i,merchant,category}));
      localStorage.setItem('ekstre-android-v1',C.backupText(W.normalizeWallet(wallet)));
    }, sentinel);
    await page.reload();
    await page.locator('[data-page=import]').first().click();
    const rows = [
      ['migros / 1234 izmir','Diğer','harcama','Giyim'],
      ['MIGROS 5678 BURSA','Eğitim','harcama','Eğitim'],
      ['METRO MARKET 9999 İZMİR','Giyim','harcama','Giyim'],
      ['MİGROS','Diğer','harcama','Diğer'],
      ['METRO MARKET 9999 İZMİR','Diğer','indirim','Giyim'],
      ['POS 5432 ANKARA','Diğer','harcama','Diğer'],
      ['POS 5678 İZMİR','Diğer','harcama','Diğer'],
      ['METRO MARKET 1234 BİLİNMİYOR','Diğer','harcama','Diğer'],
      ['METRO TURİZM 1234 İZMİR','Diğer','harcama','Diğer'],
      ['SENTETİK 7777 VAN','Diğer','odeme','Diğer'],
      ['METRO MARKET 2222 VAN','Giyim','harcama','Giyim'],
      ['migros / 1234 izmir','Eğitim','harcama','Giyim'],
    ];
    const header = 'bank,kart,period,date,desc,amount_cents,category,tur,transaction_id';
    const records = rows.map(([desc,category,kind],i) =>
      ['QNB','Sentetik kaynak','2026-10','2026-10-04',desc,(i+1)*(kind==='indirim'?-100:100),category,kind,'csv-'+i].join(','));
    await page.evaluate(sentinel => {
      const normalize = String.prototype.normalize;
      let reads = 0;
      String.prototype.normalize = function (...args) {
        if (String(this) === sentinel) reads++;
        return normalize.apply(this,args);
      };
      window.finishRuleCount = () => {
        String.prototype.normalize = normalize;
        return reads;
      };
    }, sentinel);
    await page.locator('#csv-file').setInputFiles({
      name:'sentetik-kategori.csv',mimeType:'text/csv',buffer:Buffer.from([header,...records].join('\n')),
    });
    const dialog = page.getByRole('dialog',{name:'CSV aktarımı'});
    await dialog.waitFor();
    const reads = await page.evaluate(() => window.finishRuleCount());
    const choices = dialog.locator('[data-category-suggestion]');
    assert.deepEqual(await choices.evaluateAll(fields => fields.map(field =>
      [field.labels[0].textContent.trim(),field.value,field.checked])), [
      ['migros / 1234 izmir · Öneriyi seç: Giyim','Giyim',false],
      ['MİGROS · Öneriyi seç: Market / Gıda','Market / Gıda',false],
      ['METRO MARKET 9999 İZMİR · Öneriyi seç: Giyim','Giyim',false],
      ['POS 5432 ANKARA · Öneriyi seç: Giyim','Giyim',false],
    ]);
    await choices.nth(0).check();
    await choices.nth(2).check();
    await dialog.locator('[name=card-0]').selectOption('synthetic-csv-card');
    await dialog.getByRole('button',{name:'Kaydet'}).click();
    await dialog.waitFor({state:'hidden'});
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('ekstre-android-v1')).transactions);
    assert.deepEqual(Object.fromEntries(persisted.map(row => [row.csvSourceId,row.category])),
      Object.fromEntries(rows.map((row,i) => ['csv-'+i,row[3]])));
    assert.equal(reads,1,'the CSV preview normalizes a saved rule only once');
    console.log('CSV category preview: indexed rule work, suggestion order, ambiguity and selected overrides passed');
  } finally {
    await page.close();
  }
}

async function quickAddJourney(page) {
  const add = page.getByRole('button',{name:'Ekle',exact:true});
  const menu = page.getByRole('dialog',{name:'Hızlı Ekle'});
  const option = name => menu.getByRole('button',{name,exact:true});
  const active = () => page.evaluate(() => document.activeElement.id);
  const wallet = () => page.evaluate(() => JSON.parse(localStorage.getItem('ekstre-android-v1')));
  const open = async name => { await add.click(); await option(name).click(); };
  const submitTwice = () => page.locator('#form').evaluate(form => {
    form.requestSubmit();
    form.requestSubmit();
  });

  await add.focus();
  await page.keyboard.press('Enter');
  await menu.waitFor();
  assert.equal(await active(),'dialog-title');
  assert.deepEqual(await page.locator('#nav button').allTextContents(),['⌂Özet','▣Cüzdan','⇅İşlemler','◷Plan','↓Ekstre']);
  assert.equal(await menu.getByRole('button',{name:'Kaydet'}).count(),0);
  assert.equal(await page.evaluate(() => {
    const buttons = document.querySelectorAll('header button, #quick-add-options button, #close');
    return document.documentElement.clientWidth === 320 && buttons.length === 7 &&
      [...buttons].every(button => {
        const bounds = button.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= 320 && bounds.width >= 48 && bounds.height >= 48;
      });
  }),true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent),'Kart Borcu Ödemesi');
  await page.keyboard.press('Tab');
  assert.equal(await active(),'close');
  await page.keyboard.press('Escape');
  assert.equal(await active(),'quick-add');

  await open('Kart Borcu Ödemesi');
  assert.match(await menu.getByRole('alert').innerText(),/bir kredi kartı ve kaynak/);
  assert.equal(await active(),'form-error');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent),'Kart Borcu Ödemesi');
  await option('Kart Borcu Ödemesi').press('Enter');
  await page.keyboard.press('Tab');
  assert.equal(await active(),'close');
  assert.equal(await wallet(),null);
  await page.keyboard.press('Escape');
  await open('Gider');
  await page.getByRole('dialog',{name:'Hesap / kart ekle'}).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await active(),'quick-add');

  await page.evaluate(async () => {
    const C = await import('/core.mjs');
    const initial = C.empty();
    initial.accounts = [
      {id:'quick-cash',name:'Sentetik nakit',type:'cash',opening:10000},
      {id:'quick-bank',name:'Sentetik banka',type:'bank',opening:100000},
      {id:'quick-card-a',name:'Sentetik kart A',type:'card',opening:10000},
      {id:'quick-card-b',name:'Sentetik kart B',type:'card',opening:25000},
    ];
    localStorage.setItem('ekstre-android-v1',C.backupText(initial));
  });
  await page.reload();

  await page.locator('nav [data-page=wallet]').click();
  await page.locator('[data-account-view=quick-bank]').click();
  for(const [name,kind] of [['Gider','expense'],['Gelir','income'],['Transfer','transfer']]){
    await open(name);
    assert.equal(await page.locator('#f-kind').inputValue(),kind);
    assert.equal(await page.locator('#f-account').inputValue(),'quick-bank');
    await page.keyboard.press('Escape');
    assert.equal(await active(),'quick-add');
  }

  await open('Kart Borcu Ödemesi');
  const paymentForm = page.getByRole('dialog',{name:'Kart borcu öde'});
  const source = paymentForm.getByLabel('Paranın çıktığı banka / nakit hesabı');
  assert.equal(await source.inputValue(),'quick-bank');
  await source.selectOption('quick-cash');
  assert.equal(await source.inputValue(),'quick-cash');
  await page.keyboard.press('Escape');
  assert.equal(await active(),'quick-add');
  assert.equal((await wallet()).transactions.length,0);

  await page.locator('nav [data-page=home]').click();
  await open('Gider');
  await page.getByRole('dialog',{name:'Gider ekle'}).waitFor();
  assert.equal(await page.locator('#f-kind').inputValue(),'expense');
  await page.locator('#f-account').selectOption('quick-bank');
  await page.locator('#f-desc').fill('Sentetik hızlı gider');
  await page.locator('#f-amount').fill('20');
  await submitTwice();
  assert.equal((await wallet()).transactions.length,1);
  assert.equal(await active(),'quick-add');
  assert.equal(await page.locator('[data-stat=netExpense]').innerText(),'₺20,00');

  await open('Gelir');
  await page.getByRole('dialog',{name:'Gelir ekle'}).waitFor();
  assert.equal(await page.locator('#f-kind').inputValue(),'income');
  await page.locator('#f-account').selectOption('quick-bank');
  await page.locator('#f-desc').fill('Sentetik hızlı gelir');
  await page.locator('#f-amount').fill('50');
  await page.locator('#submit').click();
  assert.equal(await page.locator('[data-stat=income]').innerText(),'₺50,00');

  await page.locator('nav [data-page=transactions]').click();
  await open('Transfer');
  await page.getByRole('dialog',{name:'Transfer yap'}).waitFor();
  assert.equal(await page.locator('#f-kind').inputValue(),'transfer');
  await page.locator('#f-account').selectOption('quick-bank');
  await page.locator('#f-target').selectOption('quick-cash');
  await page.locator('#f-desc').fill('Sentetik hızlı transfer');
  await page.locator('#f-amount').fill('10');
  await page.locator('#submit').click();
  await page.locator('button[data-edit]').filter({hasText:'Sentetik hızlı transfer'}).waitFor();

  await page.locator('nav [data-page=wallet]').click();
  await page.locator('[data-card-view=quick-card-b]').click();
  await open('Kart Borcu Ödemesi');
  await page.getByRole('dialog',{name:'Kart borcu öde'}).waitFor();
  assert.equal(await page.locator('#f-target').inputValue(),'quick-card-b');
  assert.equal(await source.inputValue(),'');
  await page.locator('#submit').click();
  assert.equal(await paymentForm.getByRole('alert').innerText(),'Kaynak hesabı seç.');
  assert.equal(await active(),'form-error');
  assert.equal((await wallet()).transactions.length,3);
  await source.selectOption('quick-bank');
  await page.locator('#f-amount').fill('40');
  await page.locator('#submit').dblclick();
  assert.equal((await wallet()).transactions.length,4);
  assert.equal(await paymentForm.count(),0);
  assert.equal(await active(),'quick-add');
  assert.equal(await page.locator('#main h1').innerText(),'Sentetik kart B');
  assert.equal(await page.locator('[data-stat=cardDebt]').innerText(),'₺210,00');
  assert.deepEqual((await wallet()).transactions.map(({kind,amount}) => [kind,amount]),
    [['expense',2000],['income',5000],['transfer',1000],['payment',4000]]);
  await page.locator('nav [data-page=home]').click();
  assert.equal(await page.locator('[data-stat=cash]').innerText(),'₺1.090,00');
  assert.equal(await page.locator('[data-stat=netExpense]').innerText(),'₺20,00');
  assert.equal(await page.locator('[data-stat=income]').innerText(),'₺50,00');

  await page.evaluate(() => localStorage.removeItem('ekstre-android-v1'));
  await page.reload();
  console.log('Quick Add: all four existing forms, 320px, focus, and one save per action passed');
}

async function reviewCenterJourney(page) {
  const wallet=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ekstre-android-v1')));
  await page.evaluate(async()=>{
    const C=await import('/core.mjs');
    const s=C.empty();
    s.accounts=[
      {id:'review-bank',name:'Sentetik banka',type:'bank',opening:100000},
      {id:'review-card',name:'Sentetik kart',type:'card',opening:0},
    ];
    const manual={
      id:'review-manual',source:'manual',kind:'expense',account:'review-card',
      date:'2026-11-10',period:'2026-11',amount:12345,desc:'Sentetik market',
      category:'Market / Gıda',note:'',
    };
    const pdf={...manual,id:'review-pdf',source:'pdf',
      matchStatus:'pending',matchCandidates:['review-manual']};
    s.transactions=[manual,pdf];
    localStorage.setItem('ekstre-android-v1',C.backupText(s));
  });
  await page.reload();
  await page.locator('nav [data-page=transactions]').click();
  await page.getByRole('button',{name:'İnceleme Merkezi'}).click();
  assert.equal(await page.locator('nav button[aria-current=page]').getAttribute('data-page'),'transactions');
  assert.equal(await page.locator('.review-item').count(),1);
  assert.match(await page.locator('.review-item').innerText(),/Olası eşleşme/);
  assert.match(await page.locator('.review-item').innerText(),/ikinci kez|ayrıca finansal/);
  const original=await wallet();
  await page.getByRole('button',{name:'Sonra incele'}).click();
  assert.deepEqual(await wallet(),original);
  await page.getByRole('button',{name:'İnceleme Merkezi'}).click();
  await page.getByRole('button',{name:'Aynı işlem'}).click();
  await page.waitForFunction(()=>{
    const s=JSON.parse(localStorage.getItem('ekstre-android-v1'));
    return s.transactions.some(t=>t.id==='review-pdf'&&t.linkedTo==='review-manual');
  });
  const linked=await wallet();
  assert.equal(linked.transactions.filter(t=>t.linkedTo).length,1);
  assert.equal(linked.transactions.filter(t=>t.matchStatus==='pending').length,0);
  await page.locator('details.review-history').evaluate(d=>d.open=true);
  assert.equal(await page.getByRole('button',{name:'Yeniden incele'}).count(),1);
  assert.equal(await page.locator('.review-item').count(),0);
  await page.evaluate(async()=>{
    const C=await import('/core.mjs');
    const s=JSON.parse(localStorage.getItem('ekstre-android-v1'));
    const m=C.summary(s,'2026-11');
    if(m.net!==12345)throw new Error('Review linking changed the expense total');
    localStorage.removeItem('ekstre-android-v1');
  });
  await page.reload();
  console.log('Review Center: pending, postpone, linking, report and navigation passed');
}

async function advancedReportsJourney(page) {
  const saved = () => page.evaluate(() => localStorage.getItem('ekstre-android-v1'));
  await page.evaluate(async () => {
    const C = await import('/core.mjs');
    const state = C.empty();
    state.accounts = [
      {id:'report-bank',name:'Sentetik çok uzun banka hesabı açıklaması',type:'bank',opening:100000},
      {id:'report-cash',name:'Sentetik nakit',type:'cash',opening:10000},
      {id:'report-card',name:'Sentetik kart',type:'card',opening:0},
    ];
    const rows = [
      ['2026-01-06','income','report-bank',3000,'Maaş','Sentetik ocak'],
      ['2026-10-06','income','report-bank',100000,'Maaş','Sentetik maaş'],
      ['2026-10-07','expense','report-card',20000,'Market / Gıda','Sentetik kart alışverişi'],
      ['2026-10-08','expense','report-bank',5000,'Diğer','Sentetik banka gideri'],
      ['2026-10-09','payment','report-bank',10000,'Kart ödemesi','Sentetik kart ödemesi','report-card'],
      ['2026-10-10','transfer','report-bank',3000,'Transfer','Sentetik transfer','report-cash'],
      ['2026-11-11','refund','report-card',25000,'Market / Gıda','Sentetik iade'],
    ];
    for(const [date,kind,account,amount,category,desc,target] of rows){
      state.transactions.push({id:'ar-'+state.transactions.length,date,period:date.slice(0,7),kind,account,amount,category,desc,...(target?{target}:{})});
    }
    localStorage.setItem('ekstre-android-v1',C.backupText(state));
  });
  const original = await saved();
  await page.reload();
  await page.getByRole('button',{name:'Raporlar ↗'}).click();
  await page.getByLabel('Bitiş ayı').fill('2026-11');
  await page.getByLabel('Bitiş ayı').evaluate(input => {
    input.value='10000-01';
    input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  assert.equal(await page.getByLabel('Bitiş ayı').inputValue(),'2026-11');
  const stat = name => page.locator('[data-stat='+name+']').innerText();
  const months = page.locator('[data-report-month]');
  assert.equal(await months.count(),6);
  assert.equal(await stat('range-income'),'₺1.000,00');
  assert.equal(await stat('range-netExpense'),'₺0,00');
  assert.match(await stat('netExpense'),/^[-−]₺250,00$/);
  assert.equal(await stat('margin'),'₺250,00');
  assert.equal(await page.locator('[data-report-month="2026-09"]').getByText('₺0,00',{exact:true}).count(),10);
  await page.getByLabel('Rapor aralığı').selectOption('12');
  assert.equal(await months.count(),12);
  assert.equal(await stat('range-income'),'₺1.030,00');
  assert.equal(await page.evaluate(() => document.activeElement.id),'f-report-range');

  await page.getByLabel('Rapor hesabı').selectOption('report-card');
  assert.equal(await stat('range-income'),'₺0,00');
  assert.match(await stat('range-netExpense'),/^[-−]₺50,00$/);
  await page.getByLabel('Aylık değişimini ve işlemlerini görmek istediğin kategori').selectOption('category:Market / Gıda');
  const details = page.locator('#report-category-transactions');
  assert.equal(await details.locator('button[data-edit]').count(),2);
  await details.getByText('Sentetik iade',{exact:true}).waitFor();
  await details.getByText('Sentetik kart alışverişi',{exact:true}).waitFor();

  await page.getByLabel('Rapor hesabı').selectOption('report-bank');
  await page.getByLabel('Bitiş ayı').fill('2026-10');
  assert.equal(await stat('cashOut'),'₺180,00');
  assert.equal(await stat('cardCashPayments'),'₺100,00');
  assert.equal(await stat('netExpense'),'₺50,00');
  await page.getByRole('button',{name:'Ayın işlem kayıtları'}).click();
  assert.equal(await page.locator('#report-movements button[data-edit]').count(),4);
  assert.equal(await page.locator('#report-movements-toggle').getAttribute('aria-expanded'),'true');
  assert.equal(await page.evaluate(() => {
    const edge=document.documentElement.clientWidth;
    return edge===320 && [...document.querySelectorAll('.advanced-reports .panel,.report-controls select')].every(e=>{
      const r=e.getBoundingClientRect();
      return r.left>=0&&r.right<=edge+1&&e.scrollWidth<=e.clientWidth+1;
    });
  }),true);
  assert.equal(await saved(),original);
  assert.equal(await page.evaluate(() => window.handleBack()),true);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.page),'reports');

  await page.evaluate(() => localStorage.removeItem('ekstre-android-v1'));
  await page.reload();
  console.log('Advanced Reports: range, account, signed categories, drilldowns, navigation and 320px passed');
}

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || undefined});
  try {
    await csvCategorySuggestionsJourney(browser);
    await categorySuggestionsJourney(browser);
    const page = await browser.newPage({viewport:{width:320,height:720}});
    page.setDefaultTimeout(4000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let acceptConfirmation = true;
    const confirmations = [];
    page.on('dialog', dialog => {
      confirmations.push(dialog.message());
      return acceptConfirmation ? dialog.accept() : dialog.dismiss();
    });
    await routeWallet(page);
    await page.goto('https://wallet.test/');
    await quickAddJourney(page);
    await reviewCenterJourney(page);
    await advancedReportsJourney(page);
    await page.locator('nav [data-page=wallet]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Cüzdanım');

    await page.getByRole('button',{name:'Örnek cüzdan'}).click();
    await page.locator('nav [data-page=transactions]').click();
    const transaction = page.locator('button[data-edit]').first();
    await transaction.focus();
    await page.keyboard.press('Space');
    await page.getByRole('dialog',{name:'İşlem ayrıntısı'}).waitFor();
    const active = () => page.evaluate(() => document.activeElement.id);
    assert.equal(await active(), 'dialog-title');
    await page.keyboard.press('Tab');
    assert.equal(await active(), 'close');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await active(), 'submit');
    await page.keyboard.press('Tab');
    assert.equal(await active(), 'close');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement.matches('button[data-edit]'));

    await page.keyboard.press('Enter');
    await page.getByRole('dialog',{name:'İşlem ayrıntısı'}).waitFor();
    assert.equal(await page.evaluate(() => window.handleBack()), true);
    await page.waitForFunction(() => document.activeElement.matches('button[data-edit]'));

    await page.keyboard.press('Enter');
    await page.evaluate(() => {
      // Reopen before a queued native close event can run.
      window.handleBack();
      document.activeElement.click();
    });
    await page.locator('[name=category]').selectOption('Giyim');
    await page.getByLabel('Bu satıcı için kategori önerisini hatırla').check();
    const originalMerchant = await page.locator('[name=desc]').inputValue();
    await page.locator('#submit').click();
    await page.waitForFunction(() => document.activeElement.matches('button[data-edit]'));

    await page.locator('[data-action=addTransaction]').click();
    await page.locator('[name=desc]').fill(originalMerchant.toLocaleUpperCase('tr'));
    const suggestion = page.getByRole('button',{name:'Önerilen kategoriyi seç'});
    await suggestion.waitFor();
    assert.notEqual(await page.locator('[name=category]').inputValue(), 'Giyim');
    await suggestion.click();
    assert.equal(await page.locator('[name=category]').inputValue(), 'Giyim');
    await page.locator('[name=amount]').fill('1.234');
    await page.locator('#submit').click();
    assert.match(await page.locator('dialog [role=alert]').innerText(), /ayraç/i);
    assert.equal(await active(), 'form-error');
    assert.equal(await page.locator('[name=amount]').inputValue(), '1.234');
    await page.keyboard.press('Escape');

    await page.locator('#settings').click();
    await page.getByRole('heading',{name:'Satıcı kategori kuralları'}).waitFor();
    await page.getByRole('button',{name:'Kuralı düzenle'}).click();
    await page.locator('[name=category]').selectOption('Diğer');
    await page.locator('#submit').click();
    await page.waitForFunction(() => document.activeElement.textContent === 'Kuralı düzenle');
    assert.match(await page.locator('main').innerText(), /Diğer/);
    await page.getByRole('button',{name:'İnceleme ve kaynak bağlantıları'}).click();
    assert.equal(await page.evaluate(() => window.handleBack()), true);
    await page.waitForFunction(() => document.activeElement.textContent === 'İnceleme ve kaynak bağlantıları');

    await page.locator('nav [data-page=plan]').click();
    await page.getByRole('button',{name:'+ Bütçe'}).click();
    await page.locator('[name=amount]').fill('5000');
    await page.locator('#submit').click();
    await page.getByRole('progressbar',{name:'Toplam bütçe kullanımı'}).waitFor();

    await page.locator('nav [data-page=transactions]').click();
    await page.locator('[data-action=addTransaction]').click();
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('ekstre-android-v1')));
    const card = (await stored()).accounts.find(a => a.type === 'card');
    await page.locator('[name=account]').selectOption(card.id);
    await page.locator('[name=desc]').fill('Sentetik taksitli alışveriş');
    await page.locator('[name=amount]').fill('100,00');
    await page.locator('[name=date]').fill('2026-01-31');
    await page.locator('[name=installmentCount]').fill('3');
    await page.locator('#submit').click();
    assert.deepEqual((await stored()).transactions.filter(t => t.installmentPlan).map(t => t.amount), [3333,3333,3334]);

    const beforeDeletion = await stored();
    await page.locator('#period').fill('2026-02');
    await page.getByRole('button',{name:/Sentetik taksitli alışveriş/}).click();
    const deletePlan = page.getByRole('button',{name:'Taksit planını sil'});
    acceptConfirmation = false;
    await deletePlan.click();
    assert.match(confirmations.at(-1),/3 taksit/i);
    assert.match(confirmations.at(-1),/100,00/);
    assert.deepEqual(await stored(),beforeDeletion);
    acceptConfirmation = true;
    await deletePlan.click();
    assert.deepEqual((await stored()).transactions,beforeDeletion.transactions.filter(t=>!t.installmentPlan));

    await page.locator('#settings').click();
    await page.getByRole('button',{name:'+ Satıcı kuralı'}).click();
    await page.getByLabel('Satıcı adı').fill('MIGROS 5432 ANKARA');
    await page.locator('[name=category]').selectOption('Giyim');
    await page.locator('#submit').click();
    await page.getByRole('button',{name:'Giyim kategorisini düzenle'}).click();
    await page.getByLabel('Kategori adı').fill('Giyim ve aksesuar');
    await page.locator('#submit').click();
    const renamed = await stored();
    assert.ok(renamed.categories.includes('Giyim ve aksesuar'));
    assert.ok(renamed.transactions.some(t=>t.category==='Giyim ve aksesuar'));
    assert.equal(renamed.merchantCategoryRules.find(r=>r.merchant==='MIGROS 5432 ANKARA').category,'Giyim ve aksesuar');

    await page.getByRole('button',{name:'Giyim ve aksesuar kategorisini düzenle'}).click();
    await page.getByRole('button',{name:'Kategoriyi sil'}).click();
    await page.getByRole('dialog',{name:'Kategoriyi sil'}).waitFor();
    const beforeCategoryRemoval = await stored();
    await page.getByRole('button',{name:'İptal',exact:true}).click();
    assert.deepEqual(await stored(),beforeCategoryRemoval);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.expenseCategoryEdit), 'Giyim ve aksesuar');
    await page.getByRole('button',{name:'Giyim ve aksesuar kategorisini düzenle'}).click();
    await page.getByRole('button',{name:'Kategoriyi sil'}).click();
    await page.getByLabel('Başka kategoriye taşı').check();
    await page.getByLabel('Hedef gider kategorisi').selectOption('Eğitim');
    await page.locator('#submit').click();
    assert.equal((await stored()).merchantCategoryRules.find(r=>r.merchant==='MIGROS 5432 ANKARA').category,'Eğitim');
    assert.deepEqual((await stored()).transactions,beforeCategoryRemoval.transactions);
    assert.equal(await page.evaluate(() => document.activeElement.matches('#main h1')), true);

    await page.locator('nav [data-page=transactions]').click();
    await page.locator('[data-action=addTransaction]').click();
    await page.locator('[name=desc]').fill('MIGROS 1234 IZMIR');
    await suggestion.waitFor();
    assert.notEqual(await page.locator('[name=category]').inputValue(),'Eğitim');
    await suggestion.click();
    assert.equal(await page.locator('[name=category]').inputValue(),'Eğitim');
    await page.keyboard.press('Escape');

    await page.locator('#settings').click();
    await page.getByRole('button',{name:'Eğitim kategorisini düzenle'}).click();
    await page.getByRole('button',{name:'Kategoriyi sil'}).click();
    await page.getByLabel('İlgili kuralları kaldır').check();
    await page.locator('#submit').click();
    assert.ok(!(await stored()).merchantCategoryRules.some(r=>r.merchant==='MIGROS 5432 ANKARA'));

    await page.getByRole('button',{name:'Abonelik kategorisini düzenle'}).click();
    await page.getByRole('button',{name:'Kategoriyi sil'}).click();
    await page.locator('#submit').click();
    await page.locator('nav [data-page=plan]').click();
    await page.locator('[data-action=subscription]').click();
    await page.getByLabel('Abonelik adı').fill('Sentetik kategori kontrolü');
    await page.locator('[name=amount]').fill('50,00');
    await page.locator('[name=next]').fill('2026-10-15');
    await page.locator('#submit').click();
    const subscription=(await stored()).subscriptions.at(-1);
    assert.equal(subscription.category,'Diğer');
    await page.locator('[data-pay]').click();
    await page.locator('[name=paidOn]').fill('2026-10-15');
    await page.locator('#submit').click();
    assert.equal((await stored()).transactions.find(t=>t.subscriptionId===subscription.id).category,'Diğer');

    await page.locator('#settings').click();

    await page.getByRole('button',{name:'+ Satıcı kuralı'}).click();
    await page.getByLabel('Satıcı adı').fill('Sentetik BIMEKS');
    await page.locator('[name=category]').selectOption('Ulaşım');
    await page.locator('#submit').click();
    await page.evaluate(() => window.onPdfText('QNB\nHesap Kesim Tarihi: 05/11/2026\n02/11/2026 SENTETIK BIMEKS 123.45'));
    await page.locator('#import-account').selectOption(card.id);
    await page.getByLabel(/SENTETIK BIMEKS.*Öneriyi seç: Ulaşım/i).check();
    await page.locator('#acknowledge-import').check();
    await page.locator('[data-action=confirmImport]').click();
    assert.equal((await stored()).transactions.find(t => t.source === 'pdf').category, 'Ulaşım');
    await page.locator('#settings').click();
    const before = await stored();
    await page.locator('#backup-file').setInputFiles({
      name:'sentetik-gecersiz.json', mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify({...before,transactions:[{id:'bozuk'}]})),
    });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('geçersiz'));
    assert.deepEqual(await stored(), before);

    const corrupted=structuredClone(before);
    const imported=corrupted.transactions.find(t=>t.source==='pdf');
    const unrelated=corrupted.transactions.find(t=>(!t.source||t.source==='manual')&&t.amount!==imported.amount);
    imported.linkedTo=unrelated.id;
    imported.matchStatus='linked';
    const beforeRecovery=await page.evaluate(()=>localStorage.getItem('ekstre-android-v1-recovery'));
    const beforeConfirmations=confirmations.length;
    await page.locator('#backup-file').setInputFiles({
      name:'sentetik-bozuk-baglanti.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(corrupted)),
    });
    await page.waitForFunction(()=>/bağlantı|eşleşme/i.test(document.querySelector('#toast').textContent));
    assert.deepEqual(await stored(),before);
    assert.equal(await page.evaluate(()=>localStorage.getItem('ekstre-android-v1-recovery')),beforeRecovery);
    assert.equal(confirmations.length,beforeConfirmations);

    const firstPan=['4111','1111','1111','1111'].join(' - ');
    const secondPan=['4000','0000','0006','1111'].join(' - ');
    const importPrivatePdf=async numbers=>{
      const text=['QNB','Hesap Kesim Tarihi: 05/10/2026',...numbers.map(n=>'01/10/2026 SENTETIK KART '+n+' 50.00')].join('\n');
      await page.evaluate(text=>window.onPdfText(text),text);
      await page.locator('#import-account').selectOption(card.id);
      await page.locator('#acknowledge-import').check();
      await page.locator('[data-action=confirmImport]').click();
    };
    await importPrivatePdf([firstPan,secondPan]);
    const initialPrivate=(await stored()).transactions.filter(t=>t.importKey?.startsWith('pdf-hmac-v1:'));
    assert.equal(initialPrivate.length,2);
    await page.locator('nav [data-page=transactions]').click();
    await page.locator('button[data-edit="'+initialPrivate[0].id+'"]').click();
    await page.locator('[name=desc]').fill('Sentetik düzenleme');
    await page.locator('[name=note]').fill('Sentetik not');
    await page.locator('[name=category]').selectOption('Sağlık');
    await page.locator('#submit').click();
    await page.reload();
    await importPrivatePdf([secondPan,firstPan]);
    const repeatedPrivate=(await stored()).transactions.filter(t=>t.importKey?.startsWith('pdf-hmac-v1:'));
    assert.deepEqual(repeatedPrivate.map(t=>t.id),[initialPrivate[1].id,initialPrivate[0].id]);
    assert.deepEqual([repeatedPrivate[1].desc,repeatedPrivate[1].note,repeatedPrivate[1].category],
      ['Sentetik düzenleme','Sentetik not','Sağlık']);
    assert.ok(!JSON.stringify(repeatedPrivate).includes(firstPan)&&!JSON.stringify(repeatedPrivate).includes(secondPan));

    const csvHeader='bank,kart,period,date,desc,amount_cents,category,tur,transaction_id';
    const sourceCard='<button type="button" data-action="cancelImport" data-import-injection>Sentetik & Kart</button>';
    const csvRow=`QNB,"${sourceCard.replaceAll('"','""')}",2026-10,2026-10-04,SENTETIK CSV AYNI,5000,Diğer,harcama,sentetik-cakis`;
    const csvFile={
      name:'sentetik-csv-tekrar.csv',mimeType:'text/csv',
      buffer:Buffer.from([csvHeader,csvRow,csvRow].join('\n')),
    };
    const uploadCsv=async()=>{
      await page.locator('#csv-file').setInputFiles(csvFile);
      await page.getByRole('dialog',{name:'CSV aktarımı'}).waitFor();
      assert.equal(await page.locator('[data-import-injection]').count(),0);
      assert.equal(await page.locator('label[for=f-card-0]').textContent(),`QNB · ${sourceCard}`);
      await page.locator('[name=card-0]').selectOption(card.id);
      await page.locator('#submit').click();
    };
    await uploadCsv();
    assert.match(await page.locator('#toast').innerText(), /2 satır.*1 kaydedildi, 1 incelemede, 0 daha önce işlendi/);
    const csvRows=(await stored()).transactions.filter(t=>t.source==='csv');
    assert.equal(csvRows.length,2);
    assert.equal(csvRows.filter(t=>t.matchStatus==='pending').length,1);
    await page.locator('#settings').click();
    await page.getByRole('button',{name:'İnceleme ve kaynak bağlantıları'}).click();
    const pendingCsvId=csvRows.find(t=>t.matchStatus==='pending')?.id;
    assert.ok(pendingCsvId);
    const csvReview=page.locator('.review-item').filter({has:page.locator('button[data-distinct="'+pendingCsvId+'"]')});
    await csvReview.waitFor();
    assert.equal(await csvReview.getByRole('button',{name:'Aynı işlem',exact:true}).count(),0);
    await csvReview.getByRole('button',{name:'Ayrı gerçek işlem'}).click();
    assert.equal((await stored()).transactions.filter(t=>t.source==='csv'&&t.matchStatus==='distinct').length,1);
    const reviewed=await stored();
    await uploadCsv();
    assert.match(await page.locator('#toast').innerText(), /2 satır.*0 kaydedildi, 0 incelemede, 2 daha önce işlendi/);
    assert.deepEqual(await stored(),reviewed);
    console.log('CSV source labels rendered as text; fake button blocked and reimport kept the wallet intact');

    await page.evaluate(cardId => {
      const wallet = JSON.parse(localStorage.getItem('ekstre-android-v1'));
      wallet.transactions = Array.from({length:10001},(_,i) => ({
        id:'synthetic-large-'+i, account:cardId, date:'2026-01-01', period:'2026-01',
        kind:'expense', desc:'Sentetik alışveriş', category:'Diğer', amount:i===10000?1:999999999999,
      }));
      localStorage.setItem('ekstre-android-v1',JSON.stringify(wallet));
    },card.id);
    await page.reload();
    await page.locator('#period').fill('2026-01');
    assert.equal(await page.locator('[data-stat=netExpense]').innerText(),'₺99.999.999.999.900,01');
    await page.locator('[data-page=reports]').click();
    await page.getByRole('heading',{name:'Kategori dağılımı'}).waitFor();
    assert.deepEqual(errors, []);
    console.log('Category, installment, accessibility and failed restore journeys passed');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
