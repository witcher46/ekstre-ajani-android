const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname,'../app/src/main/assets');

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || undefined});
  try {
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
    await page.route('https://wallet.test/**', route => {
      const name = new URL(route.request().url()).pathname.replace(/^\//,'') || 'index.html';
      const file = path.join(root,name);
      if (!file.startsWith(root+path.sep) || !fs.existsSync(file)) return route.abort();
      const contentType = name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html';
      return route.fulfill({body:fs.readFileSync(file),contentType});
    });
    await page.goto('https://wallet.test/');
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
    const sourceCard='<b data-import-injection>Sentetik & Kart</b>';
    const csvRow=`QNB,${sourceCard},2026-10,2026-10-04,SENTETIK CSV AYNI,5000,Diğer,harcama,sentetik-cakis`;
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
    const csvReview=page.locator('section').filter({hasText:'CSV satırı daha önceki bir kayda benziyor'});
    await csvReview.waitFor();
    assert.equal(await csvReview.getByRole('button',{name:'Aynı işlem',exact:true}).count(),0);
    await csvReview.getByRole('button',{name:'Ayrı gerçek işlem'}).click();
    assert.equal((await stored()).transactions.filter(t=>t.source==='csv'&&t.matchStatus==='distinct').length,1);
    const reviewed=await stored();
    await uploadCsv();
    assert.match(await page.locator('#toast').innerText(), /2 satır.*0 kaydedildi, 0 incelemede, 2 daha önce işlendi/);
    assert.deepEqual(await stored(),reviewed);

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
