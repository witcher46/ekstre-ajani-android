# Kullanım incelemesi — ilk bulgular

Kaynak: Android dalı da51ba5; gerçek Chrome/WebView varlıkları, sentetik kullanıcı akışları. Henüz yeni Android emülatör çalıştırması değildir.

## P0

1. Büyük para değerleri iki sütuna sığmıyor; `.panel` üzerindeki `overflow-wrap:anywhere` rakamları ortadan bölüyor. `.row` ve `.chart-label` çocuklarının esneme/sarma kuralları yetersiz; 320/360/390/412 px ve %150 metin matrisindeki 56 durumun 38'inde ölçülen para sarılması/taşma veya küçük buton hedefi var. Görüntüler `test-output/before` altında.
2. Manuel banka-kart ödemesi ile PDF/CSV kart ödemesi bağımsız eksi etkiler; aynı ödeme iki kez düşebiliyor. Kaynak/eşleşme durumu yok.
3. `summary` doğrudan `period` kullanıyor; işlem tarihi Eylül, ekstre Ekim olduğunda cüzdanın Eylül harcaması kayboluyor.
4. `balance` son ekstre borcunu kullanmıyor; önceki dönem devri olan kartta hareket toplamı güncel borç gibi sunuluyor.
5. `importStatement` kullanıcı açıklamasını korumuyor. CSV kimliği satır sırasına/kategoriye bağlı; sıralama değişince yeniden ekleniyor. Kaynaklar arasında aday çözümü yok.
6. Parser tanınan ama geçersiz tarihli satırları sessizce atlıyor; kısmi aktarım mümkün.

## P1

1. Abonelik ödeme tarihi `next` vadeye yazılıyor. Aynı ekran isteği/vade için idempotans yok; ayın 31'i Şubat'tan sonra 28'e kayıyor.
2. İşlem formu türden bağımsız tüm hesapları, hedefi ve ekstre dönemini soruyor. Nakit geliri için kart/transfer alanları gereksiz ve hataya açık.
3. Kart borcu, nakit ve ekstre bilgileri aynı görsel ağırlıkta. Hesap ayrımı, yaklaşan/vadesi geçen tarih ve aday kayıt uyarıları yeterince açık değil.
4. Android `setTextZoom(100)` sistemin büyük yazı ayarını yok sayıyor. Modal klavye açıkken erişim testi yok.
5. Deneme APK anahtarı derleme makinesine bağlı; eski uygulama üzerine veri korunarak güncelleme garantisi yok.
6. Geri yükleme öncesi kurtarma kopyası kullanıcıya erişilebilir bir işlem olarak sunulmuyor.

## P2

1. Uzun işlem listesinde 150 kayıt sınırı görünür ama devam yükleme yok.
2. Kart limiti/faiz/OCR/gelecek taksit ve çoklu profil bu revizyonun kapsamı dışında; bilinmeyen veriler uydurulmamalı.

Finans örneklerini kapsayan 15 yeni testin ilk çalışmasında 13 test beklenen mevcut davranış kusurları nedeniyle başarısız, 2 test başarılı. Mevcut 14 çekirdek testi başlangıçta geçti; bu eski testlerin sorunları yakalamadığını gösteriyor.

Ölçüm düzeltmesi: ilk büyük-yazı simülasyonu aynı başlığı ekran geçişleri boyunca tekrar büyütüyordu ve iç içe metin kutularındaki birkaç piksellik farkı satır kırılması sayıyordu. Test düzeltildi; aynı test eski varlıklarda yeniden çalıştırıldı: gerçek karşılaştırma **26/56 eski başarısız, 0/56 yeni başarısız**. Eski sonuçların üzeri örtülmedi; bu not başlangıç 38/56 sayısını düzeltir.
