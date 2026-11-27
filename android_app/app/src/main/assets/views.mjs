import * as C from './core.mjs';
import * as W from './wallet.mjs';
import {advancedReports,reportRows} from './reports.mjs';
import {options,select} from './ui/form-controls.mjs';
import {renderBalanceAccount} from './ui/balance-review.mjs';
import {renderBackLink,uiIcon} from './ui/navigation.mjs';

const kindNames = {expense:'Harcama',income:'Gelir',refund:'İade',payment:'Hesaptan kart ödemesi',cardPayment:'Ekstre kart ödemesi',transfer:'Transfer'};
const statementFields = {previousDebt:'Önceki dönem borcu',statementDebt:'Dönem borcu',expectedDebt:'Beklenen dönem borcu',cut:'Hesap kesim tarihi',due:'Son ödeme tarihi'};
const shell = html => `<div class="wallet-v2">${html}</div>`;
const amount = (ctx,value) => value === null || value === undefined ? '<span class="muted">Bilinmiyor</span>' : ctx.fmt(value);
const accountName = (state,id) => state.accounts.find(a => a.id === id)?.name || 'Hesap';
const newest = rows => [...rows].sort((a,b) => b.date.localeCompare(a.date));
export const ACCOUNT_HISTORY_PAGE_SIZE = 150;
const metric = (ctx,key,label,value,note='') => `<div class="metric"><small>${ctx.esc(label)}</small><b data-stat="${ctx.esc(key)}">${amount(ctx,value)}</b>${note ? `<p class="notice">${ctx.esc(note)}</p>` : ''}</div>`;
const detail = (ctx,label,value,money=false) => `<div><dt>${ctx.esc(label)}</dt><dd>${money ? amount(ctx,value) : ctx.esc(value ?? 'Bilinmiyor')}</dd></div>`;
const compactStat = (ctx,key,label,value) => `<div><dt>${ctx.esc(label)}</dt><dd data-stat="${ctx.esc(key)}">${amount(ctx,value)}</dd></div>`;
const noRows = message => `<p class="empty-note">${message}</p>`;

function quickActions() {
  return `<div class="quick-actions" aria-label="Para işlemleri">
    <button class="primary" data-action="addIncome"><span class="action-symbol" aria-hidden="true">＋</span>Gelir ekle</button>
    <button data-action="addTransaction"><span class="action-symbol" aria-hidden="true">−</span>Gider ekle</button>
    <button data-action="transfer"><span class="action-symbol" aria-hidden="true">⇄</span>Transfer</button>
    <button data-action="payCard"><span class="action-symbol" aria-hidden="true">✓</span>Kart borcu öde</button>
  </div>`;
}

function reviewWarning(ctx,transactions=ctx.state.transactions) {
  const pending = transactions.filter(t => t.matchStatus === 'pending');
  return pending.length ? `<aside class="warning"><strong>${ctx.esc(pending.length)} kayıt inceleme bekliyor</strong><p>Olası eşleşmeler kesinleşmeden ikinci kart veya harcama etkisi eklenmez. Banka hareketi korunur; kart tahmini değişebilir.</p><button data-page="review">İnceleme kutusu</button></aside>` : '';
}

function sourceWarning(ctx) {
  const missing = ctx.state.transactions.filter(t => t.kind === 'cardPayment' && C.effective(t) && C.sourceOf(t) !== 'manual');
  return missing.length ? `<aside class="warning"><strong>${ctx.esc(missing.length)} ekstre ödemesinin kaynak hesabı bilinmiyor</strong><p>Kart ödemesi ekstrede görünüyor; hangi banka veya nakit hesabından çıktığı henüz kayıtlı değil. Kullanılabilir para tutarını doğrulamak için kaynağı bağla.</p><button data-page="wallet">Kartları ve ödeme kaynaklarını incele</button></aside>` : '';
}

function dashboardRow(icon,label,note,value) {
  return `<span class="row-icon">${uiIcon(icon)}</span><span class="dashboard-row-label"><strong>${label}</strong><small>${note}</small></span><b class="dashboard-row-value">${value}</b>`;
}

function upcoming(ctx) {
  const rows = C.upcomingPayments(ctx.state).filter(r => r.days <= 7).slice(0,4);
  if (!rows.length) return '';
  return `<section class="dashboard-section" aria-labelledby="upcoming-heading">
    <div class="section-heading"><h2 id="upcoming-heading">Yaklaşan / geciken ödemeler</h2><button class="section-link" data-page="plan">Ödeme planı ${uiIcon('next')}</button></div>
    <div class="panel dashboard-list">${rows.map(r => `<div class="dashboard-row">${dashboardRow(r.estimated?'wallet':'plan',ctx.esc(r.estimated?accountName(ctx.state,r.account):r.name),
      ctx.dateStatus(r.date)+(r.estimated?' · Kalan dönem borcu tahmini':''),amount(ctx,r.amount))}</div>`).join('')}</div>
    <p class="notice">Takvim bankadaki ödeme durumunu doğrulamaz.</p>
  </section>`;
}

const expensePercent = new Intl.NumberFormat('tr-TR',{style:'percent',maximumFractionDigits:1});

function sharePermille(spent,total) {
  if (!total) return 0;
  const denominator=BigInt(total);
  return Number((BigInt(spent)*1000n+denominator/2n)/denominator);
}

function shareLabel(spent,permille) {
  return spent && !permille ? '<span aria-label="Yüzde 0,1’den az">&lt;%0,1</span>' : expensePercent.format(permille/1000);
}

function expenseBreakdown(ctx,{spent,categoryBreakdown}) {
  const categories=categoryBreakdown.filter(row=>row.spent>0)
    .sort((a,b)=>C.compareCents(b.spent,a.spent)||a.name.localeCompare(b.name,'tr'));
  return `<section class="panel expense-breakdown" aria-labelledby="expense-breakdown-title">
    <h2 id="expense-breakdown-title">Kategori bazlı gider dağılımı</h2>
    ${spent?`<p class="expense-total"><span>Brüt gider</span> <strong>${amount(ctx,spent)}</strong></p>
    <ul class="expense-category-list" role="list">${categories.slice(0,3).map(({name,spent:value})=>{
      const permille=sharePermille(value,spent);
      return `<li><button type="button" class="expense-category" data-expense-category="${ctx.esc(name)}">
        <span class="expense-category-values"><span class="expense-category-name">${ctx.esc(name||'Kategorisiz')}</span><span class="expense-category-amount">${amount(ctx,value)}</span><span class="expense-category-share">${shareLabel(value,permille)}</span></span>
        <meter min="0" max="1000" value="${permille}" aria-hidden="true"></meter>
      </button></li>`;
    }).join('')}</ul>${categories.length>3?'<p class="notice">Brüt harcamaya göre ilk 3 kategori</p>':''}`:noRows('Seçili ayda gider kaydı yok.')}
  </section>`;
}
const statementShortcut = '<button data-page="import">'+uiIcon('import')+' Ekstre yükle</button>';

