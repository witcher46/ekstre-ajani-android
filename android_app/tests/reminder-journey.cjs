const openRoute = require('./journey-navigation.cjs');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../app/src/main/assets');

(async () => {
  const C = await import('../app/src/main/assets/core.mjs');
  let wallet = {...C.empty(), accounts:[
    {id:'bank', name:'Sentetik banka', type:'bank', opening:100000},
    {id:'card', name:'Sentetik kart', type:'card', opening:0},
  ], statements:[
    {id:'card|2026-11', account:'card', period:'2026-11', cut:'2026-11-20', due:'2026-11-30', debt:null},
  ], subscriptions:[
    {id:'sub', name:'Sentetik abonelik', account:'bank', next:'2026-11-26', amount:10000, billingDay:26},
  ], incomePlans:[
    {id:'income', name:'<img src=x onerror=alert(1)>', account:'bank', next:'2026-11-28', amount:20000},
  ]};
  wallet = C.saveSavingsGoal(wallet,{id:'goal',name:'Sentetik hedef',account:'bank',
    due:'2026-12-08',target:50000,reserved:0});
  const original = C.backupText(wallet);
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || undefined});
  try {
    const page = await browser.newPage({timezoneId:'Europe/Istanbul', viewport:{width:360,height:760}});
    page.setDefaultTimeout(3000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-26T10:00:00Z'));
    await page.route('https://wallet.test/**', route => {
      const file = path.resolve(root,new URL(route.request().url()).pathname.slice(1) || 'index.html');
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.abort();
      const type = file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      return route.fulfill({body:fs.readFileSync(file),contentType:type});
    });
    await page.addInitScript(raw => {
      if (!localStorage.getItem('ekstre-android-v1')) localStorage.setItem('ekstre-android-v1',raw);
    }, original);
    const openReminders = async () => {
      await openRoute(page,'plan');
      await page.getByRole('button',{name:'Hatırlatmalar',exact:true}).click();
      const heading = page.getByRole('heading',{name:'Hatırlatmalar',exact:true});
      await heading.waitFor();
      assert.equal(await heading.evaluate(node => node === document.activeElement),true);
    };
    await page.goto('https://wallet.test/');
    await openReminders();
    await page.getByText('Android bildirimleri bu ortamda kullanılamıyor.',{exact:true}).waitFor();
    await page.getByText('Ödeme durumunu bankandan kontrol et.',{exact:false}).waitFor();
    await page.getByText('Tutar bilinmiyor',{exact:true}).waitFor();
    await page.getByText('Sentetik hedef',{exact:true}).waitFor();
    await page.getByText('<img src=x onerror=alert(1)>',{exact:true}).waitFor();
    assert.equal(await page.locator('main img').count(),0);
    const snooze = page.getByRole('button',{name:'Sentetik abonelik hatırlatmasını ertele'});
    await snooze.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog',{name:'Hatırlatmayı ertele'});
    await dialog.getByLabel('Erteleme tarihi').fill('2026-11-29');
    await dialog.getByRole('button',{name:'Ertele',exact:true}).click();
    const cancel = page.getByRole('button',{name:'Sentetik abonelik ertelemesini kaldır'});
    await cancel.waitFor();
    assert.equal(await cancel.evaluate(node => node === document.activeElement),true);
    assert.match(await page.getByRole('listitem').filter({hasText:'Sentetik abonelik'}).innerText(),/2026-11-29/);
    await page.reload();
    await openReminders();
    await cancel.click();
    await snooze.waitFor();
    const stored = await page.evaluate(() => localStorage.getItem('ekstre-android-v1'));
    assert.equal(stored,original,'snooze must not change the wallet or create a transaction');
    await openRoute(page,'plan');
    await page.getByRole('button',{name:'Ödendi',exact:true}).click();
    await page.getByRole('dialog',{name:'Abonelik ödemesi'}).getByRole('button',{name:'Ödemeyi kaydet'}).click();
    await openReminders();
    const renewed = page.getByRole('listitem').filter({hasText:'Sentetik abonelik'});
    await renewed.waitFor();
    assert.match(await renewed.innerText(),/2026-12-26/);
    assert.doesNotMatch(await renewed.innerText(),/2026-11-26/);
    await openRoute(page,'plan');
    const remove = page.getByRole('button',{name:'Aboneliği sil',exact:true});
    const confirmation = page.getByRole('dialog',{name:'Abonelik silinsin mi?'});
    await remove.click();
    await confirmation.waitFor();
    assert.equal(await page.evaluate(() => window.handleBack()),true);
    assert.equal(await remove.evaluate(node => node === document.activeElement),true);
    await remove.click();
    await confirmation.getByRole('button',{name:'Aboneliği sil',exact:true}).click();
    await openReminders();
    assert.equal(await renewed.count(),0);
    // The platform denial is simulated here. The page and snooze logic are real.
    await page.addInitScript(raw => {
      let preference = 'off', snoozes = '{}';
      window.Android = {
        snapshotSlot:slot => slot === 1 ? raw : null,
        reminderStatus:() => preference,
        reminderSnoozes:() => snoozes,
        replaceReminderSchedule:(_token,before,next) => {
          if (before !== snoozes) return false;
          snoozes = next;
          return true;
        },
        setRemindersEnabled:() => {
          preference = 'blocked';
          window.onRemindersChanged();
        },
      };
    },original);
    await page.reload();
    await openReminders();
    await page.getByRole('button',{name:'Android bildirimlerini aç',exact:true}).click();
    await page.getByText('Android bildirim izni veya bildirim kanalı kapalı.',{exact:false}).waitFor();
    await snooze.click();
    await dialog.getByRole('button',{name:'Ertele',exact:true}).click();
    await cancel.waitFor();
    assert.deepEqual(errors,[]);
    console.log('Reminder journey passed');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
