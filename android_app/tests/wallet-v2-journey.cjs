const openRoute=require('./journey-navigation.cjs');
const {openSummaryAction,selectSummaryMonth}=openRoute;
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../app/src/main/assets'),out=path.resolve(__dirname,'../test-output/wallet-v2');fs.mkdirSync(out,{recursive:true});
const approveBackup=page=>page.getByRole('dialog',{name:'JSON yedeğini incele'}).getByRole('button',{name:'Cüzdanı değiştir'}).click();
const approveLink=page=>page.getByRole('dialog',{name:'Kaynakları aynı işleme bağla',exact:true}).getByRole('button',{name:'Kaynakları bağla',exact:true}).click();

function serveAssets(page){
  return page.route('https://wallet.test/**',route=>{
    const file=path.join(root,new URL(route.request().url()).pathname.replace(/^\/$/,'/index.html'));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
    return route.fulfill({
      body:fs.readFileSync(file),
      contentType:file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',
    });
  });
}


async function expenseAllocationAvailabilityJourney(browser){
  const page=await browser.newPage();
  page.setDefaultTimeout(3500);
  try{
    await serveAssets(page);
    await page.addInitScript(()=>{
      const accounts=[
        {id:'card',name:'Synthetic card',type:'card',opening:0},
        {id:'bank',name:'Synthetic bank',type:'bank',opening:0},
        {id:'cash',name:'Synthetic cash',type:'cash',opening:0},
      ];
      localStorage.setItem('ekstre-android-v1',JSON.stringify({format:'ekstre-android',version:1,
        accounts,transactions:[],statements:[],subscriptions:[],budgets:{},categories:['Food','Travel']}));
    });
    await page.goto('https://wallet.test/');
    const field=id=>page.locator('#f-'+id);
    const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ekstre-android-v1')));
    const dialog=page.locator('dialog[open]');
    const start=async desc=>{
      await openSummaryAction(page,'addTransaction');
      await field('account').selectOption('card');
      await field('desc').fill(desc);
      await field('amount').fill('1000');
      await page.locator('#start-expense-allocation').click();
      await field('allocation-category-1').selectOption('Food');
      await field('allocation-amount-1').fill('600');
    };
    const status=()=>page.evaluate(()=>{
      const group=document.querySelector('#expense-allocation-parts');
      const form=document.querySelector('#form');
      return {hidden:group.hidden,disabled:group.disabled,hasAllocation:new FormData(form).has('allocation-category-1'),valid:form.checkValidity()};
    });
    const suspended={hidden:true,disabled:true,hasAllocation:false,valid:true};
    const restored=async()=>{
      assert.deepEqual(await status(),{hidden:false,disabled:false,hasAllocation:true,valid:false});
      assert.equal(await field('allocation-category-1').inputValue(),'Food');
      assert.equal(await field('allocation-amount-1').inputValue(),'600');
    };
    const saveWithoutSplit=async(kind,expected={})=>{
      await page.locator('#submit').click();
      await dialog.waitFor({state:'hidden'});
      const wallet=await read();
      assert.equal(wallet.version,1);
      assert.equal(Object.hasOwn(wallet,'expenseAllocations'),false);
      const row=wallet.transactions.at(-1);
      assert.equal(row.kind,kind);
      for(const [key,value] of Object.entries(expected))assert.equal(row[key],value);
    };

    await start('Synthetic income');
    await field('kind').selectOption('income');
    assert.deepEqual(await status(),suspended);
    await saveWithoutSplit('income');

    await start('Synthetic transfer');
    await field('kind').selectOption('income');
    assert.deepEqual(await status(),suspended);
    assert.equal(await page.locator('label[for=f-category]').textContent(),'Kategori');
    await field('kind').selectOption('expense');
    await restored();
    await field('kind').selectOption('transfer');
    await field('account').selectOption('bank');
    await field('target').selectOption('cash');
    assert.deepEqual(await status(),suspended);
    await saveWithoutSplit('transfer',{account:'bank',target:'cash'});

    await start('Synthetic installment');
    await field('installment').fill('1/2');
    assert.deepEqual(await status(),suspended);
    await field('installment').clear();
    await restored();
    await field('installmentCount').fill('2');
    assert.deepEqual(await status(),suspended);
    await field('installmentCount').clear();
    await restored();
    await field('installment').fill('1/2');
    await saveWithoutSplit('expense',{installment:'1/2'});

    await start('Synthetic installment plan');
    await field('installmentCount').fill('2');
    assert.deepEqual(await status(),suspended);
    await saveWithoutSplit('expense',{installment:'2/2'});
    assert.deepEqual((await read()).transactions.slice(-2).map(row=>row.installment),['1/2','2/2']);
    console.log('Expense split availability, draft restoration and nonsplit v1 saves passed');
  }finally{
    await page.close();
  }
}

