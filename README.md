# Finans Cüzdanım Mobil

Android ve iPhone tarayıcıları için masaüstü cüzdanının koyu temasını ve işlevlerini taşıyan ayrı sürüm. Tam cüzdan bilgisayarda çalışan yerel servis üzerinden açılır. Aynı pakette, CSV kart raporunu telefonda çevrimdışı açan web uygulaması da bulunur.

## Tam cüzdanı örnek verilerle aç

ZIP’i ayrı bir klasöre çıkar ve o klasörde PowerShell aç.

```powershell
.\baslat-mobil.cmd --demo
```

Bilgisayarda `http://127.0.0.1:4174` adresini aç. Örnek kart, banka hesabı, işlemler, bütçe ve abonelik hazır gelir. Menüden **Genel Bakış**, **Cüzdan**, **İşlemler**, **Planlama**, **Raporlar** ve **Ekstreler** bölümlerine geçebilirsin. **Ayarlar** ve **Yardım Merkezi** yan menüdedir. `Ctrl+C` sunucuyu kapatır ve örnek oturumu sona erdirir.

Başlatıcı Python 3.14 ortamında çalışır. Streamlit veya başka bir proje paketi eksikse bağımlılıkları yalnızca mobil klasördeki sanal ortama kur.

```powershell
py -3.14 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r .\full_wallet\requirements.lock
```

## Aynı Wi-Fi üzerinden telefonda dene

`ipconfig` çıktısından bilgisayarın Wi-Fi IPv4 adresini al. Aşağıdaki örnekteki `192.168.1.20` yerine kendi adresini yaz.

```powershell
.\baslat-mobil.cmd --demo --lan 192.168.1.20
```

Telefonda `http://192.168.1.20:4174` adresini aç. Bu deneme adresinde yalnızca sentetik veriler kullan. Tam cüzdanı telefonda kullanırken bilgisayar ve sunucu açık kalır.

## Kişisel mobil cüzdan

Bilgisayarda `baslat-mobil.cmd` dosyasını çalıştır. Mobil kayıtlar ve otomatik yedekler `%LOCALAPPDATA%\FinansCuzdanimMobil\data` altında saklanır. İlk açılış boş bir cüzdanla başlar. İstersen **Ayarlar → Yedeği geri yükle** üzerinden seçtiğin uyumlu bir yedeği mobil veritabanına aktarabilirsin. Geri yükleme mobil kayıtları değiştirir ve işlem öncesi mobil yedek alınır.

Kişisel cüzdana Wi-Fi üzerinden erişmek için telefonun güvendiği, bilgisayarın Wi-Fi adresini kapsayan bir HTTPS sertifikası ve anahtarı kullan. Sunucu her açılışta bir erişim kodu üretir. Telefonda HTTPS adresini aç ve bilgisayarda gösterilen kodu gir.

```powershell
.\baslat-mobil.cmd --lan 192.168.1.20 --cert C:\sertifikalar\cuzdan.pem --key C:\sertifikalar\cuzdan.key
```

PDF ekstreleri sunucuyu çalıştıran bilgisayarda işlenir. Ekstre aktarımı, metin katmanı olan Yapı Kredi ve QNB kredi kartı PDF’lerini destekler. Rapor yorumu ve bilinmeyen mağazalara kategori önerisi için isteğe bağlı Claude işlevleri, kendi API anahtarın ve ekrandaki onayınla çalışır.

## Çevrimdışı kart raporu

```powershell
node serve.mjs
```

`http://127.0.0.1:4173` adresinde **Örnek veriyi aç** düğmesiyle dene. Masaüstünde **Raporlar → İşlemleri CSV olarak indir** yoluyla aldığın dosyayı açabilirsin. Listeyi kaydedersen veriler tarayıcıda kalır. Yeni liste önceki kaydın yerini alır. Kart raporu en fazla 5 MB ve 5.000 işlemlik CSV kabul eder. Kategori toplamları CSV satırlarında yazan kategorilere göre hesaplanır.

Telefonda ana ekrana kurmak ve çevrimdışı açmak için kart raporunun `index.html`, `style.css`, `app.mjs`, `model.mjs`, `sample.mjs`, `sw.js`, `manifest.webmanifest` ve iki `icon-*.png` dosyasını HTTPS üzerinden aynı dizinde sun. İlk açılış çevrimiçi olmalıdır.

## Kaynak ve test

Tam cüzdan motoru, masaüstü kaynak sürümünün `5bea5a2` commit’inden alınan ayrı kopyadır. Mobil sunucu, telefon yerleşimi ve mobil veri yolu bu projede bulunur.

```powershell
node --test model.test.mjs
```
