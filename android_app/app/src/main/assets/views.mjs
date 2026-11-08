import * as C from './core.mjs';
import * as W from './wallet.mjs';

const kindNames = {expense:'Harcama',income:'Gelir',refund:'İade',payment:'Hesaptan kart ödemesi',cardPayment:'Ekstre kart ödemesi',transfer:'Transfer'};
const statementFields = {previousDebt:'Önceki dönem borcu',statementDebt:'Dönem borcu',expectedDebt:'Beklenen dönem borcu',cut:'Hesap kesim tarihi',due:'Son ödeme tarihi'};
const shell = html => `<div class="wallet-v2">${html}</div>`;
const amount = (ctx,value) => value === null || value === undefined ? '<span class="muted">Bilinmiyor</span>' : ctx.fmt(value);
const accountName = (state,id) => state.accounts.find(a => a.id === id)?.name || 'Hesap';
const newest = rows => [...rows].sort((a,b) => b.date.localeCompare(a.date));
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

function upcoming(ctx) {
  const rows = C.upcomingPayments(ctx.state).filter(r => r.days <= 7).slice(0,4);
  return rows.length ? `<section class="panel"><div class="section-heading"><h2>Yaklaşan / geciken ödemeler</h2><button data-page="plan">Ödeme planı</button></div>${rows.map(r => `<div class="row"><div class="left"><strong>${ctx.esc(r.name)}</strong><small>${ctx.dateStatus(r.date)}${r.estimated ? ' · Kaydedilmiş ödemelere göre tahmin' : ''}</small></div><b>${amount(ctx,r.amount)}</b></div>`).join('')}<p class="notice">Takvim bankadaki ödeme durumunu doğrulamaz.</p></section>` : '';
}

export function homeView(ctx) {
  const {state,periodControl,transactionList} = ctx;
  const overview = W.overview(state,ctx.period);
  const recent = newest(C.rowsForPeriod(state,ctx.period)).slice(0,5);
  return shell(`<h1>Parana genel bakış</h1><p class="lead">Paran, gelirlerin ve kart borçların aynı cüzdanda.</p>
    <section class="hero panel" aria-label="Cüzdan özeti"><small>BANKA VE NAKİT BAKİYESİ</small><div class="big" data-stat="cash">${amount(ctx,overview.cash)}</div>
      <dl class="compact-totals">${compactStat(ctx,'cardDebt','Kart borcu tahmini',overview.cardDebt)}${overview.cardCredit > 0 ? compactStat(ctx,'cardCredit','Kart artı bakiyesi',overview.cardCredit) : ''}${compactStat(ctx,'netWorth','Net varlık',overview.netWorth)}</dl>
      <p class="notice">Kayıtlarına göre tahmin; bankanın canlı bakiyesi değildir.</p>
    </section>
    ${quickActions()}
    ${!state.accounts.length ? `<section class="panel empty"><b>Cüzdanını oluştur</b><p>Önce banka hesabı, nakit hesabı veya kart ekle. Açılış bakiyesi gelir veya gider sayılmaz.</p><div class="actions"><button class="primary" data-action="addAccount">Hesap ekle</button><button data-action="demo">Örnek cüzdan</button></div></section>` : ''}
    <div class="section-heading month-heading"><div><h2>Aylık gelir ve gider</h2><p class="notice">Takvim ayı · işlem tarihine göre</p></div><button data-page="reports">Raporlar ↗</button></div>
    <div class="toolbar">${periodControl}</div>
    <section class="panel month-summary"><dl class="compact-totals">${compactStat(ctx,'income','Gelir',overview.income)}${compactStat(ctx,'netExpense','Net gider',overview.netExpense)}${compactStat(ctx,'margin','Gelir − gider',overview.margin)}</dl><p class="notice">İadeler giderden düşer. Kart ödemeleri ve transferler gider sayılmaz.</p></section>
    ${overview.plannedIncome ? `<div class="panel planned-income"><div><strong>Bu ay planlanan gelir</strong><p class="notice">Alındı olarak onaylanana kadar bakiyeye ve gelire eklenmez.</p><b>${amount(ctx,overview.plannedIncome)}</b></div><button data-page="incomePlans">Gelir planları</button></div>` : ''}
    ${reviewWarning(ctx)}${sourceWarning(ctx)}${upcoming(ctx)}
    <section class="panel"><div class="section-heading"><h2>Son hareketler</h2><button data-page="transactions">Tüm işlemler</button></div>${transactionList(recent)}</section>
    <div class="actions"><button data-page="import">Ekstre aktar</button><button data-page="incomePlans">Gelir planları</button></div>`);
}

