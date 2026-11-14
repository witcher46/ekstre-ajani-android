import {addCents,merchantKey,money,validDate} from './core.mjs';
import {maskPaymentIdentifiers,maskPdfRows,replacePaymentIdentifiers} from './privacy.mjs';
import {signPdfIdentity} from './pdf-identity.mjs';
// Keep this normalization unchanged: 0.1.1 import keys depend on its exact output.
export function clean(s){return String(s).replace(/\u00a0/g,' ').replace(/PE(?:\(cid:\d+\)){1,3}N/gi,'PESIN').replace(/\(cid:\d+\)deme/gi,'Odeme').replace(/\(cid:\d+\)ndirim/gi,'Indirim').replace(/\(cid:\d+\)/g,'').replace(/[çğıöşüÇĞİÖŞÜ]/g,c=>({'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u','Ç':'C','Ğ':'G','İ':'I','Ö':'O','Ş':'S','Ü':'U'})[c]);}
// QNB's PDF fonts reuse control codes across glyphs. Decode only recognized labels.
// Never preprocess the raw source or legacy import keys with these replacements.
const qnbLabels = [
 [/[Öö\u0000\u0003]nceki\s+D[ö\u0000\u0002]nem(?=\s+Bakiyeniz\b)/gi,'Önceki Dönem'],
 [/\bD\u0002nem(?=\s+Borcu\b)/gi,'Dönem'],
 [/\bSon\s+\u0003deme(?=\s+Tarihi\b)/gi,'Son Ödeme'],
 [/(^|[ \t])\u0004deme(?=\s*-\s*Tesekk\u0000r\s+Ederiz\b)/gim,'$1Ödeme'],
 [/\bTesekk\u0000r(?=\s+Ederiz\b)/gi,'Teşekkür'],
 [/\bEyl\u0006l\b/gi,'Eylül'],
 [/\bA\u0006ustos\b/gi,'Ağustos'],
 [/\bEk\u0006m\b/gi,'Ekim'],
 [/\bPE[\u000e\u0010\u0011]\u0007N\b/gi,'PEŞİN'],
 [/\u0007ndirim\b/gi,'İndirim'],
 [/\bal\u0001v\s+ind\b/gi,'alışv ind'],
];
function normalizeQnbLabels(text){
 for(const [pattern,value] of qnbLabels)text=text.replace(pattern,value);
 return text;
}
const months=['ocak','subat','mart','nisan','mayis','haziran','temmuz','agustos','eylul','ekim','kasim','aralik'];
const trMoney='[+-]?(?:\\d{1,3}(?:\\.\\d{3})+|\\d+),\\d{2}', enMoney='[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}';
function date(d,m,y){m=String(m);if(!/^\d+$/.test(m)){m=({austos:'agustos',eyll:'eylul',ubat:'subat',mays:'mayis'})[m.toLowerCase()]||m.toLowerCase();m=months.indexOf(m)+1;}const s=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;return validDate(s)?s:null;}
const named='(\\d{1,2})\\s+([A-Za-z]+)\\s+(\\d{4})',numeric='(\\d{1,2})[/.](\\d{1,2})[/.](\\d{4})';
function findDate(t,label){for(const pat of [numeric,named]){const m=t.match(new RegExp(label+'\\s*:?\\s*'+pat,'i'));if(m){const d=date(...m.slice(1));if(d)return d;}}return null;}
const categoryRules=[
 ['Faiz / Ücret','FAIZ|KART UCRETI'],
 ['Fatura / İnternet','TTNET|TT NET|TURKCELL|VODAFONE|TELEKOM|FATURA'],
 ['Abonelik','NETFLIX|SPOTIFY|YOUTUBE|DISNEY'],
 ['Oyun / Dijital','STEAM|EPIC GAMES|GOOGLE PLAY'],
 ['Akaryakıt','OPET|SHELL|PETROL|AKARYAKIT'],
 ['Dışarıda yeme','CAFE|KAHVE|RESTORAN|YEMEK|BURGER|DONER'],
 ['Market / Gıda','MARKET|MIGROS|BIM|A101|CARREFOUR|CARREFOURSA|GIDA'],
 ['Online alışveriş','TRENDYOL|HEPSI|HEPSIBURADA|AMAZON|N11'],
 ['Ulaşım','TAKSI|UBER|OTOBUS|METRO'],
 ['Sağlık','ECZANE|HASTANE'],
 ['Giyim','KOTON|ZARA|DEFACTO'],
 ['Ev / Kira','KIRA|AIDAT|IKEA'],
 ['Eğitim','KITAP|OKUL|KURS'],
].map(([category,words])=>[category,new RegExp('(?:^| )(?:'+words+')(?: |$)')]);
export function categorize(desc){
 const name=merchantKey(clean(desc));
 const matches=categoryRules.filter(([,pattern])=>pattern.test(name));
 return matches.length===1?matches[0][0]:'Diğer';
}
function displayDescription(s){
 return s.replace(/\u00a0/g,' ')
  .replace(/\bPE(?:\(cid:\d+\)){1,3}N\b/gi,'PEŞİN')
  .replace(/\bPEN\s+(?=\d+\.\s*ndirim\b)/gi,'PEŞİN ')
  .replace(/\b\d+\.\s*ndirim\b/gi,'İndirim')
  .replace(/\(cid:\d+\)deme\b/gi,'Ödeme')
  .replace(/\(cid:\d+\)ndirim\b/gi,'İndirim')
  .replace(/^deme(?=\s*-\s*Tesekk[üu]?r\s+Ederiz\b)/i,'Ödeme')
  .replace(/\bTesekk[üu]?r\s+Ederiz\b/gi,'Teşekkür Ederiz')
  .replace(/\(cid:\d+\)/g,'').replace(/\s+/g,' ').trim();
}
// Keep the pre-existing redaction in the import key for legacy replays.
function legacyRedactDescription(s){return s.replace(/^\d{8}\s+/,'').replace(/(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g,'[kart]').slice(0,500)||'İşlem';}
function legacyDescription(s,inst){
 if(inst)s=s.replace(inst,'').replace(/\.?\s*Taksit/i,'').trim();
 return legacyRedactDescription(s.replace(/\b\d+\.\s*(?=Indirim)/gi,'').replace(new RegExp('\\s+'+enMoney+'\\s+al\\w*v\\s+ind\\b','gi'),' Indirim'));
}
const rowPatterns=[numeric,named].map(p=>new RegExp('^'+p+'(?:\\s+(.*))?$'));
const rowMatch=line=>rowPatterns.map(p=>line.match(p)).find(Boolean);
const previousLabels='O?nceki\\s+D[o]?nem\\s+Hesap\\s+O?zeti\\s+Borcu(?:nuz)?|O?nceki\\s+D[o]?nem\\s+Borcu(?:nuz)?|O?nceki\\s+Hesap\\s+O?zeti\\s+Borcu(?:nuz)?|O?nceki\\s+Ekstre\\s+Borcu(?:nuz)?';
const qnbCarryover='Onceki\\s+Donem\\s+Bakiyeniz';
const debtLabels='(?:(?:Bu|Toplam)\\s+)?D[o]?nem\\s+Borcu(?:nuz)?|Hesap\\s+O?zeti\\s+Borcu(?:nuz)?|Ekstre\\s+Borcu(?:nuz)?';
const cutLabel='(?:Hesap Kesim Tarihi|Hesap O?zeti Tarihi|Ekstre Kesim Tarihi)';
const dueLabel='Son\\s+O?deme Tarihi';
function headerAmount(t,labels,pattern){
 const label=t.match(new RegExp('(?:^|\\n)\\s*(?:'+labels+')\\b(?:\\s*(?:\\(TL\\)|TL|₺))?\\s*:?\\s*','i'));
 if(!label)return {value:null,present:false};
 const token=t.slice(label.index+label[0].length).match(new RegExp('^('+pattern+')(?![\\d.,])'));
 return {value:token?money(token[1]):null,present:true};
}
export function parseStatement(text){return parseStatementRows(text);}

function parseStatementRows(text,privateIdentities){
 if(typeof text!=='string'||text.length>3e6)throw Error('PDF metni çok büyük.');
 const legacy=clean(text),top=legacy.slice(0,2200).toUpperCase();
 const bank=top.includes('QNB')?'QNB':/YAPI KREDI|YAPI VE KREDI|WORLDCARD|WORLDPUAN/.test(top)?'Yapı Kredi':null;
 if(!bank)throw Error('Bu sürüm Yapı Kredi ve QNB kredi kartı ekstrelerini destekler.');
 const isQ=bank==='QNB',t=isQ?clean(normalizeQnbLabels(text)):legacy;
 const pattern=isQ?enMoney:trMoney,moneyPattern='(?<![\\d.,])'+pattern+'(?![\\d.,])',cut=findDate(t,cutLabel);
 if(!cut)throw Error('Kesim tarihi okunamadı; kayıt yapılmadı.');
 const period=cut.slice(0,7),rows=[],occurrences=new Map(),lines=t.split(/\r?\n/),rawLines=text.split(/\r?\n/);
 const legacyLines=legacy.split(/\r?\n/);
 const qnbPoints=/^ParaPuan\s+(?:Is|[\x00-\x1f]*)lemleriniz\b/i;
 const yapiPoints=/^World\s*puan\s+(?:Detaylari|Islemleriniz|Hareketleri)\b/i;
 const boundary=isQ?qnbPoints:yapiPoints;
 const rowStop=new RegExp('^(?:'+previousLabels+'|'+qnbCarryover+'|'+debtLabels+'|'+cutLabel+'|'+dueLabel+')\\b','i');
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim().replace(/\s+/g,' ');
  const nextLine=lines[i+1]?.trim();
  if(boundary.test(line)||boundary.test(line+' '+(nextLine??'')))break;
  const m=rowMatch(line);if(!m)continue;
  const d=date(...m.slice(1,4));if(!d)throw Error('Ekstrede geçersiz işlem tarihi var; kısmi kayıt yapılmadı.');
  let body=m[4]||'';
  let legacyBody=rowMatch(legacyLines[i].trim().replace(/\s+/g,' '))?.[4]??body;
  let rawBody=rawLines[i].trim().replace(/^\d{1,2}(?:[/.]\d{1,2}[/.]\d{4}|\s+\S+\s+\d{4})(?:\s+|$)/,'');
  if(!new RegExp(moneyPattern).test(body)&&body&&nextLine&&!rowMatch(nextLine)&&!rowStop.test(nextLine)&&
     !boundary.test(nextLine)&&!/(?:^|\s)Siparis\s+(?:Kodu|No)\b/i.test(nextLine)){
   body+=' '+nextLine;legacyBody+=' '+legacyLines[i+1].trim();rawBody+='\n'+rawLines[i+1].trim();i++;
  }
  const tokens=[...body.matchAll(new RegExp(moneyPattern,'g'))],rawTokens=[...rawBody.matchAll(new RegExp(moneyPattern,'g'))];
  if(!tokens.length||!rawTokens.length)throw Error('Tarihli bir işlem satırının tutarı okunamadı; kısmi kayıt yapılmadı.');
  const token=isQ?tokens.at(-1):tokens[0],rawToken=isQ?rawTokens.at(-1):rawTokens[0];
  const semanticDesc=body.slice(0,token.index).trim(),tail=body.slice(token.index+token[0].length);
  const legacyTokens=[...legacyBody.matchAll(new RegExp(moneyPattern,'g'))];
  const legacyToken=isQ?legacyTokens.at(-1):legacyTokens[0];
  const oldDesc=legacyBody.slice(0,legacyToken?.index??token.index).trim();
  const sourceDesc=maskPaymentIdentifiers(rawBody.slice(0,rawToken.index).trim());
  const afterAmount=tail.match(/^\s*(\d{1,3}\/\d{1,3})(?:\s|$)/)?.[1];
  const beforeAmount=semanticDesc.match(/\b(\d{1,3}\/\d{1,3})\s*(?:Taksit)?$/i);
  const explicitBefore=beforeAmount&&!/\b(?:REF(?:ERANS)?|SIPARIS(?:\s+KODU)?|NO)\s*[:#-]?\s*$/i.test(semanticDesc.slice(0,beforeAmount.index));
  let inst=afterAmount||(!isQ&&explicitBefore?beforeAmount[1]:'');
  if(inst){const [a,b]=inst.split('/').map(Number);if(!(a>=1&&a<=b&&b<=120))inst='';}
  let desc=displayDescription(isQ?normalizeQnbLabels(sourceDesc):sourceDesc);
  if(inst)desc=desc.replace(inst,'').replace(/\.?\s*Taksit/i,'').trim();
  desc=maskPaymentIdentifiers(desc.replace(/\b\d+\.\s*(?=İndirim)/gi,'').replace(new RegExp('\\s+'+enMoney+'\\s+al(?:is)?v\\s+ind\\b','gi'),' İndirim')).replace(/^\d{8}\s+/,'').slice(0,500)||'İşlem';
  const n=money(token[0]),semantic=clean(desc).toUpperCase(),isPayment=/^ODEME\b|^TESEKKU?R\s+EDERIZ\b/.test(semantic),kind=isPayment?'cardPayment':n<0||token[0].startsWith('+')||/\b(?:INDIRIM|IADE|IPTAL)\b|\bAL(?:IS)?V\s+IND\b/.test(semantic)?'refund':'expense';
  const key=JSON.stringify([bank,period,d,legacyDescription(oldDesc,inst),n,inst]),count=(occurrences.get(key)||0)+1;occurrences.set(key,count);
  if(privateIdentities){
   // Canonicalize separators in place and keep each identifier in its original position.
   const untagged=oldDesc.replaceAll('\0','\uFFFD');
   const privateDesc=replacePaymentIdentifiers(untagged,digits=>'\0a'+digits+'z\0');
   if(privateDesc!==untagged)privateIdentities.set(rows.length,[bank,period,d,kind,n,inst,privateDesc.replace(/\s+/g,' ').trim()]);
  }
  rows.push({date:d,period,desc,sourceDesc,amount:Math.abs(n),kind,category:isPayment?'Kart ödemesi':categorize(desc),installment:inst,importKey:key+'|'+count});
 }
 if(!rows.length)throw Error('İşlem satırları okunamadı. Metin içeren banka PDF’i seç.');
 const previous=headerAmount(t,isQ?previousLabels+'|'+qnbCarryover:previousLabels,pattern),statement=headerAmount(t,debtLabels,pattern),due=findDate(t,dueLabel),totals={expenses:0,payments:0,refunds:0},missing=[],reasons=[];
 for(const r of rows){
  const field=r.kind==='expense'?'expenses':r.kind==='cardPayment'?'payments':'refunds';
  totals[field]=addCents(totals[field],r.amount);
 }
 for(const [field,header,label] of [['previousDebt',previous,'Önceki dönem borcu'],['statementDebt',statement,'Dönem borcu']]){
  if(header.value===null){missing.push(field);reasons.push(label+' '+(header.present?'okunamadı.':'başlığı bulunamadı.'));}
 }
 const expectedDebt=previous.value===null?null:addCents(addCents(addCents(previous.value,totals.expenses),-totals.payments),-totals.refunds),difference=expectedDebt===null||statement.value===null?null:addCents(statement.value,-expectedDebt),status=missing.length?'unverified':difference===0?'verified':'mismatch';
 if(status==='mismatch')reasons.push('İşlemler ekstre borcuyla uyuşmuyor. Kayıt yapılamaz.');
 if(!due)reasons.push('Son ödeme tarihi '+(new RegExp(dueLabel,'i').test(t)?'okunamadı.':'başlığı bulunamadı.'));
 const reconciliation={status,previousDebt:previous.value,statementDebt:statement.value,expectedDebt,difference,missing,totals,reasons};
 return {bank,period,cut,due,debt:statement.value,rows:maskPdfRows(rows),reconciliation,warning:status==='unverified'?'Ekstre toplamı tam doğrulanamadı. '+reasons.join(' '):status==='mismatch'?reasons[0]:''};
}

export async function parseStatementWithIdentity(text,loadKey){
 const identities=new Map(),statement=parseStatementRows(text,identities);
 if(!identities.size)return statement;
 const key=await loadKey();
 const tagged=await Promise.all([...identities].map(async ([index,identity])=>[index,await signPdfIdentity(key,identity)]));
 const occurrences=new Map();
 for(const [index,tag] of tagged){
  const count=(occurrences.get(tag)??0)+1;
  occurrences.set(tag,count);
  statement.rows[index].importKey=tag+'|'+count;
 }
 return statement;
}
