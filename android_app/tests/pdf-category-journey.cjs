const assert=require('node:assert/strict');
const openRoute=require('./journey-navigation.cjs');

const qnb=[
  'QNB', 'Hesap Kesim Tarihi: 05/11/2026', 'Onceki Donem Hesap Ozeti Borcu: 0.00',
  'Donem Borcu: 67.00',
  '01/11/2026 POS/KOMAGENE SENTETIK 10.00',
  '02/11/2026 YEMEN KAHVESI 20.00',
  '03/11/2026 SENTETIK ECZANESI 30.00',
  '03/11/2026 ORNEK ECZANESI 8.00',
  '03/11/2026 KOMAGENE MARKET 4.00',
  '04/11/2026 EFT KOMAGENE 5.00',
  '04/11/2026 ODEME KOMAGENE 10.00',
].join('\n');
const yapi=[
  'YAPI VE KREDİ', 'Hesap Özeti Tarihi: 05.12.2026', 'Önceki Hesap Özeti Borcu (TL): 0,00',
  'Hesap Özeti Borcu (TL): 40,00', 'İşlem Tarihi Açıklama Harcama (TL) Worldpuan',
  '01.12.2026 SENTETİK ECZANESİ 10,00 0,00',
  '02.12.2026 YEMEN KAHVESİ SENTETİK 20,00 0,00',
  '03.12.2026 KOMAGENE 5678 BURSA 3,00 0,00',
  '04.12.2026 SENTETİK KAFE 7,00 0,00',
].join('\n');

const legacy=[
  'QNB', 'Hesap Kesim Tarihi: 05/09/2026', 'Onceki Donem Hesap Ozeti Borcu: 0.00',
  'Donem Borcu: 38.00',
  '01/09/2026 KOMAGENE ESKI SENTETIK 11.00',
  '01/09/2026 SENTETIK ESKI ECZANESI 9.00',
  '02/09/2026 SENTETIK INCELENMIS KAFE 8.00',
  '03/09/2026 YEMEN KAHVESI ESKI 6.00',
  '04/09/2026 ECZANESI MARKET 4.00',
].join('\n');

async function checkLegacyCategories(page,readWallet,openPdf,save){
  await page.evaluate(async text=>{
    const C=await import('/core.mjs');
    const {parseStatement}=await import('/parser.mjs');
    const key='ekstre-android-v1';
    let wallet=JSON.parse(localStorage.getItem(key));
    const parsed=parseStatement(text);
    const rows=parsed.rows.map(row=>({...row,category:'Diğer'}));
    wallet=C.importStatement(wallet,{...parsed,rows},'synthetic-card');
    const byDesc=desc=>wallet.transactions.find(row=>row.desc===desc);
    const reviewed=byDesc('SENTETIK INCELENMIS KAFE');
    wallet.transactions=wallet.transactions.map(row=>row===reviewed?{...row,reviewed:true}:row);
    wallet=C.addTransaction(wallet,{
      id:'synthetic-manual-split',account:'synthetic-card',date:'2026-09-15',
      desc:'KOMAGENE BOLUNMUS',kind:'expense',category:'Diğer',amount:700,
    },{allocations:[{category:'Giyim',amount:300},{category:'Market / Gıda',amount:400}]});
    wallet=C.setTransactionCategory(wallet,byDesc('YEMEN KAHVESI ESKI').id,'Eğitim');
    localStorage.setItem(key,JSON.stringify(wallet));
  },legacy);
  const before=await readWallet();
  const candidate=before.transactions.find(row=>row.desc==='KOMAGENE ESKI SENTETIK');
  const keep=before.transactions.find(row=>row.desc==='SENTETIK ESKI ECZANESI');
  const inspect=async()=>{
    await openRoute(page,'import');
    await page.getByRole('button',{name:/Detayı aç · QNB · 2026-09/}).click();
    await page.getByRole('heading',{name:'QNB · 2026-09',exact:true}).waitFor();
  };
  await page.reload();
  await inspect();
  const advice=page.getByRole('button',{name:/^Öneriyi uygula:/});
  assert.deepEqual(await advice.evaluateAll(buttons=>buttons.map(b=>b.dataset.transactionId).sort()),[candidate.id,keep.id].sort());
  assert.deepEqual(await readWallet(),before,'opening previously imported records does not write');

  const accept=page.getByRole('button',{name:'Öneriyi uygula: '+candidate.desc,exact:true});
  await page.setViewportSize({width:320,height:720});
  await page.locator('html').evaluate(html=>html.style.fontSize='200%');
  assert.equal(await accept.evaluate(button=>{
    const bounds=button.getBoundingClientRect();
    return bounds.height>=48&&bounds.left>=0&&bounds.right<=document.documentElement.clientWidth+1;
  }),true,'review action fits narrow large text');
  await accept.focus();
  await page.keyboard.press('Enter');
  assert.equal(await accept.count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.edit),candidate.id);
  const afterAccept={...before,transactions:before.transactions.map(row=>row.id===candidate.id?
    {...row,category:'Dışarıda yeme',categoryConfirmed:true}:row)};
  assert.deepEqual(await readWallet(),afterAccept,'applying changes only the one category and marks the choice');

  const choose=page.getByRole('button',{name:'Başka kategori seç: '+keep.desc,exact:true});
  await choose.click();
  const dialog=page.getByRole('dialog',{name:'Kategori seç'});
  assert.equal(await dialog.getByLabel('Kategori').inputValue(),'Diğer');
  await page.keyboard.press('Escape');
  assert.deepEqual(await readWallet(),afterAccept,'cancel leaves the wallet intact');
  await choose.click();
  await dialog.getByRole('button',{name:'Kaydet',exact:true}).click();
  const afterKeep={...afterAccept,transactions:afterAccept.transactions.map(row=>
    row.id===keep.id?{...row,categoryConfirmed:true}:row)};
  assert.deepEqual(await readWallet(),afterKeep);
  await page.reload();
  await inspect();
  assert.equal(await advice.count(),0);
  await openPdf(legacy);
  await save();
  const replayed=await readWallet();
  const ordered=wallet=>({...wallet,transactions:[...wallet.transactions].sort((a,b)=>a.id.localeCompare(b.id))});
  assert.deepEqual(ordered(replayed),ordered(afterKeep),'replay keeps IDs, amounts, notes, allocations and explicit categories');

  const totals=await page.evaluate(async({before,after})=>{
    const C=await import('/core.mjs');
    return [before,after].map(wallet=>{
      const {net,spent,refunds}=C.summary(wallet,'2026-09');
      return [net,spent,refunds,wallet.accounts.map(account=>C.balance(wallet,account))];
    });
  },{before,after:await readWallet()});
  assert.deepEqual(totals[1],totals[0]);
  console.log('Older PDF category suggestions are opt-in and preserve replay keys, allocations and ledger totals');
}