export function walletView(ctx) {
  const {state,esc} = ctx;
  const overview = W.overview(state,ctx.period);
  let html = `<h1>Cüzdanım</h1><p class="lead">Banka ve nakit varlıklarını, kart borcunu ve kart artı bakiyesini ayrı takip et.</p><div class="toolbar"><button class="primary" data-action="addAccount">+ Hesap / kart ekle</button><button data-action="transfer">Hesaplar arası transfer</button></div>
    <div class="summary-grid">${metric(ctx,'cash','Banka ve nakit',overview.cash)}${metric(ctx,'cardDebt','Kart borcu tahmini',overview.cardDebt)}${metric(ctx,'cardCredit','Kart artı bakiyesi',overview.cardCredit)}</div>`;
  for (const [type,label] of [['bank','Banka hesapları'],['cash','Nakit'],['card','Kredi kartları']]) {
    const accounts = state.accounts.filter(a => a.type === type);
    if (!accounts.length) continue;
    html += `<section aria-label="${esc(label)}"><h2 class="divider">${esc(label)}</h2><div class="account-grid">${accounts.map(a => {
      const card = type === 'card' ? W.cardDetail(state,a.id) : null;
      return `<article class="panel account-tile"><button class="account-open" ${card ? 'data-card-view' : 'data-account-view'}="${esc(a.id)}"><span class="account-title">${esc(a.name)}<span aria-hidden="true">↗</span></span><small>${card ? 'Güncel kart borcu tahmini' : 'Kaydedilmiş kullanılabilir bakiye'}</small><b>${amount(ctx,card ? card.debt : C.balance(state,a))}</b>${card ? `<small>Kart artı bakiyesi</small><b class="card-credit">${amount(ctx,card.credit)}</b><small>Son ödeme: ${esc(card.latest?.due || 'Henüz ekstre yok')}</small>` : ''}</button><div class="actions"><button data-account="${esc(a.id)}">Hesabı düzenle</button>${card ? `<button class="primary" data-pay-card="${esc(a.id)}">Borç öde</button>` : ''}</div></article>`;
    }).join('')}</div></section>`;
  }
  if (!state.accounts.length) html += `<section class="panel empty"><b>Henüz hesap yok</b><p>Banka veya nakit bakiyeni ve kartlarını ekleyerek başla.</p><button data-action="demo">Örnek cüzdan</button></section>`;
  return shell(html + reviewWarning(ctx) + sourceWarning(ctx));
}

function installmentPanel(ctx,installments) {
  if (!installments) return '';
  const items = installments.items || [];
  return `<details class="panel optional-detail" ${items.length ? 'open' : ''}><summary>Taksit görünümü${items.length ? ` · ${ctx.esc(items.length)} plan` : ' · Kayıt yok'}</summary><div class="summary-grid">${metric(ctx,'installmentPosted','Kaydedilmiş taksit gideri',installments.postedExpense)}${metric(ctx,'installmentFuture','Gelecek taksit yükü tahmini',installments.estimatedFutureLiability)}</div>
    <p class="notice">Gelecek taksitler tahmindir; mevcut borca veya aylık gidere yeniden eklenmez. Toplam satın alma bedeli belgeyle doğrulanmış olmayabilir.</p>
    ${installments.ambiguous ? '<p class="warning">Bazı taksit hareketleri kesin gruplanamadı. Tahmini tutarları belgeyle kontrol et; aynı tutarlı ayrı alışverişler olabilir.</p>' : ''}
    ${items.map(item => `<article class="installment-item"><div class="row"><div class="left"><strong>${ctx.esc(item.desc)}</strong><small>Kaydedilen taksit ${ctx.esc(item.current)} / ${ctx.esc(item.total)} · Kalan ${ctx.esc(item.remaining)} taksit${item.ambiguous ? ' · Gruplama belirsiz' : ''}</small></div><b>${amount(ctx,item.amount)}</b></div><dl class="card-details">${detail(ctx,'Kaydedilmiş gider',item.postedExpense,true)}${detail(ctx,'Gelecek taksitler · tahmin',item.estimatedFutureLiability,true)}</dl></article>`).join('') || noRows('Bu kartta taksit bilgisi bulunan hareket yok.')}
  </details>`;
}

