# Ekstre Ajanı Android — 0.1.0 deneme

Bilgisayar veya sunucu gerektirmeyen ayrı Android uygulaması. Eski masaüstü ve mobil Python sürümlerini değiştirmez. Android 8+ ve güncel Android System WebView gerekir.

## Kapsam

- Banka/nakit hesabı ve kredi kartı; başlangıç bakiyeleri.
- Harcama, gelir, iade, transfer, hesaptan kart ödemesi; kategori/not/inceleme düzenleme.
- Yapı Kredi ve QNB metin PDF'lerinden cihaz üzerinde önizlemeli aktarım; CSV aktarımı.
- Aynı kart/dönem PDF'sinin tekrar aktarımında çoğaltmayı önleme ve kullanıcı kategori/notlarını koruma.
- Dönem/kategori bütçeleri, aylık abonelikler, son ödeme tarihleri, taksit numarası gösterimi.
- Kategori ve aylık rapor; Android JSON yedekleme ve doğrulanmış geri yükleme.
- SQLite içinde atomik kayıt; bir önceki kayıt anlık görüntüsü ayrıca saklanır. İnternet izni, analitik veya harici API yoktur.

## Henüz desteklenmeyenler

Masaüstüyle otomatik senkronizasyon, masaüstü SQLite yedeğini açma, çoklu profil, AI, işlem bölme, gelişmiş kurallar, manuel/PDF otomatik eşleştirme, gelecek taksit projeksiyonu, arka plan bildirimi ve OCR yoktur. CSV ile PDF'den aynı hareketleri ayrı ayrı aktarmayın. Farklı kaynaklar arası çift kayıt otomatik çözülmez. Kart bakiyesi başlangıç borcu + kayıtlı hareketlerden hesaplanır; bankanın güncel borcu değildir. Ekstre toplamları okunamazsa önizlemede uyarı verilir; kullanıcı belgeyle karşılaştırmalıdır. Bu bir deneme sürümüdür; gerçek telefon ve gerçek bankadan indirilmiş belgeler üzerinde kabul testi ayrıca yapılmalıdır.

## Derleme

JDK 17, Android SDK 35, Gradle 8.11.1:

```sh
gradle -p android_app assembleDebug
```

Çıktı: `app/build/outputs/apk/debug/app-debug.apk`. GitHub Actions aynı derlemeyi özel dalda yapıp `ekstre-ajani-android-deneme` artefaktı olarak saklar. Test APK'sı debug anahtarıyla imzalanır. Farklı derleme makinelerinin debug anahtarları farklı olabilir; yeni APK güncelleme olarak kurulmazsa kaldırmadan önce JSON yedek alın. Üretim imzalama anahtarı bu depoya konmaz.

## Testler

```sh
node --test android_app/tests/core.test.mjs
node android_app/tests/ui.cjs
```

UI testi için Playwright ve Chrome gerekir; `PLAYWRIGHT_PATH` ve `CHROME_PATH` ile konumları ayarlanabilir. Yapay veriler kullanılır. PDF metin ayrıştırma testleri, fiziksel telefonda PDF dosyası seçme testinin yerine geçmez.

## İlk kurulum

APK'yı telefona aktar, Android'in dosyayı açtığın uygulama için istediği kurulum iznini ver ve yükle. Örnek cüzdanla hesaplama, kayıt, kapanıp açılma ve JSON yedek akışlarını dene. Örnek cüzdan boş uygulamaya yüklenir; gerçek verilerle karıştırmadan önce yedeğini al. Uygulama verisi silinir veya uygulama kaldırılırsa kayıtlar da silinir.

## Kaynaklar

Android Gradle plugin: https://developer.android.com/build/releases/agp-8-9-0-release-notes
PDFBox Android: https://github.com/TomRoush/PdfBox-Android
WebViewAssetLoader: https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader
PDF kuralları bu deponun `ekstre_ajani_mobil/full_wallet/parsers.py` uygulamasından uyarlanmıştır. PDFBox Android Apache-2.0 lisanslıdır.
