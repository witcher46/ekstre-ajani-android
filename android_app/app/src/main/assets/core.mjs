import {maskPdfRows,pdfIdentityKeyId} from './privacy.mjs';

export const merchantKey=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i').toUpperCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const categories=['Market / Gıda','Dışarıda yeme','Akaryakıt','Fatura / İnternet','Abonelik','Oyun / Dijital','Online alışveriş','Ulaşım','Sağlık','Giyim','Ev / Kira','Eğitim','Faiz / Ücret','Diğer'];
export const id=()=>crypto.randomUUID();
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export function money(input){
 const value=String(input).trim();
 const plain=/^([+-]?)(\d{1,10})(?:[,.](\d{1,2}))?$/.exec(value);
 const turkish=/^([+-]?)(\d{1,3}(?:\.\d{3})+),(\d{1,2})$/.exec(value);
 const english=/^([+-]?)(\d{1,3}(?:,\d{3})+)\.(\d{1,2})$/.exec(value);
 const match=plain||turkish||english;
 if(!match)throw Error('Tutarın ayraçlarını kontrol et. Örneğin 1234,56 yaz ve en fazla iki ondalık basamak kullan.');
 const [,sign,whole,fraction='']=match;
 const digits=whole.replace(/[.,]/g,'');
 if(digits.length>10)throw Error('Tutar en fazla 10 tam basamak içerebilir.');
 const amount=Number(digits+fraction.padEnd(2,'0'));
 return sign==='-'&&amount!==0?-amount:amount;
}
// Keep ordinary totals as numbers and widen only when the exact sum needs it.
export function addCents(a,b){
 if(typeof a==='number'&&typeof b==='number'){
  const sum=a+b;
  if(Number.isSafeInteger(sum))return sum;
 }
 const sum=BigInt(a)+BigInt(b),n=Number(sum);
 return Number.isSafeInteger(n)?n:sum;
}
export const positiveCents=n=>n>0?n:0;
export const absCents=n=>n<0?-n:n;
export const compareCents=(a,b)=>a<b?-1:a>b?1:0;
const lira=new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'});
function moneyParts(amount){
 const value=BigInt(absCents(amount));
 return {whole:value/100n,fraction:String(value%100n).padStart(2,'0')};
}
export function decimalMoney(amount){
 const {whole,fraction}=moneyParts(amount);
 return `${amount<0?'-':''}${whole}.${fraction}`;
}
export function formatMoney(amount){
 const {whole,fraction}=moneyParts(amount);
 const signed=amount<0?(whole===0n?-0:-whole):whole;
 return lira.formatToParts(signed).map(part=>part.type==='fraction'?fraction:part.value).join('');
}
export const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export const empty=()=>({format:'ekstre-android',version:1,accounts:[],transactions:[],statements:[],budgets:{},subscriptions:[],categories:[...categories]});
const text=(s,n=200)=>typeof s==='string'&&s.length<=n;
const cents=n=>Number.isSafeInteger(n)&&Math.abs(n)<=1e12;
export function validate(s){
 if(!s||s.format!=='ekstre-android'||s.version!==1)throw Error('Bu dosya Android cüzdan yedeği değil.');
 for(const k of ['accounts','transactions','statements','subscriptions','categories'])if(!Array.isArray(s[k])||s[k].length>50000)throw Error('Yedek yapısı veya boyutu geçersiz.');
 if(!s.budgets||typeof s.budgets!=='object'||Array.isArray(s.budgets))throw Error('Bütçe verisi geçersiz.');
 const ids=new Set();for(const a of s.accounts){if(!text(a.id)||ids.has(a.id)||!text(a.name)||!a.name.trim()||!['card','bank','cash'].includes(a.type)||!cents(a.opening))throw Error('Hesap kaydı geçersiz.');ids.add(a.id);}
 const txids=new Set();for(const t of s.transactions){if(!text(t.id)||txids.has(t.id)||!ids.has(t.account)||!validDate(t.date)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(t.period)||!text(t.desc,500)||!text(t.category)||!text(t.note??'',2000)||!cents(t.amount)||t.amount<0||!['expense','income','refund','cardPayment','payment','transfer'].includes(t.kind))throw Error('İşlem kaydı geçersiz.');if(['payment','transfer'].includes(t.kind)&&(!ids.has(t.target)||t.target===t.account))throw Error('Hedef hesap geçersiz.');if(t.installment&&!/^\d{1,3}\/\d{1,3}$/.test(t.installment))throw Error('Taksit geçersiz.');txids.add(t.id);}
 for(const st of s.statements)if(!text(st.id)||!ids.has(st.account)||!validDate(st.cut)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(st.period)||!(st.debt===null||cents(st.debt))||!(st.due===null||validDate(st.due)))throw Error('Ekstre kaydı geçersiz.');
 for(const [k,v] of Object.entries(s.budgets))if(!/^\d{4}-(0[1-9]|1[0-2])\|.{1,200}$/.test(k)||!cents(v)||v<0)throw Error('Bütçe kaydı geçersiz.');
 for(const r of s.subscriptions)if(!text(r.id)||!text(r.name)||!ids.has(r.account)||!validDate(r.next)||!cents(r.amount)||r.amount<=0)throw Error('Abonelik geçersiz.');
 if(s.categories.some(c=>!text(c)||!c.trim())||new Set(s.categories).size!==s.categories.length)throw Error('Kategori listesi geçersiz.');
 if(s.merchantCategoryRules!==undefined){
  if(!Array.isArray(s.merchantCategoryRules)||s.merchantCategoryRules.length>50000)throw Error('Satıcı kategori kuralları geçersiz.');
  const keys=new Set(),ids=new Set(),allowed=new Set(s.categories);
  for(const rule of s.merchantCategoryRules){
   if(!rule||!text(rule.id)||!rule.id||ids.has(rule.id)||!text(rule.merchant,500)||!allowed.has(rule.category))throw Error('Satıcı kategori kuralı geçersiz.');
   const key=merchantKey(rule.merchant);
   if(!key||keys.has(key))throw Error('Bu satıcı için zaten bir kategori kuralı var.');
   ids.add(rule.id);keys.add(key);
  }
 }
 if(s.incomeCategories!==undefined&&(!Array.isArray(s.incomeCategories)||s.incomeCategories.length>50000||s.incomeCategories.some(c=>!text(c)||!c.trim())||new Set(s.incomeCategories).size!==s.incomeCategories.length))throw Error('Gelir kategorileri geçersiz.');
 if(s.incomePlans!==undefined){
  if(!Array.isArray(s.incomePlans)||s.incomePlans.length>50000)throw Error('Gelir planları geçersiz.');
  const planIds=new Set();for(const p of s.incomePlans){if(!text(p.id)||!p.id||planIds.has(p.id)||!text(p.name)||!p.name.trim()||!s.accounts.some(a=>a.id===p.account&&a.type!=='card')||!cents(p.amount)||p.amount<=0||!validDate(p.next)||(p.category!==undefined&&!text(p.category))||(p.billingDay!==undefined&&(!Number.isInteger(p.billingDay)||p.billingDay<1||p.billingDay>31)))throw Error('Gelir planı geçersiz.');planIds.add(p.id);}
 }
 const plans=new Map();
 const links=new Map(),byId=new Map(s.transactions.map(t=>[t.id,t]));
 for(const t of s.transactions){
  validateKind(s,t);
  if(t.installmentPlan!==undefined){
   if(!text(t.installmentPlan)||!t.installmentPlan||t.kind!=='expense'||!isCardTransaction(s,t)||sourceOf(t)!=='manual'||!t.installment||t.amount<=0)throw Error('Taksit planı kaydı geçersiz.');
   if(!plans.has(t.installmentPlan))plans.set(t.installmentPlan,[]);
   plans.get(t.installmentPlan).push(t);
  }
  if(t.linkedTo!==undefined){
   const target=byId.get(t.linkedTo);
   if(!text(t.linkedTo)||!t.linkedTo||!target||target===t||target.linkedTo||
      (t.matchStatus!==undefined&&t.matchStatus!=='linked')||t.matchCandidates!==undefined){
    throw Error('Yedekte geçersiz işlem bağlantısı var.');
   }
   appendToGroup(links,target,t);
  }
  if(t.matchStatus!==undefined&&!['pending','linked','distinct'].includes(t.matchStatus))throw Error('Eşleşme durumu geçersiz.');
  if(t.matchStatus==='linked'&&!t.linkedTo)throw Error('Eşleşme hedefi eksik.');
  if(t.matchStatus==='pending'&&(!Array.isArray(t.matchCandidates)||(!t.matchCandidates.length&&t.matchReason!=='sourceChanged'&&!isCsvReview(t))||t.matchCandidates.some(x=>!txids.has(x)||x===t.id)))throw Error('İnceleme adayı geçersiz.');
  if(t.csvSourceId!==undefined&&(!text(t.csvSourceId)||!t.csvSourceId.trim()||sourceOf(t)!=='csv'))throw Error('CSV kaynak işlem kimliği geçersiz.');
  if(t.csvBatchId!==undefined&&(!text(t.csvBatchId)||!t.csvBatchId.trim()||sourceOf(t)!=='csv'||t.csvSourceId!==undefined))throw Error('CSV aktarım kimliği geçersiz.');
 }
 validateLinkGroups(s,links);
 if(s.csvDismissals!==undefined){
  if(!Array.isArray(s.csvDismissals)||s.csvDismissals.length>50000)throw Error('CSV inceleme kayıtları geçersiz.');
  const cardIds=new Set(s.accounts.filter(a=>a.type==='card').map(a=>a.id));
  for(const receipt of s.csvDismissals){
   if(!cardIds.has(readCsvDismissal(receipt).account))throw Error('CSV inceleme kaydının kartı bulunamadı.');
  }
 }
 for(const [plan,rows] of plans){
  rows.sort((a,b)=>a.date.localeCompare(b.date));
  const first=rows[0],day=Number(first.date.slice(8,10));
  let date=first.date;
  if(first.id!==plan||rows.length<2||rows.length>120)throw Error('Taksit planı eksik veya geçersiz.');
  for(const [i,row] of rows.entries()){
   if(row.account!==first.account||row.date!==date||row.period!==date.slice(0,7)||row.installment!==`${i+1}/${rows.length}`)throw Error('Taksit planı eksik veya geçersiz.');
   date=nextMonth(date,day);
  }
 }
 return s;
}
export function merchantRule(s,merchant){
 const key=merchantKey(merchant);
 return s.merchantCategoryRules?.find(r=>merchantKey(r.merchant)===key);
}
// Recognize a branch suffix only when a store number is followed by a known province.
const branchProvinces=new Set((
 'ADANA ADIYAMAN AFYON AFYONKARAHISAR AGRI AKSARAY AMASYA ANKARA ANTALYA ARDAHAN ARTVIN AYDIN '+
 'BALIKESIR BARTIN BATMAN BAYBURT BILECIK BINGOL BITLIS BOLU BURDUR BURSA CANAKKALE CANKIRI CORUM '+
 'DENIZLI DIYARBAKIR DUZCE EDIRNE ELAZIG ERZINCAN ERZURUM ESKISEHIR GAZIANTEP GIRESUN GUMUSHANE '+
 'HAKKARI HATAY IGDIR ISPARTA ISTANBUL IZMIR KAHRAMANMARAS KARABUK KARAMAN KARS KASTAMONU KAYSERI '+
 'KIRIKKALE KIRKLARELI KIRSEHIR KILIS KOCAELI KONYA KUTAHYA MALATYA MANISA MARDIN MERSIN MUGLA MUS '+
 'NEVSEHIR NIGDE ORDU OSMANIYE RIZE SAKARYA SAMSUN SIIRT SINOP SIVAS SANLIURFA SIRNAK TEKIRDAG TOKAT '+
 'TRABZON TUNCELI USAK VAN YALOVA YOZGAT ZONGULDAK'
).split(' '));
const genericMerchantNames=new Set(['POS','POS SATIS','SANAL POS','MARKET','SUPERMARKET','MAGAZA','ISYERI',
 'KARTLI ALISVERIS','ALISVERIS','ODEME','SATIS','HARCAMA','SUBE','KREDI KARTI']);
function branchMerchantName(key){
 const match=/^(.+?) (?:SUBE )?[0-9]{3,6} ([A-Z]+)$/.exec(key);
 if(!match)return null;
 const [,name,province]=match;
 return /\p{L}/u.test(name)&&!genericMerchantNames.has(name)&&branchProvinces.has(province)?name:null;
}
export function suggestCategory(s,merchant){
 const exact=merchantRule(s,merchant);
 if(exact)return exact.category;
 const name=branchMerchantName(merchantKey(merchant));
 if(!name)return null;
 const categories=new Set();
 for(const rule of s.merchantCategoryRules??[]){
  const key=merchantKey(rule.merchant);
  if(key===name||branchMerchantName(key)===name)categories.add(rule.category);
  if(categories.size>1)return null;
 }
 return categories.values().next().value??null;
}
export function saveMerchantRule(s,merchant,category,ruleId){
 const next=structuredClone(s);
 next.merchantCategoryRules??=[];
 const rule={id:ruleId||id(),merchant:String(merchant).trim(),category};
 const index=next.merchantCategoryRules.findIndex(r=>r.id===ruleId);
 if(ruleId&&index<0)throw Error('Düzenlenecek kural bulunamadı.');
 if(index>=0)next.merchantCategoryRules[index]=rule;
 else next.merchantCategoryRules.push(rule);
 return validate(next);
}
export function removeMerchantRule(s,ruleId){
 const next=structuredClone(s);
 next.merchantCategoryRules=(next.merchantCategoryRules||[]).filter(r=>r.id!==ruleId);
 return validate(next);
}
export function activeExpenseCategory(s,preferred){
 if(s.categories.includes(preferred))return preferred;
 return s.categories.includes('Diğer')?'Diğer':'';
}
function expenseCategoryName(s,newName,existing){
 const name=String(newName??'').trim();
 if(!name||name.length>200)throw Error('Geçerli bir kategori adı gir.');
 if(name===existing)return name;
 if(name==='Toplam')throw Error('“Toplam” aylık toplam bütçesi için ayrılmıştır.');
 if(s.categories.includes(name))throw Error('Bu gider kategorisi zaten var.');
 return name;
}
export function addExpenseCategory(s,newName){
 const name=expenseCategoryName(s,newName);
 return validate({...s,categories:[...s.categories,name]});
}
export function renameExpenseCategory(s,category,newName){
 if(!s.categories.includes(category))throw Error('Gider kategorisi bulunamadı.');
 const name=expenseCategoryName(s,newName,category);
 if(name===category)return s;
 const next=structuredClone(s);
 next.categories=next.categories.map(c=>c===category?name:c);
 for(const row of next.transactions){
  if((row.kind==='expense'||row.kind==='refund')&&row.category===category)row.category=name;
 }
 for(const row of [...next.subscriptions,...(next.merchantCategoryRules??[])]){
  if(row.category===category)row.category=name;
 }
 // The reserved monthly total is independent of any expense category label.
 if(category!=='Toplam'){
  for(const [key,amount] of Object.entries(next.budgets)){
   if(key.slice(8)!==category)continue;
   const target=key.slice(0,8)+name;
   if(Object.hasOwn(next.budgets,target))throw Error('Yeni kategori adı bir bütçe ile çakışıyor.');
   next.budgets[target]=amount;
   delete next.budgets[key];
  }
 }
 return validate(next);
}