function cardView(ctx,account) {
  const {state,esc,transactionList} = ctx;
  const card = W.cardDetail(state,account.id);
  const statements = state.statements.filter(st => st.account === account.id).sort((a,b) => b.cut.localeCompare(a.cut));
  const unassigned = card.unassignedPayments || [];
  return `<div class="detail-heading"><div><h1>${esc(account.name)}</h1><p class="lead">Kredi kartı · belge ve kayıtlara göre</p></div><button class="primary" data-pay-card="${esc(account.id)}">Bu kartın borcunu öde</button></div>
    <section class="hero panel"><div class="summary-grid">${metric(ctx,'cardDebt','Güncel borç tahmini',card.debt)}${metric(ctx,'cardCredit','Kart artı bakiyesi',card.credit)}</div><p class="notice">Bilinen son ekstre borcu veya açılış borcu ile sonraki kayıtlar kullanılır. Son belgenin borcu okunamadıysa önceki bilinen tutar tahmine temel olur. Bankanın canlı bakiyesi değildir; gelecek taksitler eklenmez.</p></section>
    <section class="panel"><h2>Son ekstre ve ödeme durumu</h2><dl class="card-details">${detail(ctx,'Ekstre dönemi',card.latest?.period || 'Henüz ekstre yok')}${detail(ctx,'Hesap kesim tarihi',card.latest?.cut)}${detail(ctx,'Son ödeme tarihi',card.latest?.due)}${detail(ctx,'Belgedeki son ekstre borcu',card.statementDebt,true)}${detail(ctx,'Kesim sonrası kaydedilmiş ödemeler',card.paidAfterCut,true)}${detail(ctx,'Ödemelere göre kalan ekstre borcu',card.statementRemaining,true)}</dl><p class="notice">Kalan ekstre borcundan yalnızca kaydedilmiş ödemeler düşer. İadeler aşağıda ayrı gösterilir. Bankanın iadeyi son ödeme yükümlülüğüne saydığı varsayılmaz.</p></section>
    <section class="panel"><h2>Kesim sonrası hareketler</h2><div class="summary-grid">${metric(ctx,'postCutExpenses','Yeni harcamalar',card.postCutExpenses)}${metric(ctx,'postCutRefunds','İadeler',card.postCutRefunds)}</div><p class="notice">İade güncel borç tahminini etkileyebilir; ekstre ödeme yükümlülüğünü tek başına doğrulamaz.</p></section>
    ${reviewWarning(ctx,state.transactions.filter(t => t.account === account.id || t.target === account.id))}
    <details class="panel optional-detail" ${unassigned.length ? 'open' : ''}><summary>Ödeme kaynakları${unassigned.length ? ` · ${esc(unassigned.length)} hesap bağlanmalı` : ' · Bekleyen yok'}</summary><p class="notice">Ekstrede görünen ödemenin hangi banka veya nakit hesabından çıktığını bağla. Kart ödemesi gider sayılmaz; aynı işlem ikinci kez kaydedilmez.</p>${unassigned.map(t => `<div class="row"><div class="left"><strong>${esc(t.desc)}</strong><small>${esc(t.date)} · Kaynak hesap bilinmiyor</small></div><b>${amount(ctx,t.amount)}</b><button data-bind-payment="${esc(t.id)}">Kaynak hesabı bağla</button></div>`).join('') || noRows('Kaynak hesabı bağlanmayı bekleyen ekstre ödemesi yok.')}</details>
    ${installmentPanel(ctx,card.installments)}
    <details class="panel optional-detail"><summary>Ekstre geçmişi · ${esc(statements.length)} ekstre</summary>${statements.map(st => `<div class="row"><div class="left"><strong>${esc(st.period)}</strong><small>Kesim ${esc(st.cut)} · Son ödeme ${esc(st.due || 'Bilinmiyor')}<br>${esc(st.bank || '')}</small></div><b>${amount(ctx,st.debt)}</b></div>`).join('') || noRows('Henüz ekstre aktarılmadı.')}</details>
    <section class="panel"><h2>Kart hareketleri</h2>${transactionList(newest(card.movements || []))}</section>
    <div class="actions"><button data-page="import">Ekstre aktar</button><button data-account="${esc(account.id)}">Kartı düzenle</button></div>`;
}

