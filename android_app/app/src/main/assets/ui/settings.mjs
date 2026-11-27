import {escapeHtml as esc} from './form-controls.mjs';
import {renderBackLink,uiIcon} from './navigation.mjs';

export const unreadableRestoreFile = 'Yedek dosyası okunamadı.';
// Only fixed messages from readBackup's validators may reach restore feedback.
const restoreValidationMessages = new Set([
  'Bu dosya Android cüzdan yedeği değil.',
  'Bu Android cüzdan yedeği sürümü desteklenmiyor.',
  'Yedek yapısı veya boyutu geçersiz.',
  'Yedek en fazla 32 MB olabilir.',
  'Bütçe verisi geçersiz.',
  'Hesap kaydı geçersiz.',
  'İşlem kaydı geçersiz.',
  'Hedef hesap geçersiz.',
  'Taksit geçersiz.',
  'Ekstre kaydı geçersiz.',
  'Ekstre kimliği birden fazla kayıtta kullanılmış.',
  'Bütçe kaydı geçersiz.',
  'Abonelik geçersiz.',
  'Abonelik kimliği birden fazla kayıtta kullanılmış.',
  'Kategori listesi geçersiz.',
  'Satıcı kategori kuralları geçersiz.',
  'Satıcı kategori kuralı geçersiz.',
  'Bu satıcı için zaten bir kategori kuralı var.',
  'Gelir kategorileri geçersiz.',
  'Gelir planları geçersiz.',
  'Gelir planı geçersiz.',
  'Bakiye gözlemleri bölümü eksik veya geçersiz.',
  'Bakiye gözlemi veya bağlı hesap geçersiz.',
  'Bakiye gözleminin kayıt zamanı geçersiz.',
  'Bakiye mutabakatı onay geçmişi veya kanıtı geçersiz.',
  'Birikim hedefleri bölümü geçersiz.',
  'Birikim hedefinin adını, vadesini, tutarlarını ve banka veya nakit hesabını kontrol et.',
  'Taksit planı kaydı geçersiz.',
  'Taksit planı eksik veya geçersiz.',
  'Eşleşme durumu geçersiz.',
  'Eşleşme hedefi eksik.',
  'İnceleme adayı geçersiz.',
  'CSV kaynak işlem kimliği geçersiz.',
  'CSV aktarım kimliği geçersiz.',
  'CSV inceleme kayıtları geçersiz.',
  'CSV inceleme kaydının kartı bulunamadı.',
  'CSV inceleme kaydı geçersiz.',
  'Yedekte geçersiz işlem bağlantısı var.',
  'Yedekte hesap, tür, tutar veya kaynağı uyuşmayan işlem bağlantısı var.',
  'Yedekte işlem bağlantısının ekstre dönemi uyuşmuyor.',
  'PDF ve CSV ödemelerinin tarihleri veya işlem bilgileri uyuşmuyor.',
  'Yedekte PDF ve CSV ekstre dönemleri uyuşmuyor.',
  'Yedekte tarih veya taksit dönemi uyuşmayan işlem bağlantısı var.',
  'Yedekte CSV işlem bağlantısının kaynağı veya dönemi uyuşmuyor.',
  'Yedekte CSV işlem bağlantısının dönemi uyuşmuyor.',
  'Önce bir hesap ekle.',
  'Gelir banka veya nakit hesabına eklenir.',
  'Ekstre ödemesi bir kredi kartına ait olmalı.',
  'Transfer iki banka/nakit hesabı arasında, kart ödemesi banka/nakitten karta yapılır.',
  'Hedef hesap bağlantısı yalnızca transfer veya kart borcu ödemesinde kullanılabilir.',
  'Gider bölümleri en az iki geçerli kategori ve pozitif tutar içermeli. Bölümlerin toplamı gider tutarına eşit olmalı.',
  'Yalnızca elle girilen, bağlantısız ve taksitsiz TL giderleri bölümlere ayrılabilir.',
]);

export function restoreReadFailureMessage(error) {
  if(error instanceof SyntaxError)return 'Yedek dosyası geçerli bir JSON biçiminde değil.';
  return restoreValidationMessages.has(error?.message)?error.message:unreadableRestoreFile;
}

const failureCopy = {
  backup:['Yedek dışa aktarılamadı','Dışa aktarmayı yeniden başlat.'],
  restore:['Yedek açılamadı','Mevcut cüzdan değişmedi. Başka bir Android JSON yedeği seç.'],
  recover:['Kurtarma kopyası açılamadı','Mevcut kayıtlar korundu. Bir Android JSON yedeği seçebilir veya kopyayı yeniden inceleyebilirsin.'],
};
export const backupFailureHeading = action => failureCopy[action][0];
const failureBanner = (failure,...actions) => failure && actions.includes(failure.action)
  ? `<section class="settings-feedback" id="backup-feedback" aria-labelledby="backup-feedback-title">
    <h3 id="backup-feedback-title">${backupFailureHeading(failure.action)}</h3>
    <p>${esc(failure.message)}</p><p>${failureCopy[failure.action][1]}</p>
  </section>`
  : '';
function settingsRow(label,attributes,detail) {
  const copy = detail
    ? `<span class="settings-row-copy"><span id="${detail.id}-label">${label}</span><small id="${detail.id}-detail">${detail.text}</small></span>`
    : label;
  const accessibleCopy = detail
    ? ` aria-labelledby="${detail.id}-label" aria-describedby="${detail.id}-detail"`
    : '';
  return `<button type="button" class="settings-row" ${attributes}${accessibleCopy}>${copy} ${uiIcon('next')}</button>`;
}

