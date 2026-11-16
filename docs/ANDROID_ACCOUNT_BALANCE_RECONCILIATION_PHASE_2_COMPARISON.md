# Hesap Bakiyesi Mutabakatı Faz 2 · Karşılaştırma motoru

## Kapsam

`compareBalanceObservation(state, observationId, options)` doğrulanmış Android cüzdanı üzerinde yan etkisiz çalışır. Mevcut `balanceAt()` ve `addCents()` mali hesabı yapar. Kanıtın hareket projeksiyonu, aynı nakit hareketi dahil etme ve hesap etkisi kurallarını kullanır. Mevcut `balance()`, `balanceAt()`, kart borcu, raporlar, Android SQLite ve JSON v1/v2 davranışları aynı kalır. Karşılaştırma hiçbir bakiye, işlem veya kalıcı doğrulama alanı yazmaz.

## Dayanak ve tarih sınırı

- `observationId` bir `observation` kaydı olmalıdır. Çağıran `anchorId` ile ayrı bir `anchor` kaydı seçer. Dayanak aynı hesaba ait ve hedef gözlemden kesin olarak daha erken olmalıdır. Dayanak seçimi eksikse motor mevcut adaylardan birini otomatik seçmez.
- `anchorReview` alanları `anchorId`, `accountId`, `date`, `amountCents`, `sourceKind`, `sourceType`, `sourceRef` ve `closing`. Alanlar seçilen kayda bağlanır. Bağımsız dayanak kaynağı için banka hesabında `bankClosingRecord`, nakit hesabında `cashCountRecord` gerekir. Çağıran, `sourceRef` ile gerçek cüzdan hesabından bağımsız doğruladığı kaynağa işaret eder. Rol ve kaynak türü dış kaynağın bağımsızlığını doğrulamaz. Açılış tutarı alternatif dayanak değildir.
- `observationClosing` ve dayanak incelemesinin `closing` değeri `{boundary: "end-of-day", timeZone}` biçimindedir. Aynı geçerli saat dilimi kimliği ve aynı gün sonu anlamı gerekir. Girdiler önceden bu hesap takvimine normalleştirilmiş olmalıdır. Motor saat damgası, saat dilimi veya valör dönüşümü yapmaz. Aralık `anchorDate < movementDate <= observedDate`. Dayanak günündeki ve gelecekteki hareketler bu dönem hesabına girmez.

## Sonuç ve hareket kapsamı

| Sonuç | Anlamı |
|---|---|
| `status: unavailable` + `reason` | Gözlem veya dayanak eksik/geçersiz, dayanak kaynağı incelenmemiş ya da kapanış tanımları uyumsuz. Tutar döndürülmez. |
| `status: calculated` + `coverage.status: unverified` | Gözlenen, hesaplanan ve fark döner. Bağımsız hareket incelemesi sunulmadı. |
| `status: calculated` + `coverage.status: insufficient` | Kaynak aralığı, hareket eşleşmesi veya çözülmemiş kaynak adayı kapsamı yetersiz bırakıyor. |
| `status: calculated` + `coverage.status: source-supported` | Çağıranın bildirdiği bağımsız kaynağın satırları ve kapsamı bugünkü ilgili defterle uyumlu. Fark yine ayrı gösterilir. |

`coverageReview`, `accountId`, `fromExclusive`, `throughInclusive`, `closing`, `sourceKind` (banka için `bankStatement`, nakit için `cashJournal`), `sourceRef`, `complete` ve `rows` taşır. Bu kaynak, karşılaştırma aralığının tamamı için açıkça bildirilir. Her kaynak satırı `sourceRowId`, ilgili `movementId`, `date` ve işaretli `effectCents` taşır. İlgili mali hareketlerin her biri ayrı kaynak satırıyla aynı tarih ve kuruş etkisinde eşleşmelidir. Eksik, fazla, yanlış tarihli, yanlış tutarlı veya yinelenen satır kapsamı düşürür. Açık eşleşme adayı varsa mevcut ödeme tutarı mali hesapta korunur ve kaynak desteği verilmez. Kaynak incelemesi hareket olmayan aralığı da açıkça kapsamalıdır.

