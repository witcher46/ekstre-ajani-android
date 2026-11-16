import {addCents,balanceAt,cashBalanceMovementEffect,sourceOf,validDate} from './core.mjs';

const evidenceVersion = 1;
const evidencePolicy = 'cash-end-of-day-v1';
const byId = (a,b) => a.id<b.id?-1:a.id>b.id?1:0;
const validRef = value => typeof value==='string'&&value.length>0&&value.length<=200&&value===value.trim();
const unavailable = reason => ({status:'unavailable',reason});
const insufficient = reason => ({status:'insufficient',reason});
const inWindow = (date,from,through) => from<date&&date<=through;
const candidates = row => row.matchStatus==='pending'?row.matchCandidates:[];

function validClosing(closing){
  if(closing?.boundary!=='end-of-day'||typeof closing.timeZone!=='string'||
     !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(closing.timeZone))return false;
  try{
    new Intl.DateTimeFormat('en',{timeZone:closing.timeZone});
    return true;
  }catch{
    return false;
  }
}

function sameClosing(expected,actual){
  return actual?.boundary===expected.boundary&&actual.timeZone===expected.timeZone;
}

function reviewedAnchor(review,anchor){
  return review?.anchorId===anchor.id&&review.accountId===anchor.accountId&&
    review.date===anchor.observedDate&&review.amountCents===anchor.observedAmountCents&&
    review.sourceKind===anchor.sourceKind&&validRef(review.sourceRef);
}

function movementEvidence({transactions:rows,accounts},account,from,through){
  const accountIds = new Set(accounts.map(row=>row.id));
  const connected = new Map(rows.map(row=>[row.id,[]]));
  const relevant = [];
  for(const row of rows){
    if((row.account===account.id||row.target===account.id)&&inWindow(row.date,from,through)){
      relevant.push(row.id);
    }
    const peers = [...candidates(row)];
    if(row.linkedTo)peers.push(row.linkedTo);
    for(const peer of peers){
      if(!connected.has(peer))continue;
      connected.get(row.id).push(peer);
      connected.get(peer).push(row.id);
    }
  }
  const scoped = new Set(relevant);
  for(let i=0;i<relevant.length;i++){
    for(const peer of connected.get(relevant[i])){
      if(scoped.has(peer))continue;
      scoped.add(peer);
      relevant.push(peer);
    }
  }

  return rows.filter(row=>scoped.has(row.id)).sort(byId).map(row=>{
    const effect = inWindow(row.date,from,through)?cashBalanceMovementEffect(row,account):null;
    const source = sourceOf(row);
    return {
      id:row.id,
      date:row.date,
      kind:row.kind,
      accountId:row.account,
      targetId:accountIds.has(row.target)?row.target:null,
      amountCents:String(row.amount),
      source:['manual','pdf','csv'].includes(source)?source:'unknown',
      included:effect!==null,
      effectCents:effect===null?null:String(effect),
      matchStatus:row.matchStatus??null,
      linkedTo:row.linkedTo??null,
      matchCandidates:[...candidates(row)].sort(),
    };
  });
}

function assessCoverage(review,account,from,through,closing,movements){
  if(review===undefined)return {status:'unverified',reason:'missing-source-review'};
  const sourceKind = account.type==='bank'?'bankStatement':'cashJournal';
  if(review?.accountId!==account.id||review.sourceKind!==sourceKind||
     !validRef(review.sourceRef)||review.complete!==true||
     review.fromExclusive!==from||review.throughInclusive!==through||
     !sameClosing(closing,review.closing)||!Array.isArray(review.rows)){
    return insufficient('incomplete-source-scope');
  }
  if(movements.some(row=>row.matchStatus==='pending'))return insufficient('pending-match');

  const expected = new Map(movements.filter(row=>row.included).map(row=>[row.id,row]));
  if(review.rows.length!==expected.size)return insufficient('unmatched-source-rows');
  const sourceRows = new Set();
  const matches = [];
  for(const line of review.rows){
    const row = expected.get(line?.movementId);
    if(!row||!validRef(line.sourceRowId)||sourceRows.has(line.sourceRowId)||
       line.date!==row.date||!Number.isSafeInteger(line.effectCents)||String(line.effectCents)!==row.effectCents){
      return insufficient('unmatched-source-rows');
    }
    expected.delete(row.id);
    sourceRows.add(line.sourceRowId);
    matches.push({id:row.id,sourceRowId:line.sourceRowId});
  }
  return {status:'source-supported',sourceKind,sourceRef:review.sourceRef,matches:matches.sort(byId)};
}

