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
    await page.getByRole('button',{name:'Giyim ve aksesuar kategorisini düzenle'}).click();
    await page.getByRole('button',{name:'Kategoriyi sil'}).click();
    await page.getByLabel('Başka kategoriye taşı').check();
    await page.getByLabel('Hedef gider kategorisi').selectOption('Eğitim');
    await page.locator('#submit').click();
    assert.equal((await stored()).merchantCategoryRules.find(r=>r.merchant==='MIGROS 5432 ANKARA').category,'Eğitim');
    assert.deepEqual((await stored()).transactions,beforeCategoryRemoval.transactions);

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
