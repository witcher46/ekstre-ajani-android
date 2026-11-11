const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const assets = path.resolve(__dirname,'../app/src/main/assets');
const output = path.resolve(__dirname,'../test-output/statement-ux');
const fixture = require('./fixtures/android-0.2.0.json');
const statement = [
  'QNB', 'Hesap Kesim Tarihi: 05/11/2026', 'Son Odeme Tarihi: 20/11/2026',
  'Onceki Donem Hesap Ozeti Borcu: 100.00', 'Donem Borcu: 1000.00',
  '01/11/2026 SENTETIK MARKET 1200.00', '02/11/2026 SENTETIK KAHVE 300.00',
  '03/11/2026 ODEME 500.00', '04/11/2026 SENTETIK MARKET IADE -100.00',
].join('\n');

function makeWallet() {
  const wallet = structuredClone(fixture);
  wallet.accounts[0].name = 'Günlük kredi kartı';
  wallet.merchantCategoryRules=[{id:'synthetic-category-rule',merchant:'SENTETIK MARKET',category:'Diğer'}];
  wallet.accounts.push({id:'cash',type:'cash',name:'Nakit',opening:0});
  const row = {account:'synthetic-bank',date:'2026-10-02',period:'2026-10',source:'manual',category:'Market / Gıda'};
  wallet.transactions.push(
    {...row,id:'market',kind:'expense',desc:'Sentetik market',amount:30000},
    {...row,id:'refund',kind:'refund',desc:'Sentetik iade',amount:5000},
    {...row,id:'salary',kind:'income',desc:'Sentetik gelir',category:'Maaş',amount:100000},
    {...row,id:'transfer',kind:'transfer',target:'cash',desc:'Sentetik transfer',amount:20000},
    {...row,id:'candidate',kind:'expense',desc:'İnceleme bekleyen kayıt',amount:30000,
      matchStatus:'pending',matchCandidates:['market']},
  );
  return wallet;
}

async function capture(page,locator,name){
  const overlays=page.locator('#toast, body > nav');
  const previous=await overlays.evaluateAll(elements=>elements.map(el=>{
    const visibility=el.style.visibility;
    el.style.visibility='hidden';
    return visibility;
  }));
  try{
    await locator.screenshot({path:path.join(output,name)});
  } finally{
    await overlays.evaluateAll((elements,previous)=>elements.forEach((el,i)=>el.style.visibility=previous[i]),previous);
  }
}

async function checkLayout(page,selector){
  let count=0;
  for(const width of [320,360,390,412]){
    await page.setViewportSize({width,height:844});
    for(const scale of [1,1.5,2]){
      const issues=await page.locator(selector).evaluate((root,scale)=>{
        const elements=[root,...root.querySelectorAll('*')];
        const original=elements.map(e=>[e,e.style.fontSize,parseFloat(getComputedStyle(e).fontSize)]);
        for(const [e,,size] of original)e.style.fontSize=(size*scale)+'px';
        const failures=[];
        for(const el of root.querySelectorAll('button,select,article,dt,dd,.money')){
          const r=el.getBoundingClientRect();
          if(!r.width||!r.height)continue;
          if(r.left<0||r.right>innerWidth+1||el.scrollWidth>el.clientWidth+1)failures.push(el.textContent.trim().slice(0,75));
          if(el.matches('button,select')&&(r.height<44||r.width<44))failures.push('touch target '+el.textContent.trim());
        }
        for(const group of root.querySelectorAll('.preview-card-controls,.preview-actions,.statement-totals,.expense-category-values')){
          const children=[...group.children].map(e=>e.getBoundingClientRect());
          for(const [i,a] of children.entries())for(const b of children.slice(i+1)){
            if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)failures.push(group.className);
          }
        }
        for(const [e,size] of original)e.style.fontSize=size;
        return failures;
      },scale);
      assert.deepEqual(issues,[],selector+' '+width+'px '+scale);
      count++;
    }
  }
  return count;
}