function observationEvidence(row){
  return {id:row.id,date:row.observedDate,amountCents:String(row.observedAmountCents),sourceKind:row.sourceKind};
}

// Inputs are a validated wallet and caller-supplied reviews of independent sources.
// Matching attests to the supplied rows and scope. The motor cannot authenticate their origin.
export function compareBalanceObservation(state,observationId,{
  anchorId,anchorReview,observationClosing,coverageReview,
}={}){
  const records = state.version===2?state.balanceReconciliation.observations:[];
  const observation = records.find(row=>row.id===observationId);
  if(!observation)return unavailable('missing-observation');
  if(observation.role!=='observation')return unavailable('invalid-observation');
  const account = state.accounts.find(row=>row.id===observation.accountId);
  if(!account||!['bank','cash'].includes(account.type))return unavailable('invalid-observation');

  const anchor = records.find(row=>row.id===anchorId);
  if(!anchor)return unavailable('missing-anchor');
  if(anchor.role!=='anchor'||anchor.id===observation.id||anchor.accountId!==account.id||
     !validDate(anchor.observedDate)||anchor.observedDate>=observation.observedDate){
    return unavailable('invalid-anchor');
  }
  if(!reviewedAnchor(anchorReview,anchor))return unavailable('unconfirmed-anchor');
  if(!validClosing(observationClosing)||!sameClosing(observationClosing,anchorReview.closing)){
    return unavailable('closing-mismatch');
  }

  const from = anchor.observedDate;
  const through = observation.observedDate;
  const observedCents = observation.observedAmountCents;
  const calculatedCents = balanceAt(state,account.id,through,{
    anchor:{accountId:account.id,date:from,amountCents:anchor.observedAmountCents},
  }).amountCents;
  const differenceCents = addCents(observedCents,-calculatedCents);
  const movements = movementEvidence(state,account,from,through);
  const coverage = assessCoverage(coverageReview,account,from,through,observationClosing,movements);
  const evidence = {
    version:evidenceVersion,
    policy:evidencePolicy,
    accountId:account.id,
    accountType:account.type,
    anchor:{...observationEvidence(anchor),sourceRef:anchorReview.sourceRef},
    observation:observationEvidence(observation),
    interval:{fromExclusive:from,throughInclusive:through,boundary:observationClosing.boundary,timeZone:observationClosing.timeZone},
    calculatedCents:String(calculatedCents),
    differenceCents:String(differenceCents),
    coverage,
    movements,
  };
  return {status:'calculated',observedCents,calculatedCents,differenceCents,coverage,evidence};
}

export function evaluateBalanceComparisonEvidence(state,observationId,previous,options){
  if(previous?.version!==evidenceVersion||previous.policy!==evidencePolicy){
    return {status:'review-required',reason:'unsupported-evidence'};
  }
  if(previous.coverage?.status!=='source-supported'){
    return {status:'review-required',reason:'insufficient-previous-coverage'};
  }
  const comparison = compareBalanceObservation(state,observationId,options);
  if(comparison.status!=='calculated'||comparison.coverage.status!=='source-supported'){
    return {status:'review-required',reason:'comparison-changed',comparison};
  }
  try{
    if(JSON.stringify(previous)===JSON.stringify(comparison.evidence))return {status:'current',comparison};
  }catch{
    return {status:'review-required',reason:'invalid-evidence',comparison};
  }
  return {status:'review-required',reason:'comparison-changed',comparison};
}
