const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const openRoute = require('./journey-navigation.cjs');

const root = path.resolve(__dirname,'../app/src/main/assets');
const output = process.env.PLAN_SCREENSHOTS;
const focused = locator => locator.evaluate(node => node === document.activeElement);
const back = page => page.evaluate(() => window.handleBack());

async function checkGeometry(container) {
  const problems = await container.evaluate(node => {
    const controls = [...node.querySelectorAll('button,input,select')].filter(control => control.getClientRects().length);
    const undersized = controls.filter(control => {
      const {width,height} = control.getBoundingClientRect();
      return width < 48 || height < 48;
    }).map(control => control.getAttribute('aria-label') || control.textContent.trim() || control.id);
    const clipped = [...node.querySelectorAll('.money')].filter(money => {
      const box = money.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(money);
      return [...range.getClientRects()].some(text => text.left < box.left-1 || text.right > box.right+1);
    }).map(money => money.textContent);
    return {undersized,clipped,overflow:node.scrollWidth > node.clientWidth+1 || document.documentElement.scrollWidth > innerWidth+1};
  });
  assert.deepEqual(problems,{undersized:[],clipped:[],overflow:false});
}

async function checkPlan(browser,wallet,width,scale) {
  const page = await browser.newPage({viewport:{width,height:844},timezoneId:'Europe/Istanbul'});
  const main = page.getByRole('main');
  const dialog = page.getByRole('dialog');
  const heading = main.getByRole('heading',{level:1});
  const errors = [];
  const checkHeader = async () => {
    const header = page.locator('body > header');
    const geometry = await header.evaluate(node=>({
      height:node.getBoundingClientRect().height,
      small:[...node.querySelectorAll('button')].some(button=>button.offsetWidth<48||button.offsetHeight<48),
    }));
    assert(geometry.height<=96,`Plan header is ${geometry.height}px at ${width}px/${scale}%`);
    assert.equal(geometry.small,false);
  };
  const screenshot = async name => {
    if (!output) return;
    await page.evaluate(() => document.querySelector('#toast').classList.remove('visible'));
    await page.screenshot({path:path.join(output,`${name}-${width}-${scale}.png`),fullPage:!(await dialog.count())});
  };
  const openForm = async (button,title) => {
    await button.click();
    assert.equal(await focused(dialog.getByRole('heading',{name:title,exact:true})),true);
    await checkGeometry(dialog);
  };
  const goToSubpage = async name => {
    const opener = main.getByRole('button',{name,exact:true});
    await opener.click();
    assert.equal(await heading.textContent(),name);
    assert.equal(await focused(heading),true);
    await checkHeader();
    await checkGeometry(main);
    return opener;
  };
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('ekstre-android-v1')));

  try {
    page.setDefaultTimeout(4000);
    page.on('pageerror',error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-26T10:00:00Z'));
    await page.route('https://wallet.test/**',route => {
      const file = path.resolve(root,new URL(route.request().url()).pathname.slice(1) || 'index.html');
      if (!file.startsWith(root+path.sep) || !fs.existsSync(file)) return route.abort();
      const type = file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      return route.fulfill({body:fs.readFileSync(file),contentType:type});
    });
    await page.addInitScript(raw => localStorage.setItem('ekstre-android-v1',raw),wallet);
    await page.goto('https://wallet.test/');
    for(const colorScheme of ['no-preference','light','dark']){
      await page.emulateMedia({colorScheme});
      assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),'dark');
    }
    await page.evaluate(percent => { document.documentElement.style.fontSize = percent+'%'; },scale);
    await openRoute(page,'plan');
    assert.equal(await focused(heading),true);
    await checkHeader();
    await checkGeometry(main);
    await screenshot('plan');

    const month = main.getByLabel('Bütçe ve taksit ayı',{exact:true});
    const budgets = main.getByRole('region',{name:'Aylık bütçe'});
    const installments = main.getByRole('region',{name:'Taksitli hareketler'});
    const calendar = main.getByRole('region',{name:'Ekstre ödeme takvimi'});
    const novemberDue = calendar.getByText('2026-11-30 · Yaklaşıyor',{exact:true});
    const checkMonth = async (budgetCategory,installmentName) => {
      assert.deepEqual(await budgets.getByRole('heading',{level:3}).allTextContents(),[budgetCategory]);
      const rows = installments.getByRole('button');
      assert.equal(await rows.count(),1);
      assert.match(await rows.first().innerText(),installmentName);
      assert.equal(await novemberDue.isVisible(),true);
    };
    assert.equal(await month.inputValue(),'2026-11');
    await checkMonth('Toplam',/Sentetik Kasım taksiti/);
    await month.fill('2026-10');
    await checkMonth('Ulaşım',/Sentetik Ekim taksiti/);
    await month.fill('2026-11');
    await checkMonth('Toplam',/Sentetik Kasım taksiti/);

    const budget = main.getByRole('button',{name:'Bütçe ekle',exact:true});
    await openForm(budget,'Aylık bütçe');
    await dialog.getByRole('textbox',{name:'Bütçe sınırı (TL)'}).fill('geçersiz');
    await dialog.getByRole('button',{name:'Kaydet',exact:true}).click();
    assert.equal(await focused(dialog.getByRole('alert')),true);
    assert.match(await dialog.getByRole('alert').textContent(),/tutar/i);
    await checkGeometry(dialog);
    await screenshot('butce-hatasi');
    assert.equal(await back(page),true);
    assert.equal(await focused(budget),true);

    const payment = main.getByRole('button',{name:'Ödendi',exact:true});
    await openForm(payment,'Abonelik ödemesi');
    await dialog.getByLabel('Gerçek ödeme tarihi').fill('2026-11-24');
    await screenshot('gercek-odeme-tarihi');
    await dialog.getByRole('button',{name:'Ödemeyi kaydet',exact:true}).click();
    const paymentRow = (await read()).transactions.find(row => row.subscriptionId === 'subscription');
    assert.equal(paymentRow.date,'2026-11-24');
    assert.equal(paymentRow.subscriptionDue,'2026-11-26');
    assert.equal((await read()).subscriptions[0].next,'2026-12-26');
    assert.equal(await focused(payment),true);
    const removeBudget = main.getByRole('button',{name:'Bütçeyi kaldır',exact:true});
    await openForm(removeBudget,'Bütçe kaldırılsın mı?');
    await dialog.getByRole('button',{name:'Bütçeyi kaldır',exact:true}).click();
    assert.deepEqual((await read()).budgets,{'2026-10|Ulaşım':15000});
    assert.equal((await read()).transactions.find(row => row.id === paymentRow.id).amount,10000);
    await main.getByText('Bu ay için bütçe yok.',{exact:false}).waitFor();

    const income = await goToSubpage('Gelir planları');
    await screenshot('gelir-planlari');
    const category = main.getByRole('button',{name:'Kategori ekle',exact:true});
    await openForm(category,'Gelir kategorisi ekle');
    assert.equal(await back(page),true);
    assert.equal(await focused(category),true);
    const receive = main.getByRole('button',{name:'Gelir alındı',exact:true});
    await openForm(receive,'Gelir alındı');
    await dialog.getByLabel('Gerçekte alındığı tarih').fill('2026-11-25');
    await dialog.getByRole('button',{name:'Geliri kaydet',exact:true}).click();
    const incomeRow = (await read()).transactions.find(row => row.incomePlanId === 'income');
    assert.equal(incomeRow.date,'2026-11-25');
    assert.equal(incomeRow.incomePlanDue,'2026-11-28');
    const removeIncome = main.getByRole('button',{name:/gelir planını sil$/});
    await openForm(removeIncome,'Gelir planı kaldırılsın mı?');
    assert.equal(await dialog.evaluate(node=>{
      const note=node.querySelector('.plan-dialog-note').getBoundingClientRect();
      const submit=node.querySelector('#submit').getBoundingClientRect();
      return submit.top>=note.bottom;
    }),true,'The removal button must follow the consequence text without covering it');
    await screenshot('gelir-plani-kaldirma');
    await dialog.getByRole('button',{name:'Planı kaldır',exact:true}).click();
    assert.equal((await read()).incomePlans.length,0);
    assert.equal((await read()).transactions.find(row => row.id === incomeRow.id).amount,20000);
    assert.equal(await back(page),true);
    assert.equal(await focused(income),true);

    const goals = await goToSubpage('Birikim hedefleri');
    await screenshot('birikim-hedefleri');
    const editGoal = main.getByRole('button',{name:/hedefini düzenle$/});
    await openForm(editGoal,'Birikim hedefini düzenle');
    await screenshot('birikim-hedefi-formu');
    await dialog.getByRole('button',{name:'Hedefi sil',exact:true}).click();
    await checkGeometry(dialog);
    assert.equal(await focused(dialog.getByRole('heading',{name:'Birikim hedefi silinsin mi?'})),true);
    assert.equal(await back(page),true);
    assert.equal(await focused(editGoal),true);
    assert.equal((await read()).savingsGoals.length,1);
    assert.equal(await back(page),true);
    assert.equal(await focused(goals),true);

    const reminders = await goToSubpage('Hatırlatmalar');
    await screenshot('hatirlatmalar');
    const snooze = main.getByRole('button',{name:/aboneliği hatırlatmasını ertele$/});
    await openForm(snooze,'Hatırlatmayı ertele');
    await screenshot('hatirlatma-erteleme');
    assert.equal(await back(page),true);
    assert.equal(await focused(snooze),true);
    assert.equal(await back(page),true);
    assert.equal(await focused(reminders),true);
    assert.deepEqual(errors,[]);
  } finally {
    await page.close();
  }
}

