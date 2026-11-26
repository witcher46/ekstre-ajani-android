# Veri biçimleri ve taşıma notları

Her uygulama kendi yerel deposuna sahiptir. Bunlar otomatik eşitlenmez; taşıma kullanıcı tarafından seçilen bir yedek ve açık onayla yapılır.

| Platform | Yerel şema/depo | Yedek biçimi | Mevcut taşıma sınırı |
|---|---|---|---|
| Windows masaüstü | SQLite `PRAGMA user_version=4`; dosya kullanıcı profilinin yerel uygulama veri klasöründedir | SQLite veritabanı ve yerel kurtarma kopyaları | Bu depodaki masaüstü şeması `db.py` içinde sürümlenir. Web aktarımı yalnızca doğrulanmış SQLite v4 dosyasını salt okunur işler; parola/kimlik bilgileri aktarılmaz. |
| Android | Uygulamaya özel yerel SQLite | JSON `format="ekstre-android"`, `version` değeri `1`, `2` veya `3` | v1, v2 ve v3 geri yüklenebilir. Dışa aktarma, kaydedilmiş cüzdanın JSON sürümünü korur. |
| Web | Tarayıcı IndexedDB veritabanı sürüm 2 | Web JSON yedeği `version=2` | IndexedDB v1→v2 göçü ve eski web JSON v1 geri yüklemesi desteklenir. Android JSON v1 ve masaüstü SQLite v4 aktarımı önizleme ile yapılır. |

## Android JSON sürümleri

- **v1** yeni cüzdanın başlangıç biçimidir. Olağan düzenlemeler cüzdanın, geri yükleme ise seçilen yedeğin JSON sürümünü korur.
- **v2**, v1 cüzdana ilk bakiye gözlemi kaydedildiğinde oluşur ve `balanceReconciliation.observations` dizisini taşır. Son gözlem silinse de cüzdan v2 olarak kalır. [Gözlem saklama sözleşmesi](ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_2_STORAGE.md)
- **v3**, v2 cüzdanda ilk mutabakat onayı kalıcı olarak kaydedildiğinde oluşur. Sürüm geçişi ve onay aynı atomik yazmada kaydedilir. v3 yedeği gözlemlerin yanında `balanceReconciliation.approvals` dizisini taşır. Gözlem düzenleme veya silme v3’ü ve onay geçmişini korur. [Onay saklama sözleşmesi](ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_2_APPROVAL_STORAGE.md)

**Ayarlar → Yedek dışa aktar**, kaydedilmiş cüzdanın JSON sürümünü dosyaya yazar. **Ayarlar → Yedek yükle**, sürümü yazmadan önce doğrular. Yalnız v1 destekleyen Android okuyucuları v2 ve v3 dosyalarını, en çok v2 destekleyenler ise v3 dosyalarını mevcut cüzdanı değiştirmeden reddeder. v2 veya v3 dosyasını geri yüklemek için o JSON sürümünü destekleyen bir Android APK’sı gerekir. Android v1 ile sınırlı web aktarımı v2 ve v3 dosyalarını açamaz.

## Güvenli taşıma ilkeleri

- Yedek almadan şema/format yükseltmesi yapılmaz. Kaynak dosya değiştirilmeden saklanır.
- Bilinmeyen veya desteklenmeyen sürüm sessizce dönüştürülmez; yazma başlamadan reddedilir.
- Aktarımda profil seçimi, eşleşme ve değiştirilecek alanlar kullanıcıya gösterilir. Kayıt kimlikleri ve kaynak bilgisi mümkün olduğunca korunur.
- Mevcut cüzdanın üzerine yazma öncesinde hedef uygulamanın kurtarma kopyası bulunmalıdır. Yenileme/geri yükleme atomik olmalı; hata durumunda önceki cüzdan korunmalıdır.
- Android/Web JSON dosyaları düz metin kişisel finans verisi içerir. Git'e, CI artefaktına veya herkese açık paylaşım alanına eklenmez.
- Şema değişikliğinde sürüm, geriye uyumluluk, reddedilen sürümler ve geri alma yolu ilgili uygulama belgelerinde kayda geçirilir.

Bu tablo mevcut uygulama kodunun sınırlarını özetler; yeni bir çapraz-platform dosya formatı veya otomatik geçiş vaadi değildir.
