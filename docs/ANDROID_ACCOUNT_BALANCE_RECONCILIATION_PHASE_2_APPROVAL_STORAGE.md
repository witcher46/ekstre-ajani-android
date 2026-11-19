# Hesap Bakiyesi Mutabakatı Faz 2 · Kalıcı kanıt altyapısı (Dilim 3A)

## Yedek sözleşmesi

- JSON v1 ve v2 olağan kayıtlar ve geri yüklemelerde kendi sürümlerini korur. Gözlem ekleme, önceki sözleşmede olduğu gibi v1'i v2 yapar. v3 okuyucusu `balanceReconciliation.observations` ile birlikte `balanceReconciliation.approvals` dizisini doğrular. Boş onay dizisi dâhil, v3 üzerinde gözlem değişikliği v3'ü korur.
- İlk kalıcı onay ve v2 → v3 geçişi aynı atomik yazmada gerçekleşir. Eski v2 okuyucusu v3 yedeğini yazmadan reddeder. Yerinde APK düşürme desteklenmez.
- Her kayıt `id`, `approvedAt` (milisaniye çözünürlüklü UTC), `previousApprovalId`, `evidenceJson` ve `evidenceSha256` taşır. İlk kayıtta önceki kimlik `null` olur. Bir hesap ve gözlemin sonraki kaydı, aynı çiftin listede daha önceki son onayına bağlanır. Kimlikler benzersizdir ve onay zamanı geriye gidemez.
- `evidenceJson` karşılaştırma motorunun `JSON.stringify(evidence)` ile üretilen kanonik metnidir. Kanıt v1 ve `cash-end-of-day-v1` politikasında hesap, dayanak/gözlem kimlikleri, referansları, kapanış takvimi, kaynak hareket eşleşmeleri ve imzalı ondalık kuruş metinleri saklanır. `source-supported` kapsamı gerekir. Kanıtın tarihsel kimlikleri için güncel defterde canlı kayıt şartı aranmaz. İlgili defter değişiklikleri eski kanıtın üzerine yazmaz.
- `evidenceSha256` kanonik metnin UTF-8 SHA-256 özetidir. Kimlik doğrulaması sağlamaz. Bağımsız kaynak gerçekten kullanıcı tarafından incelenir. Ham PDF/CSV içeriği ve hesap ekstresi metni kanıt alanına eklenmez.

## Android snapshot

`Android.loadForCompare()` tek SQLite okuma işlemi içinde okunan ham snapshot'ı döndürür. Sonuç 64 küçük harfli hex SHA-256 karakteri, tek satır sonu ve ham içerikten oluşur. Okuma başarısızsa sonuç `null` olur. `Android.saveIfUnchanged(token, content)` aday JSON'u doğrular ve SQLite yazma işlemi başladıktan sonra güncel snapshot'ın kimliğini yeniden hesaplar. Geçersiz, eski veya değişiklik üretmeyen istek reddedilir. Geçerli yazma güncel ve önceki kopyayı tek işlemde günceller. Kurtarma kopyası korunur. Kimlik tam içerik eşitliğini temsil eder.

Olağan kayıt v3 geçmişinin her kaydını aynen taşır. CAS aynı geçmişin sonuna kayıt ekleyebilir. Eski bir görünüm v3 geçmişini kısaltamaz veya cüzdanı sürüm düşürerek yazamaz. Açık onaylı dosya geri yükleme önceki cüzdanı kurtarma snapshot'ına alır. Açık onaylı kurtarma, onaylanan kopyanın kimliğini işlemin içinde denetler, güncel cüzdanı önceki snapshot'a taşır ve kurtarma kopyasını korur.

## Kullanıcı onayı (Dilim 3B)

- Banka veya nakit hesabından dayanak ve gözlem eklenir. Kullanıcı gözlemi ve daha erken tarihli bir dayanağı seçer. Gerçek kapanış belgesini veya sayım kaydını uygulama dışında inceler ve kaynağa dönebileceği bir referans girer.
- Kullanıcı hareket kaynağını ve tüm tarih aralığını beyan eder. Defterdeki her etkili hareket için bağımsız kaynaktan okuduğu satır referansını, tarihi ve işaretli tutarı girer. Hareket olmayan aralık da kapsam beyanı gerektirir. Eksik, farklı veya bekleyen eşleşme kapsam onayını engeller.
- Son ekranda seçilen hesap ve kaynaklar, tutarlar, işaretli fark ve kapsam görünür. `source-supported` girilen kaynak satırlarıyla defterin karşılaştırmasını ifade eder. Kullanıcı bağımsız incelemeyi ayrıca onaylar. Kaynak kapsamı destekleniyorsa sıfır dışı fark da inceleme kaydında saklanabilir ve fark olarak gösterilir.
- Kaynak incelemesi açıldığı andaki SQLite snapshot kimliği son kanıta bağlanır. Son ekrandaki onay bir kez kullanılabilir. Uygulama onay anında yeni snapshot okur, karşılaştırmayı tekrar hesaplar ve `evaluateBalanceComparisonEvidence()` ile kanonik kanıtı doğrular. İnceleme veya onay sırasında snapshot değiştiğinde kullanıcı incelemeyi yeniler. Eski PDF/CSV kayıtları mevcut eşleşme kurallarıyla incelenir. Onay yazması bu eşleşmeleri değiştirmez. Bu kontrol, kanıt şemasına girmeyen hesap adı ve hareket açıklaması değişikliklerini de kapsar.
- Uygun onay güncel geçmişin sonuna eklenir ve aynı okumanın kimliğiyle tek CAS çağrısı yapılır. Başarısız CAS yeni inceleme gerektirir. Geçmiş ve güncellik ekranı sonraki dilime aittir.

[Karşılaştırma sözleşmesi](ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_2_COMPARISON.md) · [Gözlem saklama kararı](ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_2_STORAGE.md)
