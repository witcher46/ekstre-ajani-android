# Ortak finansal davranış sözleşmesi

Bu belge masaüstü, Android ve web uygulamalarının sonuçlarını aynı finansal anlamda tutmak için ortak referanstır. Sözleşme paylaşılan bir çalışma zamanı kütüphanesi değildir; her uygulamanın kendi testleri bu kuralları korur.

## Değişmez kurallar

1. TL tutarları hesaplamada tamsayı kuruş olarak tutulur (`1 TL = 100 kuruş`). Para dönüşümü, toplama ve bölme kayan nokta yuvarlamasına bırakılmaz.
2. Açılış bakiyesi gelir değildir. Hesaplar arasındaki transfer gelir veya gider yaratmaz.
3. Taksitsiz kredi kartı alışverişi işlem ayında gider sayılır. Her taksit ait olduğu ayda bir kez gider sayılır. 100 TL üç taksite 33,33 + 33,33 + 33,34 TL olarak dağılır.
4. Kart borcunu banka hesabından ödemek bankadaki parayı ve kart borcunu azaltır; ikinci bir gider oluşturmaz.
5. Planlanan gelir tahmindir. Gerçekleşti olarak işaretlenene kadar kullanılabilir bakiyeye ve gerçekleşen gelir raporuna eklenmez.
6. İade, gerçekleştiği ayda negatif gider olarak yazılır. Ekimdeki 1.000 TL alışverişin kasımda gelen 400 TL iadesi ekimdeki gideri değiştirmez ve kasımda gideri 400 TL azaltır. Kaynak ilişkilendirmesi mümkün olduğunda korunur.
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

## Android uygulaması

Manuel taksit planında ilk taksit tarihini kullanıcı seçer. PDF’deki taksit giderinin ayı, bankanın bildirdiği ekstre döneminden alınır. Satırdaki kaynak işlem tarihi korunur. Belgedeki dönem borcu, kayıtlardan hesaplanan güncel borç ve gelecekteki taksitler ayrı gösterilir. Mevcut Android borç tahmini, manuel plandaki gelecek taksitleri tarihleri geldiğinde işler.

## Ürün kararı bekleyen alanlar

Bu ortak sözleşme aşağıdaki konularda henüz platformlar arası politika tanımlamaz. Bir uygulamadaki mevcut kod davranışı diğer platformlar için ürün kararı sayılmaz; bu başlıklarda sessiz varsayım veya otomatik uyumlaştırma yapılmamalıdır.

- Taksitin belge veya kullanıcı tarafından belirlenmemiş ilk ayı ile gelecek taksitlerin kart limiti ve net finansal duruma etkisi.
- “Ekstre dönem borcu”, “kalan borç”, “güncel borç” ve “kullanılabilir limit” tanımları ile her birinin kaynak ve kesim tarihi.
- Otomatik hareket eşleştirmesinde tarih/açıklama toleransları ve hangi koşullarda kullanıcı onayının zorunlu olduğu. Belirsiz eşleşme incelemede kalır.
- Ekstre toplamı ile hesaplanan toplam arasında kabul edilecek mutabakat farkı. Kuruş farkı gizlenmez; tolerans ancak açık ürün kararı ve testle tanımlanır.
- Faiz, asgari ödeme, gecikme, BSMV/KKDF, nakit avans, döviz ve hesap kesim günü/saat dilimi gibi bankaya özgü durumlar.

Mevcut ortak sentetik kabul örneği bu durumları kapsamaz ve tek başına çapraz-platform uyumluluk kanıtı değildir. CI yalnız sentetik veriler kullanır; gerçek banka PDF örnekleri olmadan gerçek ekstre biçimlerine ilişkin test iddiasında bulunmaz. Bu konularda ortak davranış değişikliği yapılmadan önce beklenen sonuçları veren senaryolar tanımlanıp her platformda doğrulanmalıdır.
