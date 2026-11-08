# Ekstre Ajanı Android 0.1.1 revizyon adayı

## Durum

Yerel düzeltme dalı: `android/ux-finance-revision`. Baz alınan gerçek Android commit'i: `da51ba562c25be316edcb94fbf56ea3ad2f9cb92`. Eski dalın 19 dosyası kopyalanmadan önce GitHub blob özetleriyle birebir doğrulandı. Yeni kaynaklar henüz GitHub'a yüklenmedi. **Yeni APK henüz derlenmedi; Android emülatörü sonuçları yok.**

Kullanıcının GitHub gönderimi için ayrı onay şartı korunuyor. Onay sonrası özel depoda yeni dal ve eski Android dalına yönelik taslak PR açılacak. main'e birleştirme yapılmayacak.

## Sorunlar ve uygulanan düzeltmeler

| Öncelik | Sorun | Revizyon davranışı |
|---|---|---|
| P0 | Büyük TL değerleri ortadan bölünüyor; iki sütun ve eylemler sıkışıyor | Dar ekranda tek sütun; satır ve eylemler sarılıyor; sayılar tek satır kalıyor ve gerekirse yerlerine sığdırılıyor; alt menü yerleşimi alanına göre genişliyor |
| P0 | Kart ödemesi PDF/CSV/manual tekrarında borç iki kez azalıyor | Kaynak adayları görünür incelemeye alınıyor. Kullanıcı karar verene kadar ikinci kart etkisi uygulanmıyor. Girilen banka ödemesinin banka tarafı korunuyor |
| P0 | Takvim ayı ile hesap kesim dönemi aynı alandan raporlanıyor | Ana sayfa ve bütçe işlem tarihine göre takvim ayı; rapor ve işlemler ayrı takvim/ekstre kapsamı sunuyor |
| P0 | Son ekstre borcu ve geçmiş hareket toplamı karışıyor | Kart tahmini bilinen son ekstre borcuna ve kesim sonrası kayıtlara dayanıyor. Bilinmeyen alanlar açıkça belirtiliyor |
| P0 | Yeniden aktarım açıklamayı ve bağlantı kararını kaybediyor | Açıklama, kategori, not, inceleme ve kaynak açıklaması korunuyor. CSV sıra değişimi çoğaltmıyor; eski CSV kimlikleri de okunuyor |
| P0 | Değişen PDF kaynağı eski eşleşmeyi sessizce ayrı işlem yapıyor | Etkilenen eski grup tekrar incelemeye açılıyor; kullanıcı kararı olmadan ek harcama yaratılmıyor |
| P0 | PDF geçersiz tarih/tutar satırını sessizce atlayabiliyor | Tanınan işlem satırı bozuksa kısmi kayıt reddediliyor |
| P1 | Not düzenlemesi, ayrı gerçek işlem kararını bozabiliyor | Finansal olmayan düzenleme eşleşme kararına dokunmuyor. Onaylı kaynakla çelişen finansal düzenleme engelleniyor; bağlantı yeniden incelenebiliyor |
| P1 | Abonelik vade tarihinde ödenmiş gibi kaydoluyor | Gerçek ödeme tarihi ayrıca soruluyor. Aynı vade yinelenmiyor; 31 Ocak → 28 Şubat → 31 Mart fatura günü korunuyor |
| P1 | İşlem formunda gereksiz/yanlış hedef alanları var | Türe göre hesaplar ve hedef alanları gösteriliyor; ekstre dönemi manuel işlemde zorunlu alan olmaktan çıkarıldı |
| P1 | Eski/ödenmiş ekstre yaklaşan veya gecikmiş borç gibi görünüyor | Son ekstre için kaydedilmiş ödemelere göre tahmini kalan kullanılıyor; sıfırlanmış son ekstre yaklaşan ödeme listesinden çıkarılıyor |
| P1 | Büyük yedek kayıt/dışa aktarma/geri yükleme boyutları tutarsız | Tüm yollarda aynı 32 MB UTF-8 byte sınırı ve kompakt JSON. Önceden izin verilen eski içerik boyutları korunuyor; 35 bin satırlık gerçek payload ve Unicode eski alan testi var |
| P1 | Geri yükleme öncesi cüzdana dönüş yok | Native SQLite kurtarma anlık görüntüsü ve Ayarlar'da kurtarma eylemi eklendi; bozuk geri yükleme mevcut kaydı değiştirmiyor |
| P1 | Sistem büyük yazısı yok sayılıyor | Android font ölçeğini izleyen kod ve klavye/geri tuşu testleri hazır; Android doğrulaması henüz yapılmadı |
| P2 | 150 işlemden sonra devam yok | Daha fazla göster eklendi |

