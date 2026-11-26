const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../app/src/main/assets');
const november='2026-11',october='2026-10';
const accounts=[
  {id:'u02-card',name:'Sentetik U02 kart',type:'card',opening:2000},
  {id:'u02-other-card',name:'Sentetik U02 ikinci kart',type:'card',opening:0},
  {id:'u02-bank',name:'Sentetik U02 banka',type:'bank',opening:100000},
  {id:'u02-cash',name:'Sentetik U02 nakit',type:'cash',opening:50000},
];

function expenses(account,period,count){
  return Array.from({length:count},(_,i)=>({
    id:account+'-'+period+'-'+i,account,period,date:period+(i%2===0?'-03':'-12'),
    kind:'expense',desc:'Sentetik hareket '+i,category:'Diğer',amount:100,
  }));
}

const cardRows=expenses('u02-card',november,250);
const otherCardRows=expenses('u02-other-card',november,151);
const bankRows=expenses('u02-bank',november,249);
const priorBankRows=expenses('u02-bank',october,170);
const cashRows=expenses('u02-cash',november,249);
const transfer={id:'u02-transfer',account:'u02-bank',target:'u02-cash',period:november,
  date:november+'-01',kind:'transfer',desc:'Sentetik transfer',category:'Transfer',amount:500};
const wallet={format:'ekstre-android',version:1,accounts,
  transactions:[...cardRows,...otherCardRows,...bankRows,...priorBankRows,...cashRows,transfer],
  statements:[],budgets:{},subscriptions:[],categories:['Diğer']};

// November 12 precedes November 3. The order within each day is the fixture order.
const orderedIds=rows=>[...rows.filter((_,i)=>i%2===1),...rows.filter((_,i)=>i%2===0)].map(row=>row.id);

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
  try{
    const page=await browser.newPage({timezoneId:'UTC',viewport:{width:360,height:840}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.setDefaultTimeout(5000);
    await page.clock.setFixedTime(new Date('2026-11-25T12:00:00Z'));
    await page.route('https://wallet.test/**',route=>{
      const name=new URL(route.request().url()).pathname.replace(/^\//,'')||'index.html';
      const file=path.join(root,name);
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
      const contentType=name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':'text/html';
      return route.fulfill({body:fs.readFileSync(file),contentType});
    });
    await page.addInitScript(state=>{
      if(!localStorage.getItem('ekstre-android-v1'))localStorage.setItem('ekstre-android-v1',JSON.stringify(state));
    },wallet);
    await page.goto('https://wallet.test/');

    const stored=()=>page.evaluate(()=>localStorage.getItem('ekstre-android-v1'));
    const original=await stored();
    const panel=name=>page.locator('section').filter({has:page.getByRole('heading',{name,exact:true})});
    const card=panel('Kart hareketleri'),month=panel('Seçilen aydaki hareketler'),all=panel('Hesap geçmişi');
    const rows=list=>list.locator('[data-edit]');
    const more=list=>list.getByRole('button',{name:'Daha fazla göster',exact:true});
    const stat=async name=>(await page.locator('[data-stat='+name+']').innerText()).match(/[\d.,]+/)?.[0];
    const open=async id=>{
      await page.locator('nav [data-page=wallet]').click();
      await page.locator('[data-card-view="'+id+'"],[data-account-view="'+id+'"]').click();
    };
    async function assertRows(list,expected){
      assert.deepEqual(await rows(list).evaluateAll(buttons=>buttons.map(button=>button.dataset.edit)),expected);
    }
    async function expand(list,nextId){
      assert.equal(await more(list).count(),1,'a capped history needs a continuation control');
      await more(list).focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator(':focus').getAttribute('data-edit'),nextId);
    }
    async function assertEdit(list,id){
      await list.locator('[data-edit="'+id+'"]').press('Enter');
      assert.equal(await page.locator('#f-desc').inputValue(),'Sentetik hareket '+id.split('-').at(-1));
      assert.equal(await page.locator('#modal [data-delete]').getAttribute('data-delete'),id);
      await page.locator('#close').click();
    }

    const cardIds=orderedIds(cardRows),otherCardIds=orderedIds(otherCardRows);
    const bankIds=[...orderedIds(bankRows),transfer.id],oldBankIds=orderedIds(priorBankRows);
    const allBankIds=[...bankIds,...oldBankIds],cashIds=[...orderedIds(cashRows),transfer.id];
    await open('u02-bank');
    await assertRows(month,bankIds.slice(0,150));
    await assertRows(all,allBankIds.slice(0,150));
    await open('u02-cash');
    await assertRows(month,cashIds.slice(0,150));
    await assertRows(all,cashIds.slice(0,150));
    await open('u02-card');
    await assertRows(card,cardIds.slice(0,150));
    console.log('U02 baseline: card, bank month/history, and cash month/history each initially show 150 rows');

    await expand(card,cardIds[150]);
    await assertRows(card,cardIds);
    assert.equal(await more(card).count(),0);
    await assertEdit(card,cardIds[150]);
    assert.equal(await stat('cardDebt'),'270,00');
    await open('u02-other-card');
    await assertRows(card,otherCardIds.slice(0,150));
    await expand(card,otherCardIds[150]);
    await assertRows(card,otherCardIds);

    await open('u02-bank');
    await expand(month,bankIds[150]);
    await assertRows(month,bankIds);
    await assertRows(all,allBankIds.slice(0,150));
    await assertEdit(month,bankIds[150]);
    assert.deepEqual(await Promise.all(['accountBalance','income','netExpense'].map(stat)),['576,00','0,00','249,00']);

    await expand(all,allBankIds[150]);
    await assertRows(all,allBankIds.slice(0,300));
    await expand(all,allBankIds[300]);
    await assertRows(all,allBankIds);
    assert.equal(await more(all).count(),0);
    await assertEdit(all,allBankIds[300]);
    await page.locator('#period').fill(october);
    await assertRows(month,oldBankIds.slice(0,150));
    await assertRows(all,allBankIds);
    await expand(month,oldBankIds[150]);
    await assertRows(month,oldBankIds);
    assert.deepEqual(await Promise.all(['accountBalance','income','netExpense'].map(stat)),['576,00','0,00','170,00']);

    await page.locator('#period').fill(november);
    await open('u02-cash');
    await assertRows(month,cashIds.slice(0,150));
    await assertRows(all,cashIds.slice(0,150));
    await expand(all,cashIds[150]);
    await assertRows(all,cashIds);
    await assertRows(month,cashIds.slice(0,150));
    await expand(month,cashIds[150]);
    await assertRows(month,cashIds);
    assert.deepEqual(await Promise.all(['accountBalance','income','netExpense'].map(stat)),['256,00','0,00','249,00']);
    assert.equal(await stored(),original,'paging and opening edit dialogs leave the wallet untouched');
    assert.deepEqual(errors,[]);
    console.log('U02 history paging passed: stable IDs, account and period isolation, keyboard focus, edit actions, and balances');
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