export function homeView(ctx) {
  const {state,periodControl,transactionList} = ctx;
  const overview = W.overview(state,ctx.period);
  const monthRows = C.rowsForPeriod(state,ctx.period);
  const recent = newest(monthRows).slice(0,5);
  return shell(`<div class="dashboard-surface">
    <h1>Özet</h1>
    <section class="panel dashboard-hero" aria-label="Cüzdan özeti">
      <div class="dashboard-hero-caption"><small>Banka ve nakit bakiyesi</small><small>Kayıtlarına göre</small></div>
      <div class="dashboard-amount" data-stat="cash">${amount(ctx,overview.cash)}</div>
      <dl class="dashboard-totals">${compactStat(ctx,'cardDebt','Kart borcu tahmini',overview.cardDebt)}${compactStat(ctx,'netWorth','Net varlık',overview.netWorth)}${overview.cardCredit > 0 ? compactStat(ctx,'cardCredit','Kart artı bakiyesi',overview.cardCredit) : ''}</dl>
    </section>
    <div class="dashboard-actions"><button class="primary" data-action="quickAdd" aria-haspopup="dialog" aria-controls="modal">${uiIcon('plus')} İşlem ekle</button>${statementShortcut}</div>
    ${!state.accounts.length ? `<section class="panel empty"><b>Cüzdanını oluştur</b><p>Önce banka hesabı, nakit hesabı veya kart ekle. Açılış bakiyesi gelir veya gider sayılmaz.</p><div class="actions"><button class="primary" data-action="addAccount">Hesap ekle</button><button data-action="demo">Örnek cüzdan</button></div></section>` : ''}
    ${upcoming(ctx)}
    <section class="dashboard-section" aria-labelledby="month-heading">
      <div class="section-heading"><h2 id="month-heading">Aylık özet</h2><div class="dashboard-period">
        ${periodControl}<button class="section-link" data-page="reports">Raporlar ↗</button>
      </div></div>
      <div class="panel month-summary"><dl class="dashboard-totals">${compactStat(ctx,'income','Gelir',overview.income)}${compactStat(ctx,'netExpense','Net gider',overview.netExpense)}${compactStat(ctx,'margin','Gelir − gider',overview.margin)}</dl><p class="notice">İadeler giderden düşer. Kart ödemeleri ve transferler gider sayılmaz.</p></div>
    </section>
    ${expenseBreakdown(ctx,overview)}
    ${reviewWarning(ctx)}${sourceWarning(ctx)}
    <section class="dashboard-section" aria-labelledby="recent-heading"><div class="section-heading"><h2 id="recent-heading">Son hareketler</h2><button class="section-link" data-page="transactions">Tüm işlemler ${uiIcon('next')}</button></div><div class="panel dashboard-list dashboard-recent">${transactionList(recent)}</div></section>
    ${overview.plannedIncome ? `<div class="panel planned-income"><div><strong>Bu ay planlanan gelir</strong><p class="notice">Alındı olarak onaylanana kadar bakiyeye ve gelire eklenmez.</p><b>${amount(ctx,overview.plannedIncome)}</b></div><button data-page="incomePlans">Gelir planları</button></div>` : ''}
    ${quickActions()}
    <div class="actions"><button data-page="incomePlans">Gelir planları</button></div>
  </div>`);
}

function walletCard(ctx,account) {
  const card = W.cardDetail(ctx.state,account.id);
  const id = ctx.esc(account.id);
  return `<article class="wallet-card">
    <button class="panel wallet-card-hero" data-card-view="${id}">
      <small>Kredi kartı</small><strong>${ctx.esc(account.name)}</strong>
      <b class="dashboard-amount">${amount(ctx,card.debt)}</b><small>Güncel kart borcu tahmini</small>
    </button>
    <div class="panel dashboard-list">
      <div class="dashboard-row">${dashboardRow('import','Dönem borcu',card.latest?'Son ekstre':'Henüz ekstre yok',amount(ctx,card.statementDebt))}</div>
      <div class="dashboard-row">${dashboardRow('plan','Kalan dönem borcu',card.latest?.due?'Son ödeme · '+ctx.esc(card.latest.due):'Son ödeme tarihi bilinmiyor',amount(ctx,card.statementRemaining))}</div>
      ${card.credit ? `<div class="dashboard-row">${dashboardRow('wallet','Kart artı bakiyesi','Kayıtlarına göre',amount(ctx,card.credit))}</div>` : ''}
      <div class="dashboard-actions wallet-account-actions"><button data-account="${id}">Hesabı düzenle</button><button data-pay-card="${id}">Ödeme kaydet</button></div>
    </div>
  </article>`;
}

export function walletView(ctx) {
  const {state,esc} = ctx;
  const overview = W.overview(state,ctx.period);
  const cards = state.accounts.filter(a => a.type === 'card');
  const accounts = state.accounts.filter(a => a.type !== 'card');
  return shell(`<div class="dashboard-surface">
    <h1>Cüzdan</h1>
    ${cards.length ? `<section class="wallet-cards" aria-label="Kredi kartları">${cards.map(a => walletCard(ctx,a)).join('')}</section>` : ''}
    <div class="dashboard-actions"><button class="primary" data-action="addAccount">${uiIcon('plus')} Hesap ekle</button>${statementShortcut}</div>
    ${!state.accounts.length ? `<section class="panel empty"><b>Henüz hesap yok</b><p>Banka veya nakit bakiyeni ve kartlarını ekleyerek başla.</p><button data-action="demo">Örnek cüzdan</button></section>` : ''}
    <section class="dashboard-section" aria-labelledby="available-cash">
      <div class="section-heading"><h2 id="available-cash">Banka ve nakit bakiyesi</h2><b data-stat="cash">${amount(ctx,overview.cash)}</b></div>
      <div class="panel dashboard-list">${accounts.map(account => `<div class="wallet-account-row">
        <button class="dashboard-row" type="button" data-account-view="${esc(account.id)}">${dashboardRow(account.type,esc(account.name),account.type==='bank'?'Banka hesabı':'Nakit hesabı',amount(ctx,C.balance(state,account)))}</button>
        <button class="icon wallet-account-edit" type="button" data-account="${esc(account.id)}" aria-label="${esc(account.name+' hesabını düzenle')}">${uiIcon('edit')}</button>
      </div>`).join('') || noRows('Henüz banka veya nakit hesabı yok.')}</div>
    </section>
    <section class="panel" aria-label="Cüzdan toplamı"><dl class="dashboard-totals">${compactStat(ctx,'cardDebt','Toplam kart borcu tahmini',overview.cardDebt)}${compactStat(ctx,'cardCredit','Toplam kart artı bakiyesi',overview.cardCredit)}${compactStat(ctx,'netWorth','Net varlık',overview.netWorth)}</dl><p class="notice">Borç ve bakiye, uygulamadaki kayıtlara göre gösterilir.</p></section>
    <button data-action="transfer">Hesaplar arası transfer</button>
    ${reviewWarning(ctx)}${sourceWarning(ctx)}
  </div>`);
}

