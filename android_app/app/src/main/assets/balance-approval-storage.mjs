import {sha256} from './sha256.mjs';

export const balanceEvidenceVersion = 1;
export const balanceEvidencePolicy = 'cash-end-of-day-v1';

const id = value => typeof value==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(value);
const walletId = value => typeof value==='string'&&value.length<=200;
const ref = value => typeof value==='string'&&value.length>0&&value.length<=200&&value.trim()===value;
const cents = value => typeof value==='string'&&/^(?:0|-?[1-9][0-9]{0,17})$/.test(value);
const safeCents = value => cents(value)&&Number.isSafeInteger(Number(value));
const instant = value => typeof value==='string'&&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&
  Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const date = value => typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const ordinalList = (rows,key) => rows.every((row,i)=>i===0||rows[i-1][key]<row[key]);
const list = value => Array.isArray(value)&&value.length<=50000;
const fields = (obj,names) => obj&&typeof obj==='object'&&Object.keys(obj).join(' ')===names;

function supportedZone(zone){
  if(typeof zone!=='string'||zone.length>200||!/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(zone))return false;
  try{
    new Intl.DateTimeFormat('en',{timeZone:zone});
    return true;
  }catch{
    return false;
  }
}

function validPoint(row,bank,anchor=false){
  const keys = 'id date amountCents sourceKind'+(anchor?' sourceType sourceRef':'');
  return fields(row,keys)&&id(row.id)&&date(row.date)&&safeCents(row.amountCents)&&
    (bank?['bankDocument','manualBank'].includes(row.sourceKind):row.sourceKind==='cashCount')&&
    (!anchor||(row.sourceType===(bank?'bankClosingRecord':'cashCountRecord')&&ref(row.sourceRef)));
}

function validMovement(row){
  return fields(row,'id date kind accountId targetId amountCents source included effectCents matchStatus linkedTo previousLinkedTo matchCandidates')&&
    walletId(row.id)&&date(row.date)&&
    ['expense','income','refund','cardPayment','payment','transfer'].includes(row.kind)&&walletId(row.accountId)&&
    (row.targetId===null||walletId(row.targetId))&&safeCents(row.amountCents)&&!row.amountCents.startsWith('-')&&
    ['manual','pdf','csv','unknown'].includes(row.source)&&
    (row.included===true?safeCents(row.effectCents):row.included===false&&row.effectCents===null)&&
    [null,'linked','distinct'].includes(row.matchStatus)&&
    (row.linkedTo===null||walletId(row.linkedTo))&&row.previousLinkedTo===null&&
    Array.isArray(row.matchCandidates)&&row.matchCandidates.length===0;
}

function validHistoricalEffect(row,evidence){
  const {accountId,interval} = evidence;
  const debitOrCredit = row.accountId===accountId;
  const receiving = row.targetId===accountId;
  const included = (debitOrCredit||receiving)&&row.linkedTo===null&&
    interval.fromExclusive<row.date&&row.date<=interval.throughInclusive;
  if(row.included!==included)return false;
  if(!included)return true;
  const amount = BigInt(row.amountCents);
  const outgoing = debitOrCredit?(['income','refund'].includes(row.kind)?amount:-amount):0n;
  return BigInt(row.effectCents)===outgoing+(receiving?amount:0n);
}
function validHistoricalLinks(movements){
  const rows = new Map(movements.map(row=>[row.id,row]));
  return movements.every(row=>{
    if(row.linkedTo===null)return row.matchStatus!=='linked';
    const target = rows.get(row.linkedTo);
    return row.linkedTo!==''&&(row.matchStatus===null||row.matchStatus==='linked')&&
      target&&target!==row&&target.linkedTo===null&&row.amountCents===target.amountCents;
  });
}
function validCoverage(evidence,bank){
  const {coverage,movements} = evidence;
  if(!fields(coverage,'status sourceKind sourceRef matches')||coverage.status!=='source-supported'||
     coverage.sourceKind!==(bank?'bankStatement':'cashJournal')||!ref(coverage.sourceRef)||!list(coverage.matches)||
     !list(movements)||!movements.every(row=>validMovement(row)&&validHistoricalEffect(row,evidence))||!ordinalList(movements,'id')||!validHistoricalLinks(movements))return false;
  const included = movements.filter(row=>row.included);
  const matches = coverage.matches;
  if(matches.length!==included.length||!matches.every((row,i)=>
    fields(row,'id sourceRowId')&&row.id===included[i].id&&ref(row.sourceRowId)))return false;
  return new Set(matches.map(row=>row.sourceRowId)).size===matches.length;
}

function validEvidence(evidence){
  if(!fields(evidence,'version policy accountId accountType anchor observation interval calculatedCents differenceCents coverage movements')||
     evidence.version!==balanceEvidenceVersion||evidence.policy!==balanceEvidencePolicy||
     !walletId(evidence.accountId)||!['bank','cash'].includes(evidence.accountType))return false;
  const {anchor,observation,interval} = evidence;
  const bank = evidence.accountType==='bank';
  if(!validPoint(anchor,bank,true)||!validPoint(observation,bank)||anchor.id===observation.id||
     anchor.date>=observation.date||!fields(interval,'fromExclusive throughInclusive boundary timeZone')||
     interval.fromExclusive!==anchor.date||interval.throughInclusive!==observation.date||
     interval.boundary!=='end-of-day'||!supportedZone(interval.timeZone)||
     !cents(evidence.calculatedCents)||!cents(evidence.differenceCents)||!validCoverage(evidence,bank))return false;
  const calculated = evidence.movements.reduce((sum,row)=>row.included?sum+BigInt(row.effectCents):sum,BigInt(anchor.amountCents));
  return calculated===BigInt(evidence.calculatedCents)&&BigInt(observation.amountCents)-calculated===BigInt(evidence.differenceCents);
}

export function readBalanceApprovalEvidence(proof){
  if(!proof||typeof proof.evidenceJson!=='string'||typeof proof.evidenceSha256!=='string'||
     !/^[a-f0-9]{64}$/.test(proof.evidenceSha256))return null;
  try{
    const evidence = JSON.parse(proof.evidenceJson);
    if(validEvidence(evidence)&&JSON.stringify(evidence)===proof.evidenceJson&&
       sha256(proof.evidenceJson)===proof.evidenceSha256)return evidence;
  }catch{
    // The caller rejects malformed structured proof before writing the snapshot.
  }
  return null;
}

export function validateBalanceApprovals(approvals){
  const invalid = () => {throw Error('Bakiye mutabakatı onay geçmişi veya kanıtı geçersiz.');};
  if(!list(approvals))invalid();
  const ids = new Set();
  const latest = new Map();
  for(const approval of approvals){
    if(!approval||typeof approval!=='object'||Object.keys(approval).length!==5||
       !id(approval.id)||ids.has(approval.id)||!instant(approval.approvedAt))invalid();
    const evidence = readBalanceApprovalEvidence(approval);
    if(!evidence)invalid();
    const key = JSON.stringify([evidence.accountId,evidence.observation.id]);
    const prior = latest.get(key);
    if(approval.previousApprovalId!==(prior?.id??null)||
       (prior&&approval.approvedAt<prior.approvedAt))invalid();
    ids.add(approval.id);
    latest.set(key,approval);
  }
}
