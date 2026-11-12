// Mask plausible payment card numbers while preserving labelled transaction references.
const compactCard=/(?<![\p{L}\p{N}])[0-9]{13,19}(?![\p{L}\p{N}])/gu;
const groupedCard=/(?<![\p{L}\p{N}])(?:[0-9]{4}[\s-]+[0-9]{6}[\s-]+[0-9]{5}|(?:[0-9]{4}[\s-]+){3}[0-9]{4})(?![\p{L}\p{N}])/gu;
const cardLike=/(?<![\p{L}\p{N}])(?<![0-9][\s-])(?:[0-9][\s-]?){12,18}[0-9](?![\s-]?[0-9]|\p{L})/gu;
const referenceLabel=/(?:^|[^\p{L}\p{N}])(?:REF(?:ERANS)?|RRN|ISLEM\s*(?:NO|NUMARASI)|ONAY\s*(?:NO|KODU))[\s:#-]*$/u;

function plausibleCardNumber(value){
 const digits=value.replace(/\D/g,'');
 if(!/^[2-6]/.test(digits)||new Set(digits).size<2)return false;
 let sum=0,double=false;
 for(let i=digits.length-1;i>=0;i--){
  let digit=Number(digits[i]);
  if(double){digit*=2;if(digit>9)digit-=9;}
  sum+=digit;
  double=!double;
 }
 return sum%10===0;
}

export function maskPaymentIdentifiers(value,keepLastFour=false){
 for(const pattern of [compactCard,groupedCard,cardLike]){
  value=value.replace(pattern,(match,offset)=>{
   if(!plausibleCardNumber(match))return match;
   const prefix=value.slice(Math.max(0,offset-48),offset).normalize('NFKD')
    .replace(/\p{M}/gu,'').replace(/ı/g,'i').toUpperCase();
   if(referenceLabel.test(prefix))return match;
   return keepLastFour?'[kart:'+match.replace(/\D/g,'').slice(-4)+']':'[kart]';
  });
 }
 return value;
}

export function maskPdfSource(row){
 let masked=row;
 for(const field of ['desc','sourceDesc','merchantName','importKey']){
  if(typeof row[field]!=='string')continue;
  const value=field==='importKey'?maskImportKey(row[field]):maskPaymentIdentifiers(row[field]);
  if(value!==row[field]){
   if(masked===row)masked={...row};
   masked[field]=value;
  }
 }
 return masked;
}


function importKeyParts(value){
 return typeof value==='string'?/^(.*)\|([1-9]\d*)$/s.exec(value):null;
}
function maskImportKey(value){
 const parts=importKeyParts(value);
 if(!parts)return maskPaymentIdentifiers(value,true);
 try{
  const fields=JSON.parse(parts[1]);
  if(Array.isArray(fields)&&typeof fields[3]==='string'){
   const masked=maskPaymentIdentifiers(fields[3],true);
   if(masked===fields[3])return value;
   fields[3]=masked;
   return JSON.stringify(fields)+'|'+parts[2];
  }
 }catch{}
 return maskPaymentIdentifiers(value,true);
}

export function maskPdfRows(rows,isPdf=()=>true){
 const masked=rows.map(row=>isPdf(row)?maskPdfSource(row):row);
 if(!rows.some((row,i)=>row.importKey!==masked[i].importKey))return masked;
 const groups=new Map();
 for(const [index,row] of masked.entries()){
  if(!isPdf(row))continue;
  const safe=importKeyParts(row.importKey),original=importKeyParts(rows[index].importKey);
  if(!safe||!original)continue;
  const group=JSON.stringify([row.account,row.statement,safe[1]]);
  if(!groups.has(group))groups.set(group,[]);
  groups.get(group).push({index,safe,original,changed:rows[index].importKey!==row.importKey});
 }
 for(const entries of groups.values()){
  if(!entries.some(entry=>entry.changed)||new Set(entries.map(e=>e.safe[2])).size===entries.length)continue;
  const occupied=new Set(entries.filter(e=>!e.changed).map(e=>e.safe[2]));
  // Keep the order deterministic even if edits moved legacy transactions.
  const changed=entries.filter(e=>e.changed).sort((a,b)=>
   (a.original[1]<b.original[1]?-1:a.original[1]>b.original[1]?1:0)||Number(a.original[2])-Number(b.original[2]));
  let occurrence=1;
  for(const entry of changed){
   while(occupied.has(String(occurrence)))occurrence++;
   masked[entry.index]={...masked[entry.index],importKey:entry.safe[1]+'|'+occurrence++};
  }
 }
 return masked;
}