async function savingsGoalsJourney(browser){
  const page=await browser.newPage({viewport:{width:320,height:480}});
  const errors=[];
  page.setDefaultTimeout(3500);
  page.on('pageerror',error=>errors.push(error.message));
  const wallet={
    format:'ekstre-android',version:1,
    accounts:[
      {id:'bank',name:'Sentetik birikim bankası',type:'bank',opening:90000},
      {id:'other-bank',name:'Sentetik ikinci banka',type:'bank',opening:50000},
    ],
    transactions:[
      {id:'income',account:'bank',date:'2026-11-01',period:'2026-11',kind:'income',amount:10000,desc:'Sentetik gelir',category:'Diğer gelir',source:'manual'},
    ],
    statements:[],budgets:{},subscriptions:[],categories:['Diğer'],
  };
  try{
    await serveAssets(page);
    await page.addInitScript(initial=>localStorage.setItem('ekstre-android-v1',JSON.stringify(initial)),wallet);
    await page.goto('https://wallet.test/');
    await page.locator('[data-stat=cash]').waitFor();
    const totals=await page.locator('main [data-stat]').allTextContents();
    const dialog=page.getByRole('dialog');
    const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ekstre-android-v1')));
    const addGoal=async(name,account,reserved)=>{
      await page.getByRole('button',{name:'Hedef ekle',exact:true}).click();
      await dialog.getByLabel('Hedef adı').fill(name);
      await dialog.getByLabel('Banka veya nakit hesabı').selectOption(account);
      await dialog.getByLabel('Hedef tutarı (TL)').fill('2000');
      await dialog.getByLabel('Hedef tarihi').fill('2026-12-31');
      await dialog.getByLabel('Ayırdığım tutar (TL)').fill(reserved);
      await dialog.getByRole('button',{name:'Kaydet',exact:true}).click();
      await dialog.waitFor({state:'hidden'});
    };
    const assertLedger=async()=>{
      const {accounts,transactions}=await read();
      assert.deepEqual(accounts,wallet.accounts);
      assert.deepEqual(transactions,wallet.transactions);
    };

    await openRoute(page,'plan');
    await page.getByRole('button',{name:'Birikim hedefleri',exact:true}).click();
    await page.getByRole('heading',{name:'Birikim hedefleri',exact:true}).waitFor();
    await addGoal('Acil durum','bank','600');
    await addGoal('Tatil','bank','500');
    await addGoal('Diğer hedef','other-bank','500');
    const warning=page.locator('main').getByRole('alert');
    assert.equal(await warning.count(),1);
    assert.match(await warning.innerText(),/Sentetik birikim bankası hesabında fazla ayırma/);
    assert.match(await warning.innerText(),/1\.100,00/);
    assert.match(await warning.innerText(),/100,00.*aşıyor/);
    await assertLedger();

    await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const edit=page.getByRole('button',{name:'Tatil hedefini düzenle',exact:true});
    await edit.click();
    await dialog.getByLabel('Ayırdığım tutar (TL)').fill('400');
    await dialog.getByRole('button',{name:'Kaydet',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert(await edit.evaluate(button=>button===document.activeElement));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await warning.count(),0);
    assert.deepEqual((await read()).savingsGoals.map(({account,reserved})=>[account,reserved]),[
      ['bank',60000],['bank',40000],['other-bank',50000],
    ]);
    await assertLedger();
    await page.locator('nav [data-page=home]').click();
    assert.deepEqual(await page.locator('main [data-stat]').allTextContents(),totals);
    assert.deepEqual(errors,[]);
    console.log('Savings goals preserve the ledger and warn per account at 320px with enlarged text');
  }finally{
    await page.close();
  }
}

async function futureManualPaymentJourney(browser){
  const page=await browser.newPage({timezoneId:'UTC'});
  page.setDefaultTimeout(3500);
  const error=page.locator('#form-error'),date=page.locator('#f-date'),submit=page.locator('#submit');
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ekstre-android-v1')));
  const notice=/Gerçek kart ödeme tarihi gelecekte olamaz/;
  const bank={id:'fs1-bank',name:'Sentetik F-S1 banka',type:'bank',opening:100000};
  const card={id:'fs1-card',name:'Sentetik F-S1 kart',type:'card',opening:0};
  const future='2026-11-26',today='2026-11-25';
  const wallet={format:'ekstre-android',version:1,accounts:[bank,card],transactions:[],
    statements:[{id:'fs1-statement',account:card.id,period:'2026-11',cut:'2026-11-05',debt:10000,due:'2026-11-30'}],
    budgets:{},subscriptions:[],categories:['Diğer']};
  async function restore(state){
    await page.locator('#backup-file').setInputFiles({name:'synthetic-fs1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state))});
    await approveBackup(page);
    await page.waitForFunction(count=>JSON.parse(localStorage.getItem('ekstre-android-v1'))?.transactions.length===count,state.transactions.length);
  }
  async function openCard(){
    await page.locator('nav [data-page=wallet]').click();
    await page.locator('[data-card-view="'+card.id+'"]').click();
  }
  async function assertMetric(metric,value){
    const text=await page.locator('[data-stat='+metric+']').innerText();
    assert.equal(text.match(/[\d.,]+/)?.[0],value,metric);
  }
  async function assertFigures(cash,debt,paid){
    await page.locator('nav [data-page=home]').click();
    for(const [metric,value] of [['cash',cash],['cardDebt',debt],['netExpense','0,00']]){
      await assertMetric(metric,value);
    }
    await openRoute(page,'reports');
    await assertMetric('cardCashPayments',paid);
    await assertMetric('cardPayments',paid);
    await openCard();
    await assertMetric('cardStatementRemaining',debt);
  }
  try{
    await serveAssets(page);
    await page.clock.setFixedTime(new Date(today+'T12:00:00Z'));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto('https://wallet.test/');
    await restore(wallet);
    await openCard();
    await page.locator('[data-pay-card]').click();
    await page.locator('#f-account').selectOption(bank.id);
    await page.locator('#f-amount').fill('40');
    await date.fill(future);
    await submit.click();
    assert.match(await error.textContent(),notice);
    assert.deepEqual((await read()).transactions,[]);
    await date.fill(today);
    await submit.click();
    const [payment]=(await read()).transactions;
    assert.deepEqual([payment.kind,payment.date,payment.amount],['payment',today,4000]);
    await assertFigures('960,00','60,00','40,00');
    await page.locator('[data-edit="'+payment.id+'"]').click();
    await date.fill(future);
    await submit.click();
    assert.match(await error.textContent(),notice);
    assert.deepEqual((await read()).transactions,[payment]);
    await page.locator('#close').click();

    const legacy={...payment,id:'fs1-legacy',date:future};
    await page.locator('#backup-file').setInputFiles({name:'synthetic-fs1-legacy.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify({...wallet,transactions:[legacy]}))});
    await approveBackup(page);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ekstre-android-v1')).transactions[0]?.id==='fs1-legacy');
    assert.deepEqual((await read()).transactions,[legacy]);
    await assertFigures('1.000,00','100,00','0,00');
    await page.clock.setFixedTime(new Date(future+'T12:00:00Z'));
    await page.reload();
    await assertFigures('960,00','60,00','40,00');
    assert.deepEqual((await read()).transactions,[legacy]);
    console.log('F-S1 wallet journey passed: real payment entry/edit, legacy restore and realization date');
  }finally{await page.close();}
}

async function ambiguousStatementPaymentJourney(browser,{bankFirst=false}={}){
  const page=await browser.newPage({timezoneId:'UTC'});
  page.setDefaultTimeout(5000);
  const bank={id:'fb1-bank',name:'Sentetik F-B1 banka',type:'bank',opening:70000};
  const card={id:'fb1-card',name:'Sentetik F-B1 kart',type:'card',opening:0};
  const wallet={format:'ekstre-android',version:1,accounts:[bank,card],transactions:[],
    statements:[],budgets:{},subscriptions:[],categories:['Diğer']};
  const pdf=[
    'QNB', 'Hesap Kesim Tarihi: 05/10/2026', 'Onceki Donem Hesap Ozeti Borcu: 150.00',
    'Donem Borcu: 70.00', '03/10/2026 ODEME 40.00', '04/10/2026 ODEME 40.00',
  ].join('\n');
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ekstre-android-v1')));
  const openCard=async()=>{
    await page.locator('nav [data-page=wallet]').click();
    await page.locator('[data-card-view=fb1-card]').click();
  };
  const metric=async name=>(await page.locator('[data-stat='+name+']').innerText()).match(/[\d.,]+/)?.[0];
  try{
    await serveAssets(page);
    await page.clock.setFixedTime(new Date('2026-10-25T12:00:00Z'));
    page.on('dialog',dialog=>dialog.accept());
    await page.addInitScript(state=>{
      if(!localStorage.getItem('ekstre-android-v1'))localStorage.setItem('ekstre-android-v1',JSON.stringify(state));
    },wallet);
    await page.goto('https://wallet.test/');
    async function importPdf(){
      await page.evaluate(text=>window.onPdfText(text),pdf);
      await page.locator('#import-account').selectOption(card.id);
      await page.locator('[data-action=confirmImport]').click();
      return (await read()).transactions.filter(row=>row.kind==='cardPayment').map(row=>row.id);
    }
    async function recordPayment(){
      await openCard();
      await page.locator('[data-pay-card]').click();
      await page.locator('#f-account').selectOption(bank.id);
      await page.locator('#f-amount').fill('40');
      await page.locator('#f-date').fill('2026-10-06');
      await page.locator('#submit').click();
    }
    if(bankFirst)await recordPayment();
    const documentIds=await importPdf();
    assert.equal(new Set(documentIds).size,2);
    if(bankFirst)assert.deepEqual(await importPdf(),documentIds);
    else await recordPayment();
    await openCard();
    const payment=(await read()).transactions.find(row=>row.kind==='payment');
    assert.deepEqual(payment.matchCandidates,documentIds);
    assert.equal(await metric('cardStatementRemaining'),'70,00');
    assert.equal(await metric('cardPaidAfterCut'),'0,00');
    await page.getByText(/1 hareket eşleşme incelemesinde/).waitFor();

    await page.locator('.card-statement-link').click();
    assert.match(await page.locator('.statement-totals dt').getByText('Kart ödemesi',{exact:true}).locator('..').innerText(),/80,00/);
    await page.getByText('Bu ekstreyle ilişkili olası eşleşmeler inceleme kutusunda.').waitFor();
    await page.locator('nav [data-page=home]').click();
    await openRoute(page,'reports');
    assert.equal(await metric('cardPayments'),'80,00');
    assert.equal(await metric('cardCashPayments'),'40,00');
    assert.equal(await metric('cashOut'),'40,00');
    assert.equal(await metric('netExpense'),'0,00');
    await page.locator('#report-movements-toggle').click();
    const rows=page.locator('#report-movements [data-edit]');
    assert.deepEqual((await rows.evaluateAll(items=>items.map(item=>item.dataset.edit))).sort(),
      [...documentIds,payment.id].sort());
    await page.locator('#report-movements').getByText(/Banka hareketi kaydedildi; ikinci kart etkisi incelemede/).waitFor();
    await page.locator('#f-report-account').selectOption(card.id);
    assert.equal(await metric('cardPayments'),'80,00');
    await page.locator('#f-report-account').selectOption(bank.id);
    assert.equal(await metric('cardPayments'),'40,00');

    await openCard();
    await page.locator('.card-statement-link').click();
    await page.locator('[data-page=review]').click();
    const candidate=page.locator('[id="match-'+payment.id+'"]');
    assert.deepEqual(await candidate.locator('option').evaluateAll(items=>items.map(item=>item.value)),documentIds);
    await candidate.selectOption(documentIds[1]);
    await page.locator('[data-link="'+payment.id+'"]').click();
    await approveLink(page);
    const confirmed=(await read()).transactions;
    assert.equal(confirmed.find(row=>row.id===documentIds[1]).linkedTo,payment.id);
    assert.equal(confirmed.find(row=>row.id===documentIds[0]).linkedTo,undefined);
    await openCard();
    assert.equal(await metric('cardStatementRemaining'),'70,00');
    await page.locator('nav [data-page=home]').click();
    await openRoute(page,'reports');
    await page.locator('#f-report-account').selectOption('');
    assert.equal(await metric('cardPayments'),'80,00');
    assert.equal(await metric('cardCashPayments'),'40,00');
    console.log('F-B1 wallet journey passed ('+(bankFirst?'bank first':'PDF first')+'): reports and explicit match');
  }finally{await page.close();}
}

async function reconciliationJourney(browser){
  const page=await browser.newPage({viewport:{width:320,height:480}});
  const errors=[];
  page.setDefaultTimeout(3500);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  const wallet={
    format:'ekstre-android',version:1,
    accounts:[
      {id:'reconciliation-bank',name:'Mutabakat bankası',type:'bank',opening:20000},
      {id:'reconciliation-cash',name:'Mutabakat nakdi',type:'cash',opening:5000},
      {id:'reconciliation-card',name:'Mutabakat kartı',type:'card',opening:0},
    ],
    transactions:[
      {id:'bank-income',account:'reconciliation-bank',date:'2026-10-05',period:'2026-10',kind:'income',amount:5000,desc:'Sentetik banka girişi',category:'Diğer',source:'manual'},
      {id:'cash-expense',account:'reconciliation-cash',date:'2026-10-05',period:'2026-10',kind:'expense',amount:1000,desc:'Sentetik nakit çıkışı',category:'Diğer',source:'manual'},
      {id:'card-expense',account:'reconciliation-card',date:'2026-10-05',period:'2026-10',kind:'expense',amount:2100,desc:'Sentetik kart harcaması',category:'Diğer',source:'manual'},
    ],
    statements:[],budgets:{},subscriptions:[],categories:['Diğer'],
  };
  try{
    await serveAssets(page);
    // Substitute only the synchronous Android JS bridge. The browser runs the shipped
    // UI, comparison, validation and serialization modules on a real secure origin.
    await page.addInitScript(initial=>{
      const storageKey='reconciliation-test-snapshot';
      const load=()=>sessionStorage.getItem(storageKey);
      if(load()===null)sessionStorage.setItem(storageKey,JSON.stringify(initial));
      let revision=0,rejectSave=false,rejectReads=false,approvalAttempts=0;
      const writes={save:0,cas:0,restore:0};
      const token=()=>revision.toString(16).padStart(64,'0');
      function write(raw){
        if(raw!==load()){
          sessionStorage.setItem(storageKey,raw);
          revision++;
        }
        return true;
      }
      window.Android={
        load,
        save(raw){writes.save++;return write(raw);},
        snapshotSlot:slot=>slot===1?load():null,
        restoreChecked(expected,slot,source,raw){writes.restore++;return slot===1&&expected===source&&write(raw);},
        loadForCompare:()=>rejectReads?null:token()+'\n'+load(),
        saveIfUnchanged(expected,raw){
          writes.cas++;
          const countApprovals=value=>JSON.parse(value).balanceReconciliation?.approvals?.length??0;
          const appendsApproval=countApprovals(raw)>countApprovals(load());
          if(appendsApproval)approvalAttempts++;
          return !(rejectSave&&appendsApproval)&&expected===token()&&raw!==load()&&write(raw);
        },
      };
      window.fixture={
        snapshot:()=>JSON.parse(load()),
        raw:load,
        writes:()=>({...writes}),
        replace:state=>write(JSON.stringify(state)),
        approvalAttempts:()=>approvalAttempts,
        changeIncome(amount){
          const current=JSON.parse(load());
          current.transactions.find(row=>row.id==='bank-income').amount=amount;
          write(JSON.stringify(current));
        },
        changeIncomeDescription(desc){
          const current=JSON.parse(load());
          current.transactions.find(row=>row.id==='bank-income').desc=desc;
          write(JSON.stringify(current));
        },
        rejectWrites:()=>{rejectSave=true;},
        rejectReads:value=>{rejectReads=value;},
      };
    },wallet);
    await page.goto('https://wallet.test/');

    const snapshot=()=>page.evaluate(()=>window.fixture.snapshot());
    const attempts=()=>page.evaluate(()=>window.fixture.approvalAttempts());
    const writeState=()=>page.evaluate(()=>({raw:window.fixture.raw(),writes:window.fixture.writes()}));
    const button=name=>page.getByRole('button',{name,exact:true});
    const review=()=>page.getByRole('button',{name:/^Mutabakatı incele · /});
    async function openAccount(type){
      await page.locator('nav [data-page=wallet]').click();
      await page.locator(`[data-account-view="reconciliation-${type}"]`).click();
      await page.locator('#balance-reconciliation').waitFor();
    }
    async function addRecord(label,date,amount){
      await button(label).click();
      const dialog=page.getByRole('dialog',{name:label});
      await dialog.locator('#f-balance-date').fill(date);
      await dialog.locator('#f-balance-amount').fill(amount);
      const source=dialog.locator('#f-balance-source');
      if(await source.count()&&await source.evaluate(element=>element.tagName==='SELECT')){
        const choices=await source.locator('option').evaluateAll(options=>options.map(option=>option.value));
        if(choices.includes('bankDocument'))await source.selectOption('bankDocument');
      }
      await dialog.getByRole('button',{name:'Kaydet',exact:true}).click();
      await dialog.waitFor({state:'hidden'});
    }
    async function fillAnchor(type,ref,amount){
      const anchor=(await snapshot()).balanceReconciliation.observations.find(row=>row.accountId==='reconciliation-'+type&&row.role==='anchor');
      await page.locator('#balance-anchor-form').waitFor();
      assert.equal(await page.locator('#f-balance-anchor').inputValue(),'');
      assert.equal(await page.locator('#f-balance-anchor-ref').inputValue(),'');
      await page.locator('#f-balance-anchor').selectOption(anchor.id);
      assert.equal(await page.locator('#f-balance-anchor-date').inputValue(),'');
      assert.equal(await page.locator('#f-balance-anchor-amount').inputValue(),'');
      await page.locator('#f-balance-anchor-ref').fill(ref);
      await page.locator('#f-balance-anchor-date').fill('2026-10-01');
      await page.locator('#f-balance-anchor-amount').fill(amount);
      await page.locator('#balance-closing-confirmed').check();
      await button('Hareketleri karşılaştır').click();
      await page.locator('#balance-coverage-form').waitFor();
    }
    async function enterAnchor(type,ref,amount){
      await review().click();
      await fillAnchor(type,ref,amount);
    }
    async function enterCoverage(ref,rowRef,amount){
      const rowReference=page.locator('#f-balance-row-ref-1');
      const rowDate=page.locator('#f-balance-row-date-1');
      const rowAmount=page.locator('#f-balance-row-amount-1');
      assert.equal(await page.locator('#f-balance-coverage-ref').inputValue(),'');
      assert.equal(await rowReference.inputValue(),'');
      assert.equal(await rowDate.inputValue(),'');
      assert.equal(await rowAmount.inputValue(),'');
      await page.locator('#f-balance-coverage-ref').fill(ref);
      await rowReference.fill(rowRef);
      await rowDate.fill('2026-10-05');
      await rowAmount.fill(amount);
      await page.locator('#balance-coverage-confirmed').check();
      await button('Kanıtı incele').click();
    }
    async function assertBankReview(){
      await page.locator('#balance-final-form').waitFor();
      assert(await button('Onayı kaydet').isDisabled());
      const screen=await page.locator('main').innerText();
      assert.match(screen,/Fark var/);
      for(const value of ['Mutabakat bankası','100,00','148,00','150,00','-₺2,00','Banka kapanışı A','Banka hareket dökümü A','Banka satır A14']){
        assert(screen.includes(value),`Missing reviewed value: ${value}`);
      }
      assert.equal(await page.locator('nav button').count(),4);
      assert.equal(await page.locator('nav [data-page=wallet]').getAttribute('aria-current'),'page');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert(await page.locator('#balance-confirmed').evaluate(control=>[...control.labels].some(label=>label.textContent.trim())));
    }
    async function prepareBank(){
      await enterAnchor('bank','Banka kapanışı A','100,00');
      await enterCoverage('Banka hareket dökümü A','Banka satır A14','50,00');
      await assertBankReview();
    }
    const reviewRequired=page.getByRole('heading',{name:'Yeniden inceleme gerekli',exact:true});

    await openAccount('bank');
    const untouchedV1=await writeState();
    await page.locator('[data-balance-history=reconciliation-bank]').click();
    await page.locator('#balance-approval-history').waitFor();
    assert.equal(await page.locator('[data-balance-approval-entry]').count(),0);
    assert.deepEqual(await writeState(),untouchedV1);
    await page.evaluate(()=>window.handleBack());
    await addRecord('Gözlem ekle','2026-10-09','148,00');
    assert.equal((await snapshot()).version,2);
    await review().click();
    assert.match(await page.locator('main').innerText(),/dayanak gerekli/i);
    assert.equal(await button('Onayı kaydet').count(),0);
    assert.equal(await attempts(),0);
    await page.evaluate(()=>window.handleBack());
    await addRecord('Dayanak ekle','2026-10-01','100,00');
    const untouchedV2=await writeState();
    await page.locator('[data-balance-history=reconciliation-bank]').click();
    await page.locator('#balance-approval-history').waitFor();
    assert.equal(await page.locator('[data-balance-approval-entry]').count(),0);
    await page.locator('#balance-history-refresh').click();
    await page.evaluate(()=>window.handleBack());
    assert.deepEqual(await writeState(),untouchedV2);

    await enterAnchor('bank','Banka kapanışı A','100,00');
    await page.evaluate(()=>window.fixture.changeIncomeDescription('Güncellenen sentetik açıklama'));
    await enterCoverage('Banka hareket dökümü A','Banka satır A14','50,00');
    await reviewRequired.waitFor();
    assert.equal(await button('Onayı kaydet').count(),0);
    assert.equal(await attempts(),0);
    await page.evaluate(desc=>window.fixture.changeIncomeDescription(desc),wallet.transactions[0].desc);
    await page.evaluate(()=>window.handleBack());

    await enterAnchor('bank','Banka kapanışı A','100,00');
    await enterCoverage('Banka hareket dökümü A','Banka satır A14','49,99');
    assert.match(await page.locator('#balance-review-error').innerText(),/kapsam yetersiz/i);
    assert.equal(await button('Onayı kaydet').count(),0);
    assert.equal(await attempts(),0);
    await page.locator('#f-balance-row-amount-1').fill('50,00');
    await button('Kanıtı incele').click();
    await assertBankReview();
    await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.evaluate(()=>document.documentElement.style.removeProperty('font-size'));
    assert.equal((await snapshot()).version,2);
    await page.evaluate(()=>window.fixture.changeIncome(5100));
    await page.locator('#balance-confirmed').check();
    await button('Onayı kaydet').click();
    assert.equal((await snapshot()).version,2);
    assert.equal(await attempts(),0);
    await reviewRequired.waitFor();

    await page.evaluate(()=>window.fixture.changeIncome(5000));
    await page.reload();
    await openAccount('bank');
    await prepareBank();
    await page.evaluate(()=>window.fixture.rejectWrites());
    await page.locator('#balance-confirmed').check();
    await button('Onayı kaydet').click();
    assert.equal((await snapshot()).version,2);
    assert.equal(await attempts(),1);
    await reviewRequired.waitFor();
    assert.equal(await button('Onayı kaydet').count(),0);
    await button('Yeniden incele').click();
    assert.equal(await page.locator('#f-balance-anchor').inputValue(),'');
    assert.equal(await page.locator('#f-balance-anchor-ref').inputValue(),'');
    assert.equal(await attempts(),1);

    await page.reload();
    await openAccount('bank');
    await prepareBank();
    await page.locator('#balance-confirmed').check();
    // Two activations from the same rendered form may append only one approval.
    await button('Onayı kaydet').evaluate(save=>{
      save.click();
      save.click();
    });
    const bankApproved=await snapshot();
    assert.equal(await attempts(),1);
    assert.equal(bankApproved.version,3);
    assert.equal(bankApproved.balanceReconciliation.approvals.length,1);
    const [bankApproval]=bankApproved.balanceReconciliation.approvals;
    assert.equal(bankApproval.previousApprovalId,null);
    assert.equal(bankApproval.evidenceSha256,createHash('sha256').update(bankApproval.evidenceJson).digest('hex'));
    const bankEvidence=JSON.parse(bankApproval.evidenceJson);
    assert.equal(bankEvidence.differenceCents,'-200');
    assert.equal(bankEvidence.coverage.status,'source-supported');
    assert.deepEqual(bankEvidence.coverage.matches,[{id:'bank-income',sourceRowId:'Banka satır A14'}]);

    await page.reload();
    await openAccount('cash');
    await addRecord('Dayanak ekle','2026-10-01','40,00');
    await addRecord('Gözlem ekle','2026-10-09','30,00');
    await enterAnchor('cash','Nakit sayım kaydı B','40,00');
    await enterCoverage('Nakit günlüğü B','Nakit satır B3','-10,00');
    await page.locator('#balance-final-form').waitFor();
    assert(await button('Onayı kaydet').isDisabled());
    await page.locator('#balance-confirmed').check();
    await button('Onayı kaydet').click();
    await page.reload();
    const cashApproved=await snapshot();
    assert.equal(cashApproved.version,3);
    assert.equal(cashApproved.balanceReconciliation.approvals.length,2);
    assert.deepEqual(cashApproved.balanceReconciliation.approvals[0],bankApproval);
    const cashEvidence=JSON.parse(cashApproved.balanceReconciliation.approvals[1].evidenceJson);
    assert.equal(cashEvidence.accountType,'cash');
    assert.equal(cashEvidence.differenceCents,'0');
    assert.equal(cashEvidence.coverage.sourceKind,'cashJournal');
    assert.deepEqual(cashApproved.accounts,wallet.accounts);
    assert.deepEqual(cashApproved.transactions,wallet.transactions);
    await openAccount('bank');
    await page.getByRole('heading',{name:'Mutabakat bankası',exact:true}).waitFor();

    const [cashApproval]=cashApproved.balanceReconciliation.approvals.filter(approval=>approval.id!==bankApproval.id);
    const historyEntry=id=>page.locator(`[data-balance-approval-entry="${id}"]`);
    const detailButton=id=>page.locator(`[data-balance-approval="${id}"]`);
    const reapproveButton=id=>page.locator(`[data-balance-reapprove="${id}"]`);
    const historyPage=page.locator('#balance-approval-history');
    const detailPage=page.locator('#balance-approval-detail');
    const privateBankValues=['148,00','150,00','-₺2,00','Banka kapanışı A','Banka hareket dökümü A','Banka satır A14'];
    async function openHistory(type){
      await openAccount(type);
      await page.locator(`[data-balance-history="reconciliation-${type}"]`).click();
      await historyPage.waitFor();
      assert.equal(await page.locator('nav button').count(),4);
      assert.equal(await page.locator('nav [data-page=wallet]').getAttribute('aria-current'),'page');
    }
    async function openApproval(id){
      await detailButton(id).click();
      await detailPage.waitFor();
      assert.equal(await page.getByRole('heading',{name:'Onay ayrıntısı',exact:true}).count(),1);
    }
    async function assertHistoryPrivate(){
      const html=await page.locator('main').innerHTML();
      for(const value of privateBankValues)assert(!html.includes(value),`Private value exposed before reveal: ${value}`);
      assert.equal(await page.locator('#balance-history-reveal').getAttribute('aria-pressed'),'false');
    }
    async function restoreFixture(state){
      await page.locator('#backup-file').setInputFiles({
        name:`synthetic-history-v${state.version}.json`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state)),
      });
      await approveBackup(page);
      await page.waitForFunction(version=>window.fixture.snapshot().version===version,state.version);
    }
    async function assertFinancialOverview(){
      await selectSummaryMonth(page,'2026-10');
      for(const [metric,value] of [['cash','290,00'],['cardDebt','21,00'],['income','50,00'],['netExpense','31,00'],['margin','19,00']]){
        assert((await page.locator(`[data-stat="${metric}"]`).innerText()).includes(value));
      }
    }

    await assertFinancialOverview();
    const untouchedHistory=await writeState();
    await openHistory('bank');
    assert.equal(await historyPage.locator('[data-balance-approval-entry]').count(),1);
    assert.equal(await historyEntry(cashApproval.id).count(),0);
    assert.match(await historyEntry(bankApproval.id).innerText(),/Kayıtlarla güncel/);
    await assertHistoryPrivate();
    await page.screenshot({path:path.join(out,'approval-history-320-hidden.png'),fullPage:true});
    await openApproval(bankApproval.id);
    await assertHistoryPrivate();
    assert(await page.getByRole('heading',{name:'Onay ayrıntısı',level:1}).evaluate(heading=>heading===document.activeElement));
    await page.keyboard.press('Tab');
    const revealButton=page.getByRole('button',{name:'Tutar ve referansları göster'});
    assert(await revealButton.evaluate(button=>button===document.activeElement));
    await page.keyboard.press('Tab');
    const refreshButton=page.getByRole('button',{name:'Güncelliği yeniden değerlendir'});
    assert(await refreshButton.evaluate(button=>button===document.activeElement));
    for(const control of [revealButton,refreshButton]){
      const size=await control.boundingBox();
      assert(size&&size.width>=48&&size.height>=48);
    }
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#balance-history-reveal').getAttribute('aria-pressed'),'true');
    const revealed=await detailPage.innerText();
    for(const value of ['100,00',...privateBankValues,'bank-income','2026-10-05','50,00']){
      assert(revealed.includes(value),`Missing archived evidence value: ${value}`);
    }
    await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('#balance-history-refresh').scrollIntoViewIfNeeded();
    assert(await page.locator('#balance-history-refresh').isVisible());
    await page.screenshot({path:path.join(out,'approval-detail-320-revealed-200.png'),fullPage:true});
    await page.evaluate(()=>document.documentElement.style.removeProperty('font-size'));
    await page.evaluate(()=>{
      Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await assertHistoryPrivate();
    assert.deepEqual(await writeState(),untouchedHistory);
    await page.locator('#balance-history-refresh').click();
    await assertHistoryPrivate();
    await page.evaluate(()=>window.fixture.rejectReads(true));
    await page.locator('#balance-history-refresh').click();
    assert.match(await detailPage.innerText(),/Değerlendirilemiyor/);
    assert.match(await detailPage.innerText(),/güncel kayıtlar okunamadı/i);
    assert.equal(await reapproveButton(bankApproval.id).count(),0);
    await page.locator('#balance-history-reveal').click();
    assert((await detailPage.innerText()).includes('Banka satır A14'));
    assert.deepEqual(await writeState(),untouchedHistory);
    await page.evaluate(()=>window.fixture.rejectReads(false));
    await page.locator('#balance-history-refresh').click();
    assert.match(await detailPage.innerText(),/Kayıtlarla güncel/);
    await assertHistoryPrivate();

    // Returning across another account's routes must restore this approval's
    // account and archived proof, with sensitive values concealed again.
    await openHistory('cash');
    await openApproval(cashApproval.id);
    for(let step=0;step<4;step++)assert(await page.evaluate(()=>window.handleBack()));
    await detailPage.waitFor();
    assert.match(await detailPage.innerText(),/Mutabakat bankası/);
    assert(!(await detailPage.innerText()).includes('Mutabakat nakdi'));
    await assertHistoryPrivate();
    await page.locator('#balance-history-reveal').click();
    assert((await detailPage.innerText()).includes('Banka satır A14'));
    assert(!(await detailPage.innerText()).includes('Nakit satır B3'));
    assert.deepEqual(await writeState(),untouchedHistory);
    await page.locator('#balance-history-refresh').click();
    await assertHistoryPrivate();

    await page.evaluate(()=>window.handleBack());
    await historyPage.waitFor();
    assert(await detailButton(bankApproval.id).evaluate(element=>element===document.activeElement));
    await assertHistoryPrivate();
    await page.evaluate(()=>window.handleBack());
    assert(await page.locator('[data-balance-history=reconciliation-bank]').evaluate(element=>element===document.activeElement));
    await openHistory('cash');
    assert.equal(await historyPage.locator('[data-balance-approval-entry]').count(),1);
    assert.equal(await historyEntry(bankApproval.id).count(),0);
    assert.match(await historyEntry(cashApproval.id).innerText(),/Kayıtlarla güncel/);
    await assertFinancialOverview();
    assert.deepEqual(await writeState(),untouchedHistory);

    // Current-state mutations never replace the archived evidence. Even a same-total
    // substitution must be shown as stale, with the original source row still readable.
    const replacedIncome={
      ...cashApproved,
      transactions:[...cashApproved.transactions.filter(row=>row.id!=='bank-income'),
        {...wallet.transactions[0],id:'bank-income-replacement'},
      ],
    };
    await page.evaluate(state=>window.fixture.replace(state),replacedIncome);
    await page.reload();
    const untouchedReplacement=await writeState();
    await openHistory('bank');
    assert.match(await historyEntry(bankApproval.id).innerText(),/Yeniden inceleme gerekli/);
    await openApproval(bankApproval.id);
    await page.locator('#balance-history-reveal').click();
    assert.match(await detailPage.innerText(),/bank-income/);
    assert.match(await detailPage.innerText(),/Banka satır A14/);
    assert.equal(await reapproveButton(bankApproval.id).count(),1);
    assert.deepEqual(await writeState(),untouchedReplacement);

    for(const role of ['observation','anchor']){
      const absent={
        ...cashApproved,
        balanceReconciliation:{
          ...cashApproved.balanceReconciliation,
          observations:cashApproved.balanceReconciliation.observations.filter(row=>row.accountId!=='reconciliation-bank'||row.role!==role),
        },
      };
      await page.evaluate(state=>window.fixture.replace(state),absent);
      await page.reload();
      const beforeMissing=await writeState();
      await openHistory('bank');
      assert.match(await historyEntry(bankApproval.id).innerText(),/Değerlendirilemiyor/);
      await openApproval(bankApproval.id);
      assert.match(await detailPage.innerText(),role==='anchor'?/dayanak/i:/gözlem/i);
      assert.equal(await reapproveButton(bankApproval.id).count(),0);
      await page.locator('#balance-history-reveal').click();
      for(const value of ['100,00','148,00','bank-income','Banka satır A14']){
        assert((await detailPage.innerText()).includes(value));
      }
      assert.deepEqual(await writeState(),beforeMissing);
    }

    await page.evaluate(state=>window.fixture.replace(state),cashApproved);
    await page.reload();
    await page.evaluate(()=>window.fixture.changeIncome(5100));
    const beforeReapproval=await writeState();
    await openHistory('bank');
    assert.match(await historyEntry(bankApproval.id).innerText(),/Yeniden inceleme gerekli/);
    await openApproval(bankApproval.id);
    await reapproveButton(bankApproval.id).click();
    assert.equal(await page.locator('#f-balance-anchor').inputValue(),'');
    assert.equal(await page.locator('#f-balance-anchor-ref').inputValue(),'');
    assert.deepEqual(await writeState(),beforeReapproval);
    await fillAnchor('bank','Banka kapanışı C','100,00');
    await enterCoverage('Banka hareket dökümü C','Banka satır C19','51,00');
    await page.locator('#balance-final-form').waitFor();
    assert(await button('Onayı kaydet').isDisabled());
    await page.locator('#balance-confirmed').check();
    await button('Onayı kaydet').click();
    const chained=await snapshot();
    assert.equal(chained.balanceReconciliation.approvals.length,3);
    assert.deepEqual(chained.balanceReconciliation.approvals.slice(0,2),cashApproved.balanceReconciliation.approvals);
    const latestApproval=chained.balanceReconciliation.approvals.at(-1);
    assert.equal(latestApproval.previousApprovalId,bankApproval.id);
    assert.equal(JSON.parse(latestApproval.evidenceJson).differenceCents,'-300');
    await page.reload();
    const untouchedChain=await writeState();
    await openHistory('bank');
    assert.deepEqual(await historyPage.locator('[data-balance-approval-entry]').evaluateAll(entries=>entries.map(entry=>entry.dataset.balanceApprovalEntry)),[latestApproval.id,bankApproval.id]);
    assert.match(await historyEntry(latestApproval.id).innerText(),/Kayıtlarla güncel/);
    assert.match(await historyEntry(bankApproval.id).innerText(),/Yeniden inceleme gerekli/);
    assert.deepEqual(await writeState(),untouchedChain);

    await openAccount('bank');
    await enterAnchor('bank','Banka kapanışı D','100,00');
    await enterCoverage('Banka hareket dökümü D','Banka satır D4','51,00');
    await page.locator('#balance-final-form').waitFor();
    const beforeClockFailure=await writeState();
    await page.evaluate(()=>{
      const ActualDate=Date;
      window.Date=class extends ActualDate{
        constructor(...args){super(...(args.length?args:['2000-01-01T00:00:00.000Z']));}
        static now(){return new ActualDate('2000-01-01T00:00:00.000Z').getTime();}
      };
    });
    await page.locator('#balance-confirmed').check();
    await button('Onayı kaydet').click();
    await page.getByRole('heading',{name:'Cihaz saatini düzelt',exact:true}).waitFor();
    assert.match(await page.locator('main').innerText(),/cihazın tarihini ve saatini düzelt/i);
    assert((await page.locator('main').innerText()).includes(latestApproval.approvedAt));
    assert.deepEqual(await writeState(),beforeClockFailure);
    assert.equal(await button('Onayı kaydet').count(),0);
    await page.reload();

    // Each supported backup version remains in that version after history reads.
    const version2={...cashApproved,version:2,balanceReconciliation:{observations:cashApproved.balanceReconciliation.observations}};
    for(const restored of [wallet,version2,cashApproved]){
      await restoreFixture(restored);
      await page.reload();
      const beforeRead=await writeState();
      await openHistory('bank');
      assert.equal(await historyPage.locator('[data-balance-approval-entry]').count(),restored.version===3?1:0);
      if(restored.version===3)await openApproval(bankApproval.id);
      await page.locator('#balance-history-refresh').click();
      assert.deepEqual(await writeState(),beforeRead);
      assert.equal((await snapshot()).version,restored.version);
      assert.deepEqual((await snapshot()).transactions,wallet.transactions);
    }
    await page.reload();

    // Older raw snapshots can contain an unresolved PDF payment without its
    // candidate marker. Opening the review must keep startup's ledger projection.
    const legacyPayment={date:'2026-10-05',period:'2026-10',desc:'ODEME',category:'Diğer',amount:1000};
    const legacy={
      ...cashApproved,
      transactions:[...cashApproved.transactions,
        {...legacyPayment,id:'legacy-bank-payment',account:'reconciliation-bank',target:'reconciliation-card',kind:'payment',source:'manual'},
        {...legacyPayment,id:'legacy-pdf-payment',account:'reconciliation-card',kind:'cardPayment',source:'pdf'},
      ],
    };
    async function cardDebt(){
      await page.locator('nav [data-page=wallet]').click();
      await page.locator('[data-card-view=reconciliation-card]').click();
      return page.locator('[data-stat=cardDebt]').innerText();
    }
    await page.evaluate(state=>window.fixture.replace(state),legacy);
    await page.reload();
    assert.match(await cardDebt(),/11,00/);
    await openAccount('bank');
    await enterAnchor('bank','Banka kapanışı A','100,00');
    assert.match(await page.locator('#balance-coverage-form').innerText(),/bekleyen eşleşme/i);
    assert(await button('Kanıtı incele').isDisabled());
    await page.evaluate(()=>window.handleBack());
    assert.match(await cardDebt(),/11,00/);
    assert.deepEqual(await snapshot(),legacy);

    assert.deepEqual(errors,[]);
    console.log('Bank and cash approvals, read-only history, privacy, freshness, review chains, clock error, restores and 320px layouts passed');
  }finally{
    await page.close();
  }
}

(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 await savingsGoalsJourney(browser);
 await ambiguousStatementPaymentJourney(browser);
 await ambiguousStatementPaymentJourney(browser,{bankFirst:true});
 await futureManualPaymentJourney(browser);
 await expenseAllocationAvailabilityJourney(browser);
 const page=await browser.newPage({viewport:{width:360,height:840}}),errors=[];page.setDefaultTimeout(3500);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await serveAssets(page);
 await page.goto('https://wallet.test/');const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ekstre-android-v1')));
 async function account(name,type,opening){await page.locator('[data-action=addAccount]').first().click();await page.locator('[name=name]').fill(name);await page.locator('[name=type]').selectOption(type);await page.locator('[name=opening]').fill(opening);await page.locator('#submit').click();}
 await account('Sentetik banka','bank','20000');await page.locator('nav [data-page=wallet]').click();await account('Sentetik nakit','cash','0');await account('Sentetik kart','card','0');let s=await read();const bank=s.accounts[0].id,cash=s.accounts[1].id,card=s.accounts[2].id;
 await page.locator('nav [data-page=home]').click();await openSummaryAction(page,'addIncome');await page.locator('[name=account]').selectOption(bank);await page.locator('[name=amount]').fill('30000');await page.locator('[name=desc]').fill('Sentetik maaş');await page.locator('[name=category]').selectOption('Maaş');await page.locator('[name=date]').fill('2026-10-03');await page.locator('#submit').click();await selectSummaryMonth(page,'2026-10');assert((await page.locator('[data-stat=income]').innerText()).includes('30.000,00'));
 await openSummaryAction(page,'addTransaction');await page.locator('[name=account]').selectOption(card);await page.locator('[name=desc]').fill('SENTETIK MARKET');await page.locator('[name=amount]').fill('2000');await page.locator('[name=date]').fill('2026-10-03');await page.locator('#submit').click();assert((await page.locator('[data-stat=netExpense]').innerText()).includes('2.000,00'));
 await page.locator('nav [data-page=wallet]').click();await page.locator(`[data-card-view="${card}"]`).click();await page.locator('[data-pay-card]').click();await page.locator('[name=account]').selectOption(bank);await page.locator('[name=amount]').fill('2000');await page.locator('[name=date]').fill('2026-10-03');await page.locator('#submit').click();
 await page.locator('nav [data-page=home]').click();assert((await page.locator('[data-stat=cash]').innerText()).includes('48.000,00'));assert((await page.locator('[data-stat=cardDebt]').innerText()).includes('0,00'));assert((await page.locator('[data-stat=margin]').innerText()).includes('28.000,00'));
 const pdf='QNB\nHesap Kesim Tarihi: 05/10/2026\nOnceki Donem Hesap Ozeti Borcu: 0.00\nDonem Borcu: 0.00\n03/10/2026 SENTETIK MARKET 2000.00\n03/10/2026 ODEME TESEKKUR 2000.00';await page.evaluate(t=>window.onPdfText(t),pdf);await page.locator('#import-account').selectOption(card);await page.locator('[data-action=confirmImport]').click();s=await read();assert.equal(s.transactions.filter(t=>t.matchStatus==='pending').length,2);
 await page.locator('nav [data-page=home]').click();await page.locator('[data-page=review]').first().click();
 while(await page.locator('[data-link]').count()){
  await page.locator('[data-link]').first().click();
  await approveLink(page);
 }
 s=await read();assert.equal(s.transactions.filter(t=>t.linkedTo).length,2);const count=s.transactions.length;
 await page.evaluate(t=>window.onPdfText(t),pdf);await page.locator('#import-account').selectOption(card);await page.locator('[data-action=confirmImport]').click();assert.equal((await read()).transactions.length,count);
 await page.locator('nav [data-page=home]').click();assert((await page.locator('[data-stat=cash]').innerText()).includes('48.000,00'));assert((await page.locator('[data-stat=netExpense]').innerText()).includes('2.000,00'));
 await openRoute(page,'plan');await page.locator('[data-action=incomePlan]').click();await page.locator('[name=name]').fill('Sentetik düzenli maaş');await page.locator('[name=account]').selectOption(bank);await page.locator('[name=amount]').fill('30000');await page.locator('[name=next]').fill('2026-11-03');await page.locator('#submit').click();const before=(await read()).transactions.length;await page.locator('nav [data-page=home]').click();assert((await page.locator('[data-stat=cash]').innerText()).includes('48.000,00'));assert.equal((await read()).transactions.length,before);
 await openRoute(page,'plan');await page.locator('[data-income-receive]').click();await page.locator('[name=account]').selectOption(cash);await page.locator('[name=receivedOn]').fill('2026-11-05');await page.locator('#submit').click();s=await read();assert.equal(s.transactions.at(-1).kind,'income');assert.equal(s.transactions.at(-1).account,cash);assert.equal(s.transactions.at(-1).date,'2026-11-05');assert.equal(s.transactions.at(-1).incomePlanDue,'2026-11-03');assert.equal(s.incomePlans[0].next,'2026-12-03');
 const unknown='QNB\nHesap Kesim Tarihi: 05/11/2026\n04/11/2026 SENTETIK MAGAZA PEN 4.ndirim 75.25';await page.evaluate(t=>window.onPdfText(t),unknown);assert((await page.locator('main').innerText()).includes('İade'));await page.locator('#import-account').selectOption(card);const n=(await read()).transactions.length;assert(await page.locator('[data-action=confirmImport]').isDisabled());assert.equal((await read()).transactions.length,n);await page.locator('#acknowledge-import').check();await page.locator('[data-action=confirmImport]').click();assert.equal((await read()).transactions.length,n+1);
 s=await read();const importedRefund=s.transactions.at(-1);await openRoute(page,'transactions');await page.locator('#period').fill('2026-11');await page.locator(`[data-edit="${importedRefund.id}"]`).click();assert(await page.locator('[name=kind]').isDisabled());assert(await page.locator('[name=account]').isDisabled());await page.locator('[name=desc]').fill('Düzeltilmiş sentetik iade');await page.locator('[name=category]').selectOption('Market / Gıda');await page.locator('[name=note]').fill('Belgeyle kontrol edildi');await page.locator('#submit').click();assert.equal(await page.locator('dialog[open]').count(),0);await page.evaluate(t=>window.onPdfText(t),unknown);await page.locator('#import-account').selectOption(card);await page.locator('#acknowledge-import').check();await page.locator('[data-action=confirmImport]').click();const kept=(await read()).transactions.find(t=>t.id===importedRefund.id);assert.equal(kept.desc,'Düzeltilmiş sentetik iade');assert.equal(kept.category,'Market / Gıda');assert.equal(kept.note,'Belgeyle kontrol edildi');assert.equal(kept.sourceDesc,importedRefund.sourceDesc);
 s=await read();const old={...s,legacyUnknown:{keep:'sentetik'}};delete old.incomePlans;delete old.incomeCategories;await page.locator('#backup-file').setInputFiles({name:'synthetic-v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});await approveBackup(page);await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ekstre-android-v1')).legacyUnknown?.keep==='sentetik');assert.deepEqual((await read()).transactions.map(t=>t.id),old.transactions.map(t=>t.id));assert.deepEqual((await read()).accounts,old.accounts);await page.reload();assert.equal((await read()).legacyUnknown.keep,'sentetik');
 // Legacy v1 linked manual payments may carry a statement period different from the date.
 s=await read();s.transactions.push({id:'legacy-manual',source:'manual',account:bank,target:card,date:'2026-10-03',period:'2026-11',desc:'Sentetik eski ödeme',amount:100,kind:'payment',category:'Kart ödemesi',note:''},{id:'legacy-pdf',source:'pdf',account:card,date:'2026-10-03',period:'2026-11',desc:'Sentetik eski ödeme',amount:100,kind:'cardPayment',category:'Kart ödemesi',note:'',linkedTo:'legacy-manual',matchStatus:'linked'});await page.evaluate(s=>localStorage.setItem('ekstre-android-v1',JSON.stringify(s)),s);await page.reload();await openRoute(page,'transactions');await page.locator('#period').fill('2026-10');await page.locator('[data-edit=legacy-manual]').click();await page.locator('[name=note]').fill('Eski dönemi koruyan not');await page.locator('#submit').click();assert.equal((await read()).transactions.find(t=>t.id==='legacy-manual').period,'2026-11');assert.equal((await read()).transactions.find(t=>t.id==='legacy-manual').note,'Eski dönemi koruyan not');
 await page.locator('nav [data-page=wallet]').click();await account('Sentetik ikinci kart','card','0');s=await read();const card2=s.accounts.at(-1).id;
 const sourcePdf='QNB\nHesap Kesim Tarihi: 05/10/2026\nOnceki Donem Hesap Ozeti Borcu: 1000.00\nDonem Borcu: 400.00\n04/10/2026 ODEME TESEKKUR 600.00';await page.evaluate(t=>window.onPdfText(t),sourcePdf);await page.locator('#import-account').selectOption(card2);await page.locator('[data-action=confirmImport]').click();s=await read();const debtBefore=await page.evaluate(async id=>{const C=await import('./core.mjs');return C.cardStatus(JSON.parse(localStorage.getItem('ekstre-android-v1')),id).current;},card2);assert.equal(debtBefore,40000);
 const bankBefore=await page.evaluate(async id=>{const C=await import('./core.mjs'),s=JSON.parse(localStorage.getItem('ekstre-android-v1'));return C.balance(s,s.accounts.find(a=>a.id===id));},bank);
 await page.locator('nav [data-page=wallet]').click();await page.locator(`[data-card-view="${card2}"]`).click();await page.locator('[data-bind-payment]').click();await page.locator('[name=account]').selectOption(bank);await page.locator('[name=paidOn]').fill('2099-01-01');await page.locator('#submit').click();assert.match(await page.locator('#form-error').textContent(),/Gerçek kart ödeme tarihi gelecekte olamaz/);assert.deepEqual(await read(),s);await page.locator('[name=paidOn]').fill('2026-10-07');await page.locator('#submit').click();assert.equal(await page.locator('[data-bind-payment]').count(),0);assert.equal(await page.evaluate(async id=>{const C=await import('./core.mjs'),s=JSON.parse(localStorage.getItem('ekstre-android-v1'));return C.balance(s,s.accounts.find(a=>a.id===id));},bank),bankBefore-60000);assert((await page.locator('[data-stat=cardDebt]').innerText()).includes('400,00'));
 const attached=await read();await page.evaluate(t=>window.onPdfText(t),sourcePdf);await page.locator('#import-account').selectOption(card2);await page.locator('[data-action=confirmImport]').click();assert.equal((await read()).transactions.length,attached.transactions.length);
 const mismatch=sourcePdf.replace('400.00','500.00');await page.evaluate(t=>window.onPdfText(t),mismatch);assert(await page.locator('[data-action=confirmImport]').isDisabled());assert.equal((await read()).transactions.length,attached.transactions.length);await page.locator('[data-action=cancelImport]').click();
 assert.deepEqual(errors,[]);await selectSummaryMonth(page,'2026-10');await page.screenshot({path:path.join(out,'overview.png'),fullPage:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,checks:['salary income','card spending','card detail payment','no duplicate expense','PDF match and repeat','planned income excluded','received income actual date and account','unverified import consent','discount type','import edit and reimport preserves source category note','v1 restore identifiers balances unknown fields','reload','legacy linked period note edit','unknown payment bank attachment actual date','source attachment survives reimport','mismatch preview blocked'],errors},null,2));console.log('16 wallet v2 user flows passed');
 await reconciliationJourney(browser);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