export function settingsView({backTitle,version,categorySections,backupFailure}) {
  return `<div class="settings-surface settings-home">
    ${renderBackLink(backTitle)}
    <div class="settings-intro"><h1>Ayarlar</h1></div>
    <section class="settings-section" aria-labelledby="settings-data">
      <h2 id="settings-data">Veriler ve yedek</h2>
      <div class="panel settings-list">
        <section aria-label="Yedek dışa aktarma">
          ${failureBanner(backupFailure,'backup')}
          ${settingsRow('Yedek dışa aktar','data-action="backup"',
            {id:'settings-export',text:'Kurulum veya kaldırma öncesi bir kopya kaydet.'})}
        </section>
        <section class="settings-list" aria-label="Cüzdanı geri yükleme">
          ${failureBanner(backupFailure,'restore')}
          ${settingsRow('Yedek yükle','data-action="restore"',
            {id:'settings-restore',text:'Bir Android JSON yedeği seç ve incele.'})}
          ${failureBanner(backupFailure,'recover')}
          ${settingsRow('Önceki cüzdanı kurtar','data-action="recover" aria-haspopup="dialog" aria-controls="modal"',
            {id:'settings-recover',text:'Geri yükleme öncesindeki cihaz kopyasını incele.'})}
        </section>
      </div>
      <p class="settings-section-note">Yedek veya önceki kopya, onayından sonra mevcut cüzdanın yerini alır. Kart hareketlerini Ekstre bölümünden CSV olarak aktarabilirsin.</p>
    </section>
    <section class="settings-section settings-organization" aria-labelledby="settings-organization">
      <h2 id="settings-organization">Düzen ve bildirimler</h2>
      <div class="panel settings-list">
        ${settingsRow('Hatırlatmalar','data-page="reminders"',
          {id:'settings-reminders',text:'Vadeler ve planlanan ödemeler.'})}
        ${categorySections}
      </div>
    </section>
    <section class="settings-section" aria-labelledby="settings-application">
      <h2 id="settings-application">Uygulama</h2>
      <div class="panel settings-list">
        ${settingsRow('İnceleme ve kaynak bağlantıları','data-page="review"')}
        ${settingsRow('Örnek cüzdan oluştur','data-action="demo"',
          {id:'settings-demo',text:'Henüz kayıt yoksa yapay verilerle dene.'})}
        <div class="settings-intro settings-version">
          <h3>Sürüm bilgisi</h3>
          <p>${esc(version)}</p>
        </div>
        <section class="settings-privacy" aria-labelledby="settings-privacy">
          <h3 id="settings-privacy">Gizlilik</h3>
          <p>Cüzdan kayıtları bu cihazda saklanır. Cüzdan görüntüsü Android’in son uygulamalar ekranında gizlenir.</p>
          <p>Dışa aktardığın JSON dosyası cüzdan kayıtlarını içerir. Dosyayı erişimini kontrol edebildiğin bir konumda sakla.</p>
        </section>
      </div>
    </section>
  </div>`;
}

export function categoriesView({backTitle,categorySections}) {
  return `<div class="settings-surface">
    ${renderBackLink(backTitle)}
    <div class="settings-intro"><h1>Kategoriler</h1><p>Gelir ve gider kategorilerini, satıcıların hangi gider kategorisini önereceğini düzenle.</p></div>
    ${categorySections}
  </div>`;
}

export function recoveryView({copies,backupFailure}) {
  return `<div class="settings-surface">
    <div class="settings-intro"><h1 tabindex="-1">Cüzdan kurtarma</h1><p>Güncel cüzdan okunamadı. Normal kayıt ve dışa aktarma kapalı.</p></div>
    ${failureBanner(backupFailure,'backup','recover')}
    <section class="panel" aria-labelledby="recovery-copies">
      <h2 id="recovery-copies">Cihazdaki kopyalar</h2>
      ${copies.length ? `<p>Geri yüklemeden önce doğrulanan kopyayı incele.</p>
        <div class="settings-actions">${copies.map(({slot,label}) => `<button type="button" data-action="recover" data-slot="${slot}" aria-haspopup="dialog" aria-controls="modal">${esc(label)} · incele</button>`).join('')}</div>`
        : '<p class="empty-note">Doğrulanabilen dahili kopya bulunamadı.</p>'}
    </section>
    <section class="panel" aria-labelledby="recovery-file">
      <h2 id="recovery-file">Dosyadan geri yükle</h2>
      <p>Android JSON yedeğini seçip içeriğini inceleyebilirsin.</p>
      ${failureBanner(backupFailure,'restore')}
      ${settingsRow('JSON yedeğini yükle','data-action="restore"')}
    </section>
  </div>`;
}

export function replacementDetails({label,wallet,netWorth}) {
  return `<div class="settings-preview">
    ${label ? `<p><strong>${esc(label)}</strong></p>` : ''}
    <p>${wallet.accounts.length} hesap · ${wallet.transactions.length} işlem · Yedek biçimi v${wallet.version}</p>
    ${netWorth === undefined ? '' : `<p>Net varlık <strong>${netWorth}</strong></p>`}
  </div>
  <p class="settings-warning">Onayladığında bu kopya mevcut Android cüzdanının yerini alacak.</p>`;
}
