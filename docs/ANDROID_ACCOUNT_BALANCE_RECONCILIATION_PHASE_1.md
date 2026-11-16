# Mimari karar · Banka ve nakit hesaplarında tarihli bakiye

## Mevcut kaynaklar

- `core.mjs` içindeki `C.balance()` banka ve nakit hesaplarında `opening` ile başlar ve tarih sınırı uygulamadan mevcut hareketleri toplar. İleri tarihli ve sonradan girilen geçmiş hareketler mevcut bakiyeye yansır. `opening` banka ve nakit hesaplarında şemada tarih taşımayan, düzenlenebilir bir bakiye girdisidir. İlk işlem, ilk içe aktarım veya yedek tarihi açılışın başladığı günü kanıtlamaz.
- `effective()` bağlı kaynak satırlarını ve bekleyen adayları dışarıda bırakır. Banka/nakit bakiyesi kaynak hesaptan para çıkışını korumak için bağlantı hedefi olmayan bekleyen `payment` hareketini de sayar. İki hesap arasında transfer birini borçlandırır ve diğerini alacaklandırır. Bankadan karta ödeme kaynak hesabı bir kez azaltır ve gider raporuna girmez. Banka/nakit iadesi, kayıt tarihindeki ilgili hesabı artırır. Kart iadesi kartla sınırlıdır.
- PDF ve CSV aktarımı kredi kartlarına yapılır. Yeniden aktarım kaynak kimliği ve içe aktarma kurallarıyla ayıklanır. Eşleştirmeden sonra asıl satır mali etkiyi taşır. Banka ödemesi varsa banka tarafı manuel banka satırının tarihini kullanır. Kart ekstre tarihinin farklı olması banka hareketinin gününü kaydırmaz. Karttan içe aktarılan kaynak hesapsız ödeme, bankadan çıkış varsayımı üretmez.
- `wallet.mjs` güncel hesap özeti için `C.balance()`, dönemsel değerler için `periodFigures()` çağırır. `reports.mjs` dönemsel gelir, gider, iade ve ödeme değerlerini kullanır. Dönem etiketi, hesap bakiyesindeki hareket tarihinden farklı olabilir. Planlanan gelir veya abonelik hareket kaydı oluşana kadar bakiyeye eklenmez.
- Android, JSON içeriğini yerel `wallet.db` içindeki SQLite snapshot’larında saklar. `MainActivity.writeSnapshot()` güncel, önceki ve gerektiğinde geri yükleme öncesi kayıtları tek işlemde günceller. Android JSON v1 hesap ve hareketleri içerir. SQLite kurtarma satırları ve JSON v1, tarihe göre seçilebilir defter sürümleri tutmaz. [Ortak finansal davranış sözleşmesi](FINANCIAL_BEHAVIOR_CONTRACT.md) ve [yedek biçimleri](DATA_FORMATS_AND_MIGRATIONS.md) bu sınırlar için referanstır.

## Faz 1 kararı

Tarihli hesaplama ayrı bir saf sorgudur. Mevcut bakiye ve kart ekstre sorguları aynı davranışı sürdürür. Açılış tarihini ilk işlemden türetmek, sonradan eklenen ilk hareketle tarihin kendisini değiştirir. Gözlemleri bu aşamada kaydetmek ise yedek ve geri yükleme sözleşmesi gerektirir. İlk dilim için çağıranın sunduğu bağımsız bir gün sonu bakiyesi kullanılır.

`balanceAt(state, accountId, date, {anchor} = {})`

