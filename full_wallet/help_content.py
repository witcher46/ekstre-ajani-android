"""Offline Turkish user documentation; no financial records or network calls."""
import unicodedata


def article(ident, title, group, summary, steps, note, page, link):
    return dict(id=ident, title=title, group=group, summary=summary, steps=steps,
                note=note, page=page, link=link)


ARTICLES = [
    article("baslangic", "İlk kez nasıl başlarım?", "Başlangıç",
            "Ekstre yükleyerek veya elle hesap oluşturarak başlayabilirsiniz.", [
                "Kart ekstresiyle başlamak için Ekstreler sayfasını açın; otomatik kart algılamayı seçip PDF'lerinizi yükleyin.",
                "Nakit veya banka hesabıyla başlamak için Cüzdan → Banka ve nakit hesapları → Hesap ekle bölümünü açın. Hesap adını ve başlangıç bakiyesini girin.",
                "İşlemler'den kayıtları kontrol edin; ardından Planlama → Bütçe'de harcama hedeflerinizi belirleyin.",
                "Ayarlar'dan profil parolası ve yedeklerinizi yönetin. İlk kullanım sekmesindeki rehberi dilediğiniz zaman yeniden açabilirsiniz."],
            "Başlangıç için PDF zorunlu değildir. Yardım Merkezi internet olmadan çalışır.", "views/ekstreler.py", "Ekstreler'e git"),
    article("profil", "Profil, parola ve kilitleme", "Başlangıç",
            "Her profil kendi kartlarını, hesaplarını, işlemlerini ve ayarlarını görür.", [
                "Ayarlar → Profil güvenliği bölümünde mevcut parolanızı ve yeni parolanızı girin. İlk profilin henüz parolası yoksa mevcut parola alanını boş bırakın.",
                "En az 8 karakterlik yeni parolayı iki kez yazın ve Parolayı kaydet'e basın.",
                "Ayrı bir kullanıcı için Yeni profil oluştur bölümünü kullanın.",
                "Bilgisayardan ayrılırken soldaki Profili değiştir / Kilitle düğmesine basın."],
            "Profil parolası uygulama girişini korur; veritabanı dosyasını şifrelemez. Tam yedek tüm profilleri içerir.", "views/ayarlar.py", "Profil ayarlarına git"),
    article("pdf", "PDF ekstre nasıl yüklenir?", "Ekstreler",
            "Yapı Kredi ve QNB'nin metin içeren kredi kartı ekstreleri desteklenir.", [
                "Ekstreler → 1. Kartı seçin alanında Otomatik algıla (PDF'ten) seçeneğini kullanın veya doğru kayıtlı kartı seçin.",
                "2. Ekstre PDF'lerini yükleyin alanından bir ya da birden çok PDF seçin.",
                "3. İçe aktar ve analiz et'e basın. Her dosyanın sonucunu ve ekstre toplamlarıyla yapılan kontrolü okuyun.",
                "İşlemler → İnceleme kutusu'nda kategori ve eşleştirme bekleyen hareketleri kontrol edin."],
            "Aynı ekstreyi yeniden yüklemek hareketleri çoğaltmaz; ilgili dönem güncellenir. PDF dosya adındaki tarih yerine belgedeki ekstre dönemi kullanılır. Taranmış görüntü PDF'lerinde metin okuma (OCR) desteği yoktur.", "views/ekstreler.py", "Ekstre yükle"),
    article("kartlar", "Kart borcu ve ekstre geçmişini görme", "Cüzdan",
            "Kartın borcunu, limitini, işlemlerini ve taksitlerini birlikte inceleyin.", [
                "Cüzdan → Kredi kartları bölümünde incelemek istediğiniz kartı seçin.",
                "Borç ve limit özetini okuyun; İşlemler, Taksitler veya Ekstre geçmişi sekmesini açın.",
                "Daha ayrıntılı arama için Bu kartın tüm işlemlerini aç bağlantısını kullanın.",
                "PDF olmadan kart eklemek için Ekstreler → Yeni kart ekle bölümünden bankayı ve kart adını kaydedin."],
            "Güncel borç yalnızca son ekstre ve uygulamaya kaydedilmiş hareketleri bilir. Bankadaki bekleyen provizyonlar ve kaydedilmemiş işlemler otomatik alınmaz.", "views/cuzdanim.py", "Kartlarına git"),
    article("hesaplar", "Banka ve nakit hesabı, gelir ve gider", "Cüzdan",
            "Hesap bakiyenizi başlangıç tutarı ve kaydettiğiniz hareketlerle takip edin.", [
                "Cüzdan → Banka ve nakit hesapları → Hesap ekle'de ad, tür ve başlangıç bakiyesini yazın; Hesabı oluştur'a basın.",
                "Hareket ekle'de Gelir veya Gider'i seçin; hesap, tarih, tutar ve açıklamayı doldurun. Gider için kategori seçin.",
                "Hareketi kaydet'e basın. Hesap hareketleri tablosu ve bakiye güncellenir.",
                "Yanlış başlangıç bakiyesini Hesabı düzenle bölümünde düzeltin. Yanlış hareketi Hareket sil bölümünden kaldırıp doğru bilgileri yeniden girin."],
            "Tutarlar TL'dir. Başlangıç bakiyesine dahil ettiğiniz eski hareketleri ayrıca eklemek bakiyeyi ikinci kez etkiler.", "views/hesaplar.py", "Banka ve nakit hesaplarına git"),
    article("transfer", "Transfer ve kredi kartı ödemesi", "Cüzdan",
            "Hesaplar arası transfer ve kart borcu ödemesi harcama sayılmaz.", [
                "Cüzdan → Banka ve nakit hesapları → Hareket ekle'yi açın.",
                "Transfer için Hesaplar arası transfer'i seçin; çıkan paranın hesabını ve Alıcı hesap'ı belirtin.",
                "Kart ödemesi için Kredi kartı ödemesi'ni seçin; kaynak hesap ile Ödenen kart'ı belirtin.",
                "Tarih, tutar ve açıklamayı doldurup Hareketi kaydet'e basın."],
            "Hesaptan kart ödemesi hem hesap bakiyesini hem kart borcunu günceller; aynı ödemeyi kart tarafına tekrar elle eklemeyin. Ekstredeki karşılığıyla kesin eşleşme birleştirilir, belirsiz olanlar incelemeye gelir.", "views/hesaplar.py", "Ödeme veya transfer ekle"),
    article("islem", "İşlem ekleme, not, etiket ve kategori", "İşlemler",
            "Kart ve hesap hareketlerinizi ortak işlem masasından yönetin.", [
                "İşlemler → Yeni işlem ekle'yi açın. Kart ya da hesap seçip tarih, açıklama, tutar ve türü girin; ilgili ekleme düğmesine basın.",
                "Mevcut kaydı tablodan veya Ayrıntısı gösterilen işlem listesinden seçin.",
                "Sağdaki İşlem ayrıntısı alanında görünen adı, kategoriyi, notu ve etiketleri düzenleyin. Etiketleri virgülle ayırın: Ev, Tatil gibi.",
                "Kontrol ettiğiniz kayıtta İncelendi'yi işaretleyip Ayrıntıları kaydet'e basın."],
            "Kaynak açıklama korunur. Kart iadesini eklerken pozitif tutar girip İade türünü seçin; raporlarda harcamadan düşülür. Gelir, transfer ve kart ödemesi harcama kategorisine dönüştürülemez.", "views/islemler.py", "İşlemlere git"),
    article("filtre", "Arama, filtre ve kaydedilmiş görünümler", "İşlemler",
            "Sık kontrol ettiğiniz işlem kümelerine hızlıca dönün.", [
                "İşlemler'deki arama alanına mağaza adı, not veya etiket yazın. Kart / hesap ve Kategori filtresi'ni gerekirse daraltın.",
                "Diğer filtreler ve görünümü kaydet bölümünden dönem, kaynak, tür, inceleme durumu, tutar veya tarih seçin.",
                "Görünüm adı girip Görünümü kaydet'e basın.",
                "Sonraki kullanımda Kaydedilmiş görünümler'den adı seçip Görünümü aç'a basın."],
            "Tutar filtreleri iadelerde de tutarın büyüklüğüne bakar. Kayıt görünmüyorsa tarih, dönem ve inceleme filtrelerini kontrol edin; kayıtlı görünümü silmek işlemleri silmez.", "views/islemler.py", "İşlem filtrelerini aç"),
    article("toplu", "Birden fazla işlemi birlikte düzenleme", "İşlemler",
            "Kategori, etiket ve inceleme durumunu seçtiğiniz kayıtlara uygulayın.", [
                "İşlemler tablosundan birden çok satır seçin veya Toplu düzenleme → Seçilen hareketler listesini kullanın.",
                "Toplu kategori ve Toplu inceleme durumu alanlarında değiştirmek istediklerinizi seçin.",
                "İsterseniz Toplu eklenecek etiketler alanına virgülle ayrılmış etiketler yazın.",
                "Seçilenleri kontrol edip Seçilenlere uygula'ya basın."],
            "Değiştirme seçeneği ilgili alanı korur. Etiketler mevcut etiketlere eklenir. Toplu kategori yalnızca harcama, iade ve giderde kullanılabilir; geçersiz seçim varsa toplu değişiklik kaydedilmez.", "views/islemler.py", "Toplu düzenlemeye git"),
    article("inceleme", "İnceleme kutusu ve eşleştirme", "İşlemler",
            "Kontrol edilmemiş işlemleri ve aynı işlem olabilecek kayıtları çözün.", [
                "Genel Bakış → Kontrol bekleyenleri aç'a veya İşlemler → İnceleme kutusu sekmesine gidin.",
                "Tarih, tutar ve kategoriyi kontrol edin; gerekirse ayrıntıyı düzeltip İncelendi olarak kaydedin.",
                "Eşleştirme bekleyen kayıtlarda manuel kayıtla ekstre satırının aynı alışveriş veya ödeme olup olmadığını kontrol edin.",
                "Aynıysa Aynı işlem · eşleştir; ayrı hareketlerse Farklı işlemler · ayrı tut'a basın."],
            "Bir kaydı İncelendi yapmak belirsiz eşleştirmeyi çözmez; eşleştirme için ayrıca karar vermelisiniz. Bilerek Diğer kategorisinde bıraktığınız kaydı incelendi olarak işaretleyebilirsiniz.", "views/islemler.py", "İnceleme kutusuna git"),
    article("kategori", "Özel kategori oluşturma ve düzenleme", "İşlemler",
            "Harcamalarınızı kendinize uygun kategorilerle takip edin.", [
                "İşlemler → Kategoriler sekmesinde Yeni kategori adı yazın; isterseniz Üst kategori seçin.",
                "Kategoriyi oluştur'a basın. Kategoriyi işlem ayrıntısı, bütçe ve kural alanlarında kullanabilirsiniz.",
                "Özel kategoriyi düzenle veya sil bölümünden adını ya da üst kategorisini değiştirin.",
                "Silmek için kayıtların taşınacağı kategoriyi seçip Kategoriyi sil ve kayıtları taşı'ya basın."],
            "Kategori silme harcamaları silmez; ilgili kayıtları seçtiğiniz kategoriye taşır. Hazır kategoriler özel kategori düzenleme listesinde yer almaz.", "views/islemler.py", "Kategorileri yönet"),
    article("kural", "Otomatik işlem kuralları", "İşlemler",
            "Örneğin açıklamasında NETFLIX geçen yeni harcamalara Abonelik kategorisi atayın.", [
                "İşlemler → Kurallar sekmesinde Yeni kural'ı seçin, kural adı yazın.",
                "Açıklama içerir alanını ve gerekiyorsa kart, hesap, tür, tutar, kaynak koşullarını doldurun.",
                "Atanacak kategori, etiket, görünen ad veya inceleme durumunu belirleyin; Etkiyi önizle'ye basın.",
                "Sonucu kontrol edip Kuralı kaydet'e basın. Eski kayıtlara da uygulamak için kayıtlı kuralı seçip Kayıtlı kuralı mevcut hareketlere uygula'yı kullanın."],
            "Önizleme kayıt değiştirmez. Yeni hareketlerde küçük öncelik sayısına sahip ilk eşleşen etkin kural çalışır. Elle yaptığınız açık düzeltmeler korunur; pasif kural yeni hareketlere otomatik uygulanmaz.", "views/islemler.py", "Kuralları aç"),
    article("bolme", "Bir harcamayı kategorilere bölme", "İşlemler",
            "Örnek: 1.000 TL'lik market alışverişini 700 TL gıda ve 300 TL temizlik olarak ayırın.", [
                "İşlemler'de harcama, iade veya hesap giderini seçin.",
                "Sağdaki Kategorilere böl bölümünü açın. Tabloda en az iki satır oluşturup kategori ve tutarları yazın.",
                "Bölümlerin toplamının ana tutara kuruşu kuruşuna eşit olduğunu kontrol edin; Bölümleri kaydet'e basın.",
                "Tek kategoriye dönmek için Bölümleri kaldır'ı kullanın."],
            "Ana işlem tutarı ve kart borcu değişmez; bütçe ve kategori raporları bölümleri kullanır. İadeyi bölerken de pozitif bölüm tutarları girilir, iade işareti korunur. Yenilenen ekstre ana tutarı değiştirirse eski bölümler kaldırılır ve kayıt yeniden incelemeye açılır.", "views/islemler.py", "İşlem bölmeye git"),
    article("butce", "Aylık bütçe oluşturma", "Planlama",
            "Toplam harcama ve kategoriler için hedef belirleyin.", [
                "Planlama → Bütçe'de Bütçe dönemi'ni seçin.",
                "Düzenleme kapsamı'nda yalnızca o ay için hedef veya Varsayılan aylık bütçe'yi seçin.",
                "Bütçeleri düzenle bölümünde toplam harcama hedefini ve kategori sınırlarını girip Bütçeleri kaydet'e basın.",
                "Kalan tutarları ve aşım durumunu aynı sayfadan ya da Genel Bakış'tan takip edin."],
            "Döneme özel bütçe o ay için varsayılan bütçenin tamamının yerine geçer. 0 girilen sınır kaldırılır. Kartlar ekstre dönemine, banka/nakit giderleri işlem ayına göre hesaplanır; iadeler düşülür, transfer ve kart ödemeleri hariçtir.", "views/planlama.py", "Bütçe planlamasına git"),
    article("abonelik", "Abonelik ve düzenli ödeme yönetimi", "Planlama",
            "Tutar, tekrar sıklığı ve sonraki tarihi kaydederek ödeme planı oluşturun.", [
                "Planlama → Abonelikler'de yeni abonelik formunu açın; ad, tutar, sonraki tarih, sıklık ve kategori girin.",
                "Gerçekleşen ödemeyi kaydetmek istiyorsanız bir kart veya hesap bağlayıp aboneliği kaydedin.",
                "Ödeme yapıldığında İşlem yapılacak abonelik'i ve ödemenin gerçekleştiği tarihi seçin; Ödendi olarak kaydet'e basın.",
                "Aboneliği düzenleyebilir, etkin durumunu kapatarak durdurabilir veya Aboneliği sil ile kaldırabilirsiniz."],
            "Ödendi olarak kaydet, bağlı kartta/hesapta gerçek bir harcama oluşturur ve sonraki tarihi ilerletir. Aynı ödemeyi ayrıca elle girmeyin. Geçmişten tespit edilen düzenli ödemeler birer tahmindir.", "views/planlama.py", "Abonelik planlamasına git"),
    article("takvim", "Taksitler ve ödeme takvimi", "Planlama",
            "Ekstre son ödemeleri, gelecek taksitler ve abonelik planlarını birlikte görün.", [
                "Planlama → Taksitler'de alışveriş planları ve kalan taksit yükünü inceleyin.",
                "Ödeme takvimi bölümünde Takvim ayı'nı seçin; Takvim veya Liste görünümünü kullanın.",
                "Kart filtresi ve Gösterilen ödemeler ile listeyi daraltın.",
                "Her olayın Dayanak / Tür bilgisini okuyun: kart son ödemesi, abonelik planı ve tahmini tarihler ayrı gösterilir."],
            "Takvimde bir olay görünmesi ödeme yapıldığı anlamına gelmez. Gelecek taksitler kesim gününe göre tahmin edilir; kart son ödeme borcuyla yeniden borç sayılmaz. Takvim olayları kendiliğinden gerçek harcama oluşturmaz.", "views/planlama.py", "Ödeme takvimine git"),
    article("rapor", "Raporları inceleme ve CSV indirme", "Raporlar",
            "Harcama trendlerini ve dönemler arasındaki değişimi inceleyin.", [
                "Raporlar'da Tümü veya belirli bir kartı seçin.",
                "Aylık net harcama trendi ve Aylık karşılaştırma alanlarını inceleyin.",
                "Dikkat çekenler bölümünde dönemi seçerek değişimleri görün.",
                "Dışa aktar bölümünden İşlemleri CSV olarak indir veya Hesap hareketlerini CSV olarak indir'e basın."],
            "İadeler harcamadan düşülür. Tüm kartlar seçiminde banka/nakit giderleri de rapora dahildir. Kart CSV'si ve hesap hareketleri ayrı indirilir; CSV, tam veritabanı yedeğinin yerine geçmez.", "views/raporlar.py", "Raporlara git"),
    article("tutar", "Ekrandaki tutarlar ne anlama geliyor?", "Tutarlar ve uyarılar",
            "Borç, harcama ve gelecek yük farklı soruları yanıtlar.", [
                "Ekstre borcu: Banka belgesindeki dönem borcudur. Güncel tahmini borç: Son ekstreye ve sonraki kayıtlı hareketlere göre hesaplanan borçtur.",
                "Dönem net harcaması: Seçtiğiniz dönemdeki harcamalardan iadeler düşülür. Kart ödemeleri ve transferler yeni harcama değildir.",
                "Gelecek taksit yükü: Henüz ekstreye yansımamış kalan taksitlerdir. Gelecekte indirim olacağı varsayılmaz.",
                "Net varlık: Banka/nakit bakiyeleri eksi güncel kart borcu eksi gelecek taksit yüküdür. Başlangıç bakiyeleri ve eksik hareketler sonucu etkiler."],
            "Genel Bakış'ta dönem seçimi harcama analizini değiştirir; güncel kart borcunu geçmiş ayın borcuna dönüştürmez. Kartların dönemi ekstre kesim ayıdır; banka/nakit hareketlerinde takvim ayı kullanılır.", "views/genel_bakis.py", "Genel Bakış'a git"),
    article("uyari", "Uyarılar ve hatırlatmalar", "Tutarlar ve uyarılar",
            "Ödeme tarihleri, bütçe durumu ve kontrol bekleyen kayıtları izleyin.", [
                "Genel Bakış'taki uyarı merkezini inceleyin.",
                "Bütçenin %80 eşiği ve aşım uyarılarında bütçenizi veya işlem kategorilerini kontrol edin.",
                "Ödeme ve eski ekstre uyarılarında kayıtlı ödeme tarihine ve son yüklenen ekstreye bakın.",
                "Uyarıyı okundu olarak işaretleyin veya ertesi güne erteleyin."],
            "Bunlar uygulama içi uyarılardır. Uygulama kapalıyken Windows bildirimi gönderilmez. Bir uyarıyı okumak ya da ertelemek bankada ödeme yapmaz ve hesap kaydı oluşturmaz.", "views/genel_bakis.py", "Uyarılara git"),
    article("yedek", "Yedek alma ve geri yükleme", "Yardım ve güvenlik",
            "Tam yedek; kart, hesap, işlem, kategori, kural ve profil bilgilerini birlikte saklar.", [
                "Ana profilde Ayarlar → Veri yedekleme bölümünü açın. Şimdi yerel yedek al ile bilgisayarda bir yedek oluşturun.",
                "Başka yerde saklamak için İndirilecek yedeği hazırla'ya, ardından Yedeği indir'e basın.",
                "Geri yüklemek için Yedeği geri yükle bölümünde uygulamadan aldığınız .db dosyasını seçin.",
                "Tüm profillerin verilerinin değişeceğini onaylayıp Seçilen yedeği geri yükle'ye basın; ardından profilinize tekrar giriş yapın."],
            "Her gün ilk açılışta otomatik yerel yedek alınır. Geri yükleme öncesi mevcut veriler ayrıca yedeklenir ve dosya yapısı doğrulanır. Tam yedek tüm profilleri içerir; yedek yönetimini yalnızca ana profil yapabilir.", "views/ayarlar.py", "Yedekleri yönet"),
    article("sorun", "PDF okunmuyor veya tutarlar uyuşmuyor", "Yardım ve güvenlik",
            "İçe aktarma ve görünmeyen kayıtlar için ilk kontroller.", [
                "PDF'nin desteklenen bankaya ait kredi kartı ekstresi olduğunu kontrol edin. Tarama/fotoğraf yerine bankadan indirilen, metin seçilebilen PDF'yi kullanın; şifreliyse şifresiz kopyasını alın.",
                "Bir kartı elle seçtiyseniz dosyanın o karta ait olduğunu doğrulayın; gerekirse Otomatik algıla'yı kullanın.",
                "Ekstre toplamında fark mesajı varsa belgedeki tutarları ve okunan satırları kontrol edin. Düzeltilmiş PDF'yi tekrar yükleyebilirsiniz; aynı dönem çoğaltılmaz.",
                "İşlem görünmüyorsa profilinizi, kart/hesap seçimini ve tarih/dönem/inceleme filtrelerini kontrol edin. Borç farklıysa eksik ekstre, başlangıç bakiyesi ve kaydedilmemiş hareketleri inceleyin."],
            "Sorunu incelerken mevcut kayıtları topluca silmek yerine önce Ayarlar'dan yedek alın. Tahmini güncel borç bankanın canlı bakiyesi değildir.", "views/ekstreler.py", "Ekstreleri kontrol et"),
    article("gizlilik", "Veriler nerede, internet ne zaman kullanılır?", "Yardım ve güvenlik",
            "Günlük kayıt, PDF işleme, bütçe ve yardım içerikleri bu bilgisayarda çalışır.", [
                "Kart ve hesaplar bankanıza otomatik bağlanmaz; PDF veya elle girdiğiniz hareketler kullanılır.",
                "Claude özellikleri isteğe bağlıdır. Ekstreler'deki ayrı onay seçilirse kategori önerisi için yalnızca mağaza anahtarları gönderilir; PDF gönderilmez.",
                "Raporlar'da ayrıca onay verip Yorumla'ya bastığınızda kategori toplamları yorum için gönderilir.",
                "Hakkında sekmesinden sürüm ve mevcut veri konumunu görebilir, Ayarlar'dan tam yedeğinizi indirebilirsiniz."],
            "İsteğe bağlı Claude özellikleri internet ve ayrı API yapılandırması gerektirir. Paylaşacağınız yedek ve CSV dosyaları kişisel finans bilgisi içerir.", "views/ayarlar.py", "Veri ve profil ayarlarına git"),
]

BY_ID = {item["id"]: item for item in ARTICLES}
PAGE_TOPICS = {
    "genel_bakis": ("tutar", "uyari", "baslangic"), "cuzdanim": ("kartlar", "tutar"),
    "hesaplar": ("hesaplar", "transfer"), "islemler": ("islem", "inceleme", "filtre", "toplu", "bolme", "kural"),
    "planlama": ("butce", "abonelik", "takvim"), "butce": ("butce",),
    "taksit_abonelik": ("abonelik", "takvim"), "raporlar": ("rapor", "tutar"),
    "ekstreler": ("pdf", "sorun"), "kategoriler": ("kategori",), "ayarlar": ("yedek", "profil", "gizlilik"),
}


def normalized(value):
    value = str(value).translate(str.maketrans({"ı": "i", "İ": "i"})).casefold()
    return "".join(c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c))


def search(query="", group="Tüm konular"):
    tokens = normalized(query).split()
    matches = []
    for item in ARTICLES:
        haystack = normalized(" ".join([item["title"], item["group"], item["summary"], *item["steps"], item["note"]]))
        if group not in (None, "Tüm konular", item["group"]):
            continue
        if all(token in haystack for token in tokens):
            matches.append(item)
    return matches