function installmentPanel(ctx,installments) {
  if (!installments) return '';
  const items = installments.items || [];
  return `<details class="panel optional-detail" ${items.length ? 'open' : ''}><summary>Taksit görünümü${items.length ? ` · ${ctx.esc(items.length)} plan` : ' · Kayıt yok'}</summary><div class="summary-grid">${metric(ctx,'installmentPosted','Kaydedilmiş taksit gideri',installments.postedExpense)}${metric(ctx,'installmentPlanned','Gelecek taksitler · kayıtlı plan',installments.plannedFutureLiability)}${metric(ctx,'installmentFuture','Gelecek taksitler · ekstre tahmini',installments.estimatedFutureLiability)}</div>
    <p class="notice">Kayıtlı planlarda taksitler kendi tarihlerinde güncel borca yansır. Ekstre tahmini görülen taksit tutarlarına dayanır.</p>
    ${installments.ambiguous ? '<p class="warning">Bazı taksit hareketleri kesin gruplanamadı. Tahmini tutarları belgeyle kontrol et; aynı tutarlı ayrı alışverişler olabilir.</p>' : ''}
    ${items.map(item => `<article class="installment-item"><div class="row"><div class="left"><strong>${ctx.esc(item.desc)}</strong><small>Kaydedilen taksit ${ctx.esc(item.current)} / ${ctx.esc(item.total)} · Kalan ${ctx.esc(item.remaining)} taksit${item.ambiguous ? ' · Gruplama belirsiz' : ''}</small></div><b>${amount(ctx,item.amount)}</b></div><dl class="card-details">${detail(ctx,'Kaydedilmiş gider',item.postedExpense,true)}${detail(ctx,item.estimated?'Gelecek taksitler · tahmin':'Gelecek taksitler · kayıtlı plan',item.estimated?item.estimatedFutureLiability:item.plannedFutureLiability,true)}</dl></article>`).join('') || noRows('Bu kartta taksit bilgisi bulunan hareket yok.')}
  </details>`;
}

function accountHistoryPanel(ctx,id,title,rows,note='') {
  const limit = ctx.accountHistoryLimit?.(id) ?? ACCOUNT_HISTORY_PAGE_SIZE;
  return `<section class="panel" aria-labelledby="${id}-heading"><h2 id="${id}-heading">${ctx.esc(title)}</h2>
    ${note ? `<p class="notice">${ctx.esc(note)}</p>` : ''}
    <div id="${id}">${ctx.transactionList(newest(rows),{limit})}</div>
    ${rows.length > limit ? `<button type="button" data-action="moreAccountHistory" aria-controls="${id}">Daha fazla göster</button>` : ''}
  </section>`;
}

