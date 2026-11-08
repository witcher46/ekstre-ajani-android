# Cüzdan ve kart yönetimi tasarımı — 8 Kasım 2026

Bağlayıcı kapsam: kullanıcının “Finansal Mimari ve Kullanıcı Deneyimi Yeniden Tasarımı” belgesi. Kaynak revizyon uzak fa723276472f484edd6e41e9f343cadb5fb9ddcd; yerel eşdeğer fc4215e. Dal feature/mobile-wallet-finance-v2. GitHub main AGENTS.md kuralları okundu ve uygulanır.

## Amaç ve yaklaşım
Banka/nakit varlığı, aylık gelir-gider ve kart yükümlülüğü aynı cüzdan içinde yönetilir. Dört ana eylem gelir, gider, transfer ve kart borcu ödemesidir. Kart ayrıntısı ve PDF önizlemesi işlemin finansal anlamını açıklar.
Mevcut motor ana 20.000/30.000/2.000 TL senaryosunu doğru hesaplıyor; bu nedenle sıfırdan muhasebe/veritabanı yazımı seçilmedi. Seçim: mevcut kuruş motorunun tarih/eşleştirme hatalarını düzeltmek, cüzdan işlevleri için wallet.mjs ve görünümler için views.mjs eklemek. Yeni çatı, servis ve üretim bağımlılığı yok.

## Kanıtlanan öncelikler
P0: bozuk ndirim satırı gider oluyor; farklı banka/PDF ödeme tarihlerinde eşleşme yok ve hesap kesim sınırında ödeme tekrar borçtan düşebiliyor. Orijinal PDF açıklaması kayboluyor.
P1: kart üzerinden ödeme ve kaynağı bilinmeyen PDF ödemesine banka bağlama akışı, gelir kategorileri ve onaylı düzenli gelir planı, aylık fark/nakit akışı eksik.
P2: taksitlerin sadece numarası var; gelecek tutarlar açık tahmin olarak gösterilmeli. İçe aktarımda toplamlar ve doğrulanamama nedenleri görünmeli.

## Finans kuralları
- Bütün hesaplar ve raporlar aynı kuruş motorundan; başlangıç tutarları gelir/gider değil.
- Gelir bankaya/nakde; kart harcaması gider; banka-kart ödemesi ve iç transfer gider değil.
- Planlanan gelir bakiyeye eklenmez. Alındı onayı gerçek tarih ve tek vade anahtarıyla gelir yaratır.
- Eşleşme önerisi tarih farkına tolerans gösterebilir; kesinleştirme kullanıcıya aittir. İki eşit gerçek işlem ayrı kalır.
- Onaylı banka/PDF grubunda banka tarihi nakit akışına, PDF tarihi kartın kesim sınırına uygulanır. Kesim sınırını geçen belirsiz ödeme karara kadar ikinci kart etkisi yaratmaz; banka hareketi korunur.
- Fazla ödeme negatif borç olarak gizlenmez; kart artı bakiyesi ayrı gösterilir ve net varlığa katılır.
- Son ekstre borcu, ödemelere göre kalan ekstre, kesim sonrası harcama/iade ve güncel tahmin ayrı. Bankanın iadeyi vade ödemesine saydığı varsayılmaz.
- Taksitlerde yalnız kaydedilmiş dönem hareketi giderdir. Gelecek taksitler ve bilinmeyen toplam satın alma bedeli tahmindir, yeniden borç/gider yaratmaz. Aynı satırların belirsiz gruplanması otomatik kesinleştirilmez.
- PDF ham açıklaması korunur; güvenilir bozuk banka işaretleri gösterim için düzeltilir. Eksik başlık toplamları gerekçeli uyarı+ayrı kullanıcı onayı gerektirir; çelişen toplamlar kayda engeldir.

## Geriye uyum ve geri dönüş
Android format/version=1 korunur; incomePlans ve incomeCategories isteğe bağlı alanlardır. Eski kimlikler, tutarlar, notlar, kategoriler ve bilinmeyen alanlar korunur. Varsayılan alanlar yalnız bellek kopyasında tamamlanır; kullanıcı eylemi öncesinde otomatik kayıt yok. Geri yükleme mevcut atomik SQLite kurtarma yolunu kullanır.
Üretim verisine göç/üzerine yazma yapılmaz. Geri alınması zor şema değişikliği çıkarsa ayrıca kullanıcı onayı gerekir.
Önceki debug imza anahtarı mevcut olmadığı için sonraki APK eski uygulamayı kaldırmayı gerektirmeyen ayrı paketle hazırlanmalıdır; APK aşamasında açıkça raporlanır.

## Sınırlar ve doğrulama
Masaüstü, gerçek kayıtlar, eski APK ve android/ux-finance-revision korunur. Gerçek PDF ve kullanıcının gerçek tutarları fikstür olarak dışarı gönderilmez; yalnız sentetik veriler. GitHub gönderiminden önce liste/tarama ve kullanıcı onayı şartı sürer. Yerelde SDK yok; Android ve APK doğrulaması yerel testler sonrası ayrı, süre sınırlı CI aşamasıdır. Kör CI tekrarları yok.

Ruling: kullanıcı açıkça “analiz hazırla, ardından uygulamaya geç” dediği için geri alınabilir tasarım seçimleri için yeni onay döngüsü açılmadı. İzin sınırı veri kaybı/doğrudan gerçek veri göçü ve GitHub aktarımıdır.
Ruling: C:/workspace worktree oluşturma izni reddedildi; aynı ayrı dal kullanıcının proje kökü altında android_wallet_v2 çalışma ağacında açıldı. Önceki çalışma dosyaları değişmez.
