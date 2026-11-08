# Ekstre Ajanı cüzdan revizyonu — yerel teslim raporu

Tarih: 8 Kasım 2026. Dal: `feature/mobile-wallet-finance-v2` (yerel).
Başlangıç: uzak `fa723276472f484edd6e41e9f343cadb5fb9ddcd`, yerel eşdeğeri `fc4215e`.
Bu yeni çalışma için GitHub gönderimi, PR, Actions veya APK derlemesi yapılmadı. `main` birleştirmesi yok.

## Tespitler ve sonuç

| Öncelik | Sorun | Uygulanan düzeltme |
| --- | --- | --- |
| P0 | QNB `PEN 4.ndirim` satırı gider olarak kaydediliyordu. | Açık banka işaretleri iade olarak sınıflanır. Rastgele mağaza adları ödeme/iade kabul edilmez. |
| P0 | Bankadaki gerçek tarih ve PDF tarihi kesimin farklı taraflarına düştüğünde aynı ödeme borcu iki kez azaltabiliyordu. | En fazla üç günlük fark yalnız aday oluşturur. Banka hareketi korunur; belirsiz ikinci kart etkisi karara kadar bekler. Onaylı grupta kart için PDF, banka için gerçek tarih kullanılır. |
| P0 | Onaylı bağı yeniden incelemeye almak aynı çift düşümü geri getiriyordu. | Link → yeniden incele → tekrar link tutarları sabit tutar. Yalnız açık “ayrı gerçek işlem” kararı ikinci etkiyi açar. |
| P0 | Ham banka açıklaması kayboluyor; bozuk açıklamalarla mutabakat farkını görmek zordu. | `sourceDesc` ham açıklamayı korur; temiz gösterim ayrı tutulur. Önizlemede tarih/tür/tutar/kategori ve kaynak açıklama gösterilir. |
| P1 | Maaş, aylık gelir-gider farkı ve nakit akışı yeterince anlaşılır değildi. | Ayrı gelir kategorileri, aylık gelir/net gider/fark, nakit giriş/çıkışı; açılış, transfer ve kart ödeme ayrımı. |
| P1 | Kart üzerinden borç ödeme ve kaynağı bilinmeyen ekstre ödemesine banka bağlama akışı yoktu. | Kart ayrıntısından tutar + gerçek ödeme tarihi + kaynak hesapla ödeme. Ekstre ödemesine sonradan kaynak bağlama; çift banka çıkışı engeli. |
| P1 | Düzenli gelir planı ile gerçekleşen gelir ayrılmıyordu. | İsteğe bağlı gelir planı; yalnız “Gelir alındı” onayı, gerçek tarih ve gerçek alıcı hesap gelir yaratır. Aynı vade tekrar işlenemez. |
| P1 | Eski bağlı manuel kayıtta yalnız not değiştirmek farklı ekstre dönemini değiştirmeye çalışıyordu. | Tarih değişmiyorsa eski dönem korunur. İçe aktarılan finansal alanlar kilitli; açıklama, kategori ve not düzenlenebilir. |
| P1 | Toplamları doğrulanamayan aktarımın belirsizliği açık değildi. | Eksik başlıklar gerekçeleriyle gösterilir ve ayrı onay gerektirir. Çelişen toplamların kaydı kapalıdır. |
| P2 | Taksit numarası gelecek yükü açıklamıyordu. | Kaydedilmiş taksit gideri ve gelecek taksit tahmini ayrı; aylık gider/borca yeniden eklenmez. Belirsiz gruplama işaretlenir. |
| P2 | Mobil bilgi yoğunluğu ve kart ayrıntısına erişim. | Dört ana eylem, banka/nakit/kart ayrımı, kompakt ana özet, kart ayrıntısı, ikincil ayrıntılarda açılır bölümler. Koyu tema korundu. |

Çalışan kuruş hesaplama motoru korundu; yeni üretim kütüphanesi, servis, veritabanı veya geniş çatı değişimi eklenmedi.

## Doğrulama

| Kontrol | Bu revizyondaki sonuç |
| --- | --- |
| Mevcut temel başlangıç testi | Geliştirme öncesi 43/43 geçti. |
| Finans, ayrıştırma, yedek ve v1 uyum testleri | **76/76 geçti**: eski 43 + yeni 12 parser + yeni 21 cüzdan/regresyon. |
| Mevcut tarayıcı UI kontrolleri | **9/9 geçti**. |
| Mevcut genişletilmiş tarayıcı akışları | **13/13 geçti**. |
| Yeni cüzdan tarayıcı akışları | **16/16 geçti**. |
| Son revizyonun taşma, tutar kırpılması, kardeş öğe çakışması ve dokunma hedefi kontrolleri | **104/104 geçti**: 13 sayfa/form × 320/360/390/412 px × %100/%150 yazı. |
| Önceki 0.1.1'in karşılaştırma kontrolü | **56/56 geçti**. Bu, eski 0.1.0 değil, zaten düzeltilmiş 0.1.1 ile karşılaştırmadır. |
| Değişen JavaScript dosyalarında sözdizimi; git diff boşluk kontrolü | Geçti. |
| Korunan kaynakların SHA-256 karşılaştırması | **116/116 aynı**; kayıp dosya yok. |
| Yeni Android testleri / yeni APK / imza | **Çalıştırılmadı.** Yerelde gerekli Android SDK, Gradle ve JDK 17 ortamı yok. GitHub onayı bekleniyor. |