## Yerelde çalıştırılmış testler

| Test | Sonuç | Kanıt kapsamı |
|---|---:|---|
| Finans/ayrıştırma/uyumluluk Node testleri | **43/43** | Eski 14 test korundu; çift ödeme, üç kaynak grubu, dönem, iadeler, yeniden aktarım, eski CSV, taksit, abonelik, bozuk referans, büyük yedek ve uyumluluk |
| Mevcut Chrome UI kontrolleri | **9 kontrol geçti** | İlk açılış, örnek, yeniden açılma, düzenleme, bütçe, navigasyon ve küçük ekran |
| Görsel matris | **56/56 geçti** | 320/360/390/412 px × normal/%150 metin × 7 ekran; çakışma, parasal satır sarılması/taşması, dokunma hedefi |
| Genişletilmiş Chrome kullanıcı yolculuğu | **13 kontrol geçti** | Gerçek ekranlar üzerinden ödeme, PDF metin önizlemesi/tekrar, karar, CSV sıra değişimi, gerçek abonelik tarihi, yedek içeriği, geri yükleme/kurtarma, bozuk dosya atomikliği, yeniden açılış ve kısa modal |

İlk test simülasyonunda başlık her ekran geçişinde tekrar büyütüldüğü için yanlış pozitifler vardı; ölçüm düzeltildi ve eski kaynaklarda yeniden çalıştırıldı. Düzeltilmiş aynı ölçümle eski sürüm **26/56**, revizyon **0/56** kontrolden kaldı. Önce/sonra görüntüleri aynı sentetik verilerle üretildi.

**Önemli sınır:** Chrome testleri Android değildir. PDF metni Chrome'da native callback sınırından verilmiştir; Android PDF dosyası açma yerine geçmez. Tarayıcı dosya indirmesi ortam tarafından iptal edildi; gerçek üretilen Blob içeriği doğrulandı, indirme başarısı iddia edilmez.

## Bağımsız inceleme

Ayrı bir inceleyici yerel değişiklikleri salt okunur olarak değerlendirdi. Beş önemli bulgunun tamamı yeni başarısız testlerle yeniden üretilip düzeltildi: eşleşme sonrası dönem kaybı, not düzenlemesinde karar kaybı, üç kaynaklı ödeme grubu, değişen kaynak/finansal düzenleme ve büyük yedek turu. Ödenmiş ekstre planlaması kullanıcının P1 hedefi doğrultusunda ayrıca düzeltildi. Sonraki testlerde farklı taksitler ve çelişen PDF dönemleri de korunuyor.

## Android / APK için kalan aşama

- Yerel SDK/emülatör bulunmadığı ve indirme erişimi kısıtlı olduğu için yeni Java/Gradle derlemesi yapılmadı.
- Hazırlanan CI önce eski APK'yı ayrı paket olarak açıp görüntüleyecek; ardından yeni uygulamada hesaplar/işlemler/rapor/abonelik, native kayıt-kurtarma, PDF dosya okuyucusu, dosya seçici açma-iptal, yazılım klavyesi, geri tuşu ve dört genişlik/büyük yazı testlerini çalıştıracak.
- PDF ContentResolver sınırı gerçek sentetik PDF dosyalarıyla test edilecek. Dosya seçicinin her marka telefondaki seçim/izin akışı için gerçek telefon kontrolü yine gerekli.
- Android test kaynakları hazırlanmıştır; **derlendikleri veya geçtikleri iddia edilmez**. Hata çıkarsa onaylanan dalda düzeltme ve tekrar derleme gerekecek.
- Yeni APK adı/artefaktı eskisinden ayrı olacak. Eski APK dosyası üzerine yazılmayacak.