function cardView(ctx,account) {
  const {state,esc} = ctx;
  const card = W.cardDetail(state,account.id);
  const statements = state.statements.filter(st => st.account === account.id).sort((a,b) => b.cut.localeCompare(a.cut));
  const unassigned = card.unassignedPayments || [];
  const latest = card.latest;
  const knownStatement = Boolean(latest && card.statementDebt !== null);
  const anchor = card.currentAnchor;
  const staleAnchor = Boolean(latest && anchor && latest.id !== anchor.id);
  const anchorText = anchor
    ? 'Tahminin dayanağı: bilinen ' + anchor.period + ' ekstresi (kesim ' + anchor.cut + ') ve sonraki kayıtlar.'
    : 'Tahminin dayanağı: kartın kayıtlı açılış borcu ve işlem hareketleri.';

  let html = '<div class="detail-heading"><div><h1>' + esc(account.name) +
    '</h1><p class="lead">Kredi kartı · belgelere ve yerel kayıtlara göre</p></div>' +
    '<button class="primary" data-pay-card="' + esc(account.id) + '">Bu kartın borcunu öde</button></div>';
  html += '<section class="hero panel card-balance-board" aria-labelledby="card-current-heading">' +
    '<div class="card-section-heading"><h2 id="card-current-heading">Güncel kart durumu</h2>' +
    '<span class="card-source-label">Kayıtlara göre tahmin</span></div>' +
    '<div class="summary-grid">' +
    metric(ctx,'cardDebt','Güncel borç tahmini',card.debt) +
    metric(ctx,'cardCredit','Kart artı bakiyesi',card.credit) +
    '</div><p class="notice">Bu rakamlar bankanın canlı borç veya kullanılabilir limit bilgisi değildir. Gelecek taksitler mevcut borca peşinen eklenmez.</p>' +
    '<p class="card-source-note">' + esc(anchorText) + '</p>' +
    (staleAnchor ? '<p class="warning" role="status">En son ekstre borcu okunamadı. Güncel tahmin, önceki bilinen ekstreye dayanıyor; son dönemin ödeme yükümlülüğü bilinmiyor.</p>' : '') +
    (card.pending ? '<p class="notice">' + esc(card.pending) + ' hareket eşleşme incelemesinde. Kesinleşmeyen işlemler tahminin doğruluğunu etkileyebilir.</p>' : '') +
    '</section>';

  html += '<section class="panel card-statement-summary" aria-labelledby="card-statement-heading">' +
    '<div class="card-section-heading"><h2 id="card-statement-heading">Son ekstre ve ödeme durumu</h2>' +
    '<span class="card-source-label">' + (latest ? 'Ekstre: ' + esc(latest.period) : 'Ekstre yok') + '</span></div>';
  if(latest){
    const {rowsByStatement,underReview} = statementGroups(state);
    const rows = rowsByStatement.get(latest.id) || [];
    const status = statementStatus(latest,underReview.has(latest.id),rows.length);
    const label = status.tone === 'verified' ? 'Ekstre toplamları doğrulandı' : status.label;
    const reconciliation = status.reason ? label + ' · ' + status.reason : label;
    html += '<p class="notice">' + esc(latest.bank || 'Banka bilinmiyor') + ' · ' + esc(reconciliation) + '</p>' +
      statementDateWarning(latest,rows) +
      '<dl class="card-details">' +
      detail(ctx,'Hesap kesim tarihi',latest.cut) +
      detail(ctx,'Son ödeme tarihi',latest.due) +
      '<div><dt>Belgedeki dönem borcu</dt><dd data-stat="cardStatementDebt">' + amount(ctx,card.statementDebt) + '</dd></div>' +
      '<div><dt>Kesim sonrası kaydedilmiş ödemeler</dt><dd data-stat="cardPaidAfterCut">' + amount(ctx,knownStatement ? card.paidAfterCut : null) + '</dd></div>' +
      '<div class="card-remaining"><dt>Ödemelere göre kalan dönem borcu</dt><dd data-stat="cardStatementRemaining">' + amount(ctx,card.statementRemaining) + '</dd></div>' +
      '</dl>';
    if(!knownStatement)html += '<p class="warning">Son ekstrede dönem borcu okunamadı. Kalan dönem borcu hesaplanamaz; sıfır kabul edilmez.</p>';
    html += '<p class="notice">Kalan dönem borcundan yalnızca kaydedilmiş ödemeler düşülür. İadeler burada otomatik ödeme sayılmaz; banka onayı olmadan asgari ödeme veya kalan yükümlülük kesinleştirilmez.</p>';
    html += '<button class="card-statement-link" data-statement-view="' + esc(latest.id) + '">Son ekstre ayrıntısını aç</button>';
  }else{
    html += '<p class="empty-note">Henüz ekstre aktarılmadı. Dönem borcu, kalan ekstre borcu ve son ödeme tarihi bilinmiyor.</p>' +
      '<p class="notice">Güncel tahmin yalnızca kart açılış bilgisi ve kaydedilmiş hareketlere dayanır.</p>';
  }
  html += '</section>';

  html += '<section class="panel card-after-cut" aria-labelledby="card-after-cut-heading">' +
    '<h2 id="card-after-cut-heading">Son kesim sonrası hareketler</h2>';
  if(latest){
    html += '<div class="summary-grid">' +
      metric(ctx,'postCutExpenses','Yeni harcamalar',card.postCutExpenses) +
      metric(ctx,'postCutRefunds','Gerçekleşen iadeler',card.postCutRefunds) +
      '</div><p class="notice">Yalnızca son ekstre kesiminden sonra kaydedilmiş hareketler. İadeler güncel borç tahminini azaltabilir; dönem borcunun ödenmiş sayılacağı anlamına gelmez.</p>';
  }else{
    html += '<p class="empty-note">Son ekstre kesim tarihi olmadığı için kesim sonrası hareket toplamı gösterilemiyor.</p>';
  }
  html += '</section>';
  html += reviewWarning(ctx,state.transactions.filter(t => t.account === account.id || t.target === account.id));
  html += '<details class="panel optional-detail" ' + (unassigned.length ? 'open' : '') + '><summary>Ödeme kaynakları' +
    (unassigned.length ? ' · ' + esc(unassigned.length) + ' hesap bağlanmalı' : ' · Bekleyen yok') +
    '</summary><p class="notice">Ekstrede görünen ödemenin hangi banka veya nakit hesabından çıktığını bağla. Kart ödemesi gider sayılmaz; aynı işlem ikinci kez kaydedilmez.</p>' +
    unassigned.map(t => '<div class="row"><div class="left"><strong>' + esc(t.desc) +
      '</strong><small>' + esc(t.date) + ' · Kaynak hesap bilinmiyor</small></div><b>' +
      amount(ctx,t.amount) + '</b><button data-bind-payment="' + esc(t.id) + '">Kaynak hesabı bağla</button></div>').join('') +
    (unassigned.length ? '' : noRows('Kaynak hesabı bağlanmayı bekleyen ekstre ödemesi yok.')) + '</details>';
  html += '<div class="card-future-intro"><h2>Gelecek taksitler</h2><p class="notice">Gelecek ayların taksitleri güncel kart borcuna veya bugünkü gidere ikinci kez eklenmez. Ekstrelerden çıkarılan taksitler tahmin, manuel planlar kayıtlı plan olarak etiketlenir.</p></div>';
  html += installmentPanel(ctx,card.installments);
  html += '<details class="panel optional-detail"><summary>Ekstre geçmişi · ' + esc(statements.length) + ' ekstre</summary>' +
    (statements.map(st => '<div class="row"><div class="left"><strong>' + esc(st.period) +
      '</strong><small>Kesim ' + esc(st.cut) + ' · Son ödeme ' + esc(st.due || 'Bilinmiyor') +
      '<br>' + esc(st.bank || 'Banka bilinmiyor') + '</small></div><b>' + amount(ctx,st.debt) +
      '</b><button data-statement-view="' + esc(st.id) + '">Detayı aç</button></div>').join('') ||
      noRows('Henüz ekstre aktarılmadı.')) + '</details>';
  html += accountHistoryPanel(ctx,'card-history','Kart hareketleri',card.movements || []) +
    '<div class="actions"><button data-page="import">Ekstre aktar</button>' +
    '<button data-account="' + esc(account.id) + '">Kartı düzenle</button></div>';
  return html;
}
export function accountView(ctx,accountId) {
  const {state,esc,periodControl} = ctx;
  const account = state.accounts.find(a => a.id === accountId);
  const back = renderBackLink(ctx.backTitle ?? 'Cüzdanım');
  if (!account) return shell(`${back}<h1>Hesap bulunamadı</h1>`);
  if (account.type === 'card') return shell(back + cardView(ctx,account));
  const movements = state.transactions.filter(t => t.account === account.id || t.target === account.id);
  const overview = W.accountOverview(state,account.id,ctx.period);
  const monthly = movements.filter(t => t.date.slice(0,7) === ctx.period);
  return shell(`${back}<h1>${esc(account.name)}</h1><p class="lead">${account.type === 'cash' ? 'Nakit hesabı' : 'Banka hesabı'}</p>
    <section class="hero panel"><small>KAYDEDİLMİŞ KULLANILABİLİR BAKİYE</small><div class="big" data-stat="accountBalance">${amount(ctx,C.balance(state,account))}</div><p class="notice">Açılış bakiyesi gelir sayılmaz. Bakiye kaydedilmiş hareketlere dayanır.</p></section>
    <div class="toolbar"><button class="primary" data-action="addIncome">Gelir ekle</button><button data-action="transfer">Transfer</button><button data-account="${esc(account.id)}">Hesabı düzenle</button></div>
    ${renderBalanceAccount(state,account)}
    <h2 class="divider">Aylık hesap hareketleri</h2><div class="toolbar">${periodControl}</div><div class="summary-grid">${metric(ctx,'income','Hesaba kaydedilmiş gelir',overview.income)}${metric(ctx,'netExpense','Hesaptan net gider',overview.netExpense)}</div><p class="notice">Gelen transferler gelir, giden transferler ve kart borcu ödemeleri gider sayılmaz.</p>
    ${reviewWarning(ctx,movements)}
    ${accountHistoryPanel(ctx,'account-month-history','Seçilen aydaki hareketler',monthly)}
    ${accountHistoryPanel(ctx,'account-all-history','Hesap geçmişi',movements,'Bu hesabın kaynak veya hedef olduğu tüm hareketler.')}`);
}