- `state` mevcut doğrulamadan geçmiş cüzdandır. Hesap kapsamı banka ve nakittir.
- `anchor` biçimi `{accountId, date, amountCents}`. Tutar, ilgili hesabın belirtilen sivil gününün kapanışında bağımsız olarak bilinen bakiyedir. Çağıran, dayanağın kaynağını ve kapsamını doğrulamakla sorumludur. Örnek kaynaklar, tarihli banka kapanış bakiyesi ve o güne ait belgelenmiş nakit sayımıdır. Tarihsiz `opening`, ilk işlem tarihi ve karşılaştırılacak gözlemin kendisi dayanak olarak kullanılmaz.
- Her iki tarih de `YYYY-MM-DD` biçiminde geçerli bir takvim günüdür. Sorgu, dayanağın kapanışından sonra ve hedef günün kapanışı dahil olacak şekilde `anchor.date < row.date <= date` aralığını kullanır. Dayanak günündeki hareketler kapanış tutarına zaten dahildir. Fonksiyon saat, UTC farkı veya cihaz saat dilimi atamaz. Kaynak saat damgasından tarih türetmek gerekirse, gözlem ve hareketler önce aynı hesap takvimine çevrilmelidir. Türkiye’de yerel takvimle verilen kaynaklar için gün `Europe/Istanbul` sınırındadır. Banka farklı bir muhasebe günü kullanıyorsa karşılaştırma o sınır ortaklaştırılana kadar bekler.
- Dayanak yoksa `{status: 'unavailable', reason: 'missing-anchor'}`, hedef gün dayanağın öncesindeyse `{status: 'unavailable', reason: 'before-anchor'}` döner. Geçersiz tarih, hesap ve dayanak değerleri reddedilir.
- Başarı `{status: 'calculated', amountCents}` döndürür. Toplama tamsayı kuruşla yapılır. Mevcut `addCents()` güvenli sayı aralığı aşıldığında `bigint` kullanır. Bu sonuç yalnız bellektedir. JSON v1 tutar biçimi aynı kalır.
- Hesaplanan değer bugünkü kayıtlardan yeniden oluşturulur. Dayanak sonrası ilgili hareketlerin eksiksiz ve doğru tarihli olması gerekir. İşlem ekleme, silme, tarih değiştirme ve eşleştirme kararları daha önceki bir güne ait sonucu değiştirebilir. Eksik banka satırlarını, kayıtların o günkü eski halini ve banka valör farkını bu sorgu kendi başına belirleyemez. Uygulama sonucu “kayıtlara göre bakiye” olarak adlandırmalıdır.

## Faz 2 için gözlem ve geçerlilik kararı

Öneri, kredi kartı ekstre mutabakatından ayrı bir gözlem modeli. Bir gözlem banka veya nakit hesabına ait `id`, `accountId`, `observedDate`, `observedAmountCents` ve isteğe bağlı `note` taşıyabilir. Saat damgası saklanırsa kaynağın saat dilimi de belirtilir. Gün içi gözlem, eşdeğer gün sonu verisi olmadan kapanışla karşılaştırılmamalıdır.

Karşılaştırma bağımsız ve daha erken bir dayanak kullanır. Fark `gözlenen - hesaplanan` tutardır. Örneğin kayıt bakiyesi 10.000 TL ve gözlem 9.950 TL ise fark −50 TL’dir. Bu sonuç hiçbir işlem üretmez veya var olan açılış tutarını güncellemez. Sıfır fark, yalnız uygun dayanak ve yeterli hareket kapsamıyla doğrulanabilir.

`checkedTransactionIds` tek başına düzenlenen bir tarih veya tutarı fark edemez. Sonraki fazda doğrulama kanıtı olarak hesap, dayanak kimliği ve tutarı, kesim tarihi ve ilgili satırların kimlik/tarih/hesap yönü/kuruş etkisi birlikte değerlendirilmelidir. Etkileri birbirini götüren hareketler de önceki doğrulamayı yeniden incelemeye açabilir. Geriye tarihli ekleme, silme veya kaynak eşleştirmesi sonrası hesap yeniden çalıştırılmalı. Eski gözlem saklanmalı, önceki doğrulama güncel kabul edilmeden önce kanıt tekrar karşılaştırılmalıdır.

Kalıcı üst düzey gözlem alanı veya ayrı SQLite alanı seçilmeden önce hesap silme, hesap kimliği değişimi, eski sürümden geri yükleme, eski sürümde tekrar kaydetme, bozuk kayıt red koşulları ve atomik kurtarma test edilmelidir. Faz 1 hiçbir gözlemi kaydetmez. Eski yedekten tarih çıkarılamadığında kullanıcı tarafından sağlanan tarihli dayanakla ileriye doğru hesaplama yapılabilir. Geçmişin daha erken kısmı için yeterli tarihli açılış ve eksiksiz hareket kaynağı gerekir.

## Doğrulama

Sentetik testler boş hesap, geçmiş ve gelecek günler, geriye tarihli ekleme, transfer, kart ödemesi ve PDF/CSV bağlama, aynı CSV’nin tekrar aktarımı, bekleyen banka ödemesi, iadeler, negatif bakiye, ay ve yıl sınırları, eski JSON v1, büyük toplamlar ve eksik dayanak durumlarını kapsar. Mevcut finansal golden testleri, tarayıcı yolculukları, Android lint ve API 35, SQLite geri alma ve geçici sertifikayla 7 → 8 yükseltmesi aynı kaynakta çalışır.
