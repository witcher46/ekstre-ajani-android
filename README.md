# Ekstre Ajanı Mobil

Android öncelikli, iPhone’da da tarayıcıdan açılabilen bağımsız bir web uygulaması. İlk sürümde masaüstünden alınan kart işlemleri CSV’siyle dönem özeti, kategori toplamları ve işlem araması kullanılabilir.

## Windows’ta dene

Node.js kurulu bir bilgisayarda PowerShell’i bu klasörde aç ve çalıştır.

```powershell
node serve.mjs
```

Tarayıcıda `http://127.0.0.1:4173` adresini aç. **Örnek veriyi aç** düğmesiyle örnek işlemleri dene. Sonra masaüstünde **Raporlar → İşlemleri CSV olarak indir** yoluyla aldığın `islemler.csv` dosyasını seç. Önizlemede dönemi değiştir, bir işlem ara ve istersen **Bu listeyi kaydet** düğmesine bas.

## Telefonda dene

Telefon ve bilgisayar aynı Wi-Fi ağındayken aşağıdaki komutları çalıştır. `ipconfig` çıktısındaki Wi-Fi IPv4 adresini kullanarak telefonda `http://BILGISAYAR_IP:4173` adresini aç. Test bitince `Ctrl+C` ile sunucuyu kapat.

```powershell
$env:EKSTRE_MOBILE_HOST = '0.0.0.0'
ipconfig
node serve.mjs
```

Ana ekrana kurulum ve çevrimdışı açılış için uygulamayı HTTPS üzerinden sun. `index.html`, `style.css`, `app.mjs`, `model.mjs`, `sample.mjs`, `sw.js`, `manifest.webmanifest` ve iki `icon-*.png` dosyasını aynı dizine koy. Android’de Chrome menüsünden **Uygulamayı yükle** veya **Ana ekrana ekle**, iPhone’da Safari’nin **Paylaş → Ana Ekrana Ekle** seçeneğini kullan. Önbelleğin hazırlanması için ilk açılışı çevrimiçi yap.

## Veri ve kapsam

- CSV seçildiği cihazda okunur. Açıkça kaydedersen liste tarayıcının yerel depolamasında tutulur. Yeni listeyi kaydetmek önceki mobil listenin yerini alır. Site verisini temizlemek mobil kaydı siler.
- Dönem toplamı iadeleri düşer ve kart ödemelerini ayrı gösterir. Kategoriler CSV satırlarından gelir. Masaüstündeki alt kalem dağıtımı ve otomatik iade eşleştirmesi mobil özete uygulanmaz.
- İlk sürüm en fazla 5 MB ve 5.000 işlem içeren kart CSV’sini kabul eder. PDF içe aktarma, hesap hareketleri ve cihazlar arası eşitleme sonraki geliştirme kapsamındadır.

```powershell
node --test model.test.mjs
```
