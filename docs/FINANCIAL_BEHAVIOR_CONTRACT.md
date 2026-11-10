# Ortak finansal davranış sözleşmesi

Bu belge masaüstü, Android ve web uygulamalarının sonuçlarını aynı finansal anlamda tutmak için ortak referanstır. Sözleşme paylaşılan bir çalışma zamanı kütüphanesi değildir; her uygulamanın kendi testleri bu kuralları korur.

## Değişmez kurallar

1. TL tutarları hesaplamada tamsayı kuruş olarak tutulur (`1 TL = 100 kuruş`). Para dönüşümü, toplama ve bölme kayan nokta yuvarlamasına bırakılmaz.
2. Açılış bakiyesi gelir değildir. Hesaplar arasındaki transfer gelir veya gider yaratmaz.
3. Kredi kartı alışverişi, yapıldığı dönemde bir kez harcama ve kart borcu oluşturur.
4. Kart borcunu banka hesabından ödemek bankadaki parayı ve kart borcunu azaltır; ikinci bir gider oluşturmaz.
5. Planlanan gelir tahmindir. Gerçekleşti olarak işaretlenene kadar kullanılabilir bakiyeye ve gerçekleşen gelir raporuna eklenmez.
6. İade ve düzeltmeler kaynak işlemle ilişkilendirilir; geçmiş hareketler sessizce silinmez veya yeni bir gider gibi yeniden sayılmaz.
7. Aynı kaynağın yeniden aktarımı mükerrer kayıt oluşturmamalı ve kullanıcının düzenlemelerini korumalıdır. Kaynaklar arası belirsiz eşleşme kullanıcı kararına kadar incelemede kalır.
8. Bankanın vermediği canlı bakiye, asgari ödeme, ekstre borcu veya tarih uygulama tarafından uydurulmaz. Tahmin ve doğrulanmış belge verisi ayrı gösterilir.
9. Finans verisi yerel depolarda kalır. Otomatik bulut eşitlemesi veya CI'ya gerçek finans belgesi gönderimi yoktur.

## Ortak sentetik kabul senaryosu

Başlangıç banka bakiyesi `2.000.000 kuruş`, alınmış gelir `3.000.000 kuruş`, kart alışverişi `200.000 kuruş`, bu alışverişi kapatan kart ödemesi `200.000 kuruş` olsun.

- Banka kapanış bakiyesi: `4.800.000 kuruş`
- Kart kalan borcu: `0 kuruş`
- Gerçekleşen gelir: `3.000.000 kuruş`
- Dönem harcaması: `200.000 kuruş` (kart ödemesi ikinci kez sayılmaz)

Test ve örneklerde yalnızca sentetik veri kullanılmalıdır.