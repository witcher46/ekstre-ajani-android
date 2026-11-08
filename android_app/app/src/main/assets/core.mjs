export const categories=['Market / Gıda','Dışarıda yeme','Akaryakıt','Fatura / İnternet','Abonelik','Oyun / Dijital','Online alışveriş','Ulaşım','Sağlık','Giyim','Ev / Kira','Eğitim','Faiz / Ücret','Diğer'];
export const id=()=>crypto.randomUUID();
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export function money(s){s=String(s).trim().replace(',','.');if(!/^-?\d{1,10}(\.\d{1,2})?$/.test(s))throw Error('Tutarı en fazla iki ondalık basamakla yaz.');const n=Math.round(Number(s)*100);if(!Number.isSafeInteger(n))throw Error('Tutar geçersiz.');return n;}
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
 if(s.incomeCategories!==undefined&&(!Array.isArray(s.incomeCategories)||s.incomeCategories.length>50000||s.incomeCategories.some(c=>!text(c)||!c.trim())||new Set(s.incomeCategories).size!==s.incomeCategories.length))throw Error('Gelir kategorileri geçersiz.');
 if(s.incomePlans!==undefined){
  if(!Array.isArray(s.incomePlans)||s.incomePlans.length>50000)throw Error('Gelir planları geçersiz.');
  const planIds=new Set();for(const p of s.incomePlans){if(!text(p.id)||!p.id||planIds.has(p.id)||!text(p.name)||!p.name.trim()||!s.accounts.some(a=>a.id===p.account&&a.type!=='card')||!cents(p.amount)||p.amount<=0||!validDate(p.next)||(p.category!==undefined&&!text(p.category))||(p.billingDay!==undefined&&(!Number.isInteger(p.billingDay)||p.billingDay<1||p.billingDay>31)))throw Error('Gelir planı geçersiz.');planIds.add(p.id);}
 }
 for(const t of s.transactions){
  validateKind(s,t);
  if(t.linkedTo){const target=s.transactions.find(r=>r.id===t.linkedTo);if(!target||target.id===t.id||target.linkedTo)throw Error('Eşleşme bağlantısı geçersiz.');}
  if(t.matchStatus&&!['pending','linked','distinct'].includes(t.matchStatus))throw Error('Eşleşme durumu geçersiz.');
  if(t.matchStatus==='linked'&&!t.linkedTo)throw Error('Eşleşme hedefi eksik.');
  if(t.matchStatus==='pending'&&(!Array.isArray(t.matchCandidates)||(!t.matchCandidates.length&&t.matchReason!=='sourceChanged')||t.matchCandidates.some(x=>!txids.has(x)||x===t.id)))throw Error('İnceleme adayı geçersiz.');
 }
 return s;
}
export const sourceOf=t=>t.source||(t.statement?'pdf':t.csvKey?'csv':'manual');
export const effective=t=>!t.linkedTo&&t.matchStatus!=='pending';
const cardAccount=t=>t.kind==='payment'?t.target:t.account;
const effectKind=t=>['payment','cardPayment'].includes(t.kind)?'cardPayment':t.kind;
const sameTerms=(a,b)=>cardAccount(a)===cardAccount(b)&&effectKind(a)===effectKind(b)&&a.amount===b.amount&&(!a.installment||!b.installment||a.installment===b.installment);
const sameEconomic=(a,b)=>sameTerms(a,b)&&(a.date===b.date||(effectKind(a)==='cardPayment'&&Math.abs(Date.parse(a.date)-Date.parse(b.date))<=3*86400000));
const normalized=s=>String(s??'').replace(/ı/g,'i').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
function originalDescription(t){if(t.sourceDesc!==undefined)return t.sourceDesc;if(t.csvKey){try{const key=JSON.parse(t.csvKey);if(key[1]&&typeof key[1]==='object'&&typeof key[1].desc==='string')return key[1].desc;}catch{}}return t.desc;}
const signature=t=>JSON.stringify([cardAccount(t),effectKind(t),t.date,t.amount,normalized(originalDescription(t)),t.installment||'']);
function matchingRows(rows,t){return rows.filter(r=>r.id!==t.id&&effective(r)&&sameEconomic(r,t)&&sourceOf(r)!==sourceOf(t));}
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
export function updateTransaction(s,t){const old=s.transactions.find(r=>r.id===t.id);if(!old)throw Error('Düzenlenecek kayıt bulunamadı.');if((old.linkedTo||s.transactions.some(r=>r.linkedTo===old.id))&&['account','target','date','period','amount','kind','installment','linkedTo','matchStatus'].some(k=>old[k]!==t[k]))throw Error('Bağlı kaydın finansal alanları değiştirilemez. Önce bağlantıyı ayır.');const next=structuredClone(s);next.transactions=next.transactions.filter(r=>r.id!==t.id);return addTransaction(next,t,{editing:true});}
function ledgerEffect(t,a){let n=0;if(t.account===a.id)n=a.type==='card'?(t.kind==='expense'?t.amount:['refund','cardPayment'].includes(t.kind)?-t.amount:0):(['income','refund'].includes(t.kind)?t.amount:-t.amount);if(t.target===a.id)n+=a.type==='card'?-t.amount:t.amount;return n;}
export function cardEffectDate(s,t){const canonical=t.linkedTo?s.transactions.find(r=>r.id===t.linkedTo)||t:t;return [canonical,...s.transactions.filter(r=>r.linkedTo===canonical.id)].find(r=>sourceOf(r)==='pdf')?.date??canonical.date;}
export function cardStatus(s,account){
 const a=s.accounts.find(a=>a.id===(typeof account==='string'?account:account.id));if(!a||a.type!=='card')throw Error('Kredi kartı bulunamadı.');
 const latest=s.statements.filter(st=>st.account===a.id).sort((x,y)=>y.cut.localeCompare(x.cut))[0];
 const currentAnchor=s.statements.filter(st=>st.account===a.id&&st.debt!==null).sort((x,y)=>y.cut.localeCompare(x.cut))[0];
 const rows=s.transactions.filter(effective),anchored=latest&&latest.debt!==null;
 const pdfDates=new Map();for(const t of s.transactions)if(sourceOf(t)==='pdf'&&!pdfDates.has(t.linkedTo||t.id))pdfDates.set(t.linkedTo||t.id,t.date);
 const dateOf=t=>pdfDates.get(t.id)??t.date;
 let current=currentAnchor?currentAnchor.debt:a.opening;
 for(const t of rows)if(!currentAnchor||dateOf(t)>currentAnchor.cut)current+=ledgerEffect(t,a);
 const paidAfterCut=anchored?rows.filter(t=>dateOf(t)>latest.cut&&cardAccount(t)===a.id&&effectKind(t)==='cardPayment').reduce((n,t)=>n+t.amount,0):0;
 return {current,statementDebt:latest?.debt??null,statementRemaining:anchored?Math.max(0,latest.debt-paidAfterCut):null,paidAfterCut,latest:latest||null,currentAnchor:currentAnchor||null,pending:s.transactions.filter(t=>t.matchStatus==='pending'&&cardAccount(t)===a.id).length};
}
export function balance(s,a){return a.type==='card'?cardStatus(s,a).current:s.transactions.filter(t=>effective(t)||(t.matchStatus==='pending'&&t.kind==='payment'&&!t.linkedTo)).reduce((n,t)=>n+ledgerEffect(t,a),a.opening);}
export function isCardTransaction(s,t){return s.accounts.find(a=>a.id===cardAccount(t))?.type==='card';}
export function reportPeriod(s,t){const group=[t,...s.transactions.filter(r=>r.linkedTo===t.id)],pdf=group.find(r=>sourceOf(r)==='pdf'),csv=group.find(r=>sourceOf(r)==='csv');return pdf?.period??csv?.period??t.period;}
export function rowsForPeriod(s,period,mode='calendar'){return s.transactions.filter(t=>effective(t)&&(mode==='statement'?reportPeriod(s,t):t.date.slice(0,7))===period&&(mode!=='statement'||isCardTransaction(s,t)));}
export function summary(s,period,mode='calendar'){
 const rows=rowsForPeriod(s,period,mode),cats=new Map();let spent=0,refunds=0,income=0;
 for(const t of rows){if(t.kind==='income')income+=t.amount;if(!['expense','refund'].includes(t.kind))continue;const n=t.kind==='refund'?-t.amount:t.amount;cats.set(t.category,(cats.get(t.category)||0)+n);if(n>=0)spent+=n;else refunds-=n;}
 return {spent,refunds,income,net:spent-refunds,categories:[...cats].sort((a,b)=>b[1]-a[1])};
}
export function nextMonth(date,anchorDay=Number(date.slice(8,10))){const d=new Date(date+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(Math.min(anchorDay,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));return d.toISOString().slice(0,10);}
export function paySubscription(s,rid,options={}){
 const r=s.subscriptions.find(r=>r.id===rid);if(!r)throw Error('Abonelik bulunamadı.');const due=options.expectedDue||r.next,paidOn=options.paidOn||today();
 if(due!==r.next||s.transactions.some(t=>t.subscriptionId===rid&&t.subscriptionDue===due))throw Error('Bu vade zaten işlendi. Abonelik ekranını yenile.');
 if(!validDate(paidOn))throw Error('Gerçek ödeme tarihini seç.');
 const next=addTransaction(s,{account:r.account,date:paidOn,desc:r.name,amount:r.amount,kind:'expense',category:r.category||'Abonelik',note:'Abonelik ödemesi',subscriptionId:rid,subscriptionDue:due});
 const sub=next.subscriptions.find(x=>x.id===rid);sub.billingDay=r.billingDay||Number(due.slice(8,10));sub.next=nextMonth(due,sub.billingDay);sub.lastPaidOn=paidOn;return next;
}
function repairReferences(s){const ids=new Set(s.transactions.map(t=>t.id));for(const t of s.transactions){if(t.linkedTo&&!ids.has(t.linkedTo)){t.previousLinkedTo=t.linkedTo;delete t.linkedTo;t.matchStatus='pending';t.matchReason='sourceChanged';t.matchCandidates=[];}if(t.matchStatus==='pending'){t.matchCandidates=(t.matchCandidates||[]).filter(x=>ids.has(x)&&x!==t.id);if(!t.matchCandidates.length)t.matchReason='sourceChanged';}}return s;}
export function resolveCandidate(s,tid,decision,targetId){
 const next=structuredClone(s),row=next.transactions.find(t=>t.id===tid);if(!row)throw Error('İncelenecek aday bulunamadı.');
 if(decision==='unlink'&&row.linkedTo){const target=row.linkedTo;row.previousLinkedTo=target;delete row.linkedTo;row.matchStatus='pending';row.matchCandidates=[target];return validate(preferPdfAcrossCut(next));}
 if(row.matchStatus!=='pending')throw Error('İncelenecek aday bulunamadı.');
 if(decision==='link'){const target=next.transactions.find(t=>t.id===targetId),previouslyConfirmed=target&&effectKind(row)==='cardPayment'&&sameTerms(row,target)&&(row.previousLinkedTo===target.id||target.previousLinkedTo===row.id);if(!target||!effective(target)||!row.matchCandidates?.includes(targetId)||(!sameEconomic(row,target)&&!previouslyConfirmed))throw Error('Geçerli ve aynı tutarlı eşleşme seç.');
  const periods=new Set([row,target,...next.transactions.filter(t=>t.linkedTo===row.id||t.linkedTo===target.id)].filter(t=>sourceOf(t)==='pdf').map(t=>t.period));if(periods.size>1)throw Error('Farklı ekstre dönemleri tek işleme bağlanamaz. Belgeleri kontrol et.');
  const canonical=sourceOf(row)==='manual'&&sourceOf(target)!=='manual'?row:target,alias=canonical===row?target:row;
  if(!canonical.installment&&alias.installment)canonical.installment=alias.installment;
  if(sourceOf(row)==='manual'&&sourceOf(target)!=='manual'){
   for(const alias of next.transactions.filter(t=>t.linkedTo===target.id))alias.linkedTo=row.id;
   target.linkedTo=row.id;target.matchStatus='linked';delete target.matchCandidates;delete row.linkedTo;delete row.matchStatus;
  }else{row.linkedTo=targetId;row.matchStatus='linked';}
 }else if(decision==='distinct'){row.matchStatus='distinct';delete row.linkedTo;}else throw Error('Aynı veya ayrı işlem kararını seç.');delete row.matchCandidates;delete row.matchReason;return validate(next);
}
export function removeTransaction(s,tid){const next=structuredClone(s);next.transactions=next.transactions.filter(t=>t.id!==tid);return validate(repairReferences(next));}
function preferPdfAcrossCut(s){
 for(const row of s.transactions.filter(t=>t.matchStatus==='pending'&&t.kind==='cardPayment'&&sourceOf(t)==='pdf')){
  const latest=s.statements.filter(st=>st.account===row.account&&st.debt!==null).sort((a,b)=>b.cut.localeCompare(a.cut))[0];if(!latest)continue;
  const candidates=s.transactions.filter(t=>row.matchCandidates?.includes(t.id)&&t.kind==='payment'&&effective(t));
  if(!candidates.some(t=>(t.date>latest.cut)!==(row.date>latest.cut)))continue;
  for(const t of candidates){t.matchStatus='pending';t.matchCandidates=[row.id];}
  delete row.matchStatus;delete row.matchCandidates;delete row.matchReason;
 }return s;
}
export function reviewLegacy(s){const next=structuredClone(s);for(const t of next.transactions){if(t.matchStatus||t.linkedTo)continue;if(sourceOf(t)==='pdf'||sourceOf(t)==='csv'){const matches=matchingRows(next.transactions,t);if(matches.length&&(t.kind==='cardPayment'||matches.some(r=>sourceOf(r)==='manual')||sourceOf(t)==='csv'))markCandidate(t,next.transactions);}}return repairReferences(preferPdfAcrossCut(next));}
export function importStatement(s,p,account){
 if(p.reconciliation?.status==='mismatch')throw Error('Ekstre toplamları uyuşmuyor; aktarım kaydedilmedi.');
 const a=s.accounts.find(x=>x.id===account);if(!a||a.type!=='card')throw Error('Bir kredi kartı seç.');const next=structuredClone(s),key=account+'|'+p.period;
 const previous=next.transactions.filter(t=>t.statement===key);next.transactions=next.transactions.filter(t=>t.statement!==key);
 const invalidated=new Set();
 for(const old of previous){if(!p.rows.some(r=>r.importKey===old.importKey&&sameEconomic({...r,account},old))){invalidated.add(old.id);const canonical=old.linkedTo?next.transactions.find(t=>t.id===old.linkedTo):null;if(canonical){canonical.matchStatus='pending';canonical.matchReason='sourceChanged';canonical.matchCandidates=[];}for(const alias of next.transactions.filter(t=>t.linkedTo===old.id)){alias.previousLinkedTo=old.id;delete alias.linkedTo;alias.matchStatus='pending';alias.matchReason='sourceChanged';alias.matchCandidates=[];}}}
 const candidates=[...next.transactions];
 for(const r of p.rows){const old=previous.find(t=>t.importKey===r.importKey),row={...r,id:old?.id||id(),account,statement:key,source:'pdf',sourceDesc:r.sourceDesc??r.desc,desc:old&&old.desc!==old.sourceDesc?old.desc:r.desc,category:old?.category??r.category,note:old?.note??'',reviewed:old?.reviewed||false};
  if(old&&!invalidated.has(old.id)){for(const k of ['matchStatus','matchCandidates','linkedTo','previousLinkedTo'])if(old[k]!==undefined)row[k]=old[k];}else markCandidate(row,candidates);next.transactions.push(row);
 }
 next.statements=next.statements.filter(x=>x.id!==key);next.statements.push({id:key,account,bank:p.bank,period:p.period,cut:p.cut,due:p.due,debt:p.debt,imported:today()});return validate(repairReferences(preferPdfAcrossCut(next)));
}
export function importCsv(s,rows,account){
 const a=s.accounts.find(a=>a.id===account);if(!a||a.type!=='card')throw Error('CSV için bir kredi kartı seç.');const next=structuredClone(s),seen=new Set(),candidates=[...next.transactions];
 for(const r of rows){const row={id:id(),account,date:r.date,period:r.period,desc:r.desc,sourceDesc:r.desc,amount:Math.abs(r.cents),kind:r.kind==='odeme'?'cardPayment':r.kind==='indirim'?'refund':'expense',category:r.category,note:'',source:'csv'};
  const old=next.transactions.find(t=>sourceOf(t)==='csv'&&!seen.has(t.id)&&signature(t)===signature(row));if(old){seen.add(old.id);continue;}
  row.csvKey=signature(row);markCandidate(row,candidates);next.transactions.push(row);seen.add(row.id);
 }return validate(next);
}
export const BACKUP_LIMIT=32000000;
export function backupText(s){validate(s);const raw=JSON.stringify(s);if(new TextEncoder().encode(raw).length>BACKUP_LIMIT)throw Error('Cüzdan yedeği 32 MB sınırını aşıyor. Mevcut kayıtlar korunuyor.');return raw;}
export function readBackup(raw){if(new TextEncoder().encode(raw).length>BACKUP_LIMIT)throw Error('Yedek en fazla 32 MB olabilir.');return validate(JSON.parse(raw));}
export function upcomingPayments(s,asOf=today()){
 const items=s.subscriptions.map(r=>({id:r.id,type:'subscription',name:r.name,date:r.next,amount:r.amount,estimated:false}));
 for(const account of s.accounts.filter(a=>a.type==='card')){const r=cardStatus(s,account);if(r.latest?.due&&r.statementRemaining!==0)items.push({id:r.latest.id,type:'statement',name:account.name+' · ekstre',date:r.latest.due,amount:r.statementRemaining,estimated:true});}
 return items.map(r=>({...r,days:Math.round((Date.parse(r.date)-Date.parse(asOf))/86400000)})).sort((a,b)=>a.date.localeCompare(b.date));
}
export function demo(){const s=empty(),a={id:id(),name:'Banka hesabım',type:'bank',opening:2000000},c={id:id(),name:'Deneme kartı',type:'card',opening:0};s.accounts.push(a,c);for(const [desc,amount,category] of [['Market alışverişi',42500,'Market / Gıda'],['Kahve molası',12000,'Dışarıda yeme'],['Akaryakıt',90000,'Akaryakıt']])s.transactions.push({id:id(),account:c.id,date:today(),period:today().slice(0,7),desc,amount,category,kind:'expense',note:''});return s;}
