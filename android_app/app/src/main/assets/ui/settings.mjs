import {escapeHtml as esc} from './form-controls.mjs';
import {renderBackLink} from './navigation.mjs';

const failureBanner = message => message
  ? `<div class="settings-feedback"><h2>Yedekleme işlemi tamamlanamadı</h2><p>${esc(message)}</p></div>`
  : '';

export function settingsView({backTitle,version,categorySections,backupFailure}) {
  return `<div class="settings-surface">
    ${renderBackLink(backTitle)}
    <div class="settings-intro">
      <h1>Ayarlar</h1>
      <p>${esc(version)}</p>
      <div class="settings-actions">
        <button type="button" data-page="reminders">Hatırlatmalar</button>
        <button type="button" data-page="review">İnceleme ve kaynak bağlantıları</button>
      </div>
    </div>
    <section class="panel" aria-labelledby="settings-privacy">
      <h2 id="settings-privacy">Gizlilik</h2>
      <p>Cüzdan kayıtları bu cihazda saklanır. Cüzdan görüntüsü Android’in son uygulamalar ekranında gizlenir.</p>
      <p>Dışa aktardığın JSON dosyası cüzdan kayıtlarını içerir. Dosyayı erişimini kontrol edebildiğin bir konumda sakla.</p>
    </section>
    ${failureBanner(backupFailure)}
    <section class="panel" aria-labelledby="settings-export">
      <h2 id="settings-export">Yedek dışa aktarma</h2>
      <p>Silme veya yeniden kurma öncesinde cüzdanın bir kopyasını seçtiğin konuma kaydet.</p>
      <button type="button" class="primary" data-action="backup">Yedek dışa aktar</button>
    </section>
    <section class="panel settings-replace" aria-labelledby="settings-replace">
      <h2 id="settings-replace">Cüzdanı geri yükleme</h2>
      <p>Android JSON yedeğini veya cihazdaki önceki kopyayı incele. Onay verdiğinde seçtiğin kopya güncel cüzdanın yerini alır.</p>
      <div class="settings-actions">
        <button type="button" data-action="restore">Yedek yükle</button>
        <button type="button" data-action="recover" aria-haspopup="dialog" aria-controls="modal">Geri yükleme öncesi cüzdanı kurtar</button>
      </div>
      <p class="notice">Masaüstü .db dosyası geri yüklenemez. Kart hareketleri için Ekstre bölümünde CSV aktarımını kullan.</p>
    </section>
    ${categorySections}
    <section class="panel" aria-labelledby="settings-demo">
      <h2 id="settings-demo">İlk deneme</h2>
      <p>Henüz kaydedilmiş bir cüzdanın yoksa yapay kayıtlarla uygulamayı deneyebilirsin.</p>
      <button type="button" data-action="demo">Örnek cüzdan oluştur</button>
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
    ${failureBanner(backupFailure)}
    <section class="panel settings-replace" aria-labelledby="recovery-copies">
      <h2 id="recovery-copies">Cihazdaki kopyalar</h2>
      ${copies.length ? `<p>Geri yüklemeden önce doğrulanan kopyayı incele.</p>
        <div class="settings-actions">${copies.map(({slot,label}) => `<button type="button" data-action="recover" data-slot="${slot}" aria-haspopup="dialog" aria-controls="modal">${esc(label)} · incele</button>`).join('')}</div>`
        : '<p class="empty-note">Doğrulanabilen dahili kopya bulunamadı.</p>'}
    </section>
    <section class="panel settings-replace" aria-labelledby="recovery-file">
      <h2 id="recovery-file">Dosyadan geri yükle</h2>
      <p>Android JSON yedeğini seçip içeriğini inceleyebilirsin.</p>
      <button type="button" data-action="restore">JSON yedeğini yükle</button>
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
