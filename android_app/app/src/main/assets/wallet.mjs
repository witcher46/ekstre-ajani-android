import * as C from './core.mjs';

const incomeCategories=['Maaş','Serbest çalışma','Diğer gelir'];
const cardId=t=>t.kind==='payment'?t.target:t.account;
const isPayment=t=>t.kind==='payment'||t.kind==='cardPayment';
const bankMovement=t=>!t.linkedTo&&(C.effective(t)||(t.kind==='payment'&&t.matchStatus==='pending'));
const pairs=m=>[...m].sort((a,b)=>C.compareCents(b[1],a[1]));
const total=rows=>rows.reduce((n,t)=>C.addCents(n,t.amount),0);

// Defaults are added to a detached copy. Reading a v1 wallet never migrates it.
export function normalizeWallet(s){
 const next=structuredClone(s);
 if(next.incomePlans===undefined)next.incomePlans=[];
 if(next.incomeCategories===undefined)next.incomeCategories=[...incomeCategories];
 return C.validate(next);
}

function paymentRows(s){
 const manuals=s.transactions.filter(t=>t.kind==='payment'&&bankMovement(t));
 return [...manuals,...s.transactions.filter(t=>t.kind==='cardPayment'&&C.effective(t)&&!manuals.some(m=>m.matchCandidates?.includes(t.id)||t.matchCandidates?.includes(m.id)))];
}

function periodFigures(s,period,account){
 const rows=C.rowsForPeriod(s,period).filter(t=>!account||t.account===account.id);
 const cats=new Map(),incomeCats=new Map();let income=0,spent=0,refunds=0,cashIn=0,cashOut=0,transfers=0;
 for(const t of rows){
  if(t.kind==='income'){income=C.addCents(income,t.amount);incomeCats.set(t.category,C.addCents(incomeCats.get(t.category)||0,t.amount));}
  if(t.kind==='expense'||t.kind==='refund'){const n=t.kind==='refund'?-t.amount:t.amount;cats.set(t.category,C.addCents(cats.get(t.category)||0,n));if(t.kind==='refund')refunds=C.addCents(refunds,t.amount);else spent=C.addCents(spent,t.amount);}
 }
 for(const t of s.transactions.filter(t=>bankMovement(t)&&t.date.slice(0,7)===period)){
  if(t.kind==='transfer'){
   if(!account||t.account===account.id||t.target===account.id)transfers=C.addCents(transfers,t.amount);
   if(account&&t.account===account.id)cashOut=C.addCents(cashOut,t.amount);
   if(account&&t.target===account.id)cashIn=C.addCents(cashIn,t.amount);
   continue;
  }
  const a=s.accounts.find(a=>a.id===t.account);
  if(a?.type==='card'||(account&&t.account!==account.id))continue;
  if(t.kind==='income'||t.kind==='refund')cashIn=C.addCents(cashIn,t.amount);
  else if(t.kind==='expense'||t.kind==='payment')cashOut=C.addCents(cashOut,t.amount);
 }
 const payments=paymentRows(s).filter(t=>t.date.slice(0,7)===period&&(!account||(account.type==='card'?cardId(t)===account.id:t.account===account.id)));
 const plannedIncome=total((s.incomePlans||[]).filter(p=>p.next.slice(0,7)===period&&(!account||p.account===account.id)));
 const netExpense=C.addCents(spent,-refunds);
 return {income,spent,refunds,netExpense,margin:C.addCents(income,-netExpense),cashIn,cashOut,cardPayments:total(payments),transfers,incomeByCategory:pairs(incomeCats),categories:pairs(cats),plannedIncome};
}

export function overview(s,period){
 const cash=s.accounts.filter(a=>a.type!=='card').reduce((n,a)=>C.addCents(n,C.balance(s,a)),0);
 let cardDebt=0,cardCredit=0;for(const a of s.accounts.filter(a=>a.type==='card')){const b=C.cardStatus(s,a).current;cardDebt=C.addCents(cardDebt,C.positiveCents(b));cardCredit=C.addCents(cardCredit,C.positiveCents(-b));}
 return {cash,cardDebt,cardCredit,netWorth:C.addCents(C.addCents(cash,-cardDebt),cardCredit),...periodFigures(s,period)};
}

