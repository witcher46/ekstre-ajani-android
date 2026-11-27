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
const settingsRow = (label,attributes) =>
  `<button type="button" class="settings-row" ${attributes}>${label} ${uiIcon('next')}</button>`;

export function settingsView({backTitle,version,categorySections,backupFailure}) {
  return `<div class="settings-surface">
    ${renderBackLink(backTitle)}
    <div class="settings-intro">
      <h1>Ayarlar</h1>
      <p>${esc(version)}</p>
    </div>
    <div class="panel settings-group">
      ${settingsRow('Hatırlatmalar','data-page="reminders"')}
      ${settingsRow('İnceleme ve kaynak bağlantıları','data-page="review"')}
    </div>
    <section class="panel" aria-labelledby="settings-export">
      <h2 id="settings-export">Yedek dışa aktarma</h2>
      <p>Silme veya yeniden kurma öncesinde cüzdanın bir kopyasını seçtiğin konuma kaydet.</p>
      ${failureBanner(backupFailure,'backup')}
      ${settingsRow('Yedek dışa aktar','data-action="backup"')}
    </section>
    <section class="panel" aria-labelledby="settings-replace">
      <h2 id="settings-replace">Cüzdanı geri yükleme</h2>
      <p>Android JSON yedeğini veya önceki kopyayı incele. Onay verdiğinde seçtiğin kopya güncel cüzdanın yerini alır.</p>
      ${failureBanner(backupFailure,'restore','recover')}
      <div class="settings-group">
        ${settingsRow('Yedek yükle','data-action="restore"')}
        ${settingsRow('Geri yükleme öncesi cüzdanı kurtar','data-action="recover" aria-haspopup="dialog" aria-controls="modal"')}
      </div>
      <p class="notice">Android JSON yedekleri desteklenir. Kart hareketlerini Ekstre bölümünden CSV olarak aktarabilirsin.</p>
    </section>
    ${categorySections}
    <section class="panel" aria-labelledby="settings-privacy">
      <h2 id="settings-privacy">Gizlilik</h2>
      <p>Cüzdan kayıtları bu cihazda saklanır. Cüzdan görüntüsü Android’in son uygulamalar ekranında gizlenir.</p>
      <p>Dışa aktardığın JSON dosyası cüzdan kayıtlarını içerir. Dosyayı erişimini kontrol edebildiğin bir konumda sakla.</p>
    </section>
    <section class="panel" aria-labelledby="settings-demo">
      <h2 id="settings-demo">İlk deneme</h2>
      <p>Henüz kaydedilmiş bir cüzdanın yoksa yapay kayıtlarla uygulamayı deneyebilirsin.</p>
      ${settingsRow('Örnek cüzdan oluştur','data-action="demo"')}
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
