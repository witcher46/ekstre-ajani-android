# Veri biçimleri ve taşıma notları

Her uygulama kendi yerel deposuna sahiptir. Bunlar otomatik eşitlenmez; taşıma kullanıcı tarafından seçilen bir yedek ve açık onayla yapılır.

| Platform | Yerel şema/depo | Yedek biçimi | Mevcut taşıma sınırı |
|---|---|---|---|
| Windows masaüstü | SQLite `PRAGMA user_version=4`; dosya kullanıcı profilinin yerel uygulama veri klasöründedir | SQLite veritabanı ve yerel kurtarma kopyaları | Bu depodaki masaüstü şeması `db.py` içinde sürümlenir. Web aktarımı yalnızca doğrulanmış SQLite v4 dosyasını salt okunur işler; parola/kimlik bilgileri aktarılmaz. |
| Android | Uygulamaya özel yerel SQLite | JSON `format="ekstre-android"`, `version` değeri `1`, `2`, `3`, `4` veya `5` | v1–v5 geri yüklenebilir. Dışa aktarma, kaydedilmiş cüzdanın JSON sürümünü korur. |
| Web | Tarayıcı IndexedDB veritabanı sürüm 2 | Web JSON yedeği `version=2` | IndexedDB v1→v2 göçü ve eski web JSON v1 geri yüklemesi desteklenir. Android JSON v1 ve masaüstü SQLite v4 aktarımı önizleme ile yapılır. |

## Android JSON sürümleri

- **v1** yeni cüzdanın başlangıç biçimidir. Olağan düzenlemeler cüzdanın, geri yükleme ise seçilen yedeğin JSON sürümünü korur.
- **v2**, v1 cüzdana ilk bakiye gözlemi kaydedildiğinde oluşur ve `balanceReconciliation.observations` dizisini taşır. Son gözlem silinse de cüzdan v2 olarak kalır. [Gözlem saklama sözleşmesi](ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_2_STORAGE.md)
- **v3**, v2 cüzdanda ilk mutabakat onayı kalıcı olarak kaydedildiğinde oluşur. Sürüm geçişi ve onay aynı atomik yazmada kaydedilir. v3 yedeği gözlemlerin yanında `balanceReconciliation.approvals` dizisini taşır. Gözlem düzenleme veya silme v3’ü ve onay geçmişini korur. [Onay saklama sözleşmesi](ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_2_APPROVAL_STORAGE.md)

- **v4**, ilk manuel gider bölümleri kaydedildiğinde oluşur. `expenseAllocations` nesnesi, ana işlem kimliğini `{category, amount}` dizisine eşler. Her dizide en az iki satır bulunur. Tutarlar pozitif tamsayı kuruştur ve toplamları ana işlemle aynıdır. v4, `balanceReconciliation.observations` ve `balanceReconciliation.approvals` dizilerini taşır. Geçiş, önceki anlık görüntüyü koruyan aynı SQLite CAS yazmasında kaydedilir. Cüzdanı açmak veya son bölümleri kaldırmak sürümü değiştirmez. v1/v2/v3 yedekleri özgün sürümlerinde açılır. Bilinmeyen eski veri ayrılmış bir alanla çakışıyorsa ilk bölüm yazımı reddedilir ve veri korunur.

- **v5**, ilk birikim hedefi kaydedildiğinde oluşur. `savingsGoals` dizisindeki her kayıt `{id, name, account, target, due, reserved}` alanlarını taşır. Hedef pozitif, ayrılan tutar sıfır veya pozitif tamsayı kuruştur. Vade `YYYY-MM-DD` biçimindedir ve hesap mevcut bir banka veya nakit hesabı olmalıdır. İlk kayıt ve biçim geçişi aynı SQLite CAS yazmasında yapılır. Bölümler, bakiye gözlemleri ve onay geçmişi korunur. Son hedef silindiğinde sürüm v5 kalır. Eski bir yedekte ayrılmış alan çakışıyorsa hedef kaydı reddedilir ve mevcut veri korunur.

**Ayarlar → Yedek dışa aktar**, kaydedilmiş cüzdanın JSON sürümünü dosyaya yazar. **Ayarlar → Yedek yükle**, sürümü yazmadan önce doğrular. Yalnız v1 destekleyen Android okuyucuları v2 ve v3 dosyalarını, en çok v2 destekleyenler ise v3 dosyalarını mevcut cüzdanı değiştirmeden reddeder. v2 veya v3 dosyasını geri yüklemek için o JSON sürümünü destekleyen bir Android APK’sı gerekir. v3 ile sınırlı Android uygulamaları v4 yedeğini SQLite yazımı başlamadan reddeder. v4 ile sınırlı Android uygulamaları v5 yedeğini SQLite yazımı başlamadan reddeder. Eski uygulamaya dönmek için önceden alınmış, o uygulamanın desteklediği bir yedek gerekir. Android v1 ile sınırlı web aktarımı v2–v5 dosyalarını açamaz. Bu uygulama v5 sonrasındaki bilinmeyen yedek sürümlerini reddeder.

İşlem bölümleri yalnızca bağlantısız, taksitsiz manuel TL giderlerinde kullanılabilir. Bakiye, borç ve net gider ana işlemi bir kez işler. Kategori özeti, bütçe ve raporlar bölüm tutarlarını kullanır. Bir bölümün kategorisi yeniden adlandırıldığında etiketi güncellenir. Bölümde kullanılan kategoriyi silmeden veya bölünmüş gideri bir belgeye bağlamadan önce ilgili bölümleri düzenlemek ya da kaldırmak gerekir.

Birikim hedefleri elle girilen plan kayıtlarıdır. Aynı hesaba bağlı hedefler için ayrılan tutarlar toplanır. Toplam, hesabın güncel kullanılabilir bakiyesini aşarsa Planlama ekranında uyarı gösterilir. Negatif bakiye kullanılabilir tutar olarak sıfır kabul edilir. Hedef kayıtları işlem oluşturmaz ve finansal toplamları değiştirmez.

## Güvenli taşıma ilkeleri

- Yedek almadan şema/format yükseltmesi yapılmaz. Kaynak dosya değiştirilmeden saklanır.
- Bilinmeyen veya desteklenmeyen sürüm sessizce dönüştürülmez; yazma başlamadan reddedilir.
- Aktarımda profil seçimi, eşleşme ve değiştirilecek alanlar kullanıcıya gösterilir. Kayıt kimlikleri ve kaynak bilgisi mümkün olduğunca korunur.
- Mevcut cüzdanın üzerine yazma öncesinde hedef uygulamanın kurtarma kopyası bulunmalıdır. Yenileme/geri yükleme atomik olmalı; hata durumunda önceki cüzdan korunmalıdır.
- Android/Web JSON dosyaları düz metin kişisel finans verisi içerir. Git'e, CI artefaktına veya herkese açık paylaşım alanına eklenmez.
- Şema değişikliğinde sürüm, geriye uyumluluk, reddedilen sürümler ve geri alma yolu ilgili uygulama belgelerinde kayda geçirilir.

Bu tablo mevcut uygulama kodunun sınırlarını özetler; yeni bir çapraz-platform dosya formatı veya otomatik geçiş vaadi değildir.