export function accountView(ctx,accountId) {
  const {state,esc,transactionList,periodControl} = ctx;
  const account = state.accounts.find(a => a.id === accountId);
  if (!account) return shell('<h1>Hesap bulunamadı</h1><button data-page="wallet">Cüzdana dön</button>');
  if (account.type === 'card') return shell(`<button class="back-link" data-page="wallet">← Cüzdanım</button>${cardView(ctx,account)}`);
  const movements = state.transactions.filter(t => t.account === account.id || t.target === account.id);
  const overview = W.accountOverview(state,account.id,ctx.period);
  const monthly = movements.filter(t => t.date.slice(0,7) === ctx.period);
  return shell(`<button class="back-link" data-page="wallet">← Cüzdanım</button><h1>${esc(account.name)}</h1><p class="lead">${account.type === 'cash' ? 'Nakit hesabı' : 'Banka hesabı'}</p>
    <section class="hero panel"><small>KAYDEDİLMİŞ KULLANILABİLİR BAKİYE</small><div class="big" data-stat="accountBalance">${amount(ctx,C.balance(state,account))}</div><p class="notice">Açılış bakiyesi gelir sayılmaz. Bakiye kaydedilmiş hareketlere dayanır.</p></section>
    <div class="toolbar"><button class="primary" data-action="addIncome">Gelir ekle</button><button data-action="transfer">Transfer</button><button data-account="${esc(account.id)}">Hesabı düzenle</button></div>
    <h2 class="divider">Aylık hesap hareketleri</h2><div class="toolbar">${periodControl}</div><div class="summary-grid">${metric(ctx,'income','Hesaba kaydedilmiş gelir',overview.income)}${metric(ctx,'netExpense','Hesaptan net gider',overview.netExpense)}</div><p class="notice">Gelen transferler gelir, giden transferler ve kart borcu ödemeleri gider sayılmaz.</p>
    ${reviewWarning(ctx,movements)}<section class="panel"><h2>Seçilen aydaki hareketler</h2>${transactionList(newest(monthly))}</section><section class="panel"><h2>Hesap geçmişi</h2><p class="notice">Bu hesabın kaynak veya hedef olduğu tüm hareketler.</p>${transactionList(newest(movements))}</section>`);
}

function categoryPanel(ctx,title,values,empty) {
  const rows = values || [];
  const maximum = Math.max(1,...rows.map(([,value]) => Math.abs(value)));
  return `<section class="panel"><h2>${ctx.esc(title)}</h2>${rows.map(([category,value]) => `<div class="chart-label"><span>${ctx.esc(category)}</span><b>${amount(ctx,value)}</b></div><progress class="bar" max="${ctx.esc(maximum)}" value="${ctx.esc(Math.abs(value))}" aria-label="${ctx.esc(category)}"></progress>`).join('') || noRows(empty)}</section>`;
}

export function reportsView(ctx) {
  const {state,esc,periodControl} = ctx;
  const overview = W.overview(state,ctx.period);
  const periods = [...new Set([ctx.period,...state.transactions.filter(C.effective).map(t => t.date.slice(0,7))])].sort().reverse();
  return shell(`<h1>Raporlar</h1><p class="lead">Aylık gelir ve gideri, hesaba giren ve çıkan paradan ayrı oku.</p><p class="notice">Takvim ayı · gerçek işlem tarihine göre</p><div class="toolbar">${periodControl}</div>
    <section class="panel"><h2>Gelir ve gider</h2><div class="summary-grid">${metric(ctx,'income','Gelir',overview.income)}${metric(ctx,'netExpense','Net gider',overview.netExpense)}${metric(ctx,'margin','Gelir − gider',overview.margin)}</div><dl class="card-details">${detail(ctx,'Kaydedilmiş harcamalar',overview.spent,true)}${detail(ctx,'İadeler',overview.refunds,true)}</dl><p class="notice">Kartla harcama giderdir. Kart borcu ödemeleri, transferler ve açılış bakiyeleri gelir veya gider yaratmaz.</p></section>
    <section class="panel"><h2>Banka ve nakit akışı</h2><div class="summary-grid">${metric(ctx,'cashIn','Hesaplara giren para',overview.cashIn)}${metric(ctx,'cashOut','Hesaplardan çıkan para',overview.cashOut)}${metric(ctx,'cardPayments','Kart borcu ödemeleri',overview.cardPayments)}${metric(ctx,'transfers','Hesaplar arası transferler',overview.transfers)}</div><p class="notice">Nakit akışı banka ve nakit hareketlerini gösterir. Kaynak hesabı bilinen kart ödemeleri para çıkışına dahildir. Hesapların arasındaki transferler toplam giriş ve çıkışa tekrar eklenmez. Kart ödemeleri ve transferler aylık gider sayılmaz.</p></section>
    ${categoryPanel(ctx,'Kategori dağılımı',overview.categories,'Bu ay kaydedilmiş gider yok.')}${categoryPanel(ctx,'Gelir kategorileri',overview.incomeByCategory,'Bu ay kaydedilmiş gelir yok.')}
    <section class="panel"><h2>Aylık karşılaştırma</h2>${periods.map(period => { const month = W.overview(state,period); return `<article class="month-comparison"><h3>${esc(period)}</h3><dl class="comparison-values"><div><dt>Gelir</dt><dd>${amount(ctx,month.income)}</dd></div><div><dt>Net gider</dt><dd>${amount(ctx,month.netExpense)}</dd></div><div><dt>Gelir − gider</dt><dd>${amount(ctx,month.margin)}</dd></div></dl></article>`; }).join('')}</section>
    ${reviewWarning(ctx)}${sourceWarning(ctx)}`);
}