function categoryPanel(ctx,title,values,empty) {
  const rows = values || [];
  const maximum = rows.reduce((max,[,value]) => C.absCents(value)>max?C.absCents(value):max,1);
  return `<section class="panel"><h2>${ctx.esc(title)}</h2>${rows.map(([category,value]) => `<div class="chart-label"><span>${ctx.esc(category)}</span><b>${amount(ctx,value)}</b></div><progress class="bar" max="${ctx.esc(maximum)}" value="${ctx.esc(C.absCents(value))}" aria-label="${ctx.esc(category)}"></progress>`).join('') || noRows(empty)}</section>`;
}

const reportMetrics = [['income','Gelir'],['spent','Toplam harcama'],['refunds','İadeler'],['netExpense','Net gider'],['margin','Gelir − net gider']];
const reportMonthFormat = new Intl.DateTimeFormat('tr-TR',{month:'long',year:'numeric',timeZone:'UTC'});
const reportMonthLabel = month => reportMonthFormat.format(new Date(month+'-01T12:00:00Z'));


const reportMonthShort = new Intl.DateTimeFormat('tr-TR',{month:'short',timeZone:'UTC'});
const reportHasActivity = m => Boolean(m.categoryBreakdown.length || m.income || m.cashIn || m.cashOut || m.cardPayments || m.transfers);

function monthlyChart(ctx,months,selectedMonth,{category}={}) {
  const values=months.map(m=>category===undefined
    ? (reportHasActivity(m)?m.netExpense:null)
    : m.categoryBreakdown.find(row=>row.name===category)?.net??null);
  const max=values.reduce((largest,value)=>{
    const magnitude=C.absCents(value??0);
    return magnitude>largest?magnitude:largest;
  },1);
  const hasNegative=values.some(value=>value<0);
  const column=(value,negative=false)=>`<progress max="1000" value="${sharePermille(value,max)}" class="report-column${negative?' negative':''}"></progress>`;
  return `<section class="report-trend" aria-labelledby="report-trend-title">
    <h2 id="report-trend-title">Aylık değişim</h2>
    <p class="report-trend-caption">Son ${months.length} ay · Net gider · ${ctx.esc(reportMonthLabel(months[0].month))} – ${ctx.esc(reportMonthLabel(months.at(-1).month))}</p>
    <div class="report-chart-scroll" tabindex="0" role="region" aria-label="Aylık net gider, ayları görmek için yatay kaydır">
      <ul class="report-chart" role="list">${months.map(({month},index)=>{
        const value=values[index];
        const selected=month===selectedMonth;
        const shortMonth=reportMonthShort.format(new Date(month+'-01T12:00:00Z'));
        return `<li data-trend-month="${month}"${selected?' aria-current="date"':''}>
          <span class="report-column-positive" aria-hidden="true">${value>0?column(value):''}</span>
          ${hasNegative?`<span class="report-column-negative" aria-hidden="true">${value<0?column(-value,true):''}</span>`:''}
          <time datetime="${month}"><span class="sr-only">${ctx.esc(reportMonthLabel(month))}</span><span aria-hidden="true">${ctx.esc(shortMonth)}</span></time>
          <span class="report-column-value">${value===null?'<span class="sr-only">Kayıt yok</span><span aria-hidden="true">—</span>':C.formatMoney(value)}</span>
        </li>`;
      }).join('')}</ul>
    </div>
    ${values.includes(null)?'<p class="report-trend-caption" aria-hidden="true">— Kayıt yok</p>':''}
  </section>`;
}

function reportTransactionList(ctx,rows,id) {
  return ctx.transactionList(newest(rows))+(rows.length>ctx.listLimit ? `<button type="button" data-action="more" aria-controls="${id}">Daha fazla göster</button>` : '');
}

function reportSpendingValues(ctx,{spent,refunds,net}) {
  return `<dl class="dashboard-totals">${detail(ctx,'Brüt harcama',spent,true)}${detail(ctx,'İadeler',refunds,true)}${detail(ctx,'Net gider',net,true)}</dl>`;
}

function reportCategories(ctx,current) {
  const {spent,refunds,netExpense,categoryBreakdown}=current;
  return `<section class="panel report-distribution" aria-labelledby="report-distribution-title">
    <h2 id="report-distribution-title">Kategori dağılımı</h2>
    ${categoryBreakdown.length?`${reportSpendingValues(ctx,{spent,refunds,net:netExpense})}
      <p class="notice">Brüt harcamaya göre sıralı</p>
      <ol class="report-category-list" role="list">${categoryBreakdown.map(row=>{
        const permille=sharePermille(row.spent,spent);
        return `<li><button type="button" class="expense-category report-category-button" data-report-category="${ctx.esc(row.name)}">
          <span class="report-category-heading"><strong>${ctx.esc(row.name||'Kategorisiz')}</strong><span class="expense-category-share">${shareLabel(row.spent,permille)} brüt pay</span>${uiIcon('next')}</span>
          <meter min="0" max="1000" value="${permille}" aria-hidden="true"></meter>
          <span class="report-category-amounts"><span>Brüt <b>${amount(ctx,row.spent)}</b></span><span>İade <b>${amount(ctx,row.refunds)}</b></span><span>Net <b>${amount(ctx,row.net)}</b></span></span>
        </button></li>`;
      }).join('')}</ol>`:noRows('Seçili ayda bu kapsamda gider veya iade kaydı yok.')}
  </section>`;
}

function reportControls(ctx,accountId) {
  const range=select('report-range','Rapor aralığı',options([['6','Son 6 ay'],['12','Son 12 ay']],String(ctx.reportFilters.months)));
  const account=select('report-account','Rapor hesabı',options([['','Tüm hesaplar'],...ctx.state.accounts.map(a=>[a.id,a.name])],accountId));
  return `<div class="report-grid report-controls"><div>${range}</div><div><label for="period">Seçili ay</label>${ctx.periodControl}</div><div>${account}</div></div>`;
}

function reportHero(ctx,month,net,caption,content='') {
  return `<section class="panel dashboard-hero report-hero" aria-label="Seçili ayın net gideri">
    <div class="dashboard-hero-caption"><small>${ctx.esc(reportMonthLabel(month))} · Net gider</small><small>${ctx.esc(caption)}</small></div>
    <div class="dashboard-amount">${net===null?'Kayıt yok':amount(ctx,net)}</div>${content}
  </section>`;
}

function reportContext(ctx) {
  const {state,period,reportFilters} = ctx;
  const selectedAccount = state.accounts.find(account => account.id===reportFilters.accountId);
  const accountId = selectedAccount?.id??'';
  const report = advancedReports(state,period,{months:reportFilters.months,accountId});
  const trendEnd=C.today().slice(0,7);
  const trend=trendEnd===period?report:advancedReports(state,trendEnd,{months:reportFilters.months,accountId});
  return {selectedAccount,accountId,report,trend};
}

