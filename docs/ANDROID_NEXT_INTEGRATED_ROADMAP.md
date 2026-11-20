# Ekstre Ajanı — 9 özellik birleşik teslim planı ve kabul kapıları (taslak)

Durum: Uygulamaya başlamadan önce referans alınacak karar ve geliştirme sırası. Finansal kod ve kullanıcı verisi değiştirmez.
Dayanak: ANDROID_NEXT_FINANCE_FEATURE_CONTRACT.md + ANDROID_NEXT_UX_INFORMATION_ARCHITECTURE.md + mevcut FINANCIAL_BEHAVIOR_CONTRACT.md.
Mevcut doğrulanmış main tabanı: aa1f7a2caa5ce1a5e5ce6d961e85832fa57d46bd. PR #11 birleşimi sonrası verify/android/upgrade CI başarılı.

## Aşama sınırı / sürüm disiplini

PR #11 main üzerinde olsa da 0.4.0 -> kalıcı sertifikalı gerçek telefon yükseltmesi yapılmadan 0.5.0'ı kararlı ilan etme. Dokuz yeni özellik bu teslimatın kapsamına fark ettirmeden katılmaz; yeni özellikler ayrı geliştirme dalı, veri sözleşmesi ve sürüm/upgrade kabulü gerektirir. Mevcut veri şeması v1; yeni alan ekleme gerekiyorsa eski yedeğin geriye dönük açılma semantiği ve restore red koşulları açıkça test edilir.

Her değişiklik: izole branch -> sentetik test -> PR ve aynı HEAD SHA'da CI -> kod incelemesi -> kullanıcı merge onayı. Gerçek finans verisi, PDF, CSV ve imzalama anahtarı CI'ya aktarılmaz.

## Risk ve bağımlılık sırası

| Dilim | Kod türü | Özellik | Önkoşul | Kabul kapısı |
| --- | --- | --- | --- | --- |
| 0 | Kontrat ve prototip | Dokuz özellikte ortak tanım + beş sekmeli bilgi mimarisi | Ürün sahibinin kritik finans kararları | Onaylı senaryo, sabit kaynak main, QA matrisi |
| 1 | UI, mevcut formlar | Hızlı kayıt | Hiçbir yeni finans yolu yok | 1-2 eylemde kayıt, mevcut C.addTransaction, klavye/geri |
| 2 | UI, mevcut eşleştirme | Akıllı inceleme kutusu | Mevcut pending semantiği korunur | link/distinct/skip, PDF/CSV/manüel iki kez sayılmaz |
| 3 | UI, salt okunur | Kredi kartı detay netliği | cardStatus kaynak ve tarih etiketleri | Güncel tahmin, dönem, kalan, gelecek taksit karışmaz |
| 4 | UI, salt okunur | Temel gelişmiş raporlar | summary/periodFigures geçerliliği | 6/12 aylık gerçek gelir/net gider; tarihsel net varlık uydurulmaz |
| 5 | UI, mevcut kurallar | Yerel kategori önerileri | suggestCategory ve kullanıcı tercihi | Öneri onaysız finansı değiştirmez; reimport kullanıcı düzenlemesini korur |
| 6 | Yeni saf hesaplama ve opsiyonel veri | Banka/nakit mutabakatı | as-of balance sözleşmesi, geriye dönük işlem davranışı | Fark gözlemdir; sahte gelir/gider yok; eski yedek açılır |
| 7 | Yeni kategori tahsis modeli | İşlem bölme | kategori raporları ve bütçelerin ortak hesaplama kaynağı | Tahsisler toplamı üst tutar, tek bakiye/borç etkisi |
| 8 | Yeni opsiyonel hedef modeli | Birikim hedefleri | rezervasyon/bakiye ayrımı | Hedef eklemek veya ilerletmek para yaratmaz; fazla ayırma uyarısı |
| 9 | Android planlayıcı ve UI | Hatırlatmalar | birleşik vade modeli, izin/gizlilik politikası | Bildirimler idempotent, izinsiz çalışabilir, otomatik ödeme yok |
| 10 | Tam kabul | Bütün özelliklerin entegre regresyonu | 1-9 | aynı SHA CI, JSON restore, finans sözleşmesi, cihaz testleri |

Dilimler sıralıdır; bağımsız UI iyileştirmeleri aynı finansal kontratı gözeterek küçük PR olarak yürütülebilir. Aşama 7 öncesinde test edilmemiş split verisi raporlama koduna sokulmaz. Tarihsel net varlık çizimi as-of hesabı çözülmeden dilim 4'ün parçası değildir.

## Geliştirme mimarisi

- app.mjs: sayfa yönlendirme ve event wiring; yeni modül kodlarının merkezi olmamalı.
- ui/navigation.mjs: beş alt route sabit kalır; özel alt sayfalar ana sekmeye bağlanır.
- ui/dialog.mjs, ui/form-controls.mjs: ortak odak, validasyon, güvenli etiket üretimi; finans formu için ikinci altyapı yaratılmaz.
- core.mjs: tek finansal kurallar kaynağı. Yeni kategori tahsis hesabı hem core.summary hem wallet.periodFigures tarafından ortak çağrılır.
- wallet.mjs: özet ve kredi kartı salt-okunur sorguları; kaynak/rapor ayrımı.
- Yeni saf modüller yalnız gerektiğinde: finance/reconciliation.mjs (as-of), finance/allocations.mjs, finance/goals.mjs, finance/trends.mjs. Bağımlılık yönü tek taraflı olmalı, döngüsel import yok.
- Android Java bridge: yalnızca OS izinleri, yerel bildirim/planlama vb. Cüzdan kayıtları mevcut atomik SQLite yolunu kullanmaya devam eder.
- JSON v1: yeni özellik alanları olası opsiyonel alanlar olarak açıkça doğrulanır. Sessiz veri migrasyonu yapılmaz. Export/import ve recovery her ek alanda ayrı test edilir.
- Telefon için mevcut HTML/CSS/WebView üzerinde kademeli iyileştirme; zorunlu olmadığı sürece yeni UI framework'ü veya cloud hizmeti eklenmez.