export function accountOverview(s,accountId,period){
 const a=s.accounts.find(a=>a.id===accountId);if(!a)throw Error('Hesap bulunamadı.');
 const balance=C.balance(s,a),cardDebt=a.type==='card'?C.positiveCents(balance):0,cardCredit=a.type==='card'?C.positiveCents(-balance):0,cash=a.type==='card'?0:balance;
 return {balance,cash,cardDebt,cardCredit,netWorth:C.addCents(C.addCents(cash,-cardDebt),cardCredit),...periodFigures(s,period,a)};
}

function sourceGroups(s){
 const groups=new Map();for(const t of s.transactions)if(t.linkedTo){if(!groups.has(t.linkedTo))groups.set(t.linkedTo,[]);groups.get(t.linkedTo).push(t);}
 const aliases=id=>groups.get(id)||[];
 return {aliases,dateOf:C.cardDates(s)};
}

export function cardDetail(s,accountId){
 const status=C.cardStatus(s,accountId),sources=sourceGroups(s),movements=s.transactions.filter(t=>C.effective(t)&&cardId(t)===accountId).map(t=>({...t,cardDate:sources.dateOf(t),sources:sources.aliases(t.id).map(r=>({...r}))})).sort((a,b)=>b.cardDate.localeCompare(a.cardDate));
 const today=C.today();
 const afterCut=status.latest?movements.filter(t=>t.cardDate>status.latest.cut&&(!t.installmentPlan||t.cardDate<=today)):[];
 return {...status,debt:C.positiveCents(status.current),credit:C.positiveCents(-status.current),postCutExpenses:total(afterCut.filter(t=>t.kind==='expense')),postCutRefunds:total(afterCut.filter(t=>t.kind==='refund')),unassignedPayments:movements.filter(t=>t.kind==='cardPayment'&&C.sourceOf(t)!=='manual'),movements,installments:installmentOverview(s,accountId)};
}

export function addIncomePlan(s,plan){
 const next=normalizeWallet(s),row={...structuredClone(plan),id:plan.id||C.id()};
 next.incomePlans.push(row);return C.validate(next);
}

export function receiveIncome(s,planId,{receivedOn,expectedDue,account}={}){
 const next=normalizeWallet(s),plan=next.incomePlans.find(p=>p.id===planId);if(!plan)throw Error('Gelir planı bulunamadı.');
 if(!C.validDate(receivedOn))throw Error('Gerçek gelir tarihini seç.');
 if(!expectedDue||expectedDue!==plan.next||next.transactions.some(t=>t.incomePlanId===planId&&t.incomePlanDue===expectedDue))throw Error('Bu gelir vadesi zaten işlendi veya değişti. Planı yenile.');
 const result=C.addTransaction(next,{account:account||plan.account,date:receivedOn,period:receivedOn.slice(0,7),desc:plan.name,amount:plan.amount,kind:'income',category:plan.category||'Diğer gelir',note:'Planlanan gelir alındı',incomePlanId:planId,incomePlanDue:expectedDue});
 const updated=result.incomePlans.find(p=>p.id===planId);updated.billingDay=plan.billingDay||Number(expectedDue.slice(8,10));updated.next=C.nextMonth(expectedDue,updated.billingDay);updated.lastReceivedOn=receivedOn;return C.validate(result);
}

