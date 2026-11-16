# Veri biçimleri ve taşıma notları

Her uygulama kendi yerel deposuna sahiptir. Bunlar otomatik eşitlenmez; taşıma kullanıcı tarafından seçilen bir yedek ve açık onayla yapılır.

| Platform | Yerel şema/depo | Yedek biçimi | Mevcut taşıma sınırı |
|---|---|---|---|
| Windows masaüstü | SQLite `PRAGMA user_version=4`; dosya kullanıcı profilinin yerel uygulama veri klasöründedir | SQLite veritabanı ve yerel kurtarma kopyaları | Bu depodaki masaüstü şeması `db.py` içinde sürümlenir. Web aktarımı yalnızca doğrulanmış SQLite v4 dosyasını salt okunur işler; parola/kimlik bilgileri aktarılmaz. |
| Android | Uygulamaya özel yerel SQLite | JSON `format="ekstre-android"`, `version=1` veya `version=2` | Eski v1 kayıtlar korunur. İlk bakiye gözlemi Android yedeğini v2 yapar. Eski Android ve v1 web aktarımı için [gözlemli yedek geçiş sözleşmesine](ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_2_STORAGE.md) bak. Otomatik senkronizasyon yoktur. |
| Web | Tarayıcı IndexedDB veritabanı sürüm 2 | Web JSON yedeği `version=2` | IndexedDB v1→v2 göçü ve eski web JSON v1 geri yüklemesi desteklenir. Android JSON v1 ve masaüstü SQLite v4 aktarımı önizleme ile yapılır. |

## Güvenli taşıma ilkeleri

- Yedek almadan şema/format yükseltmesi yapılmaz. Kaynak dosya değiştirilmeden saklanır.
- Bilinmeyen veya desteklenmeyen sürüm sessizce dönüştürülmez; yazma başlamadan reddedilir.
- Aktarımda profil seçimi, eşleşme ve değiştirilecek alanlar kullanıcıya gösterilir. Kayıt kimlikleri ve kaynak bilgisi mümkün olduğunca korunur.
- Mevcut cüzdanın üzerine yazma öncesinde hedef uygulamanın kurtarma kopyası bulunmalıdır. Yenileme/geri yükleme atomik olmalı; hata durumunda önceki cüzdan korunmalıdır.
- Android/Web JSON dosyaları düz metin kişisel finans verisi içerir. Git'e, CI artefaktına veya herkese açık paylaşım alanına eklenmez.
- Şema değişikliğinde sürüm, geriye uyumluluk, reddedilen sürümler ve geri alma yolu ilgili uygulama belgelerinde kayda geçirilir.

Bu tablo mevcut uygulama kodunun sınırlarını özetler; yeni bir çapraz-platform dosya formatı veya otomatik geçiş vaadi değildir.