16 yeni akış: maaş; kart harcaması; kart ayrıntısından ödeme; ikinci gider oluşmaması; PDF eşleştirme ve tekrar; planlanan gelirin bakiyeden ayrılması; gerçek gelir tarihi ve hesabı; doğrulanmamış aktarım onayı; indirim/iade türü; kaynak/kategori/notu koruyan düzenleme ve tekrar aktarım; eski v1 yedekte kimlik/bakiye/bilinmeyen alan koruma; yeniden açılma; eski bağlı kayıtta dönem koruyan not düzenleme; bilinmeyen ödeme kaynağını gerçek banka tarihiyle bağlama; kaynağın tekrar aktarımda korunması; çelişen önizlemenin engellenmesi.

Finans kabul örneği (tamamı sentetik): banka 20.000 TL + maaş 30.000 TL = 50.000 TL; kart harcaması 2.000 TL; bankadan kart ödeme 2.000 TL sonrası banka 48.000 TL, kart 0 TL, gelir 30.000 TL, gider 2.000 TL. PDF aynı ödemeyi tekrar gider veya ödeme etkisi yapmaz. Kısmi/fazla ödeme, iade, eski borç ve aynı tutarlı ayrı gerçek ödemeler çekirdek testlerindedir.

Başlangıçta yeni regresyonların beklenen biçimde başarısız olduğu görüldü: yanlış iade türü, kesim sınırında çift düşüm, bağı yeniden açmada tekrar düşüm, gerçek alıcı hesap alanının eksikliği ve eski dönemi koruyan notun kaydedilememesi. Bu uygulama hataları düzeltildi; son yerel testlerde başarısız test yok.

Android manifest XML ayrıştırması geçti. Ayrı YAML doğrulama aracı denemesi bu yerel Python ortamında `yaml` modülü olmadığı için çalışamadı (`ModuleNotFoundError`); bu uygulama testi hatası değildir. İş akışının imza → artefakt → emülatör sırası metin üzerinden kontrol edildi; GitHub/Gradle doğrulaması henüz yapılmadı.

Tarayıcı indirme isteği oluştu, fakat bu çalışma ortamında dosyaya indirme tamamlanamadı (`downloadSaved:false`). Dışa aktarılan gerçek Blob içeriği okunup dosyaya yazılarak JSON'un birebirliği, geri yükleme ve kurtarma doğrulandı. Bu durum Android dosya dışa aktarma testi olarak gösterilmez.

## Ekran görüntüleri

Görseller tarayıcı ekran görüntüsüdür; yeni Android emülatör kanıtı değildir. Aynı sentetik cüzdanla karşılaştırma:

- [Önce — ana ekran, 390 px](../../../android_app/test-output/comparison/before-home-390.png)
- [Sonra — ana ekran, 390 px](../../../android_app/test-output/comparison/after-home-390.png)
- [Önce — tüm ana ekran](../../../android_app/test-output/comparison/before-home-full.png)
- [Sonra — tüm ana ekran](../../../android_app/test-output/comparison/after-home-full.png)
- [Sonra — kart ayrıntısı](../../../android_app/test-output/comparison/after-card-390.png)
- [Sonra — kart ödeme formu](../../../android_app/test-output/comparison/after-payment-390.png)
- [320 px / büyük yazı kart ayrıntısı](../../../android_app/test-output/after/cardDetail-320-150.png)
- [320 px / büyük yazı ekstre önizlemesi](../../../android_app/test-output/after/importPreview-320-150.png)

Yerel `test-output` görselleri, sentetik yedekleri ve günlükleri kaynak gönderim listesinde değildir. Onay sonrası CI kendi sentetik rapor artefaktını üretecektir.

## Android ve APK için hazırlanmış, henüz doğrulanmamış işler

- Android klavye testindeki `android.widget.EditText` erişilebilirlik sınıfına bağımlılık kaldırıldı. Gerçek çizilmiş alan koordinatına cihaz dokunuşu yapar; odak, yazılım klavyesi, görünür Kaydet ve geri tuşu koşulları korunur. **Bu düzeltmenin Android üzerinde geçtiği henüz söylenemez.**
- Mevcut geri yükleme testinin yerelleştirilmiş `Onayla / ONAYLA` seçicisi korunur. Yeni revizyonda yerel Android çalıştırması yapılmadı.
- Gerçek WebView/SQLite üzerinde maaş-kart-ödeme ve gelir planı akışı eklendi. Native büyük yazı matrisi 10'dan 52 duruma genişletildi; testin 180 saniye sınırı, bütün CI işinin 25 dakika sınırı var.
- APK, derleme ve imza doğrulaması geçer geçmez emülatörden **önce** artefakta konur. Sonraki Android testi başarısızsa APK korunur ve başarısızlık açık raporlanır. Otomatik kör yeniden deneme yok.
- Yeni paket `com.zagor.ekstre.preview.wallet`, sürüm `0.2.0-deneme`, etiket `Ekstre Ajanı Cüzdan`. 0.1.0 ve 0.1.1'in üzerine kurulmaz; ayrı uygulamadır. Önceki debug anahtarına sahip olunmadığından eski uygulamayı kaldırmayı gerektiren güncelleme denenmez.
- Bu bir debug deneme paketidir. Kalıcı yayın imzası ve mağaza dağıtımı bu çalışmanın kapsamında yapılmadı.

