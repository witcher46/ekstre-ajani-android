# Hesap Bakiyesi Mutabakatı Faz 2 · Kalıcı kanıt altyapısı (Dilim 3A)

## Yedek sözleşmesi

- JSON v1 ve v2 olağan kayıtlar ve geri yüklemelerde kendi sürümlerini korur. Gözlem ekleme, önceki sözleşmede olduğu gibi v1'i v2 yapar. v3 okuyucusu `balanceReconciliation.observations` ile birlikte `balanceReconciliation.approvals` dizisini doğrular. Boş onay dizisi dâhil, v3 üzerinde gözlem değişikliği v3'ü korur.
- Kalıcı onay ekleme ve v2 → v3 geçişi Dilim 3B'de ilk onayla aynı atomik yazmada yapılacak. Dilim 3A geçerli sentetik v3'ü okuyabilir ve kaydedebilir. Eski v2 okuyucusu v3 yedeğini yazmadan reddeder. Yerinde APK düşürme desteklenmez.
- Her kayıt `id`, `approvedAt` (milisaniye çözünürlüklü UTC), `previousApprovalId`, `evidenceJson` ve `evidenceSha256` taşır. İlk kayıtta önceki kimlik `null` olur. Bir hesap ve gözlemin sonraki kaydı, aynı çiftin listede daha önceki son onayına bağlanır. Kimlikler benzersizdir ve onay zamanı geriye gidemez.
- `evidenceJson` karşılaştırma motorunun `JSON.stringify(evidence)` ile üretilen kanonik metnidir. Kanıt v1 ve `cash-end-of-day-v1` politikasında hesap, dayanak/gözlem kimlikleri, referansları, kapanış takvimi, kaynak hareket eşleşmeleri ve imzalı ondalık kuruş metinleri saklanır. `source-supported` kapsamı gerekir. Kanıtın tarihsel kimlikleri için güncel defterde canlı kayıt şartı aranmaz. İlgili defter değişiklikleri eski kanıtın üzerine yazmaz.
- `evidenceSha256` kanonik metnin UTF-8 SHA-256 özetidir. Kimlik doğrulaması sağlamaz. Bağımsız kaynak gerçekten kullanıcı tarafından incelenir. Ham PDF/CSV içeriği ve hesap ekstresi metni kanıt alanına eklenmez.

## Android snapshot

`Android.loadForCompare()` tek SQLite okuma işlemi içinde okunan ham snapshot'ı döndürür. Sonuç 64 küçük harfli hex SHA-256 karakteri, tek satır sonu ve ham içerikten oluşur. Okuma başarısızsa sonuç `null` olur. `Android.saveIfUnchanged(token, content)` aday JSON'u doğrular ve SQLite yazma işlemi başladıktan sonra güncel snapshot'ın kimliğini yeniden hesaplar. Geçersiz, eski veya değişiklik üretmeyen istek reddedilir. Geçerli yazma güncel ve önceki kopyayı tek işlemde günceller. Kurtarma kopyası korunur. Kimlik tam içerik eşitliğini temsil eder.

Olağan kayıt v3 geçmişinin her kaydını aynen taşır. CAS aynı geçmişin sonuna kayıt ekleyebilir. Eski bir görünüm v3 geçmişini kısaltamaz veya cüzdanı sürüm düşürerek yazamaz. Açık onaylı dosya geri yükleme önceki cüzdanı kurtarma snapshot'ına alır. Açık onaylı kurtarma, onaylanan kopyanın kimliğini işlemin içinde denetler, güncel cüzdanı önceki snapshot'a taşır ve kurtarma kopyasını korur.

Dilim 3B, kullanıcıya sunulan kanıtı bu okuma ile bağlayacak. Kaydetmeden önce güncel defter ve kaynak incelemesiyle `evaluateBalanceComparisonEvidence()` çağrılacak, önceki onay geçmişi korunarak hazırlanan aday CAS ile kaydedilecek. CAS reddi yeni okuma ve inceleme gerektirecek. Geçmişin güncelliğini kullanıcıya gösteren akış sonraki dilimde yapılacak.

[Karşılaştırma sözleşmesi](ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_2_COMPARISON.md) · [Gözlem saklama kararı](ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_2_STORAGE.md)
