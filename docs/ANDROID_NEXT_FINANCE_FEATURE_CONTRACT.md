# Ekstre Ajanı — 9 özellik için finansal güvenlik sözleşmesi (taslak)

Durum: Ürün kararı bekleyen tasarım/kontrat. Kod veya veri şeması değiştirmez.
Taban: Android main aa1f7a2caa5ce1a5e5ce6d961e85832fa57d46bd (PR #11 entegrasyonu).
Bağlantılı belgeler: docs/FINANCIAL_BEHAVIOR_CONTRACT.md ve docs/DATA_FORMATS_AND_MIGRATIONS.md.

## Sınırlar ve mevcut işlevler

Android, Java WebView + JavaScript core.mjs/wallet.mjs, yerel SQLite snapshot ve JSON format ekstre-android sürüm 1 kullanır. core.mjs içindeki validate/addTransaction/updateTransaction/summary/cardStatus/resolveCandidate/importStatement/importCsv ve wallet.mjs içindeki overview/cardDetail değişiklik öncesi referanstır.

İnceleme kutusu, satıcı kategori kuralları, abonelik/gelir planları, dönem raporları ve PDF/CSV mutabakatı halihazırda vardır; ikinci kez uygulanmaz. Yeni özellikler mevcut sözleşmelerin üzerine eklenir.

## Değiştirilemez muhasebe ilkeleri

1. Tüm tutarlar integer kuruştur. Bölünme veya yuvarlamada fark en son tahsis kalemine eklenir.
2. Açılış bakiyesi gelir değildir; hesaplar arası transfer ve kredi kartı borcu ödemesi gider değildir.
3. Gerçekleşmeyen plan/hatırlatma/hedef hiçbir bakiyeye veya gerçekleşen gelire etki etmez.
4. Bir ekonomik hareket tam bir kez finansal etki oluşturur. PDF, CSV ve manuel kayıt eşleştirmeleri idempotent kalır.
5. İadeler gerçekleştiği dönemde negatif giderdir; ekstre kalan ödeme yükümlülüğünü bankanın onayı olmadan değiştirmez.
6. Finans bilgisi olmayan banka verisi, canlı bakiye, limit veya asgari ödeme uygulama tarafından uydurulmaz.
7. Eski v1 JSON yedekleri, kayıt kimlikleri, kullanıcı kategori/not düzenlemeleri ve desteklenmeyen genişletme alanları korunur.
8. Her işlem atomik SQLite snapshot üzerinden kaydedilir; geçersiz girdi geri yükleme/kayıt durumunu değiştirmez.
9. Kaynak verisi ve hesaplanmış tahmin görünürde ayırt edilir; raporlar tarih/hesap/dönem kapsamını etiketler.

## Dokuz özelliğin sınırları

| Özellik | Mevcut temel | Yeni davranış | Yasak yan etki |
| --- | --- | --- | --- |
| İnceleme kutusu | matchStatus, matchCandidates, resolveCandidate | Neden gruplaması, güven düzeyi açıklaması, aynı/ayrı/ertele kararı, ilgili kaynak görünümü | Belirsiz eşleşmeyi otomatik kesinleştirme, kaynak kayıt silme |
| Bakiye mutabakatı | balance, wallet balance | Bankadan manuel girilen tarihli bakiye gözlemi ve fark çözümleme | Farkı otomatik gelir, gider veya açılış bakiyesi yapma |
| Kredi kartı detayı | cardStatus, cardDetail, installmentOverview | Dönem borcu, ödenen, kalan ekstre, tahmini güncel, gelecek taksit ve kart artı bakiyesini ayrı sun | Gelecek taksitleri iki kez borç yazma, iadeyi otomatik asgari ödeme kabul etme |
| İşlem bölme | transaction/category/summary | Tek üst ekonomik işlem için birden çok kategori tahsisi | Alt parçaları ayrı defter hareketi sayarak bakiyeyi düşürme |
| Hızlı ekleme | transactionForm ve mevcut işlem türleri | Daha az dokunuşla gelir/gider/transfer/kart ödeme formuna geçme | Yeni ve farklı muhasebe kayıt yolu oluşturma |
| Raporlar | summary/periodFigures | 6/12 aylık gelir, net gider, kategori eğilimi ve kaynak açıklaması | Bugünkü bakiyeyi geçmiş ayların net varlığı gibi göstermek |
| Birikim hedefleri | bütçe/gelir planları | Hedef, vade ve ayrılan tutarın görünümü; manuel tahsis | Birikimi yeni para/gelir yaratma; rezervasyonu hesap bakiyesinden ikinci kez düşme |
| Yerel kategori önerisi | suggestCategory/merchantRules | Açıklanabilir öneri; kullanıcı tek dokunuşla kabul/değiştir | Kullanıcı düzenlemesini tekrar içe aktarmada geçersiz kılma |
| Hatırlatmalar | subscriptions/upcomingPayments/incomePlans | Birleşik vade listesi; izinle cihaz bildirimi ve erteleme | Bildirimle otomatik ödeme kaydı; kullanıcının izni olmadan hassas bildirim |

## Yüksek riskli tasarım kararları

### 1. İnceleme/eşleştirme

Mevcut pending ve linked semantiği değiştirilmez. PDF/CSV'den gelen şüpheli satırların ikinci finansal etkisi incelemeye kadar hariç tutulur; mevcut banka kaynaklı manuel ödeme hareketlerinin banka bakiyesine etkisi korunur. Genel toplu otomatik eşleştirme ilk sürüm kapsamı dışındadır.

Önerilen durumlar: inceleme nedeni, adaylar, kaynak kimlikleri, etki açıklaması, erteleme/bağla/ayrı kabul eylemleri. İşlem kimliği değişmez ve kaynak tarihleri saklanır.

### 2. Hesap bakiyesi mutabakatı

İlk kapsam banka ve nakit hesapları; kredi kartı ekstre mutabakatı mevcut ayrı iş akışında kalır. Gözlem ayrı üst düzey kayıt olarak tutulabilir: reconciliationId, accountId, observedAt, observedAmountCents, note, status, checkedTransactionIds. Gözlem finansal transaction değildir.

Yeni saf as-of balance hesaplaması tanımlanmadan geçmiş tarihli fark gösterilmez. Fark = gözlenen bakiye - ilgili gün sonuna kadar kaydedilmiş bakiye. Sonradan geriye dönük hareket girilirse önceki mutabakatın güncelliği yeniden hesaplanır; kullanıcıya gösterilir. Farkı kapatma için otomatik düzeltme kaydı oluşturulmaz.

Ürün kararı: sıfır fark durumu 'doğrulandı' olabilir; sıfır olmayan fark 'araştırılıyor' kalır. Gizli kuruş toleransı yoktur.

### 3. Kredi kartı borçları

Ayrı etiketler: belgedeki dönem borcu, kesim sonrası gerçek kayıtlı ödeme, ödemelere göre kalan dönem borcu, kaynaklara göre güncel borç tahmini, gelecek taksit toplamı, artı bakiye. Hiçbir tahmin bankanın canlı verisi gibi sunulmaz.

Belge tarih/saat sınırı, yurt dışı işlem, faizin vergiye etkisi ve bankanın iadeyi borçtan sayma kuralları doğrulanmadan otomatik kesin borç iddiası yoktur. Minimum ödeme ve kullanılabilir kart limiti kaynak veya açık kullanıcı girişi olmadan gösterilmez.

### 4. İşlem bölme

Önerilen ilk kapsam: yalnızca manuel, eşleşmemiş, tekil, taksitsiz gelir dışı harcama. Genişletme sonraki fazda. Üst işlem tek ekonomik kayıt olarak kalır. Kategori tahsisleri bağımsız finansal transaction değildir.

Önerilen alan: transactions[i].allocations = [{id, category, amountCents, note?}, ...]. Tam sayı kuruşla tahsis toplamı üst hareket tutarına eşit olmalı. İlk fazda kategoriler gider kategorileriyle sınırlı. En az iki tahsis; 0 veya negatif tahsis reddedilir. Ödeme, transfer, linked/source ve taksit işlemleri ilk aşamada bölünemez. Tahsis düzenlemeleri kaynak kimliğini ve üst toplamı değiştiremez.

core.summary ve wallet.periodFigures aynı tek kategori-tahsis hesaplama yardımcı işlevini kullanmalıdır; gelir/gider/toplam/bütçe/net varlık aynı kalır. Kategori değiştirme/silme, yedekleme, tekrar içe aktarma, rapor ve üst işlem silme için regresyon testi zorunlu.

### 5. Hızlı ekleme

Tek iş mantığı mevcut transactionForm ve ödeme formlarından çalışır. Yeni entry route hesaplamanın kopyasını oluşturmaz; hazır işlem türünü ve varsa kaynak hesabı iletir. Kaydetme hatasında eski cüzdan korunur.

### 6. Gelişmiş raporlar

İlk adım sadece dönemsel gerçekleşmiş gelir, net gider, nakit hareketleri ve kategori eğilimlerinin gösterimi. Takvim ayı ve ekstre dönemi ayrı filtrelerdir. Tarihsel net varlık grafiği ancak ayrı as-of bakiye/kredi kartı anchor semantiği test edildikten sonra eklenir. Mevcut W.overview(period).netWorth güncel hesapları kullanır; geçmiş ay değerleri olarak çoğaltılamaz.

### 7. Birikim hedefleri

Önerilen ilk model: bütçeden ayrı hedef meta verisi (ad, hedef kuruş, vade, seçilen banka/nakit hesabı, kullanıcı tarafından ayrıldığı beyan edilen kuruş). Bu tutar kullanıcı tahsisidir, ek gelir veya otomatik transfer değildir. Toplam ayrılan tutar seçilen hesabın mevcut bakiyesini aşarsa açık uyarı verilir; geçmiş hareketlere sahte işlem yazılmaz.

### 8. Yerel kategori önerileri

İlk kapsam mevcut suggestCategory() ve satıcı kategorilendirme kurallarının gösterimi ve kullanıcı onayı. Sunulan öneri ile banka kaynaklı kategori farklı alanlardır. Kabul edilmemiş öneri raporları değiştirmez. Otomatik sınıflandırma yalnızca açık, doğrulanmış kullanıcı kuralının izin verdiği kapsamda olabilir.

### 9. Hatırlatmalar

İlk faz: Plan içindeki vade listesi, kişisel erteleme ve durum. Sonraki faz: Android 13+ bildirim izni, yerel WorkManager, idempotent bildirim kimliği (eventType + sourceId + dueDate) ve gizli bildirim içeriği seçeneği. JavaScript WebView'in sürekli arka planda açık olduğu varsayılmaz. Bildirim yalnızca uyarıdır, para hareketi değildir.

## Gerekli regresyon örnekleri

- 1.000,00 TL tek kart harcaması -> 600,00 TL market + 400,00 TL temizlik: kart borcu tam 1.000,00 TL artar, toplam gider 1.000,00 TL kalır, kategori toplamları 600/400'dür.
- Manuel banka ödemesi + PDF kart ödemesi tek eşleşmeye bağlanınca banka 1 kez düşer, kart 1 kez azalır ve gelir/gider değişmez.
- 10.000,00 TL kayıt bakiyesi, 9.950,00 TL manuel gözlem: 50,00 TL fark görünür; yeni transaction oluşturulmaz.
- Mutabakat sonrası geriye dönük 20,00 TL işlem girilince eski 'doğrulandı' durumu otomatik güvenilir kabul edilmez.
- 2.000,00 TL hedef tahsisi: banka ve net varlık aynı kalır. Ayrılan tutar kullanılabilir bakiyeyi aşarsa uyarı çıkar.
- Kaydedilmemiş öneri, hatırlatma veya plan gerçekleşmiş finans toplamlarını değiştirmez.
- Eski v1 yedeği içe alındığında bütün ID ve not/kategori değişiklikleri saklanır; bozuk yeni alanlar atomik reddedilir.
- HTML benzeri merchant/category text yalnızca düz metin gösterilir; sahte düğme veya işlem oluşturmaz.
- 320dp, 390dp, büyük yazı, klavye açıkken form, geri tuşu ve ekran okuyucu odak testleri geçer.

## Açık ürün kararları (geliştirmede sessizce seçilmez)

1. Mutabakatı banka/nakit dışında kredi kartı bakiyesine de uygulayacak mıyız?
2. İşlem bölme ilk sürümde yalnız manuel taksitsiz giderlerde mi kalacak; iade ve PDF kaynaklı işlemler hangi fazda açılacak?
3. Birikim hedefi için ayrılan tutar yalnız manuel beyan mı, yoksa hesap içindeki gerçek transferden mi türetilmeli?
4. Hatırlatmalarda bildirim içeriği varsayılan olarak tutarı göstermeli mi? Öneri: hayır.
5. Kart limitleri manuel giriş olarak tutulacak mı? Öneri: ayrı karar ve başlangıçta hayır.

Bu kararlar kapatılmadan ilgili finansal veri modeli üretim kodunda değiştirilmez.