## Veri koruması ve eksikler

JSON `format/version=1` korunur. `incomePlans` ve `incomeCategories` isteğe bağlı alanlardır. Okuma sırasında yalnız bellek kopyası tamamlanır; kullanıcı eylemi olmadan yedeğe otomatik göç yazılmaz. Hesap/işlem kimlikleri, mevcut tutarlar, kategoriler, notlar ve bilinmeyen ek alanlar korunur. Geri yükleme mevcut atomik kurtarma yolunu kullanır.

Masaüstü uygulaması çalıştırılmadı/değiştirilmedi; gerçek kullanıcı veri dizinlerine yazılmadı. Eski APK/sürüm silinmedi. Yeni APK'ya veri aktarma otomatik yapılmaz; kullanıcı eski uygulamadan JSON yedeği alıp yeni uygulamada açıkça geri yükler.

Henüz tamamlanmayan doğrulamalar: yeni revizyonun Android derlemesi/lint/imzası, 9 Android test metodu, 52 native düzen kontrolü, fiziksel telefonda klavye/geri tuşu/dosya seçici ve kurulum. Günlük kullanıma hazır olduğu bu aşamada iddia edilmez.

Bankanın canlı bakiyesi, asgari ödeme/faiz hesaplaması için güvenilir banka verisi, tüm bankalar/OCR, arka plan tahsilatı, masaüstü senkronizasyonu bu sürümde yoktur. Bilinmeyen bilgiler tahmin veya bilinmiyor olarak gösterilir. Gelecek taksit yükü belgeyle doğrulanmış tam alışveriş bedeli değildir.

Telefonda APK sonrası kontrol: eski uygulamayı koruyarak yeni paketi aç; yalnız sentetik cüzdanla maaş-harcama-kart ödemesini dene; PDF aynı ödemeyi tekrar gösterince incelemede eşleştir; bilinmeyen kaynağı bağla; büyük yazıda tutar/form/klavyeyi kontrol et; JSON yedek al/geri yükle/kurtar ve uygulamayı yeniden aç. Gerçek veriyi taşımadan önce bu kontrolleri tamamla.

## Hassas veri taraması ve gönderim listesi

Değişen kaynak metinlerinde özel anahtar, GitHub/API anahtarı, JWT, parola ataması ve TR IBAN desenleri tarandı: **eşleşme yok**. Fikstürler ayrıca elle incelendi: yalnız sentetik tutar ve açıklamalar. Bu sınırlı desen/inceleme taramasıdır; bütün olası gizli veri biçimlerine ilişkin garanti değildir.

Aktarılacak **20 dosya** aşağıdadır. Gerçek PDF/CSV, veritabanı, JSON yedek, günlük, APK, ortam dosyası veya çalışma çıktısı bu listeye dahil değildir. GitHub aktarımı ve tek CI çalışması için kullanıcı onayı henüz alınmadı.

```text
.github/workflows/android-preview.yml
android_app/app/build.gradle
android_app/app/src/androidTest/java/com/zagor/ekstre/WalletJourneyTest.java
android_app/app/src/main/AndroidManifest.xml
android_app/app/src/main/assets/app.mjs
android_app/app/src/main/assets/core.mjs
android_app/app/src/main/assets/index.html
android_app/app/src/main/assets/parser.mjs
android_app/app/src/main/assets/views.mjs
android_app/app/src/main/assets/wallet-v2.css
android_app/app/src/main/assets/wallet.mjs
android_app/tests/audit.cjs
android_app/tests/core.test.mjs
android_app/tests/journey.cjs
android_app/tests/parser-v2.test.mjs
android_app/tests/wallet-v2-journey.cjs
android_app/tests/wallet-v2.test.mjs
docs/superpowers/plans/2026-11-08-wallet-finance-v2.md
docs/superpowers/specs/2026-11-08-wallet-finance-design.md
docs/superpowers/reports/2026-11-08-wallet-finance-v2.md
```

Onay sonrası hedef yalnız `feature/mobile-wallet-finance-v2` dalıdır. `main` veya önceki Android dalı güncellenmez. GitHub Actions tek çalışma olarak başlatılır; hata çıkarsa aynı çalışma raporlanır, yeni çalıştırma kendiliğinden başlatılmaz.