export function reportCategoryView(ctx,category) {
  const {state,period,esc}=ctx;
  const {accountId,report,trend}=reportContext(ctx);
  const name=category||'Kategorisiz';
  const entry=report.current.categoryBreakdown.find(row=>row.name===category);
  const rows=reportRows(state,[period],{accountId,category});
  return shell(`<div class="advanced-reports">
    ${renderBackLink(ctx.backTitle??'Raporlar')}<h1>${esc(name)}</h1>
    ${reportControls(ctx,accountId)}
    ${reportHero(ctx,period,entry?.net??null,name,entry?reportSpendingValues(ctx,entry):'')}
    <div class="panel">${monthlyChart(ctx,trend.months,period,{category})}</div>
    <section class="panel" aria-labelledby="report-category-transactions-title">
      <h2 id="report-category-transactions-title">Kategori işlemleri</h2>
      <p class="notice">${esc(reportMonthLabel(period))}</p>
      <div id="report-category-transactions">${rows.length?reportTransactionList(ctx,rows,'report-category-transactions'):noRows('Bu kapsamda kategori işlemi yok.')}</div>
    </section>
  </div>`);
}

export function reportsView(ctx) {
  const {state,esc,reportFilters} = ctx;
  const {selectedAccount,accountId,report,trend}=reportContext(ctx);
  const {current,previous,totals,changes} = report;
  return shell(`<div class="advanced-reports"><h1>Raporlar</h1>
    ${reportControls(ctx,accountId)}
    ${reportHero(ctx,current.month,reportHasActivity(current)?current.netExpense:null,'Takvim ayı',monthlyChart(ctx,trend.months,current.month))}
    ${reportCategories(ctx,current)}
    <section class="panel"><h2>${reportFilters.months} aylık toplam</h2>
      <p class="notice">${esc(reportMonthLabel(report.months[0].month))} – ${esc(reportMonthLabel(current.month))}</p>
      <div class="summary-grid">${reportMetrics.map(([key,label])=>metric(ctx,'range-'+key,label,totals[key])).join('')}</div></section>

    <section class="panel"><h2>Gelir ve gider · ${esc(reportMonthLabel(current.month))}</h2>
      <div class="summary-grid">${reportMetrics.map(([key,label])=>metric(ctx,key,label,current[key])).join('')}</div>
      <h3>${esc(reportMonthLabel(previous.month))} ayına göre değişim</h3>
      <dl class="comparison-values">${reportMetrics.map(([key,label])=>detail(ctx,label,changes[key],true)).join('')}</dl>
      <p class="notice">Kartla harcama giderdir. Kart borcu ödemeleri, transferler ve açılış bakiyeleri gelir veya gider yaratmaz.</p>
    </section>
    <section class="panel"><h2>Aylık karşılaştırma</h2>
      ${[...report.months].reverse().map(m=>`<article class="month-comparison" data-report-month="${m.month}"><h3>${esc(reportMonthLabel(m.month))}</h3>
        <dl class="comparison-values">${reportMetrics.map(([key,label])=>detail(ctx,label,m[key],true)).join('')}</dl>
        <p class="notice">Önceki aya göre</p><dl class="comparison-values">
          ${reportMetrics.map(([key,label])=>detail(ctx,label,m.changes[key],true)).join('')}</dl></article>`).join('')}
    </section>
    <section class="panel"><h2>Banka ve nakit akışı · ${esc(reportMonthLabel(current.month))}</h2>
      <div class="summary-grid">${metric(ctx,'cashIn','Hesaplara giren para',current.cashIn)}${metric(ctx,'cashOut','Hesaplardan çıkan para',current.cashOut)}
        ${metric(ctx,'cardCashPayments','Banka veya nakitten kart ödemesi',current.cardCashPayments)}${metric(ctx,'cardPayments','Kayıtlarda görünen kart ödemeleri',current.cardPayments)}
        ${metric(ctx,'cardSpent','Kartla yapılan harcama',current.cardSpent)}${metric(ctx,'transfers','Hesaplar arası transferler',current.transfers)}</div>
      <p class="notice">${selectedAccount?.type==='card'?'Kart bir nakit hesabı değildir. Bu karta yapılan kaynaklı ödemeler ayrı gösterilir.':
        accountId?'Seçili hesaba gelen ve hesaptan giden transferler bu hesabın nakit akışında görünür.':
        'Hesaplar arası transfer, tüm hesapların toplam giriş ve çıkışına eklenmez.'} Kaynak hesabı bilinen kart ödemesi gider oluşturmaz.</p>
      <h3>${reportFilters.months} aylık hareket toplamı</h3>
      <dl class="comparison-values">${detail(ctx,'Hesaplardan çıkan para',totals.cashOut,true)}
        ${detail(ctx,'Banka veya nakitten kart ödemesi',totals.cardCashPayments,true)}
        ${detail(ctx,'Kartla yapılan harcama',totals.cardSpent,true)}</dl>
      <button type="button" id="report-movements-toggle" aria-expanded="${reportFilters.reveal}" aria-controls="report-movements" data-action="toggleReportMovements">Ayın işlem kayıtları</button>
      <div id="report-movements" ${reportFilters.reveal?'':'hidden'}>${reportFilters.reveal?reportTransactionList(ctx,reportRows(state,[current.month],{accountId}),'report-movements'):''}</div>
    </section>
    ${categoryPanel(ctx,'Gelir kategorileri',current.incomeByCategory,'Bu ay kaydedilmiş gelir yok.')}
    ${reviewWarning(ctx)}${sourceWarning(ctx)}</div>`);
}

function reconciliationPreview(ctx,pending) {
  const r = pending.reconciliation || {status:'unverified',missing:[],reasons:['Belgede karşılaştırılabilir başlık toplamları doğrulanamadı.']};
  const labels = {verified:'Toplamlar doğrulandı',unverified:'Toplamlar doğrulanamadı',mismatch:'Mutabakat farkı var · aktarım kapalı'};
  return `<section class="reconciliation ${r.status==='verified'?'verified':'warning'}" aria-label="Ekstre mutabakatı">
    <details ${r.status==='mismatch'?'open':''}><summary>${ctx.esc(labels[r.status] || labels.unverified)}</summary>
      <dl class="card-details">${detail(ctx,'Hesap kesimi',pending.cut)}${detail(ctx,'Son ödeme tarihi',pending.due)}${detail(ctx,'Önceki dönem borcu',r.previousDebt,true)}${detail(ctx,'Belgedeki dönem borcu',r.statementDebt ?? pending.debt,true)}${detail(ctx,'Hareketlerden beklenen dönem borcu',r.expectedDebt,true)}${detail(ctx,'Mutabakat farkı',r.difference,true)}</dl>
      ${(r.reasons || []).length?`<ul>${r.reasons.map(reason=>`<li>${ctx.esc(reason)}</li>`).join('')}</ul>`:''}
      ${(r.missing || []).length?`<p>Okunamayan alanlar: ${r.missing.map(item=>ctx.esc(statementFields[item] || item)).join(', ')}</p>`:''}
    </details>
    ${r.status!=='verified'&&r.status!=='mismatch'?`<label class="acknowledge" for="acknowledge-import"><input type="checkbox" id="acknowledge-import" ${ctx.importDraft.acknowledged?'checked':''} required><span>Okunan hareketleri kontrol ettim ve aktarımı onaylıyorum.</span></label>`:''}
  </section>`;
}