module.exports=async function checkPdfCategories(page,initialWallet){
  const readWallet=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ekstre-android-v1')));
  const preview=page.getByRole('region',{name:'Aktarım önizlemesi'});
  const openPdf=async text=>{
    await page.evaluate(text=>window.onPdfText(text),text);
    await preview.getByText('Toplamlar doğrulandı',{exact:true}).waitFor();
  };
  const save=async()=>{
    await preview.getByRole('button',{name:'Onayla ve kaydet'}).click();
    await preview.waitFor({state:'detached'});
  };
  const visibleCategory=merchant=>preview.locator('.import-row').filter({
    has:page.getByText(merchant,{exact:true}),
  }).locator('.statement-movement-row small').innerText();

  await page.evaluate(async initialWallet=>{
    const C=await import('/core.mjs');
    const key='ekstre-android-v1';
    let wallet=initialWallet;
    wallet.transactions=[];
    wallet.statements=[];
    wallet.merchantCategoryRules=[];
    for(const [name,category] of [['YEMEN KAHVESI SENTETIK','Ulaşım'],['KOMAGENE 1234 ANKARA','Giyim'],
      ['KOMAGENE 5432 İZMİR','Eğitim'],['SENTETIK ECZANESI','Diğer']]){
      wallet=C.saveMerchantRule(wallet,name,category);
    }
    localStorage.setItem(key,JSON.stringify(wallet));
  },initialWallet);
  await page.reload();
  await openRoute(page,'import');

  await openPdf(qnb);
  for(const [merchant,category] of [
    ['POS/KOMAGENE SENTETIK','Dışarıda yeme'],['YEMEN KAHVESI','Dışarıda yeme'],['ORNEK ECZANESI','Sağlık'],
    ['KOMAGENE MARKET','Diğer'],['EFT KOMAGENE','Diğer'],['ODEME KOMAGENE','Kart ödemesi'],
  ]){
    assert.ok((await visibleCategory(merchant)).endsWith(' · '+category),merchant+' should preview '+category);
  }
  await preview.getByLabel(/SENTETIK ECZANESI · Öneriyi seç: Diğer/).check();
  await save();
  const november=(await readWallet()).transactions;
  assert.deepEqual(november.map(({category,amount})=>[category,amount]),[
    ['Dışarıda yeme',1000],['Dışarıda yeme',2000],['Diğer',3000],['Sağlık',800],
    ['Diğer',400],['Diğer',500],['Kart ödemesi',1000],
  ]);

  await openPdf(yapi);
  assert.ok((await visibleCategory('SENTETİK KAFE')).endsWith(' · Dışarıda yeme'));
  assert.ok((await visibleCategory('KOMAGENE 5678 BURSA')).endsWith(' · Diğer'));
  assert.ok((await visibleCategory('YEMEN KAHVESİ SENTETİK')).endsWith(' · Diğer'));
  const custom=preview.getByLabel(/YEMEN KAHVESİ SENTETİK · Öneriyi seç: Ulaşım/);
  assert.equal(await custom.isChecked(),false);
  await custom.check();
  assert.ok((await visibleCategory('YEMEN KAHVESİ SENTETİK')).endsWith(' · Ulaşım'));
  await preview.getByLabel(/SENTETİK ECZANESİ · Öneriyi seç: Diğer/).check();
  await save();
  const december=(await readWallet()).transactions.filter(row=>row.period==='2026-12');
  assert.deepEqual(december.map(({category,amount})=>[category,amount]),[
    ['Diğer',1000],['Ulaşım',2000],['Diğer',300],['Dışarıda yeme',700],
  ]);
  assert.equal(december[0].categoryConfirmed,true);
  assert.equal(november[2].categoryConfirmed,true);

  // Replaying an unchanged statement does not replace its existing categories, keys or rows.
  const beforeReplay=await readWallet();
  await openPdf(yapi);
  await save();
  assert.deepEqual(await readWallet(),beforeReplay);
  console.log('PDF category previews and saved QNB/Yapı Kredi records passed');
  await checkLegacyCategories(page,readWallet,openPdf,save);
};