export function attachPaymentSource(s,transactionId,bankId,{paidOn}={}){
 const row=s.transactions.find(t=>t.id===transactionId),bank=s.accounts.find(a=>a.id===bankId);
 if(!row||row.kind!=='cardPayment'||C.sourceOf(row)==='manual'||!C.effective(row))throw Error('Kaynak banka yalnızca bağlanmamış ekstre ödemesine eklenir.');
 if(!bank||bank.type==='card')throw Error('Bir banka veya nakit hesabı seç.');
 if(!C.validDate(paidOn))throw Error('Gerçek banka ödeme tarihini seç.');
 const needsReview=s.transactions.some(t=>t.kind==='payment'&&t.target===row.account&&t.amount===row.amount&&(t.matchCandidates?.includes(row.id)||row.matchCandidates?.includes(t.id)||(t.matchStatus!=='distinct'&&row.matchStatus!=='distinct'&&(Math.abs(Date.parse(t.date)-Date.parse(row.date))<=3*86400000||t.date===paidOn))));
 if(needsReview)throw Error('Bu ödeme için mevcut banka hareketini önce eşleşme incelemesinden onayla.');
 const next=C.addTransaction(s,{account:bankId,target:row.account,date:paidOn,period:paidOn.slice(0,7),desc:row.desc,amount:row.amount,kind:'payment',category:'Kart ödemesi',note:'Ekstre ödemesine kaynak hesap bağlandı',matchStatus:'distinct'});
 const manual=next.transactions.at(-1),group=[next.transactions.find(t=>t.id===transactionId),...next.transactions.filter(t=>t.linkedTo===transactionId)];
 delete manual.matchStatus;
 for(const alias of group){alias.linkedTo=manual.id;alias.matchStatus='linked';delete alias.matchCandidates;delete alias.matchReason;}
 C.repointCandidates(next,group.map(t=>t.id),manual.id);
 return C.validate(next);
}

export function installmentOverview(s,accountId,{asOf=C.today()}={}){
 const groups=new Map(),plans=new Map(),monthOf=C.calendarPeriods(s),dateOf=C.cardDates(s);
 const rows=s.transactions.filter(t=>cardId(t)===accountId&&t.kind==='expense'&&t.installment&&(t.installmentPlan||C.effective(t)));
 for(const t of rows){
  if(t.installmentPlan){
   if(!plans.has(t.installmentPlan))plans.set(t.installmentPlan,[]);
   plans.get(t.installmentPlan).push(t);
   continue;
  }
  const [current,count]=t.installment.split('/').map(Number);if(current<1||count<current)continue;
  const period=monthOf(t),month=Number(period.slice(0,4))*12+Number(period.slice(5,7))-current;
  const name=String(t.sourceDesc??t.desc).replace(/\b\d{1,3}\/\d{1,3}\b/g,'').replace(/\s+/g,' ').trim().toLocaleUpperCase('tr');
  const key=JSON.stringify([name,t.amount,count,month]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({t,current,total:count});
 }
 const items=[];
 for(const group of groups.values()){
  const ambiguous=new Set(group.map(r=>r.current)).size!==group.length;
  const partitions=ambiguous?group.map(r=>[r]):[group];
  for(const part of partitions){const latest=part.reduce((a,b)=>a.current>b.current?a:b),remaining=latest.total-latest.current;
   items.push({id:latest.t.id,desc:latest.t.desc,amount:latest.t.amount,current:latest.current,total:latest.total,remaining,postedExpense:total(part.map(r=>r.t)),estimatedFutureLiability:remaining*latest.t.amount,estimated:true,ambiguous,transactionIds:part.map(r=>r.t.id)});
  }
 }
 const estimatedFutureLiability=items.reduce((n,r)=>C.addCents(n,r.estimatedFutureLiability),0);
 let plannedFutureLiability=0;
 for(const [id,plan] of plans){
  plan.sort((a,b)=>a.date.localeCompare(b.date));
  const posted=plan.filter(t=>dateOf(t)<=asOf&&C.effective(t)),future=plan.filter(t=>dateOf(t)>asOf);
  const latest=posted.at(-1)??plan[0],remaining=total(future);
  plannedFutureLiability=C.addCents(plannedFutureLiability,remaining);
  items.push({id,desc:latest.desc,amount:latest.amount,current:posted.length,total:plan.length,
   remaining:future.length,postedExpense:total(posted),plannedFutureLiability:remaining,estimated:false,
   transactionIds:plan.map(t=>t.id)});
 }
 const postedExpense=total(rows.filter(t=>!t.installmentPlan||(dateOf(t)<=asOf&&C.effective(t))));
 return {postedExpense,estimatedFutureLiability,plannedFutureLiability,estimated:true,ambiguous:items.some(r=>r.ambiguous),items};
}