async function run() {
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},locale:'tr-TR'});
    page.setDefaultTimeout(5000);
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://wallet.test/**',route=>{
      const pathname=new URL(route.request().url()).pathname;
      const filename=path.join(assets,pathname==='/'?'index.html':pathname);
      if(!filename.startsWith(assets+path.sep)||!fs.existsSync(filename))return route.abort();
      const mime={'.mjs':'text/javascript','.css':'text/css','.html':'text/html'};
      return route.fulfill({body:fs.readFileSync(filename),contentType:mime[path.extname(filename)]});
    });
    await page.addInitScript(wallet=>{
      if(!localStorage.getItem('ekstre-android-v1'))localStorage.setItem('ekstre-android-v1',JSON.stringify(wallet));
    },makeWallet());
    await page.goto('https://wallet.test/');
    await page.locator('#period').fill('2026-10');

    const chart=page.getByRole('region',{name:'Kategori bazlı gider dağılımı'});
    await chart.waitFor();
    const rows=chart.getByRole('button');
    assert.equal(await rows.count(),2);
    assert.match(await rows.nth(0).innerText(),/Market \/ Gıda[\s\S]*300,00[\s\S]*%75/);
    assert.match(await rows.nth(1).innerText(),/Sentetik özel kategori[\s\S]*100,00[\s\S]*%25/);
    assert.match(await page.locator('[data-stat=netExpense]').innerText(),/350,00/);
    let checks=await checkLayout(page,'.expense-breakdown');
    await page.setViewportSize({width:390,height:844});
    await capture(page,chart,'01-ozet-gider-grafigi.png');
    await rows.first().focus();
    await page.keyboard.press('Enter');
    await page.getByRole('heading',{name:'İşlemler'}).waitFor();
    assert.deepEqual(await page.locator('button[data-edit]').evaluateAll(list=>list.map(e=>e.dataset.edit)),['market']);
    await page.evaluate(()=>window.handleBack());
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.expenseCategory),'Market / Gıda');
    await page.locator('#period').fill('2026-08');
    await chart.getByText('Seçili ayda gider kaydı yok.').waitFor();

    await page.evaluate(text=>window.onPdfText(text),statement);
    const preview=page.getByRole('region',{name:'Aktarım önizlemesi'});
    await preview.waitFor();
    const cardPicker=preview.getByRole('combobox',{name:'Hedef kredi kartı'});
    await cardPicker.focus();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'import-account');
    checks+=await checkLayout(page,'.statement-preview');
    await page.setViewportSize({width:390,height:844});
    await capture(page,preview,'02-ekstre-onizleme.png');
    await preview.getByText('Toplamlar doğrulandı').click();
    await preview.getByText('Son ödeme tarihi').waitFor();
    await preview.getByText('Toplamlar doğrulandı').click();
    await page.setViewportSize({width:320,height:844});
    const controls=preview.locator('.preview-card-controls');
    await controls.evaluate(root=>{
      const elements=[root,...root.querySelectorAll('*')];
      const sizes=elements.map(el=>parseFloat(getComputedStyle(el).fontSize));
      elements.forEach((el,i)=>el.style.fontSize=(sizes[i]*2)+'px');
    });
    const chosenName=controls.locator('#import-account-display');
    assert.equal(await chosenName.innerText(),'Günlük kredi kartı');
    assert.ok(await chosenName.evaluate(el=>el.clientHeight>parseFloat(getComputedStyle(el).lineHeight)));
    await capture(page,controls,'04-320px-buyuk-yazi.png');
    await controls.evaluate(root=>[root,...root.querySelectorAll('*')].forEach(el=>el.style.fontSize=''));
    await page.setViewportSize({width:390,height:844});
    await preview.getByRole('button',{name:'+ Kart ekle'}).click();
    assert.equal(await page.locator('#f-type').inputValue(),'card');
    await page.locator('#f-name').fill('Yedek kredi kartı');
    await page.locator('#submit').click();
    assert.equal(await page.locator('#import-account option:checked').innerText(),'Yedek kredi kartı');
    const newCard=await cardPicker.inputValue();
    await cardPicker.selectOption('synthetic-card');
    assert.equal(await page.locator('#import-account-display').innerText(),'Günlük kredi kartı');
    await cardPicker.selectOption(newCard);
    await page.getByRole('region',{name:'Aktarılan ekstreler'}).getByRole('button',{name:/Detayı aç/}).click();
    await page.evaluate(()=>window.handleBack());
    assert.equal(await page.locator('#import-account option:checked').innerText(),'Yedek kredi kartı');
    await preview.getByRole('button',{name:'Onayla ve kaydet'}).click();

    const history=page.getByRole('region',{name:'Aktarılan ekstreler'});
    const saved=history.getByRole('article').filter({hasText:'2026-11'});
    await saved.waitFor();
    assert.match(await saved.innerText(),/QNB[\s\S]*2026-11[\s\S]*Yedek kredi kartı/);
    for(const item of ['4 hareket','Doğrulandı','1.500,00','500,00','100,00','1.000,00','Aktarım']){
      assert.ok((await saved.innerText()).includes(item),item);
    }
    const legacy=history.getByRole('article').filter({hasText:'2026-10'});
    assert.match(await legacy.innerText(),/Eski aktarım — doğrulama bilgisi yok/);
    await legacy.getByRole('button',{name:'Detayı aç'}).click();
    await page.getByRole('heading',{name:'QNB · 2026-10'}).waitFor();
    await page.getByText('Eski aktarım — doğrulama bilgisi yok',{exact:true}).waitFor();
    await page.evaluate(()=>window.handleBack());
    assert.match(await legacy.innerText(),/20,00/);
    checks+=await checkLayout(page,'.statement-history');
    await page.setViewportSize({width:390,height:844});
    await capture(page,history,'03-aktarilan-ekstreler.png');

    await saved.getByRole('button',{name:'Detayı aç'}).click();
    await page.getByRole('heading',{name:'QNB · 2026-11'}).waitFor();
    assert.equal(await page.locator('button[data-edit]').count(),4);
    await page.evaluate(()=>window.handleBack());
    assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Detayı aç');
    await page.reload();
    await page.locator('nav [data-page=import]').click();
    assert.match(await history.getByRole('article').filter({hasText:'2026-11'}).innerText(),/Doğrulandı/);

    await page.evaluate(text=>window.onPdfText(text),statement.replace('Borcu: 1000.00','Borcu: 1001.00'));
    await preview.getByText('Mutabakat farkı var',{exact:false}).first().waitFor();
    assert.equal(await preview.getByRole('button',{name:'Onayla ve kaydet'}).isDisabled(),true);
    assert.equal(await history.getByRole('article').count(),2);
    await preview.getByRole('button',{name:'Vazgeç'}).click();
    await saved.getByRole('button',{name:'Detayı aç'}).click();
    await page.getByRole('button',{name:/SENTETIK KAHVE/}).click();
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'İşlemi sil'}).click();
    await page.getByText('Kayıtlı hareketler aktarımdan sonra değişmiş.').waitFor();
    await page.evaluate(()=>window.handleBack());
    assert.match(await saved.innerText(),/İnceleme gerekiyor/);

    const unverified=statement.replace('Onceki Donem Hesap Ozeti Borcu: 100.00\n','');
    await page.evaluate(text=>window.onPdfText(text),unverified);
    const acknowledgement=preview.locator('#acknowledge-import');
    const suggestion=preview.locator('[data-category-suggestion]').first();
    await acknowledgement.check();
    await suggestion.check();
    await history.getByRole('article').filter({hasText:'2026-10'}).getByRole('button',{name:'Detayı aç'}).click();
    await page.evaluate(()=>window.handleBack());
    assert.equal(await acknowledgement.isChecked(),true);
    assert.equal(await suggestion.isChecked(),true);
    await page.locator('#settings').click();
    await page.getByRole('button',{name:'Diğer kategorisini düzenle'}).click();
    await page.getByRole('button',{name:'Kategoriyi sil'}).click();
    await page.getByLabel('Başka kategoriye taşı').check();
    await page.getByLabel('Hedef gider kategorisi').selectOption('Ulaşım');
    await page.locator('#submit').click();
    await page.evaluate(()=>window.handleBack());
    const changedSuggestion=preview.getByLabel(/SENTETIK MARKET · Öneriyi seç: Ulaşım/i);
    await changedSuggestion.waitFor();
    assert.equal(await acknowledgement.isChecked(),true);
    assert.equal(await changedSuggestion.isChecked(),false);
    await page.evaluate(() => {
      const key='ekstre-android-v1';
      const wallet=JSON.parse(localStorage.getItem(key));
      const record=wallet.statements.find(s=>s.period==='2026-11');
      record.reconciliationStatus='mismatch';
      localStorage.setItem(key,JSON.stringify(wallet));
    });
    await page.reload();
    await page.locator('nav [data-page=import]').click();
    await saved.getByRole('button',{name:'Detayı aç'}).click();
    await page.getByText('Belgedeki ekstre toplamları uyuşmuyor.',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('Statement and expense chart journeys passed; '+checks+' responsive checks');
  } finally {
    await browser.close();
  }
}

run().catch(error=>{console.error(error);process.exitCode=1;});
