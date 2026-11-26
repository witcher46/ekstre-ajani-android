import {backupText,id,readBackup,reviewLegacy} from './core.mjs';
import {compareBalanceObservation,evaluateBalanceComparisonEvidence} from './balance-reconciliation.mjs';
import {sha256} from './sha256.mjs';

const pendingReviews = new WeakMap();
const reviewRequired = () => ({status:'review-required'});
const storageUnavailable = () => ({status:'storage-unavailable'});

export function readBalanceApprovalSnapshot(android){
  try{
    const snapshot = android?.loadForCompare();
    if(typeof snapshot!=='string'||!(/^[a-f0-9]{64}\n/.test(snapshot)))return null;
    return {token:snapshot.slice(0,64),state:readBackup(snapshot.slice(65))};
  }catch{
    return null;
  }
}

function freezeComparison(value){
  if(value&&typeof value==='object'){
    Object.values(value).forEach(freezeComparison);
    Object.freeze(value);
  }
  return value;
}

function reviewDisplay(state,comparison){
  if(comparison.status!=='calculated')return {};
  const {accountId,movements} = comparison.evidence;
  const scoped = new Set(movements.map(row=>row.id));
  const movementLabels = Object.fromEntries(state.transactions.filter(row=>scoped.has(row.id)).map(row=>[row.id,row.desc]));
  const accountLabels = Object.freeze(Object.fromEntries(state.accounts.map(row=>[row.id,row.name])));
  return {accountName:accountLabels[accountId],accountLabels,movementLabels:Object.freeze(movementLabels)};
}

export function prepareBalanceApproval(android,observationId,options,expectedSnapshotToken){
  if(typeof android?.saveIfUnchanged!=='function')return storageUnavailable();
  const snapshot = readBalanceApprovalSnapshot(android);
  if(!snapshot)return storageUnavailable();
  if(expectedSnapshotToken!==undefined&&snapshot.token!==expectedSnapshotToken){
    return {...reviewRequired(),reason:'snapshot-changed'};
  }

  const inputs = structuredClone(options);
  const wallet = reviewLegacy(snapshot.state);
  const comparison = freezeComparison(compareBalanceObservation(wallet,observationId,inputs));
  const display = reviewDisplay(wallet,comparison);
  if(comparison.coverage?.status!=='source-supported')return {...reviewRequired(),comparison,...display};

  const review = Object.freeze({status:'prepared',comparison,...display});
  pendingReviews.set(review,{android,observationId,inputs,token:snapshot.token});
  return review;
}

function previousApproval(approvals,evidence){
  for(let index=approvals.length-1;index>=0;index--){
    const approval = approvals[index];
    const stored = JSON.parse(approval.evidenceJson);
    if(stored.accountId===evidence.accountId&&stored.observation.id===evidence.observation.id)return approval;
  }
  return null;
}

export function saveBalanceApproval(android,review,independentlyReviewed){
  const pending = pendingReviews.get(review);
  if(independentlyReviewed!==true||!pending||pending.android!==android)return reviewRequired();
  // One attempt per explicit review, including failed writes and reentrant requests.
  pendingReviews.delete(review);

  const current = readBalanceApprovalSnapshot(android);
  if(!current)return storageUnavailable();

  const validation = evaluateBalanceComparisonEvidence(
    reviewLegacy(current.state),pending.observationId,review.comparison.evidence,pending.inputs,
  );
  // The exact read also binds labels and descriptions that are outside evidence v1.
  if(validation.status!=='current'||current.token!==pending.token)return reviewRequired();

  try{
    const evidence = validation.comparison.evidence;
    const existing = current.state.version>=3?current.state.balanceReconciliation.approvals:[];
    const previous = previousApproval(existing,evidence);
    const approvedAt = new Date().toISOString();
    if(previous&&approvedAt<previous.approvedAt){
      return {status:'clock-behind',previousApprovedAt:previous.approvedAt};
    }
    const evidenceJson = JSON.stringify(evidence);
    const approval = {
      id:id(),approvedAt,previousApprovalId:previous?.id??null,
      evidenceJson,evidenceSha256:sha256(evidenceJson),
    };
    const state = {...current.state,version:Math.max(current.state.version,3),balanceReconciliation:{
      ...current.state.balanceReconciliation,approvals:[...existing,approval],
    }};
    if(android.saveIfUnchanged(current.token,backupText(state))!==true)return reviewRequired();
    return {status:'saved',state};
  }catch{
    return storageUnavailable();
  }
}
