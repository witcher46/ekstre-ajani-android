import * as C from './core.mjs';
import * as W from './wallet.mjs';
import * as V from './views.mjs';
import {parseStatement} from './parser.mjs';
import {parseStatementCsv} from './csv.mjs';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const plainMoney=C.formatMoney;
const fmt=n=>`<span class="money">${plainMoney(n)}</span>`,key='ekstre-android-v1';
const kinds={expense:'Harcama',income:'Gelir',refund:'İade',cardPayment:'Ekstre kart ödemesi',payment:'Hesaptan kart ödemesi',transfer:'Transfer'};
const history=[];
let importDraft;
let actionTrigger=null,modalOpener=null,csvOpener=null;
let state=W.normalizeWallet(C.empty()),detailId=null,expenseCategory=null,page='home',period=C.today().slice(0,7),periodMode='calendar',query='',kindFilter='',accountFilter='',listLimit=150,pending=null,onSubmit=null,toastTimer,loadFailed=false;
function notice(message,{error=false}={}){
 const live=$(error?'error-announcement':'status-announcement');
 live.textContent=message;
 $('toast').textContent=message;
 $('toast').classList.add('visible');
 clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),7000);
}
const errorNotice=message=>notice(message,{error:true});
try{const raw=window.Android?Android.load():localStorage.getItem(key);if(raw)state=W.normalizeWallet(C.reviewLegacy(C.validate(JSON.parse(raw))));}catch(e){loadFailed=true;errorNotice('Kayıtlar okunamadı. Mevcut verilerin üzerine yazılmayacak. '+e.message);}
function commit(next,{restore=false}={}){if(loadFailed)throw Error('Kayıtlar okunamadığı için yazma kapalı. Önce geçerli bir yedek yükle.');next=W.normalizeWallet(next);const raw=C.backupText(next);if(window.Android){if(!(restore&&Android.restore?Android.restore(raw):Android.save(raw)))throw Error('Kayıt kaydedilemedi; değişiklik uygulanmadı.');}else {if(restore)localStorage.setItem(key+'-recovery',localStorage.getItem(key)||'');localStorage.setItem(key,raw);}state=next;render();}
const copy=()=>structuredClone(state),accountName=id=>state.accounts.find(a=>a.id===id)?.name||'Hesap';
const options=(items,selected)=>items.map(([value,label])=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`).join('');
const accountOptions=(filter=()=>true,selected)=>options(state.accounts.filter(filter).map(a=>[a.id,a.name]),selected);
const field=(name,label,value='',type='text',extra='')=>`<label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
const select=(name,label,opts)=>`<label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${opts}</select>`;
const categoryOptions=(kind,selected)=>options([...new Set([...(kind==='income'?state.incomeCategories:state.categories),...(selected?[selected]:[])])].map(c=>[c,c]),selected);
const cats=selected=>categoryOptions('expense',selected);
function focusMain(){
 $('main').querySelector('h1')?.focus({preventScroll:true});
}
function focusTarget(element){
 if(!element||element===document.body)return null;
 if(element.id)return {element,selector:'#'+CSS.escape(element.id)};
 const key=Object.keys(element.dataset||{})[0];
 if(!key)return {element};
 const attr=key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
 const scope=element.closest('nav')?'#nav':'#main';
 const selector=`${scope} [data-${attr}="${CSS.escape(element.dataset[key])}"]`;
 return {element,selector,index:[...document.querySelectorAll(selector)].indexOf(element)};
}
function restoreFocus(target){
 const current=target?.element?.isConnected?target.element:
  target?.selector?document.querySelectorAll(target.selector)[Math.max(0,target.index??0)]:null;
 if(current)current.focus();
 else focusMain();
}
function modal(title,html,save,label='Kaydet',opener=focusTarget(actionTrigger||document.activeElement)){
 modalOpener=opener;
 $('dialog-title').textContent=title;
 $('fields').innerHTML=html;
 $('form-error').textContent='';
 $('submit').textContent=label;
 onSubmit=save;
 $('modal').showModal();
 $('dialog-title').focus();
}
function closeModal(){
 const dialog=$('modal');
 if(!dialog.open)return;
 const opener=modalOpener;
 modalOpener=null;
 dialog.close();
 restoreFocus(opener);
}
$('modal').addEventListener('cancel',event=>{event.preventDefault();closeModal();});
$('close').onclick=closeModal;
$('form').onsubmit=e=>{
 e.preventDefault();
 try{onSubmit(new FormData(e.target));closeModal();}
 catch(error){$('form-error').textContent=error.message;$('form-error').focus();}
};
window.handleBack=()=>{
 if($('modal').open){closeModal();return true;}
 const previous=history.pop();
 if(!previous)return false;
 ({page,detailId,query,expenseCategory}=previous);
 render();window.scrollTo(0,previous.scroll);restoreFocus(previous.opener);
 return true;
};
window.nativeError=errorNotice;window.nativeNotice=message=>notice(message);
window.onPdfText=text=>{try{pending=parseStatement(text);importDraft={account:'',acknowledged:false,suggestions:new Map()};go('import');notice('PDF okundu. Kartı seçip önizlemeyi onayla.');}catch(e){errorNotice(e.message);}};
function go(next,id=null,category=null){
 if(next!==page||id!==detailId||category!==expenseCategory){
  history.push({page,detailId,query,expenseCategory,scroll:window.scrollY,opener:focusTarget(actionTrigger||document.activeElement)});
 }
 page=next;detailId=id;expenseCategory=category;query='';
 render();window.scrollTo(0,0);focusMain();
}
const empty=message=>`<div class="empty"><b>Buradan başlayalım</b><p>${message}</p></div>`;
function transactionList(rows){return rows.length?rows.slice(0,listLimit).map(t=>`<button class="row transaction" type="button" data-edit="${esc(t.id)}"><span class="left"><strong>${esc(t.desc)}</strong><small>${esc(t.date)} · ${esc(accountName(t.account))}<br>${esc(t.category)} · ${esc(kinds[t.kind])}${t.installment?' · '+esc(t.installment):''}${t.matchStatus==='pending'?(t.kind==='payment'?'<br>Banka hareketi kaydedildi; ikinci kart etkisi incelemede':'<br>Olası eşleşme · henüz toplama eklenmedi'):t.linkedTo?'<br>Aynı işleme bağlı · ikinci kez sayılmıyor':''}</small></span><span class="amount">${fmt(t.amount)}${t.reviewed?'<small>İncelendi</small>':''}</span></button>`).join(''):empty('Henüz işlem yok. Hesap ekleyebilir veya bir ekstre aktarabilirsin.');}
function importCategoryOption(merchant,current,index,selectedCategory){
 const category=C.suggestCategory(state,merchant);
 return category&&category!==current?`<label><input type="checkbox" data-category-suggestion="${index}" value="${esc(category)}" ${category===selectedCategory?'checked':''}> ${esc(merchant)} · Öneriyi seç: ${esc(category)}</label>`:'';
}
function render(){
 const sections=[['home','⌂','Özet'],['wallet','▣','Cüzdan'],['transactions','⇅','İşlem'],['plan','◷','Plan'],['import','↓','Ekstre']];
 const activePage={account:'wallet',incomePlans:'plan',statement:'import'}[page]||page;
 $('nav').innerHTML=sections.map(([id,icon,label])=>`<button data-page="${id}" class="${activePage===id?'active':''}" ${activePage===id?'aria-current="page"':''}><span aria-hidden="true">${icon}</span>${label}</button>`).join('');
 const filteredExpenses=page==='transactions'&&expenseCategory!==null;
 const mode=!filteredExpenses&&['transactions','reports'].includes(page)?periodMode:'calendar';
 const s=C.summary(state,period,mode),rows=C.rowsForPeriod(state,period,mode),periodControl=`<input class="period" id="period" aria-label="Takvim ayı / ekstre dönemi" type="month" value="${period}">`;
 const modeControl=select('view-mode','Rapor kapsamı',options([['calendar','Takvim ayı · işlem tarihine göre'],['statement','Ekstre dönemi · yalnız kartlar']],periodMode));
 let html='';
 const ctx={state,period,periodMode,fmt,esc,transactionList,periodControl,dateStatus,importCategoryOption,listLimit,importDraft};
 if(page==='home'){html=V.homeView(ctx);
 }else if(page==='wallet'){html=V.walletView(ctx);
 }else if(page==='account'){html=V.accountView(ctx,detailId);
 }else if(page==='incomePlans'){html=V.incomePlansView(ctx);
 }else if(page==='transactions'){
 const list=rows.filter(t=>(filteredExpenses?t.kind==='expense'&&t.amount>0&&t.category===expenseCategory:(!kindFilter||t.kind===kindFilter)&&(!accountFilter||t.account===accountFilter||t.target===accountFilter))&&`${t.desc} ${t.category} ${t.note||''}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))).sort((a,b)=>b.date.localeCompare(a.date));
 html=`<h1>İşlemler</h1><p class="lead">Bir işleme dokunarak düzenle veya incele.</p>${filteredExpenses?`<div class="toolbar"><strong>Gider kategorisi · ${esc(expenseCategory||'Kategorisiz')}</strong><button data-action="clearExpenseCategory">Filtreyi temizle</button></div>`:modeControl}<div class="toolbar">${periodControl}<button class="primary" data-action="addTransaction">+ İşlem</button></div>${filteredExpenses?'':select('kind-filter','İşlem türü',options([['','Tüm türler'],...Object.entries(kinds)],kindFilter))+select('account-filter','Hesap / kart',options([['','Tüm hesaplar'],...state.accounts.map(a=>[a.id,a.name])],accountFilter))}<input id="search" class="search" type="search" placeholder="Açıklama, kategori veya not ara" value="${esc(query)}"><small>${list.length} işlem · ${Math.min(listLimit,list.length)} gösteriliyor</small><div class="panel">${transactionList(list)}</div>${list.length>listLimit?'<button data-action="more">Daha fazla göster</button>':''}`;
 }else if(page==='plan'){
 const budgets=Object.entries(state.budgets).filter(([k])=>k.startsWith(period+'|'));
 html=`<h1>Planlama</h1><p class="lead">Bütçeni ve yaklaşan ödemelerini takip et.</p>${V.incomePlansView(ctx)}<div class="toolbar">${periodControl}<button data-action="budget">+ Bütçe</button></div><div class="panel"><h2>Aylık bütçe</h2>${budgets.map(([k,v])=>{const cat=k.slice(8),used=cat==='Toplam'?s.net:s.categories.find(([c])=>c===cat)?.[1]||0;return `<div class="row"><div><strong>${esc(cat)}</strong><small>${fmt(used)} / ${fmt(v)}</small>${used>v?'<small class="danger">Bütçe aşıldı</small>':''}</div><button data-budget="${esc(k)}" aria-label="Bütçeyi kaldır">×</button></div><progress class="bar" aria-label="${esc(cat)} bütçe kullanımı" aria-valuetext="${esc(`${plainMoney(used)} / ${plainMoney(v)}${used>v?' · Bütçe aşıldı':''}`)}" max="${Math.max(v,1)}" value="${C.positiveCents(used)}"></progress>`;}).join('')||'<p>Bu dönem için bütçe ekle.</p>'}</div><div class="panel"><div class="row"><h2>Abonelikler</h2><button data-action="subscription">+ Ekle</button></div>${state.subscriptions.map(r=>`<div class="row"><div><strong>${esc(r.name)}</strong><small>${dateStatus(r.next)} · ${fmt(r.amount)}<br>${esc(accountName(r.account))}</small></div><div><button data-pay="${esc(r.id)}" data-due="${esc(r.next)}">Ödendi</button><button data-subdelete="${esc(r.id)}" aria-label="Aboneliği sil">×</button></div></div>`).join('')||'<p>Aylık ödemelerini planla. Ödendi düğmesi gerçek ödeme tarihini sorar; bir vade bir kez kaydedilir.</p>'}</div><div class="panel"><h2>Ekstre ödeme takvimi</h2>${C.upcomingPayments(state).filter(st=>st.type==='statement').map(st=>`<div class="row"><div><strong>${esc(st.name)}</strong><small>${dateStatus(st.date)} · kaydedilen ödemelere göre kalan tahmin</small></div><strong>${st.amount===null?'Okunamadı':fmt(st.amount)}</strong></div>`).join('')||'<p>Son ödeme tarihi bulunan bir ekstre aktar.</p>'}<p class="notice">Ödeme takvimi bankadaki ödeme durumunu doğrulamaz.</p></div><div class="panel"><h2>Taksitli hareketler</h2>${transactionList(rows.filter(t=>t.installment))}<p class="notice">Taksit ayrıntıları ve kalan taksit tahmini kartın ayrıntısında gösterilir. Tahmin gelecekteki harcamaları bugünün giderine eklemez.</p></div>`;
 }else if(page==='reports'){html=V.reportsView(ctx);
 }else if(page==='import'){html=V.importView(ctx,pending);
 }else if(page==='statement'){html=V.statementView(ctx,detailId);
 }else if(page==='review'){
 html=reviewPage();
 }else{
 html=`<h1>Ayarlar</h1><p class="lead">Android cüzdan denemesi · 0.3.0</p><button data-page="review">İnceleme ve kaynak bağlantıları</button><div class="panel"><h2>Veriler ve yedek</h2><p>Kayıtların bu cihazda saklanır. Uygulamayı kaldırmadan veya yeni bir deneme APK’sı kurmadan önce yedek al.</p><div class="actions"><button data-action="backup">Yedek dışa aktar</button><button data-action="restore">Yedek yükle</button></div><p class="notice">Bu sürüm Android JSON yedeklerini açar. Masaüstü .db yedeği doğrudan aktarılamaz; kart hareketleri için CSV aktarımını kullan.</p></div><button data-action="recover">Geri yükleme öncesi cüzdanı kurtar</button>${expenseCategoriesPanel()}${merchantRulesPanel()}<div class="panel"><h2>Gelir kategorileri</h2><p>${state.incomeCategories.map(esc).join(' · ')}</p><button data-action="incomeCategory">+ Gelir kategorisi</button></div><div class="panel"><h2>İlk deneme</h2><p>Örnek cüzdan yalnızca boş uygulamada açılır. Gerçek belgelerini yüklemeden önce temel işlevleri deneyebilirsin.</p><button data-action="demo">Örnek cüzdan oluştur</button></div><div class="panel"><h2>Bu sürümün kapsamı</h2><p>Hesaplar, işlemler, PDF/CSV aktarımı, kategori düzenleme, bütçe, aylık abonelik, rapor ve yedekleme. Çoklu profil, AI yorumu, otomatik eşleştirme, işlem bölme, gelişmiş kurallar ve arka plan hatırlatmaları henüz yoktur.</p></div>`;
 }
 $('main').innerHTML=html;
 $('main').querySelector('h1')?.setAttribute('tabindex','-1');
 for(const [id,key] of [['view-mode','mode'],['kind-filter','kind'],['account-filter','account']])$('f-'+id)?.addEventListener('change',e=>{if(key==='mode')periodMode=e.target.value;else if(key==='kind')kindFilter=e.target.value;else accountFilter=e.target.value;render();$('f-'+id)?.focus({preventScroll:true});});
 requestAnimationFrame(fitLayout);
 $('period')?.addEventListener('change',e=>{if(e.target.value){period=e.target.value;render();$('period')?.focus({preventScroll:true});}});
 $('search')?.addEventListener('input',e=>{const pos=e.target.selectionStart;query=e.target.value;render();$('search').focus();$('search').setSelectionRange(pos,pos);});
}
function accountForm(existing,{fromImport=false}={}){modal(existing?'Hesabı düzenle':fromImport?'Kredi kartı ekle':'Hesap / kart ekle',field('name','Hesap adı',existing?.name||'','text','required maxlength="80"')+select('type','Hesap türü',options(fromImport?[['card','Kredi kartı']]:[['bank','Banka'],['cash','Nakit'],['card','Kredi kartı']],fromImport?'card':existing?.type||'bank'))+field('opening','Başlangıç bakiyesi / kart borcu (TL)',(existing?.opening||0)/100,'text','inputmode="decimal" required')+'<p class="notice">Ekstre aktaracaksan başlangıç borcuna aynı işlemleri ikinci kez ekleme.</p>',f=>{const next=copy(),a={id:existing?.id||C.id(),name:f.get('name').trim(),type:f.get('type'),opening:C.money(f.get('opening'))};if(existing){if(existing.type!==a.type&&state.transactions.some(t=>t.account===a.id||t.target===a.id))throw Error('Hareketi olan hesabın türü değiştirilemez.');Object.assign(next.accounts.find(x=>x.id===a.id),a);}else next.accounts.push(a);
 commit(next);
 if(fromImport&&$('import-account')){
  $('import-account').value=a.id;
  rememberImportAccount($('import-account'));
 }
 });}
function merchantRulesPanel(){
 const rules=state.merchantCategoryRules||[];
 return `<section class="panel"><h2>Satıcı kategori kuralları</h2>${rules.map(rule=>`<div class="row"><span class="left"><strong>${esc(rule.merchant)}</strong><small>${esc(rule.category)}</small></span><button data-merchant-rule="${esc(rule.id)}">Kuralı düzenle</button></div>`).join('')||'<p>Henüz kaydedilmiş satıcı kuralı yok.</p>'}<button data-action="merchantRule">+ Satıcı kuralı</button></section>`;
}
function expenseCategoriesPanel(){
 const rows=state.categories.map(name=>`<div class="row expense-category-setting"><span class="left">${esc(name)}</span><button type="button" data-expense-category-edit="${esc(name)}" aria-label="${esc(name+' kategorisini düzenle')}">Düzenle</button></div>`).join('');
 return `<section class="panel"><h2>Gider kategorileri</h2>${rows}<button data-action="category">+ Kategori ekle</button></section>`;
}
function expenseCategoryForm(category){
 const linked=state.merchantCategoryRules?.filter(rule=>rule.category===category).length??0;
 modal('Gider kategorisini düzenle',
  field('name','Kategori adı',category,'text','required maxlength="200"')+
  (linked?`<p>Bu kategoriye bağlı ${linked} satıcı kuralı yeni adı kullanır.</p>`:'')+
  `<button type="button" class="danger" data-expense-category-remove="${esc(category)}">Kategoriyi sil</button>`,
  f=>commit(C.renameExpenseCategory(state,category,f.get('name'))));
}
function confirmExpenseCategoryRemoval(category){
 const linked=state.merchantCategoryRules?.filter(rule=>rule.category===category).length??0;
 const targets=state.categories.filter(name=>name!==category);
 if(!targets.length)throw Error('En az bir gider kategorisi kalmalı.');
 const rules=linked?`<fieldset class="category-rule-choices"><legend>Bu kategoriye bağlı ${linked} satıcı kuralı var</legend>
  <label><input type="radio" name="rule-choice" value="move" required> Başka kategoriye taşı</label>
  ${select('destination','Hedef gider kategorisi',options([['','Kategori seç'],...targets.map(name=>[name,name])],''))}
  <label><input type="radio" name="rule-choice" value="remove" required> İlgili kuralları kaldır</label>
 </fieldset>`:'';
 modal('Kategoriyi sil',`<p><strong>${esc(category)}</strong> gider kategorisi listeden kaldırılacak. Mevcut işlem, bütçe ve abonelik etiketleri korunacak.</p>${rules}<button type="button" data-action="cancelCategoryRemoval">İptal</button>`,f=>{
  const ruleChoice=f.get('rule-choice');
  commit(C.removeExpenseCategory(state,category,{
   moveRulesTo:ruleChoice==='move'?f.get('destination'):undefined,
   removeRules:ruleChoice==='remove',
  }));
 },'Kategoriyi sil',modalOpener);
}
function confirmTransactionRemoval(id){
 const rows=C.transactionRemovalRows(state,id);
 if(!rows.length)return;
 const message=rows[0].installmentPlan
  ?`Bu kayda bağlı taksit planının tamamı silinecek. ${rows.length} taksit, toplam ${plainMoney(rows.reduce((sum,row)=>C.addCents(sum,row.amount),0))}. Planı silmek istiyor musun?`
  :'İşlemi silmek istiyor musun?';
 if(confirm(message)){commit(C.removeTransaction(state,id));closeModal();}
}
function merchantRuleForm(rule){
 modal(rule?'Satıcı kuralını düzenle':'Satıcı kuralı ekle',
  field('merchant','Satıcı adı',rule?.merchant??'','text','required maxlength="500"')+
  select('category','Önerilecek kategori',cats(rule?.category))+
  (rule?`<button type="button" class="danger" data-remove-rule="${esc(rule.id)}">Kuralı sil</button>`:''),
  f=>commit(C.saveMerchantRule(state,f.get('merchant'),f.get('category'),rule?.id)));
}
function transactionForm(existing,preset='expense'){
 if(!state.accounts.length){notice('Önce hesap veya kart ekle.');accountForm();return;}
 if(existing?.linkedTo){const canonical=state.transactions.find(t=>t.id===existing.linkedTo);if(canonical)return transactionForm(canonical);}
 const locked=!!(existing?.statement||existing?.csvKey||existing?.installmentPlan),isEdit=!!existing;
 const merchant=desc=>existing?.merchantName??existing?.sourceDesc??desc;
 modal(isEdit?'İşlem ayrıntısı':preset==='income'?'Gelir ekle':preset==='transfer'?'Transfer yap':'Gider ekle',select('kind','İşlem türü',options(Object.entries(kinds).filter(([k])=>k!=='cardPayment'||existing?.kind===k),existing?.kind||preset))+select('account','Hesap',accountOptions(()=>true,existing?.account||(page==='account'?detailId:undefined)))+`<div id="target-fields"></div>`+field('desc','Açıklama',existing?.desc||'','text','required maxlength="500"')+field('amount','Tutar (TL)',existing?existing.amount/100:'','text','inputmode="decimal" required')+field('date','Gerçek işlem tarihi',existing?.date||C.today(),'date','required')+(existing?.installmentPlan?'<p class="notice">Taksit planına bağlı. Açıklama, kategori ve not düzenlenebilir.</p>':locked?`<p class="notice">Kaynak: ${esc(C.sourceOf(existing))} · Ekstre dönemi: ${esc(existing.period)}<br>Orijinal açıklama: ${esc(existing.sourceDesc??existing.desc)}</p>`:'')+select('category','Kategori',categoryOptions(existing?.kind||preset,existing?.category))+`<div id="category-suggestion"><p id="category-advice" role="status"></p><button id="choose-category" type="button" hidden>Önerilen kategoriyi seç</button><label><input name="remember-category" type="checkbox"> Bu satıcı için kategori önerisini hatırla</label></div><div id="installment-fields"></div>`+field('note','Not',existing?.note||'','text','maxlength="2000"')+`<label><input name="reviewed" type="checkbox" ${existing?.reviewed?'checked':''}> İncelendi</label>`+(existing?`<button type="button" class="danger" data-delete="${esc(existing.id)}">${existing.installmentPlan?'Taksit planını sil':'İşlemi sil'}</button>`:''),f=>{
  const kind=locked?existing.kind:f.get('kind'),t={...existing,id:existing?.id||C.id(),account:locked?existing.account:f.get('account'),kind,desc:f.get('desc').trim(),amount:C.money(f.get('amount')),date:f.get('date'),period:existing&&(locked||existing.date===f.get('date'))?existing.period:f.get('date').slice(0,7),category:['payment','transfer','cardPayment'].includes(kind)?kinds[kind]:f.get('category'),note:f.get('note'),reviewed:f.get('reviewed')==='on'};
  if(['payment','transfer'].includes(kind))t.target=f.get('target');else delete t.target;
  const count=f.get('installmentCount')?.trim();
  if(!locked){const installment=f.get('installment')?.trim();if(count&&installment)throw Error('Taksit planı veya tek taksit bilgisi gir.');if(kind==='expense'&&installment){const [a,b]=installment.split('/').map(Number);if(!/^\d{1,3}\/\d{1,3}$/.test(installment)||a<1||b<a)throw Error('Taksidi 1/6 gibi yaz; mevcut taksit toplamdan büyük olamaz.');t.installment=installment;}else delete t.installment;}
  if(locked&&(t.amount!==existing.amount||t.account!==existing.account||t.kind!==existing.kind||t.date!==existing.date))throw Error('Aktarılan kaydın tutar, tarih, hesap ve türü korunur. Açıklama, kategori ve notu düzenleyebilirsin.');
  let next=existing?C.updateTransaction(state,t):count?C.addInstallmentPlan(state,t,Number(count)):C.addTransaction(state,t);
  if(['expense','refund'].includes(kind)&&f.get('remember-category')==='on'){
   const name=merchant(t.desc),rule=C.merchantRule(next,name);
   next=C.saveMerchantRule(next,name,t.category,rule?.id);
  }
  commit(next);
 });
 function updateFields(){
  const kind=$('f-kind').value,current=$('f-account').value,filter=a=>kind==='income'||['payment','transfer'].includes(kind)?a.type!=='card':kind==='cardPayment'?a.type==='card':true;
  $('f-account').innerHTML=accountOptions(filter,current);const account=$('f-account').value;
  $('target-fields').innerHTML=['payment','transfer'].includes(kind)?select('target',kind==='payment'?'Ödenecek kredi kartı':'Hedef banka / nakit hesabı',accountOptions(a=>a.id!==account&&(kind==='payment'?a.type==='card':a.type!=='card'),existing?.target)):'';
  const hide=['payment','transfer','cardPayment'].includes(kind),old=$('f-category').value;
  $('f-category').innerHTML=categoryOptions(kind,old&&((kind==='income'?state.incomeCategories:state.categories).includes(old))?old:existing?.kind===kind?existing.category:undefined);
  document.querySelector('label[for=f-category]').hidden=hide;$('f-category').hidden=hide;
  const cardExpense=kind==='expense'&&state.accounts.find(a=>a.id===account)?.type==='card',previous=$('f-installment')?.value;
  const count=$('f-installmentCount')?.value;
  $('installment-fields').innerHTML=cardExpense?
   (!isEdit?field('installmentCount','Toplam taksit sayısı (isteğe bağlı)',count??'','text','inputmode="numeric" pattern="[0-9]{1,3}" maxlength="3"')+
    '<p class="notice">Plan için toplam alışveriş tutarını ve ilk taksitin tarihini gir.</p>':'')+
   field('installment','Tek taksit bilgisi (isteğe bağlı; 1/6)',previous??existing?.installment??'','text','maxlength="7"')+
   '<p class="notice">Tek taksit giriyorsan tutar alanına yalnız o taksitin tutarını yaz.</p>':'';
  updateSuggestion();
  if(locked)for(const name of ['kind','account'])$('f-'+name).disabled=true;
 }
 function updateSuggestion(){
  const applicable=['expense','refund'].includes($('f-kind').value);
  $('category-suggestion').hidden=!applicable;
  const category=applicable?C.suggestCategory(state,merchant($('f-desc').value)):null;
  const advice=category?'Kayıtlı öneri: '+category:'';
  if($('category-advice').textContent!==advice)$('category-advice').textContent=advice;
  $('choose-category').hidden=!category;
  $('choose-category').onclick=()=>{if(category){$('f-category').value=category;$('f-category').focus();}};
 }
 $('f-desc').addEventListener('input',updateSuggestion);
 $('f-kind').onchange=updateFields;$('f-account').onchange=updateFields;updateFields();
 if(locked){for(const name of ['amount','date','installment'])if($('f-'+name))$('f-'+name).readOnly=true;}
}
function payCardForm(cardId){
 const cards=state.accounts.filter(a=>a.type==='card'),sources=state.accounts.filter(a=>a.type!=='card');
 if(!cards.length||!sources.length)throw Error('Kart ödemesi için bir kredi kartı ve kaynak banka / nakit hesabı ekle.');
 const card=cards.find(a=>a.id===cardId)||cards[0],status=W.cardDetail(state,card.id),suggested=status.statementRemaining>0?status.statementRemaining:status.debt;
 modal('Kart borcu öde',select('target','Ödenecek kredi kartı',options(cards.map(a=>[a.id,a.name]),card.id))+select('account','Paranın çıktığı banka / nakit hesabı',options([['','Kaynak hesabı seç'],...sources.map(a=>[a.id,a.name])],''))+field('amount','Ödenen tutar (TL)',suggested?C.decimalMoney(suggested):'','text','inputmode="decimal" required')+field('date','Gerçek ödeme tarihi',C.today(),'date','required')+'<p class="notice">Banka / nakit bakiyesi azalır, kart borcu kapanır. Bu ödeme yeni bir gider değildir. Ekstrede aynı ödeme varsa incelemede eşleştir.</p>',f=>{
  if(!f.get('account'))throw Error('Kaynak hesabı seç.');commit(C.addTransaction(state,{id:C.id(),kind:'payment',account:f.get('account'),target:f.get('target'),amount:C.money(f.get('amount')),date:f.get('date'),period:f.get('date').slice(0,7),desc:accountName(f.get('target'))+' borç ödemesi',category:'Kart ödemesi',note:''}));
 },'Ödemeyi kaydet');
 $('f-target').onchange=()=>{const d=W.cardDetail(state,$('f-target').value);$('f-amount').value=C.decimalMoney(d.statementRemaining>0?d.statementRemaining:d.debt);};
}
function attachPaymentForm(tid){const t=state.transactions.find(t=>t.id===tid);if(!t)return;
 modal('Ekstre ödemesine kaynak bağla',`<p>${esc(t.desc)} · ${fmt(t.amount)}</p><p>Yalnız paranın hangi hesaptan çıktığını biliyorsan bağla. Kaynağı bilinmeyen ekstre ödemesi gelir sayılmaz. Zaten kaydettiğin banka ödemesi varsa inceleme kutusunda eşleştir.</p>`+select('account','Kaynak banka / nakit',options([['','Kaynak hesabı seç'],...state.accounts.filter(a=>a.type!=='card').map(a=>[a.id,a.name])],''))+field('paidOn','Bankadan paranın çıktığı tarih',t.date,'date','required'),f=>commit(W.attachPaymentSource(state,tid,f.get('account'),{paidOn:f.get('paidOn')})),'Kaynağı bağla');
}
function incomePlanForm(){if(!state.accounts.some(a=>a.type!=='card'))throw Error('Önce bir banka veya nakit hesabı ekle.');
 modal('Düzenli gelir planla',field('name','Gelir adı','','text','required maxlength="200"')+select('account','Gelirin geleceği hesap',accountOptions(a=>a.type!=='card'))+field('amount','Beklenen tutar (TL)','','text','inputmode="decimal" required')+field('next','Planlanan gelir tarihi',C.today(),'date','required')+select('category','Gelir kategorisi',categoryOptions('income','Maaş'))+'<p class="notice">Plan oluşturmak bakiye veya aylık geliri artırmaz. Para geldiğinde “Gelir alındı” ile gerçek tarihi kaydet.</p>',f=>commit(W.addIncomePlan(state,{name:f.get('name').trim(),account:f.get('account'),amount:C.money(f.get('amount')),next:f.get('next'),category:f.get('category')})));
}
function receiveIncomeForm(id,due){const p=state.incomePlans.find(r=>r.id===id);if(!p)return;modal('Gelir alındı',`<p>${esc(p.name)} · Planlanan tarih ${esc(due)} · ${fmt(p.amount)}</p>`+select('account','Gelirin gerçekten geldiği hesap',accountOptions(a=>a.type!=='card',p.account))+field('receivedOn','Gerçekte alındığı tarih',C.today(),'date','required'),f=>commit(W.receiveIncome(state,id,{receivedOn:f.get('receivedOn'),expectedDue:due,account:f.get('account')})),'Geliri kaydet');}
function dateStatus(date){const days=Math.round((new Date(date+'T12:00:00')-new Date(C.today()+'T12:00:00'))/86400000);return `${esc(date)} · ${days<0?'Vadesi geçti':days===0?'Bugün':days<=7?'Yaklaşıyor':'Planlandı'}`;}
function upcoming(){const items=C.upcomingPayments(state).filter(r=>r.days<=7).slice(0,3);return items.length?`<div class="panel"><h2>Yaklaşan / geciken ödemeler</h2>${items.map(r=>`<div class="row"><div><strong>${esc(r.name)}</strong><small>${dateStatus(r.date)}${r.estimated?' · kayıtlı ödemelere göre tahmin':''}</small></div><b>${r.amount===null?'Tutar bilinmiyor':fmt(r.amount)}</b></div>`).join('')}<button data-page="plan">Ödeme planına git</button></div>`:'';}
function reviewPage(){const pending=state.transactions.filter(t=>t.matchStatus==='pending'),linked=state.transactions.filter(t=>t.linkedTo);return `<h1>İnceleme kutusu</h1><p>Olası eşleşmeler kesin kabul edilmedi. İkinci kart/harcama etkisi karara kadar ayrı tutulur. Bankadan girdiğin ödeme hareketi banka bakiyesinde korunur.</p>${pending.map(t=>{const candidates=(t.matchCandidates||[]).map(id=>state.transactions.find(x=>x.id===id)).filter(x=>x&&C.effective(x));return `<section class="panel"><h2>${esc(t.desc)}</h2><p>${esc(t.date)} · ${esc(accountName(t.account))} · ${esc(C.sourceOf(t))}</p><b>${fmt(t.amount)}</b>${t.matchReason==='sourceChanged'?'<p class="warning">Önceden bağlı kaynak değişti veya kaldırıldı. Bu eski kayıt ayrıca sayılmıyor. Yeni ekstreyle karşılaştırıp ayrı gerçek işlem olarak kabul edebilir veya eski kaydı silebilirsin.</p>':''}${candidates.length?`<label for="match-${esc(t.id)}">Aynı olabilecek kayıt</label><select id="match-${esc(t.id)}">${options(candidates.map(x=>[x.id,`${x.date} · ${x.desc} · ${plainMoney(x.amount)} · ${C.sourceOf(x)}`]))}</select>`:''}<div class="actions">${candidates.length?`<button data-link="${esc(t.id)}">Aynı işlem</button>`:''}<button data-distinct="${esc(t.id)}">Ayrı gerçek işlem</button><button data-delete="${esc(t.id)}" type="button">Bu eski kaydı sil</button></div></section>`;}).join('')||empty('İnceleme bekleyen eşleşme yok.')}<h2 class="divider">Onaylanan kaynak bağlantıları</h2>${linked.map(t=>`<div class="panel"><strong>${esc(t.sourceDesc??t.desc)}</strong><p>${esc(C.sourceOf(t))} · ${esc(t.date)} · ${fmt(t.amount)}</p><p>Bağlı kayıt: ${esc(state.transactions.find(x=>x.id===t.linkedTo)?.desc)}</p><button data-unlink="${esc(t.id)}">Bağlantıyı yeniden incele</button></div>`).join('')||'<p>Henüz onaylı bağlantı yok.</p>'}`;}

function subscriptionPayment(rid,due){const r=state.subscriptions.find(r=>r.id===rid);if(!r)return;modal('Abonelik ödemesi',`<p>${esc(r.name)} · Planlanan vade ${esc(due)}</p><b>${fmt(r.amount)}</b>`+field('paidOn','Gerçek ödeme tarihi',C.today(),'date','required'),f=>commit(C.paySubscription(state,rid,{paidOn:f.get('paidOn'),expectedDue:due})),'Ödemeyi kaydet');}
function fitLayout(){
 const nav=$('nav');if(!nav.classList.contains('expanded')&&[...nav.children].some(b=>b.scrollWidth>b.clientWidth+1))nav.classList.add('expanded');
 document.documentElement.style.setProperty('--nav-height',nav.getBoundingClientRect().height+'px');
}
const layoutObserver=new ResizeObserver(()=>requestAnimationFrame(fitLayout));layoutObserver.observe($('main'));layoutObserver.observe($('nav'));window.addEventListener('resize',fitLayout);

const actions={
 back:()=>{if(!window.handleBack())go('import');},
 clearExpenseCategory:()=>{expenseCategory=null;render();focusMain();},
 addImportCard:()=>accountForm(null,{fromImport:true}),
 more:()=>{listLimit+=150;render();},
 recover:()=>{const raw=window.Android&&Android.recovery?Android.recovery():localStorage.getItem(key+'-recovery');if(!raw)throw Error('Geri yükleme öncesine ait kurtarma kopyası yok.');const prior=C.validate(JSON.parse(raw));if(confirm('Geri yükleme öncesindeki cüzdan geri getirilsin mi?'))commit(prior);},
 merchantRule:()=>merchantRuleForm(),
 cancelCategoryRemoval:closeModal,
 addAccount:()=>accountForm(),addTransaction:()=>transactionForm(),addIncome:()=>transactionForm(null,'income'),transfer:()=>transactionForm(null,'transfer'),payCard:()=>payCardForm(),incomePlan:()=>incomePlanForm(),
 incomeCategory:()=>modal('Gelir kategorisi ekle',field('name','Kategori adı','','text','required maxlength="80"'),f=>{const next=copy();next.incomeCategories.push(f.get('name').trim());commit(next);}),
 demo:()=>{if(state.accounts.length||state.transactions.length)throw Error('Örnek cüzdan yalnızca boş uygulamada açılır.');commit(C.demo());notice('Yapay örnek kayıtlar oluşturuldu.');},
 category:()=>modal('Kategori ekle',field('name','Kategori adı','','text','required maxlength="80"'),f=>commit(C.addExpenseCategory(state,f.get('name')))),
 budget:()=>modal('Aylık bütçe',field('period','Dönem',period,'month','required')+select('category','Kategori',options([['Toplam','Toplam'],...state.categories.filter(c=>c!=='Toplam').map(c=>[c,c])],'Toplam'))+field('amount','Bütçe (TL)','','text','inputmode="decimal" required'),f=>{const next=copy();next.budgets[f.get('period')+'|'+f.get('category')]=C.money(f.get('amount'));commit(next);}),
 subscription:()=>{if(!state.accounts.length)throw Error('Önce hesap ekle.');modal('Aylık abonelik',field('name','Abonelik adı','','text','required maxlength="80"')+field('amount','Tutar (TL)','','text','inputmode="decimal" required')+field('next','Sonraki ödeme',C.today(),'date','required')+select('account','Ödeme hesabı',accountOptions()),f=>{const next=copy();next.subscriptions.push({id:C.id(),name:f.get('name').trim(),amount:C.money(f.get('amount')),next:f.get('next'),account:f.get('account'),category:'Abonelik'});commit(next);});},
 pdf:()=>{if(!window.Android)throw Error('PDF seçimi Android uygulamasında çalışır. Tarayıcı önizlemesinde CSV kullanabilirsin.');notice('PDF seçildikten sonra cihazda okunacak…');Android.pickPdf();},
 csv:()=>{csvOpener=focusTarget(actionTrigger||document.activeElement);$('csv-file').click();},restore:()=>$('backup-file').click(),
 backup:()=>{const raw=C.backupText(state);if(window.Android)Android.exportBackup(raw);else{const u=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='ekstre-ajani-yedek.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}},
 confirmImport:()=>{
  if(!pending)return;
  if(pending.reconciliation?.status==='mismatch')throw Error('Ekstre toplamları çelişiyor; kayıt yapılamaz.');
  if(pending.reconciliation?.status!=='verified'&&!$('acknowledge-import')?.checked)throw Error('Toplamları doğrulanamayan ekstreyi kaydetmeden önce uyarıyı onayla.');
  const rows=pending.rows.map((row,index)=>{
   const selected=importDraft.suggestions.get(index);
   return selected&&C.suggestCategory(state,row.desc)===selected?{...row,category:selected}:row;
  });
  commit(C.importStatement(state,{...pending,rows},$('import-account').value));
  period=pending.period;pending=null;render();$('statement-history-title')?.focus();notice('Ekstre kaydedildi.');
 },
 cancelImport:()=>{pending=null;render();document.querySelector('[data-action="pdf"]')?.focus();}
};
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;actionTrigger=b;try{if('expenseCategory' in b.dataset){go('transactions',null,b.dataset.expenseCategory);}else if(b.dataset.statementView){go('statement',b.dataset.statementView);}else if(b.dataset.cardView||b.dataset.accountView){go('account',b.dataset.cardView||b.dataset.accountView);}else if(b.dataset.payCard)payCardForm(b.dataset.payCard);else if(b.dataset.bindPayment)attachPaymentForm(b.dataset.bindPayment);else if(b.dataset.incomeReceive)receiveIncomeForm(b.dataset.incomeReceive,b.dataset.due);else if(b.dataset.incomeDelete&&confirm('Gelir planı kaldırılsın mı? Kaydedilmiş gelirler korunur.')){const next=copy();next.incomePlans=next.incomePlans.filter(p=>p.id!==b.dataset.incomeDelete);commit(next);}else if(b.dataset.page)go(b.dataset.page);else if(b.dataset.action)actions[b.dataset.action]();else if(b.dataset.expenseCategoryEdit)expenseCategoryForm(b.dataset.expenseCategoryEdit);else if(b.dataset.expenseCategoryRemove)confirmExpenseCategoryRemoval(b.dataset.expenseCategoryRemove);else if(b.dataset.merchantRule)merchantRuleForm(state.merchantCategoryRules.find(r=>r.id===b.dataset.merchantRule));else if(b.dataset.removeRule&&confirm('Bu satıcı kuralı silinsin mi?')){commit(C.removeMerchantRule(state,b.dataset.removeRule));closeModal();}else if(b.dataset.edit)transactionForm(state.transactions.find(t=>t.id===b.dataset.edit));else if(b.dataset.account)accountForm(state.accounts.find(t=>t.id===b.dataset.account));else if(b.dataset.delete)confirmTransactionRemoval(b.dataset.delete);else if(b.dataset.pay)subscriptionPayment(b.dataset.pay,b.dataset.due);else if(b.dataset.unlink){commit(C.resolveCandidate(state,b.dataset.unlink,'unlink'));}else if(b.dataset.link){if(confirm('Bu iki kaynak aynı işlemi mi gösteriyor? İkinci kez sayılmayacak.'))commit(C.resolveCandidate(state,b.dataset.link,'link',$('match-'+b.dataset.link).value));}else if(b.dataset.distinct){if(confirm('Bu ayrı bir gerçek işlem mi? Toplama ayrıca eklenecek.'))commit(C.resolveCandidate(state,b.dataset.distinct,'distinct'));}else if(b.dataset.subdelete&&confirm('Abonelik silinsin mi?')){const next=copy();next.subscriptions=next.subscriptions.filter(r=>r.id!==b.dataset.subdelete);commit(next);}else if(b.dataset.budget&&confirm('Bütçe kaldırılsın mı?')){const next=copy();delete next.budgets[b.dataset.budget];commit(next);}}catch(error){errorNotice(error.message);}finally{actionTrigger=null;}});
function rememberImportAccount(field){
 importDraft.account=field.value;
 $('import-account-display').textContent=field.selectedOptions[0]?.textContent??'';
}
$('main').addEventListener('change',event=>{
 if(!pending)return;
 const field=event.target;
 if(field.id==='import-account')rememberImportAccount(field);
 else if(field.id==='acknowledge-import')importDraft.acknowledged=field.checked;
 else if('categorySuggestion' in field.dataset){
  const index=Number(field.dataset.categorySuggestion);
  if(field.checked)importDraft.suggestions.set(index,field.value);
  else importDraft.suggestions.delete(index);
 }
});
$('settings').dataset.page='settings';
$('backup-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>C.BACKUP_LIMIT)throw Error('Yedek 32 MB’den büyük olamaz.');const next=C.readBackup(await file.text());if(confirm('Bu yedek mevcut Android cüzdanının yerini alacak. Devam edilsin mi?')){const was=loadFailed;loadFailed=false;try{commit(W.normalizeWallet(C.reviewLegacy(next)),{restore:true});}catch(err){loadFailed=was;throw err;}notice('Yedek geri yüklendi.');}}catch(error){errorNotice(error.message);}};
$('csv-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{
 if(file.size>5*1024*1024)throw Error('CSV en fazla 5 MB olabilir.');
 const rows=parseStatementCsv(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())),groups=[...new Set(rows.map(r=>JSON.stringify([r.bank,r.card])))];
 const merchants=[...new Set(rows.filter(r=>r.kind!=='odeme'&&C.suggestCategory(state,r.desc)!==r.category&&C.suggestCategory(state,r.desc)).map(r=>r.desc))];
 modal('CSV aktarımı',`<p>${rows.length} hareket okundu. Aynı kaynak satırları tekrar eklenmez. PDF/manual çakışmaları inceleme kutusuna alınır.</p>`+groups.map((group,i)=>select('card-'+i,JSON.parse(group).join(' · '),accountOptions(a=>a.type==='card'))).join('')+merchants.map((name,i)=>importCategoryOption(name,null,i)).join(''),f=>{
  const targets=groups.map((g,i)=>f.get('card-'+i));if(targets.some(t=>!t)||new Set(targets).size!==targets.length)throw Error('Her kaynak kart için ayrı bir hedef kredi kartı seç.');
  const chosen=new Set(merchants.filter((_,i)=>document.querySelector(`#fields [data-category-suggestion="${i}"]:checked`)));
  const selected=rows.map(r=>r.kind!=='odeme'&&chosen.has(r.desc)?{...r,category:C.suggestCategory(state,r.desc)??r.category}:r);
  let next=state;for(const [i,g]of groups.entries())next=C.importCsv(next,selected.filter(r=>JSON.stringify([r.bank,r.card])===g),targets[i]);commit(next);period=rows.at(-1).date.slice(0,7);render();
 },'Kaydet',csvOpener);
}catch(error){errorNotice(error.message);}};

render();