## Eski kurulum ve veriler

JSON `format=ekstre-android`, `version=1` korunuyor; yeni ilişki/vade alanları isteğe bağlı. Bilinmeyen eski alanlar silinmiyor.

Eski debug APK imza anahtarı elimizde bulunmadığı için doğrudan güncelleme garantisi verilemez. Deneme, **Ekstre Ajanı Revizyon** / `com.zagor.ekstre.preview.revision` adıyla yan yana kurulacak. Eski uygulama ve kayıtları yerinde kalacak. Eski uygulamadan JSON yedek alıp yeni revizyonda yüklemek gerekir; iki uygulama otomatik eşitlenmez. Kalıcı üretim imzalama ve dağıtımı ayrı bir sonraki karardır.

## Gerçek telefonda kontrol listesi

1. Eski uygulamadan JSON yedek al; eski uygulamayı kaldırmadan yeni revizyonu kur ve yedeği yükle.
2. Büyük yazı, yazılım klavyesi ve 320–412 px ölçeklerde tutarlar, modallar ve alt menüyü incele.
3. Sentetik hesaplarla gelir, nakit gideri, kart alışverişi, iade, transfer ve banka-kart ödemesi dene; kart ödemesi gideri artırmamalı.
4. Aynı kart PDF/CSV'sini tekrar aktar. Eşleşme kutusunda aynı/ayrı kararlarını ver; banka hareketi ve kart borcu iki kez etkilenmemeli.
5. Aboneliğin vade/gerçek ödeme tarihini kontrol et; aynı vadeyi ikinci kez işlemeye çalış.
6. Telefon dosya seçicisinden PDF ve JSON seç; yedeği dışarı kaydet; bozuk dosyada mevcut kaydın korunduğunu doğrula.
7. Uygulamayı kapat/aç ve geri yükleme öncesi kurtarmayı dene.

## Tamamlanmayanlar

Android derleme/emülatör ve gerçek telefon kabulü; gerçek banka PDF yerleşimlerinin kapsamlı doğrulaması; üretim imzalama; masaüstü senkronizasyonu ve SQLite yedeği aktarımı; OCR, AI, çoklu profil, gelişmiş kurallar, işlem bölme ve gelecek taksit projeksiyonu. Bu eksikler tamamlanmış gibi sunulmaz.

## Görüntüler

Yerel çıktı: `android_app/test-output/comparison.png` ve `comparison.html`. Tam önce/sonra görüntüler `test-output/before` ve `after` klasörlerinde. Bunlar sentetik Chrome görüntüleridir; kullanıcı verisi içermez. CI görüntüleri onay sonrası ayrı artefakta alınacak.

## Gönderim listesi

19 kaynak/test/belge dosyası. Görüntüler ve sentetik yedekler kaynak gönderimine dahil değil; CI artefaktında üretilecek.

```text
.github/workflows/android-preview.yml
android_app/README.md
android_app/app/build.gradle
android_app/app/src/androidTest/java/com/zagor/ekstre/OfflineTest.java
android_app/app/src/androidTest/java/com/zagor/ekstre/WalletJourneyTest.java
android_app/app/src/main/AndroidManifest.xml
android_app/app/src/main/assets/app.mjs
android_app/app/src/main/assets/core.mjs
android_app/app/src/main/assets/parser.mjs
android_app/app/src/main/assets/style.css
android_app/app/src/main/java/com/zagor/ekstre/MainActivity.java
android_app/tests/audit.cjs
android_app/tests/journey.cjs
android_app/tests/revision.test.mjs
docs/REVIEW_REPORT.md
docs/findings.md
docs/progress.md
docs/revision-spec.md
docs/superpowers/plans/2026-11-08-android-ux-finance.md
```

Son tarama: anahtar/token/özel anahtar/IBAN/e-posta desenleriyle eşleşme bulunmadı. Bu desen taraması tek başına mutlak güvenlik garantisi değildir.