function statementGroups(state) {
  const rowsByStatement = new Map();
  const statementsByMovement = new Map();
  for (const row of state.transactions) {
    if (!row.statement) continue;
    if (!rowsByStatement.has(row.statement)) rowsByStatement.set(row.statement, []);
    rowsByStatement.get(row.statement).push(row);
    for (const movement of [row.id,row.linkedTo].filter(Boolean)) {
      if (!statementsByMovement.has(movement)) statementsByMovement.set(movement, new Set());
      statementsByMovement.get(movement).add(row.statement);
    }
  }
  const underReview = new Set();
  for (const row of state.transactions) {
    if (row.matchStatus !== 'pending') continue;
    for (const id of [row.id,...(row.matchCandidates || [])]) {
      for (const statement of statementsByMovement.get(id) || []) underReview.add(statement);
    }
  }
  return {rowsByStatement,underReview};
}

function statementTotals(rows) {
  if (!rows.length) return {};
  const totals = {expense:0,cardPayment:0,refund:0};
  // These are the source rows in the statement, including any linked copies.
  for (const row of rows) {
    if (Object.hasOwn(totals,row.kind)) totals[row.kind] = C.addCents(totals[row.kind],row.amount);
  }
  return {expenses:totals.expense,payments:totals.cardPayment,refunds:totals.refund};
}

function totalsList(ctx,totals,debt=undefined) {
  return `<dl class="statement-totals">${detail(ctx,'Harcama',totals.expenses,true)}${detail(ctx,'Ödeme',totals.payments,true)}${detail(ctx,'İade / indirim',totals.refunds,true)}${debt!==undefined?detail(ctx,'Dönem borcu',debt,true):''}</dl>`;
}

function statementDateWarning(statement,rows) {
  return rows.some(row=>row.date>statement.cut)
    ? '<p class="warning" role="status">Ekstrede işlem tarihi hesap kesim tarihinden sonra olan hareketler var. Kaynak tarihleri korundu.</p>'
    : '';
}

function statementStatus(statement,pending,movementCount) {
  if (statement.reconciliationStatus === 'mismatch') return {label:'İnceleme gerekiyor',reason:'Belgedeki ekstre toplamları uyuşmuyor.'};
  if (Number.isSafeInteger(statement.importedMovementCount) && statement.importedMovementCount !== movementCount) {
    return {label:'İnceleme gerekiyor',reason:'Kayıtlı hareketler aktarımdan sonra değişmiş.'};
  }
  if (pending) return {label:'İnceleme gerekiyor',reason:'Bu ekstreyle ilişkili olası eşleşmeler inceleme kutusunda.'};
  if (statement.reconciliationStatus === 'verified') return {label:'Doğrulandı',tone:'verified'};
  if (statement.reconciliationStatus === 'unverified') return {label:'İnceleme gerekiyor',reason:'Aktarımda belgedeki toplamlar tam doğrulanamadı.'};
  return {label:'Eski aktarım — doğrulama bilgisi yok',tone:'legacy'};
}

function statementCard(ctx,statement,rows,pending) {
  const {state,esc}=ctx;
  const status=statementStatus(statement,pending,rows.length);
  return `<article class="statement-card">
    <div class="statement-card-heading"><div><h3>${esc(statement.bank || 'Banka bilinmiyor')} <span>· ${esc(statement.period)}</span></h3><p>${esc(accountName(state,statement.account))}</p></div><span class="statement-status ${status.tone||''}">${status.label}</span></div>
    <p class="statement-meta">${esc(rows.length)} hareket${statement.imported?` · Aktarım ${esc(statement.imported)}`:''}</p>
    ${totalsList(ctx,statementTotals(rows),statement.debt??null)}
    <button type="button" class="statement-detail-button" data-statement-view="${esc(statement.id)}" aria-label="${esc(`Detayı aç · ${statement.bank||'Ekstre'} · ${statement.period} · ${accountName(state,statement.account)}`)}">Detayı aç</button>
  </article>`;
}

export function statementTitle(statement) {
  return statement ? `${statement.bank || 'Ekstre'} · ${statement.period}` : 'Ekstre bulunamadı';
}

export function statementView(ctx,id) {
  const statement=ctx.state.statements.find(st=>st.id===id);
  const back = renderBackLink(ctx.backTitle ?? 'Ekstreler');
  const title = ctx.esc(statementTitle(statement));
  if (!statement) return shell(`${back}<h1>${title}</h1>`);
  const {rowsByStatement,underReview}=statementGroups(ctx.state);
  const rows=rowsByStatement.get(id) || [];
  const pending=underReview.has(id);
  const status=statementStatus(statement,pending,rows.length);
  return shell(`${back}
    <h1>${title}</h1>
    <p class="lead">${ctx.esc(accountName(ctx.state,statement.account))}</p>
    <section class="panel"><h2>Ekstre bilgileri</h2><p class="statement-status ${status.tone||''}">${status.label}</p>
      ${status.reason?`<p>${status.reason}</p>`:''}
      ${statementDateWarning(statement,rows)}
      ${totalsList(ctx,statementTotals(rows),statement.debt??null)}
      <dl class="card-details">${detail(ctx,'Hesap kesimi',statement.cut)}${detail(ctx,'Son ödeme tarihi',statement.due)}${detail(ctx,'İçe aktarma tarihi',statement.imported)}</dl>
      <div class="actions"><button data-card-view="${ctx.esc(statement.account)}">Kredi kartını aç</button>${pending?'<button data-page="review">İnceleme kutusu</button>':''}</div>
    </section>
    <section class="panel" id="statement-transactions"><h2>Belgedeki hareketler · ${ctx.esc(rows.length)}</h2>
      ${rows.length?ctx.transactionList(newest(rows)):noRows('Bu ekstreye bağlı hareket kaydı yok.')}
      ${rows.length>ctx.listLimit?'<button type="button" data-action="more" aria-controls="statement-transactions">Daha fazla göster</button>':''}
    </section>`);
}