(async () => {
  const C = await import('../app/src/main/assets/core.mjs');
  const wallet = C.backupText(C.saveSavingsGoal({...C.empty(),
    accounts:[{id:'bank',name:'Sentetik banka',type:'bank',opening:500000},
      {id:'card',name:'Sentetik kredi kartı',type:'card',opening:0}],
    budgets:{'2026-10|Ulaşım':15000,'2026-11|Toplam':999999999999},
    transactions:[
      {id:'oct-installment',kind:'expense',account:'card',date:'2026-10-05',period:'2026-10',
        desc:'Sentetik Ekim taksiti',category:'Ulaşım',amount:12500,installment:'1/2'},
      {id:'nov-installment',kind:'expense',account:'card',date:'2026-11-05',period:'2026-11',
        desc:'Sentetik Kasım taksiti',category:'Ulaşım',amount:13000,installment:'2/2'},
    ],
    subscriptions:[{id:'subscription',name:'Uzun adlı sentetik internet aboneliği',account:'bank',next:'2026-11-26',amount:10000}],
    incomePlans:[{id:'income',name:'Sentetik düzenli gelir ' + 'uzun açıklama '.repeat(11),account:'bank',next:'2026-11-28',amount:20000}],
    statements:[{id:'card|2026-11',account:'card',period:'2026-11',cut:'2026-11-20',due:'2026-11-30',debt:null}],
  },{id:'goal',name:'Uzun adlı sentetik birikim hedefi',account:'bank',due:'2027-01-10',target:999999999999,reserved:50000}));
  if (output) fs.mkdirSync(output,{recursive:true});
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || undefined});
  try {
    await checkPlan(browser,wallet,390,100);
    await checkPlan(browser,wallet,320,200);
    console.log('Plan journey passed at 390px/100% and 320px/200%');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
