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

export function maskPaymentIdentifiers(value){
 for(const pattern of [compactCard,groupedCard,cardLike]){
  value=value.replace(pattern,(match,offset)=>{
   if(!plausibleCardNumber(match))return match;
   const prefix=value.slice(Math.max(0,offset-48),offset).normalize('NFKD')
    .replace(/\p{M}/gu,'').replace(/ı/g,'i').toUpperCase();
   return referenceLabel.test(prefix)?match:'[kart]';
  });
 }
 return value;
}

export function maskPdfSource(row){
 let masked=row;
 for(const field of ['desc','sourceDesc','merchantName','importKey']){
  if(typeof row[field]!=='string')continue;
  const value=maskPaymentIdentifiers(row[field]);
  if(value!==row[field]){
   if(masked===row)masked={...row};
   masked[field]=value;
  }
 }
 return masked;
}