function reconciliationPreview(ctx,pending) {
  const r = pending.reconciliation || {status:'unverified',missing:[],reasons:['Belgede karşılaştırılabilir başlık toplamları doğrulanamadı.'],totals:{}};
  const labels = {verified:'Toplamlar doğrulandı',unverified:'Toplamlar doğrulanamadı',mismatch:'Toplamlar uyuşmuyor · aktarım kapalı'};
  return `<section class="reconciliation ${r.status === 'verified' ? 'verified' : 'warning'}" aria-label="Ekstre mutabakatı"><h3>${ctx.esc(labels[r.status] || labels.unverified)}</h3><dl class="card-details">${detail(ctx,'Önceki dönem borcu',r.previousDebt,true)}${detail(ctx,'Belgedeki dönem borcu',r.statementDebt ?? pending.debt,true)}${detail(ctx,'Hareketlerden beklenen dönem borcu',r.expectedDebt,true)}${detail(ctx,'Mutabakat farkı',r.difference,true)}</dl>
    ${(r.reasons || []).length ? `<ul>${r.reasons.map(reason => `<li>${ctx.esc(reason)}</li>`).join('')}</ul>` : ''}${(r.missing || []).length ? `<p>Okunamayan alanlar: ${r.missing.map(item => ctx.esc(statementFields[item] || item)).join(', ')}</p>` : ''}
    ${r.status === 'mismatch' ? '<p>Belgedeki borç ve hareket toplamları çelişiyor. Bu önizleme kaydedilemez; belgeyi ve okunan satırları kontrol et.</p>' : r.status !== 'verified' ? '<p>Eksik başlıklar nedeniyle borç doğrulanamadı. Satırları belgeyle karşılaştırdıktan sonra ayrıca onay vermen gerekir.</p><label class="acknowledge" for="acknowledge-import"><input type="checkbox" id="acknowledge-import" required><span>Toplamların doğrulanamadığını anladım; okunan hareketleri kontrol ettim ve aktarımı onaylıyorum.</span></label>' : '<p>Belgede okunan başlık toplamları ve hareketler birbiriyle uyumlu.</p>'}</section>`;
}