export function removeExpenseCategory(s,category,{moveRulesTo,removeRules=false}={}){
 if(!s.categories.includes(category))throw Error('Gider kategorisi bulunamadı.');
 const categories=s.categories.filter(c=>c!==category);
 if(!categories.length)throw Error('En az bir gider kategorisi kalmalı.');
 if(moveRulesTo!==undefined&&(!categories.includes(moveRulesTo)||removeRules))throw Error('Başka bir hedef gider kategorisi seç.');
 const next=structuredClone(s);
 if(next.merchantCategoryRules?.some(rule=>rule.category===category)){
  if(removeRules)next.merchantCategoryRules=next.merchantCategoryRules.filter(rule=>rule.category!==category);
  else if(moveRulesTo){
   for(const rule of next.merchantCategoryRules)if(rule.category===category)rule.category=moveRulesTo;
  }else throw Error('Kategoriye bağlı satıcı kurallarını taşı veya kaldır.');
 }
 next.categories=categories;
 return validate(next);
}
export const sourceOf=t=>t.source||(t.statement?'pdf':t.csvKey?'csv':'manual');
export const effective=t=>!t.linkedTo&&t.matchStatus!=='pending';
const cardAccount=t=>t.kind==='payment'?t.target:t.account;
const effectKind=t=>['payment','cardPayment'].includes(t.kind)?'cardPayment':t.kind;
const sameTerms=(a,b)=>cardAccount(a)===cardAccount(b)&&effectKind(a)===effectKind(b)&&a.amount===b.amount&&(!a.installment||!b.installment||a.installment===b.installment);
const installmentMonth=t=>t.statement&&t.installment?t.period:t.date.slice(0,7);
function sameEconomic(a,b){
 if(!sameTerms(a,b))return false;
 if((a.installmentPlan||b.installmentPlan)&&a.installment&&b.installment){
  return installmentMonth(a)===installmentMonth(b);
 }
 return a.date===b.date||(effectKind(a)==='cardPayment'&&Math.abs(Date.parse(a.date)-Date.parse(b.date))<=3*86400000);
}
function incompatibleStatementPeriods(a,b){
 const x=sourceOf(a),y=sourceOf(b);
 return effectKind(a)!=='cardPayment'&&a.period!==b.period&&
  ((x==='pdf'&&y==='csv')||(x==='csv'&&y==='pdf'));
}
function incompatibleDocumentPayments(a,b){
 const x=sourceOf(a),y=sourceOf(b);
 return a.kind==='cardPayment'&&b.kind==='cardPayment'&&
  ((x==='pdf'&&y==='csv')||(x==='csv'&&y==='pdf'))&&!sameEconomic(a,b);
}
function connectedLinkRows(target,aliases){
 const connected=[target],remaining=[...aliases];
 if(target.kind==='payment')return [...connected,...remaining];
 while(remaining.length){
  const index=remaining.findIndex(row=>connected.some(other=>sameEconomic(row,other)));
  if(index<0)break;
  connected.push(...remaining.splice(index,1));
 }
 return connected;
}
function validateLinkGroups(s,links){
 if(!links.size)return;
 const statements=new Map(s.statements.map(st=>[st.id,st]));
 const cardIds=new Set(s.accounts.filter(a=>a.type==='card').map(a=>a.id));
 for(const [target,aliases] of links){
  const group=[target,...aliases],kind=effectKind(target);
  const sources=new Set();
  let installment=null;
  for(const row of group){
   const source=sourceOf(row);
   const sourceIdentity={
    manual:!row.statement&&!row.csvKey,
    // A valid legacy PDF payment may not carry a statement reference.
    pdf:!row.csvKey&&(row.statement===undefined||typeof row.statement==='string'&&!!row.statement),
    csv:typeof row.csvKey==='string'&&!!row.csvKey&&!row.statement,
   };
   const validSource=Object.hasOwn(sourceIdentity,source)&&sourceIdentity[source]&&!sources.has(source);
   const validDirection=row.kind==='payment'
    ?row===target&&source==='manual'
    :!row.target&&(row.kind!=='cardPayment'||source!=='manual');
   if(!validSource||!validDirection||!['expense','refund','cardPayment'].includes(kind)||
      !cardIds.has(cardAccount(row))||!sameTerms(row,target)||
      (row.installment&&installment&&row.installment!==installment)){
    throw Error('Yedekte hesap, tür, tutar veya kaynağı uyuşmayan işlem bağlantısı var.');
   }
   if(row.statement){
    const st=statements.get(row.statement);
    if(source!=='pdf'||!st||st.account!==row.account||st.period!==row.period){
     throw Error('Yedekte işlem bağlantısının ekstre dönemi uyuşmuyor.');
    }
   }
   if(source==='csv')validateCsvLinkPeriod(row);
   if(row.installment)installment=row.installment;
   sources.add(source);
  }
  const csv=group.find(row=>sourceOf(row)==='csv'),pdf=group.find(row=>sourceOf(row)==='pdf');
  if(pdf&&csv&&incompatibleDocumentPayments(pdf,csv)){
   throw Error('PDF ve CSV ödemelerinin tarihleri veya işlem bilgileri uyuşmuyor.');
  }
  // Previously confirmed legacy links did not require the two export periods to match.
  if(pdf&&csv?.csvKey.startsWith('["csv-v2",')&&incompatibleStatementPeriods(csv,pdf)){
   throw Error('Yedekte PDF ve CSV ekstre dönemleri uyuşmuyor.');
  }
  if(connectedLinkRows(target,aliases).length!==group.length){
   throw Error('Yedekte tarih veya taksit dönemi uyuşmayan işlem bağlantısı var.');
  }
 }
}
const normalized=s=>String(s??'').replace(/ı/g,'i').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
function originalDescription(t){if(t.sourceDesc!==undefined)return t.sourceDesc;if(t.csvKey){try{const key=JSON.parse(t.csvKey);if(key[1]&&typeof key[1]==='object'&&typeof key[1].desc==='string')return key[1].desc;}catch{}}return t.desc;}
const csvFields=t=>[t.account,t.period,t.kind,t.date,t.amount,normalized(originalDescription(t))];
const csvSignature=t=>JSON.stringify(csvFields(t));
const csvKeyFor=row=>JSON.stringify(['csv-v2',...csvFields(row),row.csvSourceId??null]);
function validateCsvLinkPeriod(row){
 let key;
 try{key=JSON.parse(row.csvKey);}catch{return;}
 if(!Array.isArray(key))return;
 if(key[0]==='csv-v2'){
  if(row.csvKey!==csvKeyFor(row))throw Error('Yedekte CSV işlem bağlantısının kaynağı veya dönemi uyuşmuyor.');
 }else if(key[1]?.period&&key[1].period!==row.period){
  throw Error('Yedekte CSV işlem bağlantısının dönemi uyuşmuyor.');
 }
}
function readCsvDismissal(receipt){
 const invalid=()=>Error('CSV inceleme kaydı geçersiz.');
 if(!Array.isArray(receipt)||receipt.length!==2||!text(receipt[0],5000))throw invalid();
 let key;
 try{key=JSON.parse(receipt[0]);}catch{throw invalid();}
 if(!Array.isArray(key)||key.length!==8||key[0]!=='csv-v2')throw invalid();
 const [,account,period,kind,date,amount,sourceDesc,sourceId]=key;
 const batch=receipt[1];
 if(!text(account)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||!['expense','refund','cardPayment'].includes(kind)||
    !validDate(date)||!cents(amount)||amount<0||!text(sourceDesc,2000)||
    (sourceId===null?(!text(batch)||!batch.trim()):(batch!==null||!text(sourceId)||!sourceId.trim()))){
  throw invalid();
 }
 return {account,period,kind,date,amount,sourceDesc,csvSourceId:sourceId,csvBatchId:batch};
}
function csvBatchSignature(rows){
 return JSON.stringify(rows.map(csvSignature).sort());
}
function appendToGroup(groups,key,row){
 if(!groups.has(key))groups.set(key,[]);
 groups.get(key).push(row);
}
function matchingRows(rows,t){
 const viaAliases=new Set(),incompatible=new Set();
 for(const row of rows){
  if(row.id===t.id||sourceOf(row)===sourceOf(t))continue;
  if(incompatibleStatementPeriods(row,t)||incompatibleDocumentPayments(row,t))incompatible.add(row.linkedTo||row.id);
  if(row.linkedTo&&sameEconomic(row,t))viaAliases.add(row.linkedTo);
 }
 return rows.filter(r=>r.id!==t.id&&effective(r)&&sourceOf(r)!==sourceOf(t)&&
  !incompatible.has(r.id)&&(sameEconomic(r,t)||viaAliases.has(r.id)));
}
function markCandidate(t,rows){if(t.matchStatus==='distinct'||t.linkedTo)return;const candidates=matchingRows(rows,t);if(candidates.length){t.matchStatus='pending';t.matchCandidates=candidates.map(r=>r.id);}}
function validateKind(s,t){
 const a=s.accounts.find(a=>a.id===t.account),b=s.accounts.find(a=>a.id===t.target);
 if(!a)throw Error('Önce bir hesap ekle.');
 if(t.kind==='income'&&a.type==='card')throw Error('Gelir banka veya nakit hesabına eklenir.');
 if(t.kind==='cardPayment'&&a.type!=='card')throw Error('Ekstre ödemesi bir kredi kartına ait olmalı.');
 if(['payment','transfer'].includes(t.kind)&&(!b||a.id===b.id||a.type==='card'||(t.kind==='payment'?b.type!=='card':b.type==='card')))throw Error('Transfer iki banka/nakit hesabı arasında; kart ödemesi banka/nakitten karta yapılır.');
}
export function addTransaction(s,t,{editing=false}={}){
 validateKind(s,t);const next=structuredClone(s),row={...t,id:t.id||id(),period:t.period||t.date.slice(0,7),source:sourceOf(t)};
 if(!editing&&next.transactions.some(alias=>alias.linkedTo===row.id&&!sameEconomic(alias,row)))throw Error('Kaynakla bağlantılı bir tutar, tarih veya hesap değiştirilemez. Önce inceleme kutusundan bağlantıyı ayır.');
 if(!editing&&!row.statement&&!row.csvKey&&!row.matchStatus)markCandidate(row,next.transactions);
 next.transactions.push(row);return validate(next);
}
export function addInstallmentPlan(s,purchase,count){
 if(purchase.kind!=='expense'||!isCardTransaction(s,purchase))throw Error('Taksit planı için bir kredi kartı seç.');
 if(!validDate(purchase.date))throw Error('İlk taksit tarihini seç.');
 if(!Number.isInteger(count)||count<2||count>120)throw Error('Taksit sayısı 2 ile 120 arasında olmalı.');
 if(!cents(purchase.amount)||purchase.amount<count)throw Error('Her taksit en az 1 kuruş olmalı.');
 const next=structuredClone(s),plan=purchase.id||id(),day=Number(purchase.date.slice(8,10));
 const share=Math.floor(purchase.amount/count);
 let date=purchase.date;
 for(let i=1;i<=count;i++){
  const amount=i===count?purchase.amount-share*(count-1):share;
  const row={...purchase,id:i===1?plan:id(),date,period:date.slice(0,7),amount,
   source:'manual',installment:`${i}/${count}`,installmentPlan:plan};
  markCandidate(row,s.transactions);
  next.transactions.push(row);
  date=nextMonth(date,day);
 }
 return validate(next);
}
export function updateTransaction(s,t){
 const old=s.transactions.find(r=>r.id===t.id);
 if(!old)throw Error('Düzenlenecek kayıt bulunamadı.');
 const financialChange=['account','target','date','period','amount','kind','installment','installmentPlan'].some(k=>old[k]!==t[k]);
 if(old.installmentPlan&&financialChange)throw Error('Taksit planının tutarı, tarihi ve hesabı tek tek değiştirilemez.');
 if((old.linkedTo||s.transactions.some(r=>r.linkedTo===old.id))&&
    (financialChange||old.linkedTo!==t.linkedTo||old.matchStatus!==t.matchStatus)){
  throw Error('Bağlı kaydın finansal alanları değiştirilemez. Önce bağlantıyı ayır.');
 }
 const next=structuredClone(s);
 next.transactions=next.transactions.filter(r=>r.id!==t.id);
 const row={...t};
 if(financialChange&&sourceOf(old)==='manual'){
  delete row.matchStatus;delete row.matchReason;delete row.matchCandidates;delete row.previousLinkedTo;
  for(const candidate of next.transactions){
   if(candidate.matchCandidates?.includes(row.id)&&!sameEconomic(candidate,row)){
    candidate.matchCandidates=candidate.matchCandidates.filter(id=>id!==row.id);
    if(!candidate.matchCandidates.length)candidate.matchReason='sourceChanged';
   }
  }
  markCandidate(row,next.transactions);
 }
 return addTransaction(next,row,{editing:true});
}
function ledgerEffect(t,a){let n=0;if(t.account===a.id)n=a.type==='card'?(t.kind==='expense'?t.amount:['refund','cardPayment'].includes(t.kind)?-t.amount:0):(['income','refund'].includes(t.kind)?t.amount:-t.amount);if(t.target===a.id)n+=a.type==='card'?-t.amount:t.amount;return n;}
export function cardDates(s){
 const cuts=new Map(s.statements.map(st=>[st.id,st.cut]));
 const pdfDates=new Map();
 for(const t of s.transactions)if(sourceOf(t)==='pdf'&&!pdfDates.has(t.linkedTo||t.id)){
  const date=t.kind==='expense'&&t.installment&&t.date.slice(0,7)!==t.period?cuts.get(t.statement)??t.date:t.date;
  pdfDates.set(t.linkedTo||t.id,date);
 }
 return t=>pdfDates.get(t.linkedTo||t.id)??t.date;
}
export function cardEffectDate(s,t){
 const canonical=t.linkedTo?s.transactions.find(r=>r.id===t.linkedTo)||t:t;
 return cardDates(s)(canonical);
}
export function cardStatus(s,account,{asOf=today()}={}){
 const a=s.accounts.find(a=>a.id===(typeof account==='string'?account:account.id));if(!a||a.type!=='card')throw Error('Kredi kartı bulunamadı.');
 const latest=s.statements.filter(st=>st.account===a.id).sort((x,y)=>y.cut.localeCompare(x.cut))[0];
 const currentAnchor=s.statements.filter(st=>st.account===a.id&&st.debt!==null).sort((x,y)=>y.cut.localeCompare(x.cut))[0];
 const rows=s.transactions.filter(effective),anchored=latest&&latest.debt!==null;
 const dateOf=cardDates(s);
 let current=currentAnchor?currentAnchor.debt:a.opening;
 for(const t of rows)if((!t.installmentPlan||dateOf(t)<=asOf)&&(!currentAnchor||dateOf(t)>currentAnchor.cut))current=addCents(current,ledgerEffect(t,a));
 const paidAfterCut=anchored?rows.filter(t=>dateOf(t)>latest.cut&&cardAccount(t)===a.id&&effectKind(t)==='cardPayment').reduce((n,t)=>addCents(n,t.amount),0):0;
 return {current,statementDebt:latest?.debt??null,statementRemaining:anchored?positiveCents(addCents(latest.debt,-paidAfterCut)):null,paidAfterCut,latest:latest||null,currentAnchor:currentAnchor||null,pending:s.transactions.filter(t=>t.matchStatus==='pending'&&cardAccount(t)===a.id).length};
}
export function balance(s,a){return a.type==='card'?cardStatus(s,a).current:s.transactions.filter(t=>effective(t)||(t.matchStatus==='pending'&&t.kind==='payment'&&!t.linkedTo)).reduce((n,t)=>addCents(n,ledgerEffect(t,a)),a.opening);}
export function isCardTransaction(s,t){return s.accounts.find(a=>a.id===cardAccount(t))?.type==='card';}
export function reportPeriod(s,t){const group=[t,...s.transactions.filter(r=>r.linkedTo===t.id)],pdf=group.find(r=>sourceOf(r)==='pdf'),csv=group.find(r=>sourceOf(r)==='csv');return pdf?.period??csv?.period??t.period;}
export function calendarPeriods(s){
 const statementPeriods=new Map();
 for(const t of s.transactions){
  if(t.statement&&t.kind==='expense'&&t.installment)statementPeriods.set(t.linkedTo||t.id,t.period);
 }
 return t=>t.kind==='expense'&&t.installment&&!t.installmentPlan&&statementPeriods.has(t.id)?
  statementPeriods.get(t.id):t.date.slice(0,7);
}
export function rowsForPeriod(s,period,mode='calendar'){
 const monthOf=mode==='statement'?t=>reportPeriod(s,t):calendarPeriods(s);
 return s.transactions.filter(t=>effective(t)&&monthOf(t)===period&&(mode!=='statement'||isCardTransaction(s,t)));
}
export function summary(s,period,mode='calendar'){
 const rows=rowsForPeriod(s,period,mode),cats=new Map();let spent=0,refunds=0,income=0;
 for(const t of rows){if(t.kind==='income')income=addCents(income,t.amount);if(!['expense','refund'].includes(t.kind))continue;const n=t.kind==='refund'?-t.amount:t.amount;cats.set(t.category,addCents(cats.get(t.category)||0,n));if(n>=0)spent=addCents(spent,n);else refunds=addCents(refunds,-n);}
 return {spent,refunds,income,net:addCents(spent,-refunds),categories:[...cats].sort((a,b)=>compareCents(b[1],a[1]))};
}
export function nextMonth(date,anchorDay=Number(date.slice(8,10))){const d=new Date(date+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(Math.min(anchorDay,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));return d.toISOString().slice(0,10);}
export function paySubscription(s,rid,options={}){
 const r=s.subscriptions.find(r=>r.id===rid);if(!r)throw Error('Abonelik bulunamadı.');const due=options.expectedDue||r.next,paidOn=options.paidOn||today();
 if(due!==r.next||s.transactions.some(t=>t.subscriptionId===rid&&t.subscriptionDue===due))throw Error('Bu vade zaten işlendi. Abonelik ekranını yenile.');
 if(!validDate(paidOn))throw Error('Gerçek ödeme tarihini seç.');
 const next=addTransaction(s,{account:r.account,date:paidOn,desc:r.name,amount:r.amount,kind:'expense',category:activeExpenseCategory(s,r.category??'Abonelik'),note:'Abonelik ödemesi',subscriptionId:rid,subscriptionDue:due});
 const sub=next.subscriptions.find(x=>x.id===rid);sub.billingDay=r.billingDay||Number(due.slice(8,10));sub.next=nextMonth(due,sub.billingDay);sub.lastPaidOn=paidOn;return next;
}
function reopenSource(row){
 row.previousLinkedTo=row.linkedTo;
 delete row.linkedTo;
 row.matchStatus='pending';
 row.matchReason='sourceChanged';
 row.matchCandidates=[];
}
function repairReferences(s){
 const byId=new Map(s.transactions.map(row=>[row.id,row])),links=new Map();
 for(const row of s.transactions){
  if(row.linkedTo){
   const target=byId.get(row.linkedTo);
   if(target)appendToGroup(links,target,row);
   else reopenSource(row);
  }
  if(row.matchStatus==='pending'){
   row.matchCandidates=(row.matchCandidates||[]).filter(id=>byId.has(id)&&id!==row.id);
   if(!row.matchCandidates.length&&!isCsvReview(row))row.matchReason='sourceChanged';
  }
 }
 for(const [target,aliases] of links){
  const connected=new Set(connectedLinkRows(target,aliases));
  // If a removed source was the only link, leave the dependent row in review.
  for(const row of aliases)if(!connected.has(row))reopenSource(row);
 }
 return s;
}
function isCsvReview(row){return row.matchStatus==='pending'&&['csvRepeatedRow','csvSourceConflict'].includes(row.matchReason);}
export function repointCandidates(s,oldIds,canonicalId){
 const replaced=new Set(oldIds);
 for(const row of s.transactions){
  if(row.matchStatus!=='pending'||!row.matchCandidates?.some(id=>replaced.has(id)))continue;
  row.matchCandidates=[...new Set(row.matchCandidates.map(id=>replaced.has(id)?canonicalId:id))].filter(id=>id!==row.id);
  if(!row.matchCandidates.length)row.matchReason='sourceChanged';
 }
}
export function resolveCandidate(s,tid,decision,targetId){
 const next=structuredClone(s),row=next.transactions.find(t=>t.id===tid);if(!row)throw Error('İncelenecek aday bulunamadı.');
 if(decision==='unlink'&&row.linkedTo){const target=row.linkedTo;row.previousLinkedTo=target;delete row.linkedTo;row.matchStatus='pending';row.matchCandidates=[target];return validate(repairReferences(preferPdfAcrossCut(next)));}
 if(row.matchStatus!=='pending')throw Error('İncelenecek aday bulunamadı.');
 if(decision==='link'){
  const target=next.transactions.find(t=>t.id===targetId);
  const aliases=next.transactions.filter(t=>t.linkedTo===targetId);
  const members=[row,...(target?[target]:[]),...aliases,...next.transactions.filter(t=>t.linkedTo===row.id)];
  const pdf=members.find(t=>sourceOf(t)==='pdf'),csv=members.find(t=>sourceOf(t)==='csv');
  if(pdf&&csv&&incompatibleDocumentPayments(pdf,csv)){
   throw Error('PDF ve CSV ödemelerinin tarihleri veya işlem bilgileri uyuşmuyor.');
  }
  if(pdf&&csv&&incompatibleStatementPeriods(pdf,csv)){
   throw Error('Farklı PDF ve CSV ekstre dönemleri tek işleme bağlanamaz.');
  }
  const previouslyConfirmed=target&&effectKind(row)==='cardPayment'&&sameTerms(row,target)&&(row.previousLinkedTo===target.id||target.previousLinkedTo===row.id);
  if(!target||!effective(target)||!row.matchCandidates?.includes(targetId)||
     (![target,...aliases].some(t=>sameEconomic(row,t))&&!previouslyConfirmed))throw Error('Geçerli ve aynı tutarlı eşleşme seç.');
  const periods=new Set(members.filter(t=>sourceOf(t)==='pdf').map(t=>t.period));if(periods.size>1)throw Error('Farklı ekstre dönemleri tek işleme bağlanamaz. Belgeleri kontrol et.');
  const sources=members.map(sourceOf);
  if(new Set(sources).size!==sources.length)throw Error('Bu işleme aynı kaynaktan bir satır zaten bağlı. Ekstredeki ayrı hareketi kontrol et.');
  const canonical=sourceOf(row)==='manual'&&sourceOf(target)!=='manual'?row:target,alias=canonical===row?target:row;
  if(!canonical.installment&&alias.installment)canonical.installment=alias.installment;
  for(const member of next.transactions.filter(t=>t.linkedTo===alias.id))member.linkedTo=canonical.id;
  alias.linkedTo=canonical.id;
  alias.matchStatus='linked';
  delete alias.matchCandidates;delete alias.matchReason;
  if(canonical.matchStatus==='pending')delete canonical.matchStatus;
  delete canonical.matchCandidates;delete canonical.matchReason;
  repointCandidates(next,[alias.id],canonical.id);
 }else if(decision==='distinct'){row.matchStatus='distinct';delete row.linkedTo;}else throw Error('Aynı veya ayrı işlem kararını seç.');delete row.matchCandidates;delete row.matchReason;return validate(next);
}
export function transactionRemovalRows(s,tid){
 const plan=s.transactions.find(t=>t.id===tid)?.installmentPlan;
 return s.transactions.filter(t=>t.id===tid||(plan&&t.installmentPlan===plan));
}
export function removeTransaction(s,tid){
 const removed=new Set(transactionRemovalRows(s,tid).map(t=>t.id));
 const next=structuredClone(s);
 const removedRow=next.transactions.find(row=>row.id===tid);
 if(removedRow&&(removedRow.csvSourceId||removedRow.csvBatchId)&&isCsvReview(removedRow)){
  next.csvDismissals??=[];
  next.csvDismissals.push([csvKeyFor(removedRow),removedRow.csvBatchId??null]);
 }
 next.transactions=next.transactions.filter(t=>!removed.has(t.id));
 return validate(repairReferences(next));
}
function preferPdfAcrossCut(s){
 const dateOf=cardDates(s);
 for(const row of s.transactions.filter(t=>t.matchStatus==='pending'&&sourceOf(t)==='pdf')){
  const latest=s.statements.filter(st=>st.account===row.account&&st.debt!==null).sort((a,b)=>b.cut.localeCompare(a.cut))[0];
  if(!latest)continue;
  const candidates=s.transactions.filter(t=>row.matchCandidates?.includes(t.id)&&effective(t)&&
   (row.kind==='cardPayment'||(row.kind==='expense'&&row.installment&&t.installmentPlan)));
  if(!candidates.some(t=>(dateOf(t)>latest.cut)!==(dateOf(row)>latest.cut)))continue;
  for(const t of candidates){
   t.matchStatus='pending';t.matchCandidates=[row.id];
  }
  delete row.matchStatus;delete row.matchCandidates;delete row.matchReason;
  repointCandidates(s,candidates.map(t=>t.id),row.id);
 }
 return s;
}
export function reviewLegacy(s){
 const next=structuredClone(s),candidates=next.transactions.filter(t=>t.matchStatus!=='distinct');
 for(const t of candidates){
  if(t.matchStatus||t.linkedTo||sourceOf(t)==='manual')continue;
  const matches=matchingRows(candidates,t);
  if(t.kind==='cardPayment'||sourceOf(t)==='csv'||matches.some(r=>sourceOf(r)==='manual'))markCandidate(t,candidates);
 }
 return repairReferences(preferPdfAcrossCut(next));
}
export function sanitizePdfSources(s){
 const transactions=maskPdfRows(s.transactions,row=>sourceOf(row)==='pdf');
 return transactions.some((row,index)=>row!==s.transactions[index])?{...s,transactions}:s;
}
function matchPdfReplay(previous,incoming){
 if(!previous.length)return new Map();
 const needsReview=()=>Error('PDF tekrar aktarımı inceleme gerektiriyor. İşlem kimliği güvenle doğrulanamadı. Mevcut ekstreyi ve yeni PDF’yi karşılaştır.');
 const keyStem=key=>key.replace(/\|[1-9]\d*$/,'');
 const index=rows=>{
  const byKey=new Map(),counts=new Map();
  for(const row of rows){
   const key=row.importKey;
   if(typeof key!=='string'||!key||/\[kart(?::\d{4})?\]/.test(key)||byKey.has(key))throw needsReview();
   byKey.set(key,row);
   const stem=keyStem(key);
   counts.set(stem,(counts.get(stem)??0)+1);
  }
  return {byKey,counts};
 };
 const original=index(previous),replacement=index(incoming);
 for(const [key,old] of original.byKey){
  const row=replacement.byKey.get(key);
  const stem=keyStem(key);
  const count=original.counts.get(stem);
  if(!row||replacement.counts.get(stem)!==count||(count>1&&pdfIdentityKeyId(key))||
     row.kind!==old.kind||row.amount!==old.amount||row.date!==old.date||row.period!==old.period||
     (row.installment||'')!==(old.installment||'')||
     (old.sourceDesc!==undefined&&row.sourceDesc!==undefined&&old.sourceDesc!==row.sourceDesc)){
   throw needsReview();
  }
 }
 return original.byKey;
}
export function importStatement(s,p,account){
 if(p.reconciliation?.status==='mismatch')throw Error('Ekstre toplamları uyuşmuyor; aktarım kaydedilmedi.');
 const a=s.accounts.find(x=>x.id===account);if(!a||a.type!=='card')throw Error('Bir kredi kartı seç.');const next=structuredClone(sanitizePdfSources(s)),key=account+'|'+p.period;
 const incoming=maskPdfRows(p.rows);
 const previous=next.transactions.filter(t=>t.statement===key);
 const priorRows=matchPdfReplay(previous,incoming);
 next.transactions=next.transactions.filter(t=>t.statement!==key);
 const candidates=[...next.transactions];
 for(const r of incoming){
  const old=priorRows.get(r.importKey);
  const category=old?.category??(['expense','refund'].includes(r.kind)?activeExpenseCategory(s,r.category):r.category);
  const row={...r,id:old?.id||id(),account,statement:key,source:'pdf',merchantName:r.desc,sourceDesc:r.sourceDesc??r.desc,desc:old&&old.desc!==old.sourceDesc?old.desc:r.desc,category,note:old?.note??'',reviewed:old?.reviewed||false};
  if(old){for(const k of ['matchStatus','matchCandidates','matchReason','linkedTo','previousLinkedTo'])if(old[k]!==undefined)row[k]=old[k];}else markCandidate(row,candidates);next.transactions.push(row);
 }
 next.statements=next.statements.filter(x=>x.id!==key);next.statements.push({id:key,account,bank:p.bank,period:p.period,cut:p.cut,due:p.due,debt:p.debt,imported:today(),reconciliationStatus:p.reconciliation?.status==='verified'?'verified':'unverified',importedMovementCount:p.rows.length});return validate(repairReferences(preferPdfAcrossCut(next)));
}
export function importCsv(s,rows,account){
 const a=s.accounts.find(a=>a.id===account);
 if(!a||a.type!=='card')throw Error('CSV için bir kredi kartı seç.');
 const next=structuredClone(s),candidates=[...next.transactions];
 const storedBatches=new Map(),incomingBatches=new Map();
 const seenSignatures=new Map(),anonymousSignatures=new Map(),seenIds=new Map(),priorOccurrences=new Map(),incomingOccurrences=new Map();
 const countOccurrence=(counts,key)=>{
  const count=(counts.get(key)??0)+1;
  counts.set(key,count);
  return count;
 };
 const sourceIdKey=row=>JSON.stringify([row.period,row.csvSourceId]);
 const remember=(row,previous=false)=>{
  const signature=csvSignature(row);
  if(!seenSignatures.has(signature))seenSignatures.set(signature,row);
  if(row.csvSourceId){
   const identity=sourceIdKey(row);
   if(!seenIds.has(identity))seenIds.set(identity,row);
   if(previous)countOccurrence(priorOccurrences,csvKeyFor(row));
  }else if(!anonymousSignatures.has(signature))anonymousSignatures.set(signature,row);
 };
 for(const row of candidates){
  if(row.account!==account||sourceOf(row)!=='csv')continue;
  remember(row,true);
  if(!row.csvSourceId)appendToGroup(storedBatches,JSON.stringify([row.period,row.csvBatchId??null]),row);
 }
 for(const receipt of s.csvDismissals??[]){
  const row=readCsvDismissal(receipt);
  if(row.account!==account)continue;
  if(row.csvSourceId){
   countOccurrence(priorOccurrences,receipt[0]);
   const identity=sourceIdKey(row);
   if(!seenIds.has(identity))seenIds.set(identity,row);
  }
  else appendToGroup(storedBatches,JSON.stringify([row.period,row.csvBatchId]),row);
 }
 const incoming=rows.map(r=>{
  const row={id:id(),account,date:r.date,period:r.period,desc:r.desc,merchantName:r.desc,sourceDesc:r.desc,
   amount:Math.abs(r.cents),kind:r.kind==='odeme'?'cardPayment':r.kind==='indirim'?'refund':'expense',category:r.category,note:'',source:'csv'};
  if(r.transactionId!==undefined){
   if(!text(r.transactionId)||!r.transactionId.trim())throw Error('CSV kaynak işlem kimliği geçersiz.');
   row.csvSourceId=r.transactionId.trim();
  }else appendToGroup(incomingBatches,row.period,row);
  return row;
 });
 const storedSignatures=new Set([...storedBatches.values()].map(csvBatchSignature));
 for(const batch of incomingBatches.values()){
  if(storedSignatures.has(csvBatchSignature(batch)))continue;
  const batchId=id();
  for(const row of batch)row.csvBatchId=batchId;
 }
 for(const row of incoming){
  if(!row.csvSourceId&&!row.csvBatchId)continue;
  const signature=csvSignature(row),sameId=row.csvSourceId?seenIds.get(sourceIdKey(row)):undefined;
  row.csvKey=csvKeyFor(row);
  if(row.csvSourceId&&countOccurrence(incomingOccurrences,row.csvKey)<=(priorOccurrences.get(row.csvKey)??0))continue;
  const ambiguous=sameId||(row.csvSourceId?anonymousSignatures:seenSignatures).get(signature);
  if(ambiguous){
   row.matchStatus='pending';
   row.matchReason=sameId?'csvSourceConflict':'csvRepeatedRow';
   row.matchCandidates=ambiguous.id?[ambiguous.id]:[];
  }else markCandidate(row,candidates);
  next.transactions.push(row);
  remember(row);
 }
 return validate(next);
}
export const BACKUP_LIMIT=32000000;
export function backupText(s){validate(s);const raw=JSON.stringify(sanitizePdfSources(s));if(new TextEncoder().encode(raw).length>BACKUP_LIMIT)throw Error('Cüzdan yedeği 32 MB sınırını aşıyor. Mevcut kayıtlar korunuyor.');return raw;}
export function readBackup(raw){if(new TextEncoder().encode(raw).length>BACKUP_LIMIT)throw Error('Yedek en fazla 32 MB olabilir.');return sanitizePdfSources(validate(JSON.parse(raw)));}
export function upcomingPayments(s,asOf=today()){
 const items=s.subscriptions.map(r=>({id:r.id,type:'subscription',name:r.name,date:r.next,amount:r.amount,estimated:false}));
 for(const account of s.accounts.filter(a=>a.type==='card')){const r=cardStatus(s,account);if(r.latest?.due&&r.statementRemaining!==0)items.push({id:r.latest.id,type:'statement',name:account.name+' · ekstre',date:r.latest.due,amount:r.statementRemaining,estimated:true});}
 return items.map(r=>({...r,days:Math.round((Date.parse(r.date)-Date.parse(asOf))/86400000)})).sort((a,b)=>a.date.localeCompare(b.date));
}
export function demo(){const s=empty(),a={id:id(),name:'Banka hesabım',type:'bank',opening:2000000},c={id:id(),name:'Deneme kartı',type:'card',opening:0};s.accounts.push(a,c);for(const [desc,amount,category] of [['Market alışverişi',42500,'Market / Gıda'],['Kahve molası',12000,'Dışarıda yeme'],['Akaryakıt',90000,'Akaryakıt']])s.transactions.push({id:id(),account:c.id,date:today(),period:today().slice(0,7),desc,amount,category,kind:'expense',note:''});return s;}
