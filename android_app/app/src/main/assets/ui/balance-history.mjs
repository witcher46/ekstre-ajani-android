import {formatMoney} from '../core.mjs';
import {escapeHtml as esc} from './form-controls.mjs';

const statuses = {
 current:'Kayıtlarla güncel',
 'review-required':'Yeniden inceleme gerekli',
 unavailable:'Değerlendirilemiyor',
};
const reasons = {
 'evidence-current':'Kanonik kanıt ve kaynak kapsamı son okunan kayıtlarla eşleşiyor.',
 'comparison-changed':'Hareketler, kaynak eşleşmeleri veya karşılaştırma kapsamı değişmiş.',
 'pending-match':'İlgili kaynak hareketlerinde bekleyen eşleşme bulunuyor.',
 'missing-observation':'Bu onayın gözlemi güncel kayıtlarda bulunamıyor.',
 'missing-anchor':'Bu onayın dayanağı güncel kayıtlarda bulunamıyor.',
 'missing-account':'Bu onayın hesabı güncel kayıtlarda bulunamıyor.',
 'changed-observation':'Gözlemin tarihi, tutarı veya hesap bağlantısı değişmiş.',
 'changed-anchor':'Dayanağın tarihi, tutarı veya hesap bağlantısı değişmiş.',
 'changed-account':'Hesabın türü veya karşılaştırma bağlantısı değişmiş.',
 'unsupported-evidence':'Kayıtlı kanıtın sürümü desteklenmiyor.',
 'invalid-evidence':'Kayıtlı kanıt güvenilir biçimde okunamıyor.',
 'storage-unavailable':'Güncel kayıtlar okunamadığı için bu onayın güncelliği değerlendirilemiyor.',
};
const sources = {
 bankClosingRecord:'Banka kapanış kaydı',
 cashCountRecord:'Nakit sayım kaydı',
 bankStatement:'Banka ekstresi',
 cashJournal:'Nakit hareket günlüğü',
 bankDocument:'Banka belgesi',
 manualBank:'Elle aktarılan banka bakiyesi',
 cashCount:'Nakit sayımı',
 manual:'Elle kaydedilen işlem',
 pdf:'PDF aktarımı',
 csv:'CSV aktarımı',
 unknown:'Tanınmayan hareket kaynağı',
};
const kinds = {
 expense:'Harcama',income:'Gelir',refund:'İade',payment:'Hesaptan kart ödemesi',
 cardPayment:'Ekstre kart ödemesi',transfer:'Transfer',
};
const definition = (label,value) => `<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
const protectedValue = () => '<span class="muted">Gizli</span>';
const reference = (value,reveal) => reveal?esc(value):protectedValue();
const amount = (value,reveal,signed=false) => {
 if(!reveal)return protectedValue();
 const cents = BigInt(value);
 return `<span class="money">${signed&&cents>0n?'+':''}${formatMoney(cents)}</span>`;
};
const instant = value => `<time datetime="${esc(value)}">${esc(value.replace('T',' ').replace('Z',' UTC'))}</time>`;

function status(evaluation){
 const label = statuses[evaluation.status]??statuses.unavailable;
 return `<div class="balance-history-status" data-balance-status="${esc(evaluation.status)}">
  <strong>${label}</strong><p>${esc(reasons[evaluation.reason]??'Bu onay için yeni bir kaynak incelemesi gerekli.')}</p>
 </div>`;
}

function commonControls(reveal){
 return `<div class="toolbar balance-history-controls">
  <button type="button" id="balance-history-reveal" data-action="balanceHistoryReveal" aria-pressed="${reveal}">${reveal?'Tutar ve referansları gizle':'Tutar ve referansları göster'}</button>
  <button type="button" id="balance-history-refresh" data-action="balanceHistoryRefresh">Güncelliği yeniden değerlendir</button>
 </div>`;
}

function evidenceSummary(evidence,reveal){
 return `<dl class="comparison-values">
  ${definition('Gözlem tarihi',esc(evidence.observation.date))}
  ${definition('Dayanak tarihi',esc(evidence.anchor.date))}
  ${definition('Dayanak tutarı',amount(evidence.anchor.amountCents,reveal))}
  ${definition('Gözlenen bakiye',amount(evidence.observation.amountCents,reveal))}
  ${definition('Kayıtlara göre hesaplanan bakiye',amount(evidence.calculatedCents,reveal))}
  ${definition('Fark (gözlenen − hesaplanan)',amount(evidence.differenceCents,reveal,true))}
  ${definition('Dayanak kaynağı',esc(sources[evidence.anchor.sourceType]))}
  ${definition('Dayanak referansı',reference(evidence.anchor.sourceRef,reveal))}
  ${definition('Gözlem kaynağı',esc(sources[evidence.observation.sourceKind]))}
  ${definition('Hareket kaynağı',esc(sources[evidence.coverage.sourceKind]))}
  ${definition('Hareket kaynağı referansı',reference(evidence.coverage.sourceRef,reveal))}
  ${definition('Kayıtlı kaynak kapsamı','Kaynak satırlarıyla desteklenmiş')}
 </dl>`;
}

function historyEntry(entry,reveal){
 const {approval,evidence,evaluation} = entry;
 return `<article class="panel balance-history-entry" data-balance-approval-entry="${esc(approval.id)}">
  <h2>Gözlem · ${esc(evidence.observation.date)}</h2>
  <p class="balance-approval-date">Onay tarihi · ${instant(approval.approvedAt)}</p>
  ${status(evaluation)}${evidenceSummary(evidence,reveal)}
  <button type="button" data-balance-approval="${esc(approval.id)}" aria-label="Onay ayrıntısını aç · ${esc(approval.approvedAt)}">Onay ayrıntısını aç</button>
 </article>`;
}

function historicalMovement(row,sourceRows,reveal){
 const effect = row.included?amount(row.effectCents,reveal,true):'Bu hesaplamaya dahil edilmemiş';
 const linked = row.linkedTo===null?'Bağlantı yok':reference(row.linkedTo,reveal);
 return `<li class="balance-historical-row">
  <h3>${esc(row.date)} · ${esc(kinds[row.kind])}</h3>
  <dl class="comparison-values">
   ${definition('Hareket kimliği',reference(row.id,reveal))}
   ${definition('Hareket kaynağı',esc(sources[row.source]))}
   ${definition('İşlem tutarı',amount(row.amountCents,reveal))}
   ${definition('Hesaba etkisi',effect)}
   ${definition('Kaynak hesap kimliği',reference(row.accountId,reveal))}
   ${row.targetId===null?'':definition('Hedef hesap kimliği',reference(row.targetId,reveal))}
   ${definition('Kaynak satırı eşleşmesi',row.included?reference(sourceRows.get(row.id),reveal):'Hesaplamaya dahil edilmemiş')}
   ${definition('Bağlı hareket kimliği',linked)}
  </dl>
 </li>`;
}

function historyDetail(entry,reveal,movementLimit){
 const {approval,evidence,evaluation} = entry;
 const sourceRows = new Map(evidence.coverage.matches.map(row=>[row.id,row.sourceRowId]));
 return `<section class="panel">
  <p class="balance-approval-date">Onay tarihi · ${instant(approval.approvedAt)}</p>
  ${status(evaluation)}${evidenceSummary(evidence,reveal)}
  <dl class="comparison-values balance-history-identifiers">
   ${definition('Onay kimliği',reference(approval.id,reveal))}
   ${definition('Önceki onay',approval.previousApprovalId===null?'Bu gözlem için ilk onay':reference(approval.previousApprovalId,reveal))}
   ${definition('Dayanak kimliği',reference(evidence.anchor.id,reveal))}
   ${definition('Gözlem kimliği',reference(evidence.observation.id,reveal))}
   ${definition('Kapsanan aralık',esc(evidence.interval.fromExclusive)+' kapanışından sonra · '+esc(evidence.interval.throughInclusive)+' kapanışına kadar')}
   ${definition('Saat dilimi',esc(evidence.interval.timeZone))}
  </dl>
  ${evaluation.status!=='current'&&evaluation.canReview?`<button class="primary" type="button" data-balance-reapprove="${esc(approval.id)}">Yeniden incele</button>`:''}
 </section>
 <section class="panel" aria-labelledby="balance-history-movements-title">
  <h2 id="balance-history-movements-title">Tarihsel hareketler ve kaynak eşleşmeleri</h2>
  <p>Bu satırlar onay sırasında saklanan kanıttan gelir. Hesap bağlantıları o tarihteki yerel kimliklerle gösterilir.</p>
  ${evidence.movements.length?`<ul class="balance-historical-rows">${evidence.movements.slice(0,movementLimit).map(row=>historicalMovement(row,sourceRows,reveal)).join('')}</ul>
   ${evidence.movements.length>movementLimit?'<button type="button" data-action="balanceHistoryMoreMovements">Daha fazla hareket</button>':''}`:'<p>Bu kanıtta aralığı etkileyen hareket bulunmuyor.</p>'}
 </section>
 <p class="notice">Kanonik içeriğin SHA-256 özeti saklanan içeriğin bütünlüğünü denetler. Kaynağın doğruluğu ve bugünkü güncellik ayrıca değerlendirilir.</p>`;
}

export function renderBalanceApprovalHistory({accountName,entries,reveal=false,unavailable=false,selectedId=null,hasMore=false,movementLimit=50}){
 const selected = selectedId===null?null:entries.find(entry=>entry.approval.id===selectedId);
 const heading = selectedId===null?'Onay Geçmişi':'Onay ayrıntısı';
 const id = selectedId===null?'balance-approval-history':'balance-approval-detail';
 const back = selectedId===null?'← Hesap ayrıntısı':'← Onay Geçmişi';
 const body = selectedId===null?
  entries.length?entries.map(entry=>historyEntry(entry,reveal)).join('')+
   (hasMore?'<button type="button" data-action="balanceHistoryMore">Daha fazla onay</button>':''):
   '<section class="panel"><p>Bu hesap için kayıtlı onay bulunmuyor.</p></section>':
  selected?historyDetail(selected,reveal,movementLimit):'<p class="warning">Seçilen onay bu hesabın kayıtlı geçmişinde bulunamıyor.</p>';
 return `<div class="wallet-v2 balance-history" id="${id}">
  <button type="button" class="back-link" data-action="balanceHistoryBack">${back}</button>
  <h1>${heading}</h1><p class="lead">${esc(accountName)}</p>
  ${unavailable?'<p class="warning" role="alert">Güncel kayıtlar okunamadı. Geçmişte saklanan kanıt gösteriliyor, güncellik değerlendirilemiyor.</p>':''}
  ${commonControls(reveal)}
  <p class="notice">Güncellik, bu ekran açılırken veya yeniden değerlendirilirken okunan kayıtlara dayanır. Bağımsız kaynak incelemesi onayı veren kullanıcının beyanına dayanır.</p>
  ${body}
 </div>`;
}
