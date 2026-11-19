import {reviewLegacy} from './core.mjs';
import {balanceEvidenceVersion,balanceEvidencePolicy,readBalanceApprovalEvidence} from './balance-approval-storage.mjs';
import {evaluateBalanceComparisonEvidence} from './balance-reconciliation.mjs';

const unavailable = reason => ({status:'unavailable',reason,canReview:false});

function storedEvidence(approval){
  try{
    const parsed = JSON.parse(approval.evidenceJson);
    if(parsed.version!==balanceEvidenceVersion||parsed.policy!==balanceEvidencePolicy){
      return {error:unavailable('unsupported-evidence')};
    }
    const evidence = readBalanceApprovalEvidence(approval);
    return evidence?{evidence}:{error:unavailable('invalid-evidence')};
  }catch{
    return {error:unavailable('invalid-evidence')};
  }
}

function sourceReview(evidence){
  const {accountId,anchor,interval,coverage,movements} = evidence;
  const closing = {boundary:interval.boundary,timeZone:interval.timeZone};
  const matches = new Map(coverage.matches.map(row=>[row.id,row.sourceRowId]));
  // These dates and effects were matched to independent source rows at approval.
  // Read them from the archive so live edits cannot become new source evidence.
  return {
    anchorId:anchor.id,
    observationClosing:closing,
    anchorReview:{
      anchorId:anchor.id,accountId,date:anchor.date,amountCents:Number(anchor.amountCents),
      sourceKind:anchor.sourceKind,sourceType:anchor.sourceType,sourceRef:anchor.sourceRef,closing,
    },
    coverageReview:{
      accountId,fromExclusive:interval.fromExclusive,throughInclusive:interval.throughInclusive,
      closing,sourceKind:coverage.sourceKind,sourceRef:coverage.sourceRef,complete:true,
      rows:movements.filter(row=>row.included).map(row=>({
        movementId:row.id,sourceRowId:matches.get(row.id),date:row.date,effectCents:Number(row.effectCents),
      })),
    },
  };
}

function evaluateEvidence(wallet,evidence){
  if(!wallet)return unavailable('storage-unavailable');
  const account = wallet.accounts.find(row=>row.id===evidence.accountId);
  if(!account)return unavailable('missing-account');
  const observations = wallet.version>=2?wallet.balanceReconciliation.observations:[];
  const observation = observations.find(row=>row.id===evidence.observation.id);
  if(!observation)return unavailable('missing-observation');
  const anchor = observations.find(row=>row.id===evidence.anchor.id);
  if(!anchor)return unavailable('missing-anchor');
  if(observation.role!=='observation'||observation.accountId!==evidence.accountId){
    return {status:'review-required',reason:'changed-observation',canReview:false};
  }
  if(anchor.role!=='anchor'||anchor.accountId!==evidence.accountId||anchor.observedDate>=observation.observedDate){
    return {status:'review-required',reason:'changed-anchor',canReview:false};
  }
  if(account.type!==evidence.accountType){
    return {status:'review-required',reason:'changed-account',canReview:false};
  }
  const result = evaluateBalanceComparisonEvidence(wallet,observation.id,evidence,sourceReview(evidence));
  return {
    status:result.status,
    reason:result.status==='current'?'evidence-current':
      result.comparison.coverage?.reason==='pending-match'?'pending-match':'comparison-changed',
    canReview:true,
  };
}

// Inputs are a validated current wallet and a stored proof. No storage writes occur.
export function evaluateStoredBalanceApproval(state,approval){
  const archive = storedEvidence(approval);
  if(archive.error)return archive.error;
  return evaluateEvidence(state?reviewLegacy(state):null,archive.evidence);
}

export function balanceApprovalHistory(state,accountId,currentState=state,{offset=0,limit=Infinity,approvalId}={}){
  if(state.version!==3)return [];
  const rows = state.balanceReconciliation.approvals.map((approval,index)=>({
    approval,index,evidence:readBalanceApprovalEvidence(approval),
  })).filter(row=>row.evidence?.accountId===accountId&&(approvalId===undefined||row.approval.id===approvalId));
  rows.sort((a,b)=>b.approval.approvedAt.localeCompare(a.approval.approvedAt)||b.index-a.index);
  const wallet = currentState?reviewLegacy(currentState):null;
  const evaluated = new Map();
  return rows.slice(offset,offset+limit).map(({approval,evidence})=>{
    if(!evaluated.has(approval.evidenceJson))evaluated.set(approval.evidenceJson,evaluateEvidence(wallet,evidence));
    return {approval,evidence,evaluation:evaluated.get(approval.evidenceJson)};
  });
}
