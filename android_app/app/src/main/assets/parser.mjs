import {categories,validDate} from './core.mjs';
export function clean(s){return String(s).replace(/\u00a0/g,' ').replace(/PE(?:\(cid:\d+\)){1,3}N/gi,'PESIN').replace(/\(cid:\d+\)deme/gi,'Odeme').replace(/\(cid:\d+\)ndirim/gi,'Indirim').replace(/\(cid:\d+\)/g,'').replace(/[çğıöşüÇĞİÖŞÜ]/g,c=>({'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u','Ç':'C','Ğ':'G','İ':'I','Ö':'O','Ş':'S','Ü':'U'})[c]);}
const months=['ocak','subat','mart','nisan','mayis','haziran','temmuz','agustos','eylul','ekim','kasim','aralik'];
const trMoney='[+-]?(?:\\d{1,3}(?:\\.\\d{3})+|\\d+),\\d{2}', enMoney='[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}';
function amount(s,numeric){return Math.round(Number(s.replaceAll(numeric?',':'.','').replace(',','.'))*100);}
function date(d,m,y){m=String(m);if(!/^\d+$/.test(m)){m=({austos:'agustos',eyll:'eylul',ubat:'subat',mays:'mayis'})[m.toLowerCase()]||m.toLowerCase();m=months.indexOf(m)+1;}const s=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;return validDate(s)?s:null;}
const named='(\\d{1,2})\\s+([A-Za-z]+)\\s+(\\d{4})',numeric='(\\d{1,2})[/.](\\d{1,2})[/.](\\d{4})';
function findDate(t,label){for(const pat of [numeric,named]){const m=t.match(new RegExp(label+'\\s*:?\\s*'+pat,'i'));if(m){const d=date(...m.slice(1));if(d)return d;}}return null;}
export function categorize(desc){const rules=[['Faiz / Ücret','FAIZ|KART UCRETI'],['Fatura / İnternet','TTNET|TT NET|TURKCELL|VODAFONE|TELEKOM|FATURA'],['Abonelik','NETFLIX|SPOTIFY|YOUTUBE|DISNEY'],['Oyun / Dijital','STEAM|EPIC GAMES|GOOGLE PLAY'],['Akaryakıt','OPET|SHELL|PETROL|AKARYAKIT'],['Dışarıda yeme','CAFE|KAHVE|RESTORAN|YEMEK|BURGER|DONER'],['Market / Gıda','MARKET|MIGROS|BIM|A101|CARREFOUR|GIDA'],['Online alışveriş','TRENDYOL|HEPSI|AMAZON|N11'],['Ulaşım','TAKSI|UBER|OTOBUS|METRO'],['Sağlık','ECZANE|HASTANE'],['Giyim','KOTON|ZARA|DEFACTO'],['Ev / Kira','KIRA|AIDAT|IKEA'],['Eğitim','KITAP|OKUL|KURS']];return rules.find(([,r])=>new RegExp(r).test(clean(desc).toUpperCase()))?.[0]||'Diğer';}
export function parseStatement(text){
 if(typeof text!=='string'||text.length>3e6)throw Error('PDF metni çok büyük.');const t=clean(text),top=t.slice(0,2200).toUpperCase();const bank=top.includes('QNB')?'QNB':/YAPI KREDI|YAPI VE KREDI|WORLDCARD|WORLDPUAN/.test(top)?'Yapı Kredi':null;
 if(!bank)throw Error('Bu sürüm Yapı Kredi ve QNB kredi kartı ekstrelerini destekler.');
 const isQ=bank==='QNB',pattern=isQ?enMoney:trMoney,cut=findDate(t,'Hesap Kesim Tarihi');if(!cut)throw Error('Kesim tarihi okunamadı; kayıt yapılmadı.');const period=cut.slice(0,7),rows=[],occurrences=new Map(),lines=t.split(/\r?\n/);
 const start=new RegExp('^'+(isQ?numeric:named)+'\\s+(.+)$');
 for(let i=0;i<lines.length;i++){const line=lines[i].trim().replace(/\s+/g,' ');if(isQ&&/^ParaPuan\s+.*lemleriniz/i.test(line))break;const m=line.match(start);if(!m)continue;const d=date(...m.slice(1,4));if(!d)continue;let body=m[4];if(!new RegExp(pattern).test(body)&&lines[i+1]&&!start.test(lines[i+1].trim()))body+=' '+lines[i+1].trim();const tokens=[...body.matchAll(new RegExp(pattern,'g'))];if(!tokens.length)continue;const token=isQ?tokens.at(-1):tokens[0];let desc=body.slice(0,token.index).trim(),tail=body.slice(token.index+token[0].length),inst=(isQ?tail.match(/^\s*(\d{1,3}\/\d{1,3})(?:\s|$)/):(desc+' '+tail).match(/\b(\d{1,3}\/\d{1,3})\b/))?.[1]||'';
 if(inst){const [a,b]=inst.split('/').map(Number);if(!(a>=1&&a<=b&&b<=120))inst='';else desc=desc.replace(inst,'').replace(/\.?\s*Taksit/i,'').trim();}
 const n=amount(token[0],isQ),isPayment=/^(?:ODEME|DEME)\b|TESEKK[U]?R/i.test(desc);const kind=isPayment?'income':n<0||token[0].startsWith('+')||/INDIRIM|IADE|IPTAL|AL\w*V\s+IND/i.test(desc)?'refund':'expense';
 desc=desc.replace(/^\d{8}\s+/,'').replace(/\b\d+\.\s*(?=Indirim)/gi,'').replace(new RegExp('\\s+'+enMoney+'\\s+al\\w*v\\s+ind\\b','gi'),' Indirim').replace(/(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g,'[kart]').slice(0,500)||'İşlem';
 const key=JSON.stringify([bank,period,d,desc,n,inst]),count=(occurrences.get(key)||0)+1;occurrences.set(key,count);
 rows.push({date:d,period,desc,amount:Math.abs(n),kind:isPayment?'cardPayment':kind,category:isPayment?'Kart ödemesi':categorize(desc),installment:inst,importKey:key+'|'+count});
 }
 const headerAmount=label=>{const m=t.match(new RegExp(label+'\\s*:?\\s*('+pattern+')','i'));return m?amount(m[1],isQ):null;};
 const debt=headerAmount('D\\w{0,2}nem Borcu'),previous=headerAmount('Onceki Donem Hesap Ozeti Borcu');
 if(!rows.length)throw Error('İşlem satırları okunamadı. Metin içeren banka PDF’i seç.');
 const total=rows.reduce((n,r)=>n+(r.kind==='expense'?r.amount:-r.amount),0);
 if(previous!==null&&debt!==null&&previous+total!==debt)throw Error('İşlemler ekstre borcuyla uyuşmuyor. Kısmi aktarım yapılmadı.');
 const due=findDate(t,'Son\\s+\\w*deme Tarihi');
 return {bank,period,cut,due,debt,rows,warning:previous===null||debt===null?'Ekstre toplamı tam doğrulanamadı. Önizlemeyi bankanın belgesiyle karşılaştır.':''};
}
