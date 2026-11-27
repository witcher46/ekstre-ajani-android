// Review Center is a read-only view over existing pending/linked decisions.
// Financial effects remain exclusively in core.resolveCandidate().
import * as C from '../core.mjs';
import {escapeHtml as esc} from './form-controls.mjs';

const reasons=Object.freeze({
  csvRepeatedRow:'Tekrar eden CSV satırı',
  csvSourceConflict:'CSV kaynak çakışması',
  sourceChanged:'Kaynak bağlantısı değişmiş',
});
const sourceNames=Object.freeze({manual:'Manuel kayıt',pdf:'PDF ekstresi',csv:'CSV aktarımı'});
const sourceLabel=row=>sourceNames[C.sourceOf(row)]||'Bilinmeyen kaynak';

export function reviewCounts(transactions) {
  return {
    pending:transactions.filter(t=>t.matchStatus==='pending').length,
    linked:transactions.filter(t=>Boolean(t.linkedTo)).length,
  };
}

function money(value) {
  return esc(C.formatMoney(value));
}

function accountName(state,id) {
  return state.accounts.find(a=>a.id===id)?.name||'Hesap bulunamadı';
}

function rowSummary(state,row) {
  return '<span class="review-record-description">'+esc(row.desc)+'</span>'+
    '<small>'+esc(row.date)+' · '+esc(accountName(state,row.account))+
    ' · '+esc(sourceLabel(row))+'</small>'+
    '<strong class="review-record-amount">'+money(row.amount)+'</strong>';
}

function candidatesFor(state,row,byId) {
  return [...new Set(row.matchCandidates||[])]
    .map(id=>byId.get(id))
    .filter(item=>item&&C.effective(item)&&C.sourceOf(item)!==C.sourceOf(row));
}

function renderPending(state,row,index,byId,backTitle) {
  const candidates=candidatesFor(state,row,byId);
  const isCsvReview=['csvRepeatedRow','csvSourceConflict'].includes(row.matchReason);
  const id='review-item-'+index;
  const reason=reasons[row.matchReason]||(candidates.length?'Olası eşleşme':'İnceleme gerekiyor');
  const impact=row.kind==='payment'
    ? 'Manuel banka ödemesinin banka bakiyesi etkisi korunur. Kart tarafındaki ikinci etki karar verilene kadar ayrı tutulur.'
    : 'Bu kayıt, belirsiz eşleşme sonuçlanana kadar ayrıca finansal toplamlara katılmaz.';
  const note=row.matchReason==='sourceChanged'
    ? 'Önceki kaynak değişmiş veya kaldırılmış. Ayrı işlem kararı vermeden önce belgeyle karşılaştır.'
    : isCsvReview
      ? 'Bu CSV hareketi daha önce kaydedilmiş bir satırla çakışabilir. Gerçekten ayrı bir işlem mi kontrol et.'
      : 'Aday kayıtlar öneridir; otomatik olarak aynı işlem kabul edilmez.';

  let html='<article class="panel review-item" aria-labelledby="'+id+'">';
  html+='<div class="review-item-head"><div><span class="review-reason">'+esc(reason)+'</span>'+
    '<h3 id="'+id+'">'+esc(row.desc)+'</h3></div><strong>'+money(row.amount)+'</strong></div>';
  html+='<div class="review-meta">'+esc(row.date)+' · '+esc(accountName(state,row.account))+
    ' · '+esc(sourceLabel(row))+'</div>';
  html+='<p class="review-impact">'+esc(impact)+'</p>';
  html+='<p class="notice">'+esc(note)+'</p>';

  if(candidates.length){
    html+='<div class="review-candidates"><label for="match-'+esc(row.id)+'">Aynı olabilecek kayıt</label>';
    html+='<select id="match-'+esc(row.id)+'" aria-label="Eşleştirilecek işlem · '+esc(row.desc)+'">';
    for(const candidate of candidates){
      const label=candidate.date+' · '+candidate.desc+' · '+C.formatMoney(candidate.amount)+' · '+sourceLabel(candidate);
      html+='<option value="'+esc(candidate.id)+'">'+esc(label)+'</option>';
    }
    html+='</select><p class="notice">Kaynak ayrıntılarını karşılaştırmadan eşleştirme yapma.</p></div>';
  } else {
    html+='<p class="notice">Eşleştirilebilecek uygun kayıt bulunamadı. Kaydı ayrı kabul edebilir veya incelemeyi erteleyebilirsin.</p>';
  }

  html+='<div class="review-decisions" role="group" aria-label="'+esc('İnceleme kararı · '+row.desc)+'">';
  if(candidates.length)html+='<button type="button" class="primary" data-link="'+esc(row.id)+'">Aynı işlem</button>';
  html+='<button type="button" data-distinct="'+esc(row.id)+'">Ayrı gerçek işlem</button>';
  html+='<button type="button" data-action="back">Sonra incele · '+esc(backTitle)+'</button>';
  html+='</div>';
  html+='<details class="review-destructive"><summary>Diğer seçenekler</summary>';
  html+='<button type="button" data-delete="'+esc(row.id)+'">'+
    (isCsvReview?'Bu CSV kaydını kaldır':'Bu eski kaydı sil')+'</button>';
  html+='<p class="notice">Kaldırma işlemi ayrıca onay gerektirir.</p></details>';
  html+='</article>';
  return html;
}

function renderLinked(state,row,byId) {
  const parent=byId.get(row.linkedTo);
  return '<div class="review-linked-row"><div>'+rowSummary(state,row)+
    '<small>Bağlı ana kayıt: '+esc(parent?.desc||'Kaynak bulunamadı')+'</small></div>'+
    '<button type="button" data-unlink="'+esc(row.id)+'">Yeniden incele</button></div>';
}

export function renderReviewCenter(state,backTitle='Ekstreler') {
  const transactions=state.transactions;
  const pending=transactions.filter(t=>t.matchStatus==='pending');
  const linked=transactions.filter(t=>Boolean(t.linkedTo));
  const byId=new Map(transactions.map(t=>[t.id,t]));
  let html='<section class="review-center" aria-labelledby="review-title">';
  html+='<h1 id="review-title">İnceleme Merkezi</h1>';
  html+='<p class="lead">Şüpheli kayıtları karşılaştır, aynı işlemi birleştir veya bağımsız hareket olarak onayla.</p>';
  html+='<div class="review-counts"><div><strong>'+pending.length+'</strong><span>Bekleyen karar</span></div>'+
    '<div><strong>'+linked.length+'</strong><span>Bağlanan kaynak</span></div></div>';
  html+='<aside class="review-principle">Belirsiz kayıtlar otomatik eşleştirilmez. Kart borcu ödemesi ikinci bir gider sayılmaz.</aside>';
  html+='<section aria-label="Bekleyen kayıtlar"><h2>Karar bekleyenler</h2>';
  if(pending.length){
    for(const [index,row] of pending.entries())html+=renderPending(state,row,index,byId,backTitle);
  }else {
    html+='<div class="panel review-empty"><strong>İncelenecek kayıt yok</strong><p>Yeni bir PDF veya CSV aktardığında belirsiz kayıtlar burada görünür.</p></div>';
  }
  html+='</section>';
  html+='<details class="panel review-history"><summary>Onaylanan kaynak bağlantıları · '+linked.length+'</summary>';
  if(linked.length){
    for(const row of linked)html+=renderLinked(state,row,byId);
  }else html+='<p class="notice">Henüz bağlanmış bir kaynak kaydı yok.</p>';
  html+='</details></section>';
  return html;
}