Kaynak referansları yerel opak kimliklerdir. Çağıran bağımsız kaynağı kontrol etmekle sorumludur. Motor belge doğrulaması veya banka satırı içe aktarımı yapmaz. `source-supported` sonucu sağlanan satır ve kapsamın uyuşmasını anlatır. Hiçbir tutar, sıfır fark veya kaynak alanı tek başına kesin doğrulama oluşturmaz.

`differenceCents = observedCents - calculatedCents`. Örneğin 795.000 kuruş gözlenen ve 800.000 kuruş hesaplanan için fark −5.000 kuruştur. Tutar ve fark gerektiğinde bellekte `bigint` döner. Cüzdan veya JSON yedeği olarak serileştirilecek veri, motorun sonucu değildir.

## Bellekteki kanıt ve Dilim 3

`evidence.version = 1` ve `policy = "cash-end-of-day-v1"` ile kanıt girdisi tanımlanır. Hesap türü/kimliği, dayanak ve gözlemin kimliği, tarih ve kuruşu, kapanış aralığı ve kapsam sonucu yer alır. Hesabı etkileyen dönem satırları ve bunlarla ilişkili aday/bağlı satırlar kimliğe göre sabit sırada döner. Bağlı kaynak satırlarının mali etkisi tekrar sayılmaz. Hareket özeti tutarı, tarihi, hesap yönünü, mali etkisini ve eşleşme durumunu içerir. Kapsam sağlanabilmişse kaynak satırı eşleşmeleri de kimliğe göre sıralıdır.

Kanonik çıktı, aynı girdiler başka kayıt sırasındayken aynı yapıyı üretir. Tutarlar kanıt içinde ondalık tamsayı metnidir. Not, açıklama ve işlem kategorisi kanıta dahil edilmez. Bilinmeyen eski kaynak alanları kendi yedeklerinde korunur. Kanıta tanınan kaynak türü veya `unknown` yazılır. Geriye dönük düzenleme, silme, neti sıfırlayan yeni hareketler, hesap yönü ve eşleştirme değişikliği kanıt içeriğini değiştirir.

`evaluateBalanceComparisonEvidence(state, observationId, previous, options)` önceki kanonik çıktıyı ve aynı kaynak incelemesini alır. Kanıt sürümü ve kuralı tanınıyor, iki incelemenin de kaynak kapsamı destekleniyor ve kanonik JSON aynıysa `current` döner. Transfer hedefi gibi mali toplamı değiştirmeyen bir kanıt farkı, bilinmeyen sürüm veya artık sağlanamayan kapsam `review-required` döndürür. Güncel karşılaştırma her iki durumda da ayrıca döner. `current`, verilen kanıtın bugünle eşleşmesini gösterir. Kaynağın bağımsızlığı çağıranın kontrolüne dayanır. Önceki kanıt, motorun oluşturduğu sabit alan sırasıyla saklanmalı veya karşılaştırılmalıdır.

Dilim 3, açık kullanıcı incelemesini o anda üretilen kanonik içeriğe bağlamalı. Bu içerik inceleme ile kayıt arasında değişirse incelemeyi yenilemelidir. Kaydedilen eski kanıt, yeniden açılış ve geri yükleme sonrası güncel motor çıktısıyla karşılaştırılmalıdır. Yeni bir karşılaştırma eski kaydı kendiliğinden güncellemez. Kalıcı kanıt şeması, özet, kaynak incelemesini geri çağırma ve kurtarma kuralları Dilim 3’te belirlenir.

[Dayanak kararı](ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_1.md) · [Gözlem saklama sözleşmesi](ANDROID_ACCOUNT_BALANCE_RECONCILIATION_PHASE_2_STORAGE.md) · [Finansal davranış sözleşmesi](FINANCIAL_BEHAVIOR_CONTRACT.md)
