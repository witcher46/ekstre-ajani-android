const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../app/src/main/assets'),out=path.resolve(__dirname,'../test-output/wallet-v2');fs.mkdirSync(out,{recursive:true});

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

async function reconciliationJourney(browser){
  const page=await browser.newPage({viewport:{width:320,height:480}});
  const errors=[];
  page.setDefaultTimeout(3500);
  page.on('pageerror',error=>errors.push(error.message));
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
      let revision=0,rejectSave=false,approvalAttempts=0;
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
        save:write,
        loadForCompare:()=>token()+'\n'+load(),
        saveIfUnchanged(expected,raw){
          const countApprovals=value=>JSON.parse(value).balanceReconciliation?.approvals?.length??0;
          const appendsApproval=countApprovals(raw)>countApprovals(load());
          if(appendsApproval)approvalAttempts++;
          return !(rejectSave&&appendsApproval)&&expected===token()&&raw!==load()&&write(raw);
        },
      };
      window.fixture={
        snapshot:()=>JSON.parse(load()),
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
      };
    },wallet);
    await page.goto('https://wallet.test/');

    const snapshot=()=>page.evaluate(()=>window.fixture.snapshot());
    const attempts=()=>page.evaluate(()=>window.fixture.approvalAttempts());
    const button=name=>page.getByRole('button',{name,exact:true});
    const review=()=>page.getByRole('button',{name:/^Mutabakatı incele · /});
    async function openAccount(type){
      await button('Cüzdan').click();
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
    async function enterAnchor(type,ref,amount){
      const anchor=(await snapshot()).balanceReconciliation.observations.find(row=>row.accountId==='reconciliation-'+type&&row.role==='anchor');
      await review().click();
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
      assert.equal(await page.locator('nav button').count(),5);
      assert.equal(await button('Cüzdan').getAttribute('aria-current'),'page');
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
    await addRecord('Gözlem ekle','2026-10-09','148,00');
    assert.equal((await snapshot()).version,2);
    await review().click();
    assert.match(await page.locator('main').innerText(),/dayanak gerekli/i);
    assert.equal(await button('Onayı kaydet').count(),0);
    assert.equal(await attempts(),0);
    await page.evaluate(()=>window.handleBack());
    await addRecord('Dayanak ekle','2026-10-01','100,00');

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
      await button('Cüzdan').click();
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
    console.log('Bank and cash reconciliation approvals, stale evidence, CAS rejection and narrow-screen review passed');
  }finally{
    await page.close();
  }
}