export function importView(ctx,pending) {
  const {state,esc} = ctx;
  let preview = '';
  if (pending) {
    const rows = (pending.rows || []).map(row=>['expense','refund'].includes(row.kind)
      ? {...row,category:C.activeExpenseCategory(state,row.category)}
      : row);
    const blocked = pending.reconciliation?.status === 'mismatch';
    const needsAcknowledgement = pending.reconciliation?.status !== 'verified';
    const cards = state.accounts.filter(a => a.type === 'card');
    const selectedCard = cards.find(a=>a.id===ctx.importDraft.account) || cards[0];
    preview = `<section class="panel statement-preview" aria-labelledby="statement-preview-title">
      <div class="preview-heading"><h2 id="statement-preview-title">Aktarım önizlemesi</h2><p>${esc(pending.bank || 'Kaynak banka bilinmiyor')} · ${esc(pending.period)} · ${esc(rows.length)} hareket</p></div>
      ${totalsList(ctx,pending.reconciliation?.totals || statementTotals(rows))}
      <div class="preview-card-controls">
        <div><label for="import-account">Hedef kredi kartı</label>
          <div class="preview-select">
            <select id="import-account" ${!cards.length ? 'disabled' : ''}>${cards.length ? cards.map(a => `<option value="${esc(a.id)}" ${a===selectedCard?'selected':''}>${esc(a.name)}</option>`).join('') : '<option value="">Önce kredi kartı ekle</option>'}</select>
            <span class="preview-select-value" aria-hidden="true"><span id="import-account-display">${esc(selectedCard?.name ?? 'Önce kredi kartı ekle')}</span><span>⌄</span></span>
          </div>
        </div>
        <button type="button" data-action="addImportCard">+ Kart ekle</button>
      </div>
      ${reconciliationPreview(ctx,pending)}
      ${statementDateWarning(pending,rows)}
      <div class="preview-movements"><h3 id="preview-movement-title">Okunan hareketler</h3><div class="preview import-preview" role="region" aria-labelledby="preview-movement-title" tabindex="0">${rows.map((r,i) => `<article class="import-row"><div class="row"><div class="left"><strong>${esc(r.desc)}</strong><small>${esc(r.date)} · ${esc(kindNames[r.kind] || r.kind)}<br>${esc(r.category || 'Kategori belirlenmedi')}${r.installment ? ' · '+esc(r.installment) : ''}</small></div><b>${amount(ctx,r.amount)}</b></div><details class="raw-source"><summary>Orijinal banka açıklaması</summary><p>${esc(r.sourceDesc ?? r.desc)}</p></details>${['expense','refund'].includes(r.kind)?ctx.importCategoryOption(r.desc,r.category,i,ctx.importDraft.suggestions.get(i)):''}</article>`).join('') || noRows('Okunmuş hareket yok.')}</div></div>
      <p class="notice">Aynı kartın aynı dönemini tekrar aktarmak ekstre hareketlerini yeniler. Manuel kayıtlar korunur.</p>
      <div class="preview-actions"><button class="primary" data-action="confirmImport" ${blocked || !cards.length || !rows.length || (needsAcknowledgement && !ctx.importDraft.acknowledged) ? 'disabled' : ''}>Onayla ve kaydet</button><button data-action="cancelImport">Vazgeç</button></div>
    </section>`;
  }
  const {rowsByStatement,underReview}=statementGroups(state);
  const history=[...state.statements].sort((a,b)=>b.cut.localeCompare(a.cut));
  return shell(`<h1>Ekstreler</h1><p class="lead">PDF cihazda işlenir. Dosyan dışarı gönderilmez.</p><section class="panel"><h2>Yeni ekstre aktar</h2><p>Metin içeren, şifresiz Yapı Kredi veya QNB kredi kartı PDF'i seç. En fazla 20 MB / 100 sayfa.</p><div class="actions"><button class="primary" data-action="pdf">PDF seç</button><button data-action="csv">Masaüstü CSV'si</button></div><p class="notice">Taranmış görseller ve diğer bankaların PDF'leri desteklenmez. PDF kart hareketlerini aktarır; banka hesabının canlı bakiyesini getirmez.</p></section>${preview}
    <section class="statement-history" aria-labelledby="statement-history-title"><h2 id="statement-history-title" tabindex="-1">Aktarılan ekstreler</h2>${history.map(st=>statementCard(ctx,st,rowsByStatement.get(st.id)||[],underReview.has(st.id))).join('') || noRows('Henüz ekstre aktarılmadı.')}</section>`);
}


export function incomePlansView(ctx,{embedded=false}={}) {
  const {state,esc,transactionList} = ctx;
  const titleTag = embedded ? 'h2' : 'h1';
  const panelTag = embedded ? 'h3' : 'h2';
  const plans = state.incomePlans || [];
  const categories = W.normalizeWallet(state).incomeCategories;
  const received = state.transactions.filter(t => t.incomePlanId);
  return shell(`<section class="income-plans" aria-label="Gelir planları"><${titleTag} class="view-title">Gelir planları</${titleTag}><p class="lead">Maaşını veya düzenli gelirini planla; gerçek para geldiğinde alındı olarak onayla.</p><div class="toolbar"><button class="primary" data-action="incomePlan">+ Gelir planı</button><button data-action="addIncome">Tek seferlik gelir ekle</button></div>
    <aside class="panel"><${panelTag}>Planlanan gelir bakiye değildir</${panelTag}><p>Plan oluşturmak hesabına para eklemez. Alındı onayı gerçek tarihi ve alıcı hesabı sorar. Aynı vade yalnızca bir kez gelir olarak kaydedilir.</p></aside>
    <section class="panel"><${panelTag}>Alındı onayı bekleyen planlar</${panelTag}>${plans.map(plan => `<article class="income-plan"><div class="row"><div class="left"><strong>${esc(plan.name)}</strong><small>${ctx.dateStatus(plan.next)}<br>${esc(accountName(state,plan.account))} · ${esc(plan.category)}</small></div><b>${amount(ctx,plan.amount)}</b></div><div class="actions"><button class="primary" data-income-receive="${esc(plan.id)}" data-due="${esc(plan.next)}">Gelir alındı</button><button data-income-delete="${esc(plan.id)}" aria-label="${esc(plan.name)} gelir planını sil">Planı sil</button></div></article>`).join('') || noRows('Henüz düzenli gelir planın yok.')}</section>
    <section class="panel"><div class="section-heading"><${panelTag}>Gelir kategorileri</${panelTag}><button data-action="incomeCategory">+ Kategori ekle</button></div><p>${categories.map(category => esc(category)).join(' · ')}</p></section>
    <section class="panel"><${panelTag}>Alınmış planlı gelirler</${panelTag}>${transactionList(newest(received))}</section></section>`);
}
