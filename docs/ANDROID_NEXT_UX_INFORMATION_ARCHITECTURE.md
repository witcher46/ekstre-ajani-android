# Ekstre Ajanı — Android bilgi mimarisi ve arayüz yerleşimi (taslak)

Durum: UX planı. Çalışan UI veya kullanıcı verisine henüz dokunmaz.
Hedef: Düşük zihinsel yük, finansal terimlerin açıklığı, erişilebilirlik, mevcut veri ve route kimliklerini koruma.

## Birincil gezinme (5 sekme)

Android telefon alt navigasyonu aynen beş hedefli kalır:

| Sekme / route | Kullanıcının ana sorusu | Birincil içerik | Yeni özellik konumları |
| --- | --- | --- | --- |
| Özet / home | Ne kadar nakdim, borcum ve bekleyen işim var? | Kayıtlara göre bakiye, net durum, aylık özet, inceleme uyarısı, ödemeler, son hareketler | İnceleme kutusu giriş kartı; raporlara geçiş; yaklaşan ödemeler |
| Cüzdan / wallet | Param ve kart borçlarım hangi hesapta? | Banka, nakit, kart grupları; detay ekranı | Banka/nakit mutabakatı, gelişmiş kredi kartı ayrıntıları |
| İşlemler / transactions | Ne oldu ve nasıl düzeltebilirim? | Arama, dönem/kaynak/tür filtreleri, liste, işlem detayı | Hızlı giriş, işlem bölme, kategori önerileri, inceleme filtresi |
| Plan / plan | Gelecekte ne ödeyecek, ne biriktireceğim? | Takvim, abonelikler, bütçeler, gelir planları | Hedefler, vade listesi, hatırlatma tercihleri |
| Ekstre / import | Bankadan hangi kayıtları aldım? | PDF/CSV seçimi, önizleme, ekstre geçmişi | Belge mutabakatı, belgeden gelen şüpheli kayıt inceleme bağlantısı |

Android Material 3 telefon navigasyonu için 3-5 üst düzey hedef önerir. Yeni dokuz özelliğin hiçbiri altıncı sabit sekme oluşturmaz. Ekstre incelemesinin kaynağı hesap/işlem de olabileceği için genel inceleme tek başına 'Ekstre'ye gömülmez.

Ayarlar üstte mevcut ayarlar kontrolünde; raporlar Özet içindeki açık 'Raporlar' bağlantısında; kredi kartı detayına Cüzdan'dan girilir. Mevcut data-page değerleri ve Android geri davranışı korunur.

## Üst çubuk ve hızlı kayıt

Başlık/marka, tek bir 'Ekle' eylemi ve 'Ayarlar' açıcı. Ekle, bottom sheet veya erişilebilir kısa menü üzerinden dört mevcut akışı çağırır: Gider, Gelir, Transfer, Kart ödemesi. Farklı yeni kayıt motoru yoktur. Ekle düğmesi modal açıkken veya ilgili formda ikinci kez eylem başlatmaz.

Birincil başlıkta tarih/ay seçimi ilgili ekrana özgü kalır. Alt sekmeye eylem '+ Ekle' olarak ayrı destinasyon eklenmez. WebView klavye, güvenli alan/sistem gezinti, modal odak yönetimi ve Android geri tuşu testleri gereklidir.

## Ekran düzenleri

### Özet

1. Kayıtlara göre banka + nakit; kredi kartı tahmini borç; net finansal durum. Canlı banka bakiyesi izlenimi verilmez.
2. Aylık gelir / net gider / gelir eksi gider; dönem açıklaması.
3. Öncelik sıralı bildirim kartı: şüpheli işlem, bağlanmamış kaynak hesap, geciken ödeme. Hiçbiri sahte finansal toplama katılmaz.
4. Hızlı eylemler, yaklaşan ödeme listesi, son 5 işlem.
5. Raporları aç ve detay filtrelerine git.

İlk ekranda yalnız en kritik metrikler. Uzun grafik ve bütün kart detayları ayrı ekranlarda.

### Cüzdan

Banka, nakit ve kredi kartı ayrı listelenir. Banka/nakit detayı: kayıtlı bakiye, son bakiyeyle karşılaştırma düğmesi, işlem geçmişi, mutabakat kayıtları ve açıklanmış fark.

Kredi kartı detayı ayrı üst bilgi blokları içerir:
- Güncel borç TAHMİNİ
- Belgedeki dönem borcu (kaynak + kesim tarihi)
- Ödemeye göre kalan dönem borcu
- Kesim sonrası hareket ve iadeler
- Gelecek taksitler, tahmini tutarlar
- Kartın artı bakiyesi ve kaynak bağlanmamış ödemeler

Eksik banka kaynaklı rakamlar 'Bilinmiyor' şeklinde kalır; 0 veya hayalî limit gösterilmez. Kaynağın PDF veya manuel kayıt olduğu ekran üzerinde anlaşılır.

### İşlemler