(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const page=await browser.newPage({viewport:{width:360,height:840}}),errors=[];page.setDefaultTimeout(3500);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await serveAssets(page);
 await page.goto('https://wallet.test/');const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ekstre-android-v1')));
 async function account(name,type,opening){await page.locator('[data-action=addAccount]').first().click();await page.locator('[name=name]').fill(name);await page.locator('[name=type]').selectOption(type);await page.locator('[name=opening]').fill(opening);await page.locator('#submit').click();}
 await account('Sentetik banka','bank','20000');await page.locator('nav [data-page=wallet]').click();await account('Sentetik nakit','cash','0');await account('Sentetik kart','card','0');let s=await read();const bank=s.accounts[0].id,cash=s.accounts[1].id,card=s.accounts[2].id;
 await page.locator('nav [data-page=home]').click();await page.locator('[data-action=addIncome]').click();await page.locator('[name=account]').selectOption(bank);await page.locator('[name=amount]').fill('30000');await page.locator('[name=desc]').fill('Sentetik maaş');await page.locator('[name=category]').selectOption('Maaş');await page.locator('[name=date]').fill('2026-10-03');await page.locator('#submit').click();await page.locator('#period').fill('2026-10');assert((await page.locator('[data-stat=income]').innerText()).includes('30.000,00'));
 await page.locator('[data-action=addTransaction]').click();await page.locator('[name=account]').selectOption(card);await page.locator('[name=desc]').fill('SENTETIK MARKET');await page.locator('[name=amount]').fill('2000');await page.locator('[name=date]').fill('2026-10-03');await page.locator('#submit').click();assert((await page.locator('[data-stat=netExpense]').innerText()).includes('2.000,00'));
 await page.locator('nav [data-page=wallet]').click();await page.locator(`[data-card-view="${card}"]`).click();await page.locator('[data-pay-card]').click();await page.locator('[name=account]').selectOption(bank);await page.locator('[name=amount]').fill('2000');await page.locator('[name=date]').fill('2026-10-03');await page.locator('#submit').click();
 await page.locator('nav [data-page=home]').click();assert((await page.locator('[data-stat=cash]').innerText()).includes('48.000,00'));assert((await page.locator('[data-stat=cardDebt]').innerText()).includes('0,00'));assert((await page.locator('[data-stat=margin]').innerText()).includes('28.000,00'));
 const pdf='QNB\nHesap Kesim Tarihi: 05/10/2026\nOnceki Donem Hesap Ozeti Borcu: 0.00\nDonem Borcu: 0.00\n03/10/2026 SENTETIK MARKET 2000.00\n03/10/2026 ODEME TESEKKUR 2000.00';await page.evaluate(t=>window.onPdfText(t),pdf);await page.locator('#import-account').selectOption(card);await page.locator('[data-action=confirmImport]').click();s=await read();assert.equal(s.transactions.filter(t=>t.matchStatus==='pending').length,2);
 await page.locator('nav [data-page=home]').click();await page.locator('[data-page=review]').first().click();while(await page.locator('[data-link]').count())await page.locator('[data-link]').first().click();s=await read();assert.equal(s.transactions.filter(t=>t.linkedTo).length,2);const count=s.transactions.length;
 await page.evaluate(t=>window.onPdfText(t),pdf);await page.locator('#import-account').selectOption(card);await page.locator('[data-action=confirmImport]').click();assert.equal((await read()).transactions.length,count);
 await page.locator('nav [data-page=home]').click();assert((await page.locator('[data-stat=cash]').innerText()).includes('48.000,00'));assert((await page.locator('[data-stat=netExpense]').innerText()).includes('2.000,00'));
 await page.locator('nav [data-page=plan]').click();await page.locator('[data-action=incomePlan]').click();await page.locator('[name=name]').fill('Sentetik düzenli maaş');await page.locator('[name=account]').selectOption(bank);await page.locator('[name=amount]').fill('30000');await page.locator('[name=next]').fill('2026-11-03');await page.locator('#submit').click();const before=(await read()).transactions.length;await page.locator('nav [data-page=home]').click();assert((await page.locator('[data-stat=cash]').innerText()).includes('48.000,00'));assert.equal((await read()).transactions.length,before);
 await page.locator('nav [data-page=plan]').click();await page.locator('[data-income-receive]').click();await page.locator('[name=account]').selectOption(cash);await page.locator('[name=receivedOn]').fill('2026-11-05');await page.locator('#submit').click();s=await read();assert.equal(s.transactions.at(-1).kind,'income');assert.equal(s.transactions.at(-1).account,cash);assert.equal(s.transactions.at(-1).date,'2026-11-05');assert.equal(s.transactions.at(-1).incomePlanDue,'2026-11-03');assert.equal(s.incomePlans[0].next,'2026-12-03');
 const unknown='QNB\nHesap Kesim Tarihi: 05/11/2026\n04/11/2026 SENTETIK MAGAZA PEN 4.ndirim 75.25';await page.evaluate(t=>window.onPdfText(t),unknown);assert((await page.locator('main').innerText()).includes('İade'));await page.locator('#import-account').selectOption(card);const n=(await read()).transactions.length;assert(await page.locator('[data-action=confirmImport]').isDisabled());assert.equal((await read()).transactions.length,n);await page.locator('#acknowledge-import').check();await page.locator('[data-action=confirmImport]').click();assert.equal((await read()).transactions.length,n+1);
 s=await read();const importedRefund=s.transactions.at(-1);await page.locator('nav [data-page=transactions]').click();await page.locator('#period').fill('2026-11');await page.locator(`[data-edit="${importedRefund.id}"]`).click();assert(await page.locator('[name=kind]').isDisabled());assert(await page.locator('[name=account]').isDisabled());await page.locator('[name=desc]').fill('Düzeltilmiş sentetik iade');await page.locator('[name=category]').selectOption('Market / Gıda');await page.locator('[name=note]').fill('Belgeyle kontrol edildi');await page.locator('#submit').click();assert.equal(await page.locator('dialog[open]').count(),0);await page.evaluate(t=>window.onPdfText(t),unknown);await page.locator('#import-account').selectOption(card);await page.locator('#acknowledge-import').check();await page.locator('[data-action=confirmImport]').click();const kept=(await read()).transactions.find(t=>t.id===importedRefund.id);assert.equal(kept.desc,'Düzeltilmiş sentetik iade');assert.equal(kept.category,'Market / Gıda');assert.equal(kept.note,'Belgeyle kontrol edildi');assert.equal(kept.sourceDesc,importedRefund.sourceDesc);
 s=await read();const old={...s,legacyUnknown:{keep:'sentetik'}};delete old.incomePlans;delete old.incomeCategories;await page.locator('#backup-file').setInputFiles({name:'synthetic-v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ekstre-android-v1')).legacyUnknown?.keep==='sentetik');assert.deepEqual((await read()).transactions.map(t=>t.id),old.transactions.map(t=>t.id));assert.deepEqual((await read()).accounts,old.accounts);await page.reload();assert.equal((await read()).legacyUnknown.keep,'sentetik');
 // Legacy v1 linked manual payments may carry a statement period different from the date.
 s=await read();s.transactions.push({id:'legacy-manual',source:'manual',account:bank,target:card,date:'2026-10-03',period:'2026-11',desc:'Sentetik eski ödeme',amount:100,kind:'payment',category:'Kart ödemesi',note:''},{id:'legacy-pdf',source:'pdf',account:card,date:'2026-10-03',period:'2026-11',desc:'Sentetik eski ödeme',amount:100,kind:'cardPayment',category:'Kart ödemesi',note:'',linkedTo:'legacy-manual',matchStatus:'linked'});await page.evaluate(s=>localStorage.setItem('ekstre-android-v1',JSON.stringify(s)),s);await page.reload();await page.locator('nav [data-page=transactions]').click();await page.locator('#period').fill('2026-10');await page.locator('[data-edit=legacy-manual]').click();await page.locator('[name=note]').fill('Eski dönemi koruyan not');await page.locator('#submit').click();assert.equal((await read()).transactions.find(t=>t.id==='legacy-manual').period,'2026-11');assert.equal((await read()).transactions.find(t=>t.id==='legacy-manual').note,'Eski dönemi koruyan not');
 await page.locator('nav [data-page=wallet]').click();await account('Sentetik ikinci kart','card','0');s=await read();const card2=s.accounts.at(-1).id;
 const sourcePdf='QNB\nHesap Kesim Tarihi: 05/10/2026\nOnceki Donem Hesap Ozeti Borcu: 1000.00\nDonem Borcu: 400.00\n04/10/2026 ODEME TESEKKUR 600.00';await page.evaluate(t=>window.onPdfText(t),sourcePdf);await page.locator('#import-account').selectOption(card2);await page.locator('[data-action=confirmImport]').click();s=await read();const debtBefore=await page.evaluate(async id=>{const C=await import('./core.mjs');return C.cardStatus(JSON.parse(localStorage.getItem('ekstre-android-v1')),id).current;},card2);assert.equal(debtBefore,40000);
 const bankBefore=await page.evaluate(async id=>{const C=await import('./core.mjs'),s=JSON.parse(localStorage.getItem('ekstre-android-v1'));return C.balance(s,s.accounts.find(a=>a.id===id));},bank);
 await page.locator('nav [data-page=wallet]').click();await page.locator(`[data-card-view="${card2}"]`).click();await page.locator('[data-bind-payment]').click();await page.locator('[name=account]').selectOption(bank);await page.locator('[name=paidOn]').fill('2026-10-07');await page.locator('#submit').click();assert.equal(await page.locator('[data-bind-payment]').count(),0);assert.equal(await page.evaluate(async id=>{const C=await import('./core.mjs'),s=JSON.parse(localStorage.getItem('ekstre-android-v1'));return C.balance(s,s.accounts.find(a=>a.id===id));},bank),bankBefore-60000);assert((await page.locator('[data-stat=cardDebt]').innerText()).includes('400,00'));
 const attached=await read();await page.evaluate(t=>window.onPdfText(t),sourcePdf);await page.locator('#import-account').selectOption(card2);await page.locator('[data-action=confirmImport]').click();assert.equal((await read()).transactions.length,attached.transactions.length);
 const mismatch=sourcePdf.replace('400.00','500.00');await page.evaluate(t=>window.onPdfText(t),mismatch);assert(await page.locator('[data-action=confirmImport]').isDisabled());assert.equal((await read()).transactions.length,attached.transactions.length);await page.locator('[data-action=cancelImport]').click();
 assert.deepEqual(errors,[]);await page.locator('nav [data-page=home]').click();await page.locator('#period').fill('2026-10');await page.screenshot({path:path.join(out,'overview.png'),fullPage:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,checks:['salary income','card spending','card detail payment','no duplicate expense','PDF match and repeat','planned income excluded','received income actual date and account','unverified import consent','discount type','import edit and reimport preserves source category note','v1 restore identifiers balances unknown fields','reload','legacy linked period note edit','unknown payment bank attachment actual date','source attachment survives reimport','mismatch preview blocked'],errors},null,2));console.log('16 wallet v2 user flows passed');
 await reconciliationJourney(browser);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
