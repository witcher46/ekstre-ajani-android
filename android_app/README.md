# Ekstre Ajanı Android — 0.1.1 revizyon adayı

Bu revizyonun kaynak testleri yerelde doğrulandı; Android derleme ve genişletilmiş emülatör testleri GitHub gönderim onayını bekliyor. Yeni APK henüz üretilmedi. Önceki 0.1.0 APK korunur.

## Revizyondaki davranış

- Ana sayfa ve bütçe takvim ayını kullanır. Kart ekstre dönemleri raporda ayrı seçilir.
- PDF/CSV/manual adaylar kullanıcı incelemesine gider. Aynı kaydın kaynakları onaylandığında ikinci kez harcama/kart etkisi oluşmaz. Bankadan girilen ödeme, kart eşleşmesi beklerken banka bakiyesinde korunur.
- Tekrar PDF aktarımı açıklama, kategori, not ve inceleme kararlarını korur. Kaynak değişirse eski bağlantı sessizce ayrı işlem sayılmaz; yeniden incelemeye açılır.
- Güncel kart borcu tahmini varsa son ekstre borcuna ve kesim sonrası kayıtlara dayanır. Tam ödenmiş son ekstre yaklaşan borç olarak gösterilmez. Bilinmeyen bankacılık alanları uydurulmaz.
- Abonelik vadesi ile gerçek ödeme tarihi ayrı tutulur. Aynı vade ikinci kez işlenmez; ayın sabit fatura günü korunur.
- JSON biçimi `ekstre-android`, version=1 kalır; eski yedekler okunur, bilinmeyen eski alanlar korunur. Kayıt/JSON dışa aktarma/geri yükleme aynı 32 MB UTF-8 byte sınırını kullanır. Geri yükleme öncesi cüzdan ayrıca kurtarılabilir.
- 320/360/390/412 px ve büyük yazıda tutarlar satır ortasında bölünmez; butonlar ve kartlar gerektiğinde alt alta yerleşir.

## Eski kurulum ve verilerin korunması

Önceki debug APK'nın özel imza anahtarı bu projede bulunmuyor. Bu nedenle doğrudan üzerine güncelleme yapılacağı iddia edilmez. Bu deneme `com.zagor.ekstre.preview.revision` ve **Ekstre Ajanı Revizyon** adıyla yan yana kurulacak; eski APK ve verileri yerinde kalır. Eski uygulamadan JSON yedek dışa aktarıp yeni revizyonda geri yüklenebilir. Otomatik senkronizasyon yoktur. Üretim imzalama anahtarı hâlâ ayrı bir sonraki karardır; anahtarlar kaynak depoya eklenmez.

## Doğrulama sınırı

Yerel sonuçlar: 43 finans/uyumluluk testi, mevcut 9 UI kontrolü, 56 görsel matris durumu ve 13 genişletilmiş UI akışı geçti. Chrome testleri Android emülatörü yerine geçmez. Tarayıcı ortamı indirmeyi engellediği için yedek dosyasının gerçek içeriği doğrulandı; native dosya yazma/Android klavye ve geri tuşu kontrolleri CI aşamasında bekliyor. Gerçek banka belgeleri kullanılmadı.

Bilgisayar veya sunucu gerektirmeyen ayrı Android uygulaması. Eski masaüstü ve mobil Python sürümlerini değiştirmez. Android 8+ ve güncel Android System WebView gerekir.

## Kapsam

- Banka/nakit hesabı ve kredi kartı; başlangıç bakiyeleri.
- Harcama, gelir, iade, transfer, hesaptan kart ödemesi; kategori/not/inceleme düzenleme.
- Yapı Kredi ve QNB metin PDF'lerinden cihaz üzerinde önizlemeli aktarım; CSV aktarımı.
- Aynı kart/dönem PDF'sinin tekrar aktarımında çoğaltmayı önleme ve kullanıcı kategori/notlarını koruma.
- Dönem/kategori bütçeleri, aylık abonelikler, son ödeme tarihleri, taksit numarası gösterimi.
- Kategori ve aylık rapor; Android JSON yedekleme ve doğrulanmış geri yükleme.
- SQLite içinde atomik kayıt; bir önceki kayıt anlık görüntüsü ayrıca saklanır. İnternet izni, analitik veya harici API yoktur.

## İlk sürümden devralınan kapsam ve kalan sınırlar

Masaüstüyle otomatik senkronizasyon, masaüstü SQLite yedeğini açma, çoklu profil, AI, işlem bölme, gelişmiş kurallar, gelecek taksit projeksiyonu, arka plan bildirimi ve OCR yoktur. Farklı kaynaklardaki olası çift kayıtlar otomatik kesinleştirilmez; inceleme kutusunda karar verilmelidir. Bankanın canlı borcu/bakiyesi bilinmez. Ekstre toplamları okunamazsa önizlemede uyarı verilir; kullanıcı belgeyle karşılaştırmalıdır. Gerçek telefon ve gerçek bankadan indirilmiş belgeler üzerinde kabul testi ayrıca yapılmalıdır.

## Derleme

JDK 17, Android SDK 35, Gradle 8.11.1:

```sh
gradle -p android_app assembleDebug
```

Çıktı: `app/build/outputs/apk/debug/app-debug.apk`. GitHub Actions aynı derlemeyi özel dalda yapıp `ekstre-ajani-android-deneme` artefaktı olarak saklar. Test APK'sı debug anahtarıyla imzalanır. Farklı derleme makinelerinin debug anahtarları farklı olabilir; yeni APK güncelleme olarak kurulmazsa kaldırmadan önce JSON yedek alın. Üretim imzalama anahtarı bu depoya konmaz.

## Testler

```sh
node --test android_app/tests/*.test.mjs
node android_app/tests/ui.cjs
node android_app/tests/audit.cjs
node android_app/tests/journey.cjs
```

UI testi için Playwright ve Chrome gerekir; `PLAYWRIGHT_PATH` ve `CHROME_PATH` ile konumları ayarlanabilir. Yapay veriler kullanılır. PDF metin ayrıştırma testleri, fiziksel telefonda PDF dosyası seçme testinin yerine geçmez.

## İlk kurulum

APK'yı telefona aktar, Android'in dosyayı açtığın uygulama için istediği kurulum iznini ver ve yükle. Örnek cüzdanla hesaplama, kayıt, kapanıp açılma ve JSON yedek akışlarını dene. Örnek cüzdan boş uygulamaya yüklenir; gerçek verilerle karıştırmadan önce yedeğini al. Uygulama verisi silinir veya uygulama kaldırılırsa kayıtlar da silinir.

## Kaynaklar

Android Gradle plugin: https://developer.android.com/build/releases/agp-8-9-0-release-notes
PDFBox Android: https://github.com/TomRoush/PdfBox-Android
WebViewAssetLoader: https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader
PDF kuralları bu deponun `ekstre_ajani_mobil/full_wallet/parsers.py` uygulamasından uyarlanmıştır. PDFBox Android Apache-2.0 lisanslıdır.