Üstte arama ve özlü filtre: dönem, hesap/kart, tür, kategori, inceleme gerekiyor mu. Liste satırında açıklama, tarih, kaynak, kategori, tutar ve gerektiğinde 'incele' işareti.

Bir işlem açıldığında ayrıntı paneli açılır: düzenle, not/kategori, mevcut eşleşme ilişkisi, varsa kategori bölümleri, belge kaynağı. 'İşlemi böl' bu detay içinde yer alır; üst ekonomik işlem tek satır kalır, alt tahsisler açılır.

İnceleme merkezi ayrı kalıcı alt sekme olmaz: Özet uyarısı, İşlemler 'İncele' filtresi ve Ekstre kaynağından aynı review ekranına bağlantı sağlanır.

### Plan

İkinci düzeyde dört grup: Takvim / Bütçeler / Gelir planları / Hedefler. Telefon küçükse yatay kaydırılabilir başlıklar veya sıralı kartlar kullanılır.

Takvimde abonelikler, son ödeme tarihi belgeyle bilinen kart ödemeleri, beklenen gelirler ve hedef vadeleri farklı sembol/etiketlerle gösterilir. 'Planlanan', 'tahmini', 'gerçekleşti' durumları birbirine karıştırılmaz.

Bildirim tercihi yalnız bu bölüm ve Ayarlar içindeki bildirim alt ekranında bulunur. Ödeme düğmesi gerçek finansal işlemi kaydederken ayrıca kullanıcı onayı ister.

### Ekstre

Üstte PDF/CSV içe aktarma, ardından belgeyi kaydetmeden önce özet ve kullanıcı onayı. Kaynak kartı, dönem, belge borcu, okunan hareket sayısı, mutabakat sonucu açık gösterilir.

Daha sonra ekstre geçmişi ve bu ekstreyle ilişkili 'inceleme gerektiriyor' bağlantıları bulunur. Bu akış gerçek banka hesabı mutabakatı ile karıştırılmaz; iki farklı anlamdır.

### Raporlar

Özet üzerinden ikinci düzey ekran. İlk sürüm: son 6/12 aylık gerçekleşmiş gelir/net gider, kategori sıralaması, ay değişimleri ve nakit akışı. Kart borcu ödemesi net giderden hariç. Net varlık zaman çizelgesi ancak tarihsel bakiye hesaplaması test edildikten sonra. Grafik üzerinde negatif gider (iade), sıfır ve eksik veri birbirinden ayırt edilir.

## İnceleme kutusu ayrıntısı

Her kayıt için üç net eylem:
- Aynı işlem: mevcut eşleştirme motoruyla bağla (uygun kaynak ve hedef gerekli).
- Ayrı işlem: gerçek bağımsız hareket olarak onayla.
- Sonra incele: hiçbir finansal değişiklik yapmadan beklet.

Üzerinde henüz karar olmayan hareket banka bakiyesine etkili bir manuel ödeme ise mevcut özel semantik korunur. Tüm bekleyenleri tek tuşla otomatik kabul etme yoktur.

## Tasarım sistemi

Önerilen yön: koyu antrasit + ölçülü zümrüt/mint vurgu; durum/uyarı renkleri yalnız anlamlı durumlarda. İsteğe bağlı açık tema sonraki aşama. Parasal tutarlar tabular rakamlarla, taşma korumasıyla yazılır; her sayı veri kaynağı/tarih/gerçekleşme durumuna göre etiketlenir.

Minimum 48dp dokunma hedefi, okunabilir etiketler, klavye ve Android geri, tutarlı erişilebilirlik sırası, büyük sistem fontları ve 320dp dar ekran desteklenir. Sabit alt bar modal/klavye alanına binmez. Kartlar ne kadar çok veri gösterdiğine göre değil, kullanıcının aldığı karara göre sıralanır.

## Görsel prototip ve kabul

Koddan önce aynı sentetik veri setiyle Özet, Cüzdan, Kredi kartı, İşlem detayı, İnceleme, Plan, Ekstre ve Raporlar ekranları prototiplenir.

Uygulanacak senaryolar:
- Boş hesapla başlangıç; para veya banka verisi uydurulmaz.
- Çok uzun Türkçe hesap adı ve milyonluk tutar hiçbir düğmeyi taşırtmaz.
- Özetten incelemeye 1-2 dokunuş; İnceleme sonucu önceki ekranın odağına dönüş.
- Açık modal + klavye + Android geri davranışı ve 200% yazı büyüklüğü.
- Bildirim izni yokken uygulamanın normal kullanılabilmesi.
- Kaynağı bilinmeyen kart ödemesinin tahmin etiketleriyle görünmesi.
- 320x640, 360x780, 390x844, 600dp ve tablet/geniş ekran düzeni.

İlk uygulama PR'ı mevcut muhasebeyi değiştirmeden yalnız hızlı giriş menüsü ve bilgi hiyerarşisini kapsayabilir. Bunun dışındaki finansal özellikler kendi sözleşme ve regresyon testleriyle açılır.
