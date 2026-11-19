import * as C from '../core.mjs';
import {escapeHtml as esc,field,options,select} from './form-controls.mjs';

const sourceLabels = {bankDocument:'Banka belgesi',manualBank:'Elle aktarılan banka bakiyesi',cashCount:'Nakit sayımı'};
const ledgerSources = {manual:'Elle kaydedilen işlem',pdf:'PDF aktarımı',csv:'CSV aktarımı',unknown:'Kayıt kaynağı tanınmıyor'};
const movementKinds = {expense:'Harcama',income:'Gelir',refund:'İade',payment:'Hesaptan kart ödemesi',cardPayment:'Ekstre kart ödemesi',transfer:'Transfer'};
const observations = state => state.version>=2?state.balanceReconciliation.observations:[];
const amount = cents => `<span class="money">${C.formatMoney(BigInt(cents))}</span>`;
const signed = cents => `${BigInt(cents)>0n?'+':''}${amount(cents)}`;
const dateField = (name,label) => field(name,label,'','date','required max="9999-12-31"');
const moneyField = (name,label) => field(name,label,'','text','required inputmode="text" autocomplete="off"');
const referenceField = (name,label) => field(name,label,'','text','required maxlength="200" autocomplete="off"');
const checkbox = (id,label) => `<label class="balance-check" for="${id}"><input id="${id}" name="${id}" type="checkbox" required><span>${label}</span></label>`;
const detail = (label,value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;

function sourceRef(data,key){
 const ref = data.get(key)?.trim();
 if(!ref||ref.length>200)throw Error('Bağımsız kaynağı bulabileceğin kısa bir referans gir.');
 return ref;
}

export function renderBalanceAccount(state,account) {
 const records = observations(state).filter(row=>row.accountId===account.id)
  .sort((a,b)=>b.observedDate.localeCompare(a.observedDate)||b.createdAt.localeCompare(a.createdAt));
 return `<section class="panel" id="balance-reconciliation" aria-labelledby="balance-reconciliation-title">
  <h2 id="balance-reconciliation-title">Bakiye mutabakatı</h2>
  ${records.length?'':'<p>Gün sonu bakiyeni ve karşılaştırmak için daha eski bir bağımsız dayanağı kaydet.</p>'}
  <div class="actions"><button type="button" data-action="balanceAddAnchor">Dayanak ekle</button>
   <button type="button" data-action="balanceAddObservation">Gözlem ekle</button>
   <button type="button" data-balance-history="${esc(account.id)}">Onay Geçmişi</button></div>
  ${records.map(row=>`<div class="row"><div><strong>${row.role==='anchor'?'Dayanak':'Gözlem'} · ${esc(row.observedDate)}</strong>
   ${amount(row.observedAmountCents)}<small>${esc(sourceLabels[row.sourceKind])}${row.note?` · ${esc(row.note)}`:''}</small></div>
   ${row.role==='observation'?`<button type="button" data-balance-review="${esc(row.id)}" aria-label="Mutabakatı incele · ${esc(row.observedDate)}">Mutabakatı incele</button>`:''}</div>`).join('')}
 </section>`;
}

export function balanceObservationFields(account,role){
 const anchor = role==='anchor';
 const sources = account.type==='bank'?['bankDocument','manualBank']:['cashCount'];
 return `<p><strong>${esc(account.name)}</strong></p>
  ${anchor?'<p>Bu hesap için daha eski bir gün sonu bakiyesi kaydet. Bağımsız kaynağı mutabakat incelemesinde seç.</p>':''}
  ${dateField('balance-date','Gün sonu tarihi')}
  ${moneyField('balance-amount',anchor?'Dayanak tutarı (TL)':'Gözlenen bakiye (TL)')}
  ${select('balance-source','Kaynak türü',options(sources.map(source=>[source,sourceLabels[source]])))}
  ${field('balance-note','Not (isteğe bağlı)','','text','maxlength="2000"')}`;
}

export function addReviewedBalanceRecord(state,accountId,role,data){
 const note = data.get('balance-note').trim();
 return C.addBalanceObservation(state,{
  accountId,role,note:note||undefined,
  observedDate:data.get('balance-date'),
  observedAmountCents:C.money(data.get('balance-amount'),{wide:true}),
  sourceKind:data.get('balance-source'),
 });
}

function eligibleAnchors(state,observation){
 return observations(state).filter(row=>row.role==='anchor'&&row.accountId===observation.accountId&&row.observedDate<observation.observedDate);
}

export function readBalanceAnchor(state,observationId,data){
 const observation = observations(state).find(row=>row.id===observationId&&row.role==='observation');
 const anchor = observation&&eligibleAnchors(state,observation).find(row=>row.id===data.get('balance-anchor'));
 const account = state.accounts.find(account=>account.id===observation?.accountId);
 if(!anchor||!account)throw Error('Aynı hesabın daha eski bir dayanağını seç.');
 if(!data.has('balance-closing-confirmed'))throw Error('Ortak gün sonu sınırını kontrol et.');
 const closing = {boundary:'end-of-day',timeZone:data.get('balance-time-zone').trim()};
 return {
  anchorId:anchor.id,observationClosing:closing,
  anchorReview:{
   anchorId:anchor.id,accountId:account.id,sourceKind:anchor.sourceKind,
   sourceType:account.type==='bank'?'bankClosingRecord':'cashCountRecord',
   sourceRef:sourceRef(data,'balance-anchor-ref'),
   date:data.get('balance-anchor-date'),amountCents:C.money(data.get('balance-anchor-amount'),{wide:true}),closing,
  },
 };
}

export function readBalanceCoverage(comparison,data){
 const evidence = comparison.evidence;
 return {
  accountId:evidence.accountId,fromExclusive:evidence.interval.fromExclusive,throughInclusive:evidence.interval.throughInclusive,
  closing:{boundary:evidence.interval.boundary,timeZone:evidence.interval.timeZone},
  sourceKind:evidence.accountType==='bank'?'bankStatement':'cashJournal',
  sourceRef:sourceRef(data,'balance-coverage-ref'),complete:data.has('balance-coverage-confirmed'),
  rows:evidence.movements.filter(row=>row.included).map((row,index)=>({
   movementId:row.id,sourceRowId:sourceRef(data,`balance-row-ref-${index+1}`),
   date:data.get(`balance-row-date-${index+1}`),
   effectCents:C.money(data.get(`balance-row-amount-${index+1}`),{wide:true}),
  })),
 };
}

function anchorForm(state,account,observation){
 const anchors = eligibleAnchors(state,observation);
 if(!anchors.length)return '<p class="warning">Dayanak gerekli. Hesap ayrıntısında bu gözlemden daha eski bir gün sonu dayanağı ekle.</p>';
 const bank = account.type==='bank';
 const choices = [['','Dayanak seç'],...anchors.sort((a,b)=>b.observedDate.localeCompare(a.observedDate)).map(anchor=>[
  anchor.id,`${anchor.observedDate} · ${C.formatMoney(anchor.observedAmountCents)} · ${sourceLabels[anchor.sourceKind]}${anchor.note?` · ${anchor.note}`:''}`,
 ])];
 return `<form id="balance-anchor-form" class="panel">
  <h2 id="balance-anchor-title">Bağımsız dayanak</h2>
  <p>${bank?'Banka kapanış belgeni veya bankanın tarihli kapanış ekranını':'Kapanıştaki nakit sayım kaydını'} aç. Seçtiğin dayanağın tarihini ve tutarını oradan gir. Belgeyi daha sonra bulabilmek için kısa bir referans kullan.</p>
  ${select('balance-anchor','Kaydedilmiş dayanağı seç',options(choices,''))}
  ${referenceField('balance-anchor-ref','Dayanak kaynağının referansı')}
  ${dateField('balance-anchor-date','Kaynakta yazan gün sonu tarihi')}
  ${moneyField('balance-anchor-amount','Kaynakta yazan dayanak tutarı (TL)')}
  ${field('balance-time-zone','Ortak gün sonu saat dilimi (IANA)','Europe/Istanbul','text','required maxlength="200" spellcheck="false"')}
  ${checkbox('balance-closing-confirmed','Belgeyi inceledim. Dayanak ve gözlem aynı hesabın bu saat dilimindeki gün sonu bakiyelerini gösteriyor.')}
  <button class="primary" type="submit">Hareketleri karşılaştır</button>
 </form>`;
}

function comparisonDetails(comparison,accountName){
 const {evidence,differenceCents} = comparison;
 const supported = comparison.coverage.status==='source-supported';
 const bank = evidence.accountType==='bank';
 return `<section class="panel" aria-labelledby="balance-result-title">
  <h2 id="balance-result-title">Karşılaştırma</h2>
  <dl class="comparison-values">
   ${detail('Hesap',esc(accountName))}
   ${detail('Gözlem tarihi',esc(evidence.observation.date))}
   ${detail('Bağımsız dayanak tarihi',esc(evidence.anchor.date))}
   ${detail('Dayanak tutarı',amount(evidence.anchor.amountCents))}
   ${detail(bank?'Gözlenen banka bakiyesi':'Gözlenen nakit bakiyesi',amount(evidence.observation.amountCents))}
   ${detail('Kayıtlara göre hesaplanan bakiye',amount(evidence.calculatedCents))}
   ${detail('Fark (gözlenen − hesaplanan)',signed(evidence.differenceCents))}
   ${detail(bank?'Banka kapanış kaydı referansı':'Nakit sayım kaydı referansı',esc(evidence.anchor.sourceRef))}
   ${detail('Kapanış saat dilimi',esc(evidence.interval.timeZone))}
   ${detail('Kaynak kapsamı',supported?'Kapsam kaynak satırlarıyla desteklendi':comparison.coverage.status==='insufficient'?'Kapsam yetersiz':'Hareket kapsamı kontrol edilmedi')}
   ${supported?detail(bank?'Banka ekstresi referansı':'Nakit hareket günlüğü referansı',esc(evidence.coverage.sourceRef)):''}
  </dl>
  ${BigInt(differenceCents)!==0n?`<p class="warning"><strong>Fark var · ${signed(evidence.differenceCents)}</strong>Bakiye farkı için otomatik düzeltme yapılmaz.</p>`:''}
 </section>`;
}

function movementHeading(row,label){
 return `<strong>${esc(label||row.id||'Açıklamasız hareket')}</strong> · ${esc(row.date)} · ${row.included?signed(row.effectCents):amount(row.amountCents)}`;
}

function matchingStatus(row){
 return row.matchStatus==='pending'?'Bekleyen eşleşme':
  row.linkedTo!==null?'Başka kayda bağlı':row.included?'Hesaplamaya dahil':'Hesaplamaya dahil değil';
}

function lookupLabel(labels,id){
 return Object.hasOwn(labels,id)?labels[id]||id:id;
}

function movementContext(row,accountLabels,movementLabels){
 const account = esc(lookupLabel(accountLabels,row.accountId));
 const direction = row.targetId===null?`Hesap ${account}`:
  `Kaynak hesap ${account} · Hedef hesap ${esc(lookupLabel(accountLabels,row.targetId))}`;
 const linked = row.linkedTo===null?'':` · Bağlı kayıt ${esc(lookupLabel(movementLabels,row.linkedTo))} (kimlik ${esc(row.linkedTo)})`;
 return `${movementKinds[row.kind]} · ${direction}${linked}`;
}

function movementEntries(evidence,movementLabels,accountLabels){
 let index = 0;
 return evidence.movements.map(row=>{
  const heading = movementHeading(row,lookupLabel(movementLabels,row.id));
  const candidateLabels = row.matchCandidates.map(id=>lookupLabel(movementLabels,id)).filter(Boolean);
  const status = `<p class="${row.matchStatus==='pending'?'warning':'notice'}">${matchingStatus(row)} · ${ledgerSources[row.source]}
   <br>${movementContext(row,accountLabels,movementLabels)}
   ${candidateLabels.length?`<br>Olası eşleşmeler · ${esc(candidateLabels.join(' · '))}`:''}</p>`;
  if(!row.included)return `<section class="balance-movement"><h3>${heading}</h3>${status}</section>`;
  index++;
  return `<fieldset class="balance-movement"><legend>Satır ${index} · ${heading}</legend>${status}
   ${referenceField(`balance-row-ref-${index}`,`Satır ${index} kaynak referansı`)}
   ${dateField(`balance-row-date-${index}`,`Satır ${index} kaynak tarihi`)}
   ${moneyField(`balance-row-amount-${index}`,`Satır ${index} kaynak tutarı (işaretli TL)`)}
  </fieldset>`;
 }).join('');
}

function coverageForm(state,comparison,storageAvailable){
 const {evidence} = comparison;
 const bank = evidence.accountType==='bank';
 const pending = evidence.movements.some(row=>row.matchStatus==='pending');
 const movementLabels = Object.fromEntries(state.transactions.map(row=>[row.id,row.desc]));
 const accountLabels = Object.fromEntries(state.accounts.map(row=>[row.id,row.name]));
 const start = esc(evidence.interval.fromExclusive);
 const end = esc(evidence.interval.throughInclusive);
 const source = bank?'Banka ekstresi':'Nakit hareket günlüğü';
 return `<form id="balance-coverage-form" class="panel">
  <h2>Hareket kaynağı</h2>
  <p>${source} üzerinden her hareketin tarihini ve işaretli tutarını karşılaştır. Her satır için kaynakta yeniden bulabileceğin bir referans gir. Girişler artı, çıkışlar eksi tutarla yazılır.</p>
  <p>Aralık <strong>${start}</strong> gününün kapanışından hemen sonra başlar ve <strong>${end}</strong> gününün kapanışıyla biter.</p>
  ${pending?'<p class="warning"><strong>Bekleyen eşleşme var</strong> Önce İnceleme Merkezi’nde ilgili PDF/CSV bağlantısını incele.</p><button type="button" data-page="review">İnceleme Merkezi</button>':''}
  ${referenceField('balance-coverage-ref',source+' referansı')}
  ${movementEntries(evidence,movementLabels,accountLabels)||'<p>Bu aralıkta kayıtlı hareket yok. Kaynağın aralığın tamamında hareket olmadığını gösterdiğini kontrol et.</p>'}
  ${checkbox('balance-coverage-confirmed','Kaynağı inceledim. Bu hesabın tam aralığını kapsıyor ve eşleştirilmemiş kaynak satırı bulunmuyor.')}
  <div class="actions"><button type="button" data-action="balanceChangeAnchor">Dayanağı değiştir</button>
   <button class="primary" type="submit" ${pending||!storageAvailable?'disabled':''}>Kanıtı incele</button></div>
 </form>`;
}

function finalForm(prepared){
 const evidence = prepared.comparison.evidence;
 const hasDifference = BigInt(evidence.differenceCents)!==0n;
 const sourceRows = new Map(evidence.coverage.matches.map(row=>[row.id,row.sourceRowId]));
 return `${comparisonDetails(prepared.comparison,prepared.accountName)}
  <form id="balance-final-form" class="panel">
   <h2>Onayı kaydet</h2>
   <p>Kaynak incelemesi senin beyanına dayanır. Uygulama kaynak satırlarıyla defterin uyumunu kontrol eder.</p>
   ${evidence.movements.length?`<h3>İncelenen hareketler</h3><ul class="balance-proof-rows">${evidence.movements.map(row=>`<li>${movementHeading(row,lookupLabel(prepared.movementLabels,row.id))}
    <small>${movementContext(row,prepared.accountLabels,prepared.movementLabels)}</small>
    <small>${row.included?`Kaynak satırı · ${esc(sourceRows.get(row.id))}`:matchingStatus(row)} · ${ledgerSources[row.source]}</small></li>`).join('')}</ul>`:'<p>Kaynak incelemesinde bu aralıkta hareket bulunmadı.</p>'}
   ${checkbox('balance-confirmed',hasDifference?'Bağımsız dayanağı ve hareket kaynağını inceledim. Gösterilen farkla birlikte bu incelemeyi kaydetmeyi onaylıyorum.':'Bağımsız dayanağı ve hareket kaynağını inceledim. Gösterilen incelemeyi kaydetmeyi onaylıyorum.')}
   <div class="actions"><button type="button" data-action="balanceChangeAnchor">İncelemeye baştan dön</button>
    <button id="balance-save" class="primary" type="submit" disabled>Onayı kaydet</button></div>
  </form>`;
}

export function renderBalanceReview(state,observationId,draft,storageAvailable){
 const observation = observations(state).find(row=>row.id===observationId&&row.role==='observation');
 const account = state.accounts.find(row=>row.id===observation?.accountId);
 const header = `<button type="button" class="back-link" data-action="balanceBack">← Hesap ayrıntısı</button><h1>Bakiye mutabakatı</h1>`;
 const error = '<p id="balance-review-error" role="alert" tabindex="-1" hidden></p>';
 if(draft.clockBehind)return `<div class="wallet-v2 balance-review">${header}<section class="panel">
  <h2 id="balance-clock-title" tabindex="-1">Cihaz saatini düzelt</h2>
  <p>Cihaz saati önceki onaydan geride. Önceki onay · <time datetime="${esc(draft.clockBehind)}">${esc(draft.clockBehind)} UTC</time>.</p>
  <p>Cihazın tarihini ve saatini düzeltip güncel kayıtları yeniden incele.</p>
  <button type="button" data-action="balanceRestart">Yeniden incele</button>${error}</section></div>`;
 if(draft.saved)return `<div class="wallet-v2 balance-review">${header}<section class="panel"><h2 id="balance-review-saved">İnceleme onayı kaydedildi</h2><p>${esc(draft.saved.accountName)} · ${esc(draft.saved.date)}</p></section></div>`;
 if(draft.restart)return `<div class="wallet-v2 balance-review">${header}<section class="panel">
  <h2 id="balance-review-result" tabindex="-1">Yeniden inceleme gerekli</h2>
  <p>${esc(draft.restart)}</p><button type="button" data-action="balanceRestart">Yeniden incele</button>${error}</section></div>`;
 if(draft.prepared)return `<div class="wallet-v2 balance-review">${header}${finalForm(draft.prepared)}${error}</div>`;
 if(!account)return `<div class="wallet-v2 balance-review">${header}<p class="warning">Gözlem veya ilgili hesap artık bulunamıyor.</p></div>`;
 const intro = `<p class="lead">${esc(account.name)} · ${esc(observation.observedDate)} · Gözlenen bakiye ${amount(observation.observedAmountCents)}</p>`;
 const unavailable = storageAvailable?'':'<p class="warning">Kalıcı onay için Android kayıt alanı gerekli.</p>';
 const body = draft.comparison?comparisonDetails(draft.comparison,account.name)+coverageForm(state,draft.comparison,storageAvailable):anchorForm(state,account,observation);
 return `<div class="wallet-v2 balance-review">${header}${intro}
  <p>Bağımsız belgeleri veya kayıtları bu ekranın dışında incele. Kaynaklara erişemiyorsan onayı tamamlayamazsın. Hesap numarası veya belge içeriği yerine kısa, kişisel bilgi içermeyen referanslar kullan.</p>
  ${unavailable}${body}${error}</div>`;
}
