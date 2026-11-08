# Android UX ve finans revizyonu

Kullanıcının 8 Kasım 2026 ayrıntılı talebi bağlayıcı kapsamdır. Var olan Java/WebView/SQLite mimarisi, koyu tema ve JSON format/version=1 korunur. Yeni alanlar isteğe bağlıdır; eski yedekler kayıpsız açılır. Eski debug imza anahtarı mevcut olmadığından revizyon ayrı paket kimliğiyle yan yana kurulur; eski uygulamanın kimliği ve kayıtları korunur. Masaüstü, eski mobil ve gerçek veriler değişmez. GitHub gönderimi için ayrıca onay gerekir; kullanıcı 19 dosyanın yeni dala aktarılmasını ve CI derlemesini onayladı.

## Beklenen finans davranışı

- Banka 10.000 TL; kart alışverişi 1.000 TL; bankadan karta 1.000 TL ödeme: banka 9.000, kart borcu 0, gider 1.000 TL. PDF aynı ödemeyi getirirse banka tekrar azalmaz, borç -1.000 olmaz. Kaynaklar arası aday kullanıcı kararına açılır; adayın ikinci etkisi karara kadar uygulanmaz ve görünür biçimde belirtilir. Aynı PDF içindeki iki eşit gerçek alışveriş korunur.
- 30 Eylül alışverişi, 3 Ekim kesimli ekstrede: takvim raporu Eylül; ekstre raporu Ekim. Ana sayfa ve bütçe takvim ayını kullanır.
- Son ekstrenin dönem borcu biliniyorsa güncel kayıt tahmini bu borç + kesimden sonraki hareketlerdir. Geçmiş satır toplamı dönem borcu diye sunulmaz. Gelecek taksitler kesin borca eklenmez.
- İade, hesabı artırır/kart borcunu azaltır; giderden ilgili kategoride düşer. Ödeme ve transfer gider değildir.
- Aynı PDF tekrarında kullanıcı açıklaması, kategori, not ve inceleme durumu korunur. CSV sırası değişse de aynı kaynak kaydı çoğalmaz; CSV/PDF/manual adayları kesin eşleştirilmez.
- Abonelik vadeden ayrı gerçek tarihte ödenir. Aynı vade ikinci kez ödenemez; eski ekran isteği reddedilir. 31 Ocak → 28 Şubat → 31 Mart sabit fatura günü korunur.
- Başarısız kayıt/geri yükleme mevcut veriyi değiştirmez. Geri yükleme öncesi kurtarma kopyası ayrı saklanır.

## Görsel davranış

320/360/390/412 px, normal ve %150 metin ölçeği; büyük TL tutarları ve uzun adlar: sayı tek satırda korunur, alan gerektiğinde tam satıra/sütuna geçer. Eylemler sarılır; alt menü ve modal klavye açıkken erişilebilir kalır. Yalnız scrollWidth değil metin sınırları/çakışma ve ekran görüntüleri denetlenir.

## Yaklaşım

Yalnız CSS yaması finans hatalarını çözmez. Geniş mimari yeniden yazımı gereksiz risk taşır. Seçilen yaklaşım: mevcut motoru geriye uyumlu isteğe bağlı kaynak/eşleşme/vade alanlarıyla düzeltmek; aynı render yapısında kullanıcı akışlarını sadeleştirmek; Java köprüsünü yalnız veri koruma/erişilebilirlik ve test edilebilir dosya akışları için genişletmek.

## Ortam sınırı

Yerel SDK/emülatör yok, ağdan indirme kısıtlı. Android derleme ve emülatör doğrulamaları onaylanan GitHub Actions çalışmasında yürütülür. Eski APK'nın ilk testleri yeni talebin akışlarını kanıtlamaz; revizyon için ayrı genişletilmiş test sonuçları gerekir. Güncel kanıtlar REVIEW_REPORT.md içinde tutulur.
