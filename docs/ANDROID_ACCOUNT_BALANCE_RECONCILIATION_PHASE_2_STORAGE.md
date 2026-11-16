# Hesap Bakiyesi Mutabakatı Faz 2 · Gözlem saklama kararı

## Yedek zarfı ve uyumluluk

İlk gözlem oluşturulduğunda cüzdan `format: "ekstre-android", version: 2` ve `balanceReconciliation: {observations: [...]}` ile kaydedilir. Son gözlem silinse de cüzdan aynı sürümde kalır. Gözlem oluşturmayan v1 cüzdan ilk açılışta ve olağan düzenlemelerde v1 olarak kalır. v1’de önceden bulunan aynı adlı yabancı bir alan korunur. Bu cüzdanda yeni gözlem oluşturma veri çakışması çözülene kadar reddedilir.

İsteğe bağlı v1 alanını önceki okuyucular taşıyabilir. Ancak önceki uygulama gözleme bağlı hesabı bilmeden hesabın türünü değiştirebilir ve daha sonra yeni okuyucu bu kaydı reddeder. Sürüm 2 bu karma sürüm döngüsünü yedek alımında keser. Uygulama içi JSON ve SQLite snapshot aynı zarfı kullanır. SQLite tablo şeması ve mevcut işlemsel yazma protokolü korunur.

| Kaynak | Açan sürüm | Davranış |
|---|---|---|
| Eski v1 JSON veya SQLite | Dilim 1 | Gözlem bölümü eklemeden açar. Olağan kayıtta v1 olarak yazar. |
| Dilim 1 v2 JSON | Dilim 1 | Tam kayıt doğrulaması yapar. Geçerli cüzdan ve gözlemler aynı snapshot’ta geri yüklenir. |
| Dilim 1 v2 JSON | Android 0.4.0 veya Faz 1 | Eski okuyucu sürümü kabul etmez. Kullanıcıya dosyanın kabul edilmediği gösterilir. Eski cüzdan ile dışa aktarılan özgün v2 dosyası korunur. Eski uygulama kendi v1 cüzdanını kaydedebilir. |
| Mevcut v2 SQLite üzerine eski APK kurulması | Eski Android | Desteklenen geçiş yeni uygulamaya geri dönüp özgün v2 yedeğini açmaktır. Gerçek uygulama verisiyle sürüm düşürme güvenli kabul edilmez. Eski APK’nın kendi restore davranışı değiştirilemez. |
| Daha yeni tanınmayan yedek sürümü | Dilim 1 | Yazma öncesi reddedilir. |

v2 yedekleri mevcut v1 dışa aktarma sözleşmesine sessizce dönüştürülmez. Eski Android veya Android v1’e bağlı web aktarımı gerektiğinde v2 dosyası saklanır. v2 için ayrı web taşıma sözleşmesi yoktur.

## Alanlar ve düzenleme

- `id` oluşturma sırasında üretilen benzersiz kimlik.
- `accountId` banka veya nakit hesabının kalıcı kimliği. Silinmiş hesap, kart hesabı ve hesap türüyle uyuşmayan kaynak reddedilir.
- `role` ayrı `observation` ve `anchor` rolleri. İki rolün kaydı aynı veri biçimini paylaşır. Bağımsız kapsam veya doğruluk kaydın rolünden türetilmez.
- `observedDate` geçerli `YYYY-MM-DD` kapanış günü. Aynı hesap ve tarihteki kayıtlar kimlikleriyle ayrılır.
- `observedAmountCents` işaretli güvenli tamsayı kuruş. Sıfır ve negatif tutarlar geçerlidir.
- `sourceKind` banka için `bankDocument` veya `manualBank`, nakit için `cashCount`.
- `note` isteğe bağlı düz metin, en fazla 2.000 karakter. JSON’a metin olarak kaydedilir. Sonraki ekran metni kullanıcı girdisi olarak kaçışlamalıdır.
- `createdAt` ve `updatedAt` milisaniye çözünürlüklü UTC zamanları. Kimlik, hesap, rol ve oluşturulma zamanı güncellenemez. Düzenleme zamanı önceki düzenlemenin gerisine gidemez.

Yalnızca gözlem kayıtlarını değiştiren çekirdek yardımcıları yeni cüzdan değeri döndürür. JS yedek okuyucusu v2 gözlemleri dahil cüzdanı doğrular. Android köprüsü v2 gözlem kayıtlarını ve bağlı hesap türünü yazma öncesi denetler. Başarılı geri yükleme önceki cüzdanı kurtarma snapshot’ına kopyalar. Hatalı giriş veya son yazma hatası güncel, önceki ve kurtarma snapshot’larını korur.

## Dilim 2 için hesaplama sözleşmesi

Karşılaştırılacak kayıt `observation` rolünde, dayanak ayrı kimlikli `anchor` rolünde, aynı hesapta ve kesin olarak daha erken bir gün sonu olmalıdır. Dış kaynağın bağımsızlığı ve hareket aralığının tamamı ayrıca doğrulanır. Tek toplam, eksik banka hareketlerini kendi başına bulamaz. Fark `gözlenen − hesaplanan` olarak hesaplanır. Bakiye ve hareketler bu fark nedeniyle güncellenmez.

Gözlem, hesaplanan sonuç ve geçmiş doğrulama kanıtı farklı verilerdir. Bu dilim bir doğrulama durumu kaydetmez. Sonraki dilim, güncel doğrulamayı karşılaştırmadan türetmeli ve geçmiş doğrulama kanıtında dayanak/gözlem kimlikleri, tarih ve tutar, kesim sınırı ve kapsam kaynağı tutmalıdır. Defter içeriği için sıra bağımsız, sürümlü kanıt girdisi kayda dahil olan hareketlerin kimliğini, tarihini, kuruş tutarını, hesap yönünü ve eşleştirme durumunu kapsamalıdır. Böylece tutarlar birbirini götürse bile ekleme, silme, düzenleme ve kaynak eşleştirme değişikliği önceki doğrulamanın yeniden değerlendirilmesini sağlar.

[Önceki mimari karar](ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_1.md) · [Finansal davranış sözleşmesi](FINANCIAL_BEHAVIOR_CONTRACT.md)