export function importView(ctx,pending) {
  const {state,esc} = ctx;
  let preview = '';
  if (pending) {
    const totals = pending.reconciliation?.totals || {};
    const rows = pending.rows || [];
    const blocked = pending.reconciliation?.status === 'mismatch';
    const cards = state.accounts.filter(a => a.type === 'card');
    preview = `<section class="panel"><h2>Aktarım önizlemesi</h2><p>${esc(pending.bank || 'Kaynak banka bilinmiyor')} · ${esc(pending.period)} · ${esc(rows.length)} hareket</p><dl class="card-details">${detail(ctx,'Hesap kesimi',pending.cut)}${detail(ctx,'Son ödeme tarihi',pending.due)}</dl>${pending.warning ? `<p class="warning">${esc(pending.warning)}</p>` : ''}
      <div class="summary-grid">${metric(ctx,'importExpenses','Okunan harcamalar',totals.expenses)}${metric(ctx,'importPayments','Okunan kart ödemeleri',totals.payments)}${metric(ctx,'importRefunds','Okunan iadeler',totals.refunds)}</div>
      ${reconciliationPreview(ctx,pending)}
      <p class="notice">Aynı kartın aynı dönemi yeniden aktarılırsa o ekstrenin hareketleri yenilenir. Manuel kayıtlar korunur; olası eşleşmeler kararını bekler.</p>
      <label for="import-account">Hedef kredi kartı</label><select id="import-account" ${!cards.length ? 'disabled' : ''}>${cards.length ? cards.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('') : '<option value="">Önce kredi kartı ekle</option>'}</select><button data-action="addAccount">+ Kart ekle</button>
      <h3>Okunan hareketler</h3><div class="preview import-preview">${rows.map(r => `<article class="import-row"><div class="row"><div class="left"><strong>${esc(r.desc)}</strong><small>${esc(r.date)} · ${esc(kindNames[r.kind] || r.kind)}<br>${esc(r.category || 'Kategori belirlenmedi')}${r.installment ? ' · '+esc(r.installment) : ''}</small></div><b>${amount(ctx,r.amount)}</b></div><details class="raw-source"><summary>Orijinal banka açıklaması</summary><p>${esc(r.sourceDesc ?? r.desc)}</p></details></article>`).join('') || noRows('Okunmuş hareket yok.')}</div>
      <div class="actions"><button class="primary" data-action="confirmImport" ${blocked || !cards.length || !rows.length ? 'disabled aria-disabled="true"' : ''}>Onayla ve kaydet</button><button data-action="cancelImport">Vazgeç</button></div>
    </section>`;
  }
  return shell(`<h1>Ekstreler</h1><p class="lead">PDF cihazda işlenir. Dosyan dışarı gönderilmez.</p><section class="panel"><h2>Yeni ekstre aktar</h2><p>Metin içeren, şifresiz Yapı Kredi veya QNB kredi kartı PDF'i seç. En fazla 20 MB / 100 sayfa.</p><div class="actions"><button class="primary" data-action="pdf">PDF seç</button><button data-action="csv">Masaüstü CSV'si</button></div><p class="notice">Taranmış görseller ve diğer bankaların PDF'leri desteklenmez. PDF kart hareketlerini aktarır; banka hesabının canlı bakiyesini getirmez.</p></section>${preview}
    <section class="panel"><h2>Aktarılan ekstreler</h2>${[...state.statements].sort((a,b) => b.cut.localeCompare(a.cut)).map(st => `<div class="row"><div class="left"><button class="text-button" data-card-view="${esc(st.account)}">${esc(accountName(state,st.account))}</button><small>${esc(st.period)} · ${esc(st.bank || '')}</small></div><b>${amount(ctx,st.debt)}</b></div>`).join('') || noRows('Henüz ekstre aktarılmadı.')}</section>`);
}

export function incomePlansView(ctx) {
  const {state,esc,transactionList} = ctx;
  const plans = state.incomePlans || [];
  const categories = W.normalizeWallet(state).incomeCategories;
  const received = state.transactions.filter(t => t.incomePlanId);
  return shell(`<section aria-label="Gelir planları"><h2 class="view-title">Gelir planları</h2><p class="lead">Maaşını veya düzenli gelirini planla; gerçek para geldiğinde alındı olarak onayla.</p><div class="toolbar"><button class="primary" data-action="incomePlan">+ Gelir planı</button><button data-action="addIncome">Tek seferlik gelir ekle</button></div>
    <aside class="panel"><h2>Planlanan gelir bakiye değildir</h2><p>Plan oluşturmak hesabına para eklemez. Alındı onayı gerçek tarihi ve alıcı hesabı sorar. Aynı vade yalnızca bir kez gelir olarak kaydedilir.</p></aside>
    <section class="panel"><h2>Alındı onayı bekleyen planlar</h2>${plans.map(plan => `<article class="income-plan"><div class="row"><div class="left"><strong>${esc(plan.name)}</strong><small>${ctx.dateStatus(plan.next)}<br>${esc(accountName(state,plan.account))} · ${esc(plan.category)}</small></div><b>${amount(ctx,plan.amount)}</b></div><div class="actions"><button class="primary" data-income-receive="${esc(plan.id)}" data-due="${esc(plan.next)}">Gelir alındı</button><button data-income-delete="${esc(plan.id)}" aria-label="${esc(plan.name)} gelir planını sil">Planı sil</button></div></article>`).join('') || noRows('Henüz düzenli gelir planın yok.')}</section>
    <section class="panel"><div class="section-heading"><h2>Gelir kategorileri</h2><button data-action="incomeCategory">+ Kategori ekle</button></div><p>${categories.map(category => esc(category)).join(' · ')}</p></section>
    <section class="panel"><h2>Alınmış planlı gelirler</h2>${transactionList(newest(received))}</section></section>`);
}