## Uçtan uca kabul senaryoları

T01 Kayıtlı harcamaya yeni hızlı giriş, önceki manuel ekleme ile aynı mali sonucu verir; ekleme iki kez basılınca iki kayıt oluşmaz.
T02 PDF/CSV/manüel aynı işlem adayları 'pending' iken yanlış finans etkisi üretmez; bağla/ayrı/ertele sonucu kontrollüdür.
T03 Banka/kart/transfer/ödeme/iade bulunan cüzdanda kaynak bazlı borç ve nakit toplamları sabit kalır.
T04 Kart ekstresi 1.000 TL, kayıtlı ödeme 400 TL ve iade 200 TL: kalan dönem ödemesi ve güncel tahmini borç ayrı ve dürüst görünür; banka kuralları kesin varsayılmaz.
T05 1.000 TL manuel kart gideri 600/400 kategoriye bölününce kart borcu ve net gider 1.000 TL, kategori toplamları 600/400; taksit ve bağlı import ilk aşamada bölünemez.
T06 10.000 TL banka hesabına 9.950 TL gözlem girildiğinde fark -50 TL; işlem ve rapor toplamları değişmez.
T07 Eski mutabakat sonrası tarih geriye işlemiş harcama girilirse mutabakat durumu yeniden sorgulanır.
T08 2.000 TL birikim hedefi ve 500 TL rezervasyon yalnız planı değiştirir; net varlık, nakit ve gelir değişmez.
T09 Aynı vade için bildirimin iki kez gönderilmemesi, izin reddi, cihaz yeniden başlatma ve saat dilimi sınırı.
T10 Eski 0.1.0/0.1.1/0.2.0 ve 0.4.0 JSON yedekleri, işlem ID, not, kategori ve bilinmeyen alanları korur; yanlış alan atomik reddedilir.
T11 Taksitli kredi kartı harcamaları, dönem sınırı, ay sonu 31/28 ve PDF tekrar içe aktarma sabit finansal toplamı korur.
T12 HTML/CSV girişleri, uzun tutar ve etiket, 320dp ekran, büyük yazı, geri ve klavye testleri geçer.
T13 Raporlar dönemsel gelir/net gideri doğrular; geçmiş net varlığı güncel bakiye ile yanlış üretmez.
T14 Bekleyen/ödendi durumuna tıklamak yalnız açık kullanıcı kayıt eyleminde transaction oluşturur.
T15 Tüm testler aynı entegrasyon commit SHA'sında (Node + Playwright + Android instrumentation + upgrade) geçer.

## Test ve CI kapıları

Her özellik PR'ı:
- Node finans ve JSON golden/regresyon testleri
- Playwright kullanıcı yolculukları ve güvenli HTML
- Android build/lint/API35 instrumentation
- Eski -> aday sürüm 7 -> 8 veya sonraki gerçek sürüm koduna uygun yükseltme senaryosu
- Aynı SHA ve kaynak kod ağacında geçiş kaydı
- İmzalı gerçek cihaz yükseltme öncesi bağımsız yedek, sertifika ve kimlik doğrulama kontrolü

CI'daki geçici sertifika gerçek 0.4.0 kalıcı imzasının yerine geçmez. Üretim .p12 dosyası veya parola GitHub/CI'ya gönderilmez; kararlı APK bu özellik çalışması sırasında otomatik oluşturulmaz.

## Tek geliştiricili kalite kapısı

Resmî ikinci insan GitHub reviewer zorunlu değilse açık teknik inceleme + yeşil CI + kullanıcıdan açık merge onayı. GitHub dal kuralları/CI gevşetilmez. PR'a bilinen sınırlar, test raporu, yedek uyumu ve son commit SHA'sı yazılır. Main'e kendiliğinden merge, APK dağıtımı ve branch cleanup yok.

## İlk uygulama işi (finans koduna dokunmadan)

1. Bu üç tasarım sözleşmesini gözden geçir ve kritik ürün kararlarını işaretle.
2. Ayrı dalda yalnız 'Hızlı Ekle' akışını aç: üst başlık butonu + erişilebilir işlem türü seçimi. Var olan form handler'larını çağır.
3. Yeni veri modeli, Android bildirim izni, kredi kartı hesaplaması, muhasebe düzeltmesi, JSON migrasyonu yapma.
4. Ekran boyutu ve klavye testleri + mevcut alt navigasyon route kimliklerinin korunması.
5. PR taslak olarak bırak; birleşik CI ve kullanıcı incelemesi sonrası değerlendirilir.

Ürün kararı alınmamış yüksek riskli özellikler bu ilk PR'da kodlanmaz.
