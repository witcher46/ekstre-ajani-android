# Android kalıcı dağıtım ve imzalama

## Uygulama planı

1. Arşiv APK'larının paket ve imza bilgilerini kaydet. Mevcut geliştirme ve eski deneme yapılarını koru.
2. Kalıcı paket için tek kimlik ve artan sürüm kodu belirle. Dağıtım APK'sını Gradle'da imzasız derle. Emülatör için ayrı bir yapı türü kullan.
3. İmzalamayı yalnızca gözden geçirilmiş varsayılan dal commit'i için elle başlatılan, korumalı bir GitHub ortamında çalıştır. Derleme işi anahtar almaz. İmzalama işi imzayı, paket kimliğini, sürüm kodunu ve APK özetini doğrular.
4. Geçici anahtarla yanlış paket, sürüm ve sertifikayı reddeden kontrolleri, eski JSON geri yüklemeyi ve aynı paket üzerine kurulumda veri korumayı sına.
5. Üretim anahtarı, yedekleri, GitHub ortamı ve ilk geçiş için depo sahibinin yapacağı adımları kaydet.


## Önceki APK'lar

| Sürüm | Paket | versionCode | İmza kanıtı |
| --- | --- | --- | --- |
| 0.1.0-deneme | com.zagor.ekstre.preview | 1 | Arşiv Gradle yapılandırması, debug |
| 0.1.1-deneme | com.zagor.ekstre.preview.revision | 2 | Arşiv Gradle yapılandırması, debug |
| 0.2.0-deneme | com.zagor.ekstre.preview.wallet | 3 | Arşiv Gradle yapılandırması, debug |
| 0.2.1-deneme | com.zagor.ekstre.preview.wallet.trial | 4 | 71785f03302652359f3e503a6d3f48ff2effc08030936c22b689a5f88010aaf6 |
| 0.3.0-deneme | com.zagor.ekstre.preview.wallet.trial.v3 | 5 | 1a23e6d14d95fca3042bdcd56bb4b93b87ffd2bfd3728d755013d24306394575 |
| 0.3.1-deneme | com.zagor.ekstre.preview.wallet.trial.v31 | 6 | cf37c3a9432a9e09b98db061bf7d8ffb3bcc33acc34e9213670b750e92fa059f |

Son üç değer GitHub Actions'ta APK sertifikasından okunan SHA-256 değerleridir. İlk üç satırın APK sertifikaları bu incelemede doğrulanmadı. Farklı paket kimlikleri nedeniyle bu eski uygulamalardan kalıcı pakete yerinde güncelleme yapılamaz.

[0.2.1 arşivi](https://github.com/witcher46/ekstre-ajani-android/actions/runs/42927396286/artifacts/13815256543) · [0.3.0 arşivi](https://github.com/witcher46/ekstre-ajani-android/actions/runs/43117973561/artifacts/13898584603) · [0.3.1 arşivi](https://github.com/witcher46/ekstre-ajani-android/actions/runs/43123935632/artifacts/13901862179)

## Paket ve sürüm politikası

- Geliştirme `debug` paketi `com.zagor.ekstre.preview.wallet`. Yerel veya geçici debug anahtarı kullanır.
- Arşiv `trial` paketi `com.zagor.ekstre.preview.wallet.trial.v31`. Bu yapı 0.3.1 deneme APK'sını temsil eder.
- Yeni `beta` paketi `com.zagor.ekstre.preview.beta`. `assembleBeta` imzasız çıktı üretir. Kurulabilir beta gerektiğinde ayrı bir beta anahtarıyla imzalanır. Beta kullanıcılarına yerinde güncelleme sağlanacaksa bu anahtar ve beta paket kimliği korunur.
- Kalıcı `release` paketi `com.zagor.ekstre`. Önerilen ilk sürüm `0.4.0` ve `versionCode=7`. `assembleRelease` imzasız çıktı üretir. Dağıtım imzasını korumalı iş akışı ekler.
- `upgradeTest`, aynı kalıcı kimlik üzerinde emülatörde test anahtarıyla çalışan hata ayıklanabilir yapıdır. Dağıtım imzalama betiği hata ayıklanabilir APK'yı reddeder.

Her yeni kalıcı dağıtımda `android_app/distribution.properties` içindeki `versionCode` en az bir artırılır. İlk dağıtımda `previousSourceCommit` boş ve korumalı `ANDROID_LAST_DISTRIBUTED_VERSION_CODE` değeri `0` olur. İlk dağıtımdan sonra son dağıtılan kod ortam değişkenine işlenir ve sonraki değişiklikte `previousSourceCommit` alanına son dağıtılan kaynak commit'inin tam SHA'sı yazılır. CI bu commit'i yeniden derleyip güncellemeyi sınar. İmzalama işi, eski kaynak sürüm kodunun korumalı değerle eşleşmesini ve yeni kodun onu aşmasını denetler. Dağıtılan her APK için kaynak SHA, sürüm kodu, APK SHA-256 ve sertifika SHA-256 kaydedilir. [Android sürümleme](https://developer.android.com/studio/publish/versioning)

## Depo sahibinin etkinleştirme adımları

1. İncelenen değişiklikler ileride varsayılan dala alındığında `Android signed distribution` elle çalıştırılabilir. Bu işlem için varsayılan dalda iş akışı bulunması gerekir. [GitHub manuel çalıştırma](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
2. Güvenilir bir bilgisayarda ve Git çalışma dizininin dışında, JDK `keytool` ile uzun ömürlü tek bir PKCS#12 anahtarı üret. Aşağıdaki komutu kendi özel klasöründeki dosya yoluna uyarlayarak çalıştır. Güçlü, benzersiz parolayı komut satırı argümanına eklemeden etkileşimli gir.

   ```powershell
   keytool -genkeypair -storetype PKCS12 -keystore 'D:\OzelAnahtarlar\ekstre-android.p12' -alias ekstre-android -keyalg RSA -keysize 3072 -validity 10950 -dname 'CN=Ekstre Ajani Android'
   keytool -list -v -storetype PKCS12 -keystore 'D:\OzelAnahtarlar\ekstre-android.p12' -alias ekstre-android
   ```

   PKCS#12 için bu akış tek parola kullanır. Anahtarın iki şifreli yedeğini ayrı yerlerde, parolayı erişim kontrollü parola yöneticisinde sakla. Yedekten geri açıp sertifika SHA-256'sını karşılaştır. Doğrudan APK dağıtımında bu anahtarın kaybı mevcut kurulumlara yerinde güncelleme yolunu kesebilir. Base64 şifreleme değildir. [Android anahtar koruma](https://developer.android.com/studio/publish/app-signing#secure-key)
3. GitHub **Settings → Environments** altında `android-distribution-signing` ortamını oluştur. Dağıtım kuralını yalnızca `main` dalına ayarla. Ortama yetkili inceleyici ekle ve mümkünse bağımsız onay kullan. Bu korumaları Secrets eklemeden önce doğrula. Ortam dal kısıtlaması veya inceleyici onayı hesabında kullanılamıyorsa anahtarı Actions'a yüklemeden imzasız çıktıyı çevrimdışı imzala. Anahtarı depo düzeyinde değil, yalnızca bu ortamın Secrets bölümünde sakla. [GitHub ortam korumaları](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
4. Ortam Secrets bölümüne `ANDROID_KEYSTORE_BASE64` ve `ANDROID_KEYSTORE_PASSWORD` değerlerini ekle. Örneğin kimliği doğrulanmış GitHub CLI ile Base64 değeri terminale yazdırmadan aktarılabilir. Parolayı gizli girişle ekle.

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes('D:\OzelAnahtarlar\ekstre-android.p12')) | gh secret set ANDROID_KEYSTORE_BASE64 --repo witcher46/ekstre-ajani-android --env android-distribution-signing
   gh secret set ANDROID_KEYSTORE_PASSWORD --repo witcher46/ekstre-ajani-android --env android-distribution-signing
   ```

   Ortam **Variables** bölümünde `ANDROID_DISTRIBUTION_CERT_SHA256` değerini `keytool -list -v` çıktısındaki açık sertifikanın 64 haneli SHA-256 değeri olarak, iki nokta işaretleri olmadan gir. `ANDROID_LAST_DISTRIBUTED_VERSION_CODE` için ilk kalıcı APK öncesinde `0` kullan. Keystore veya parola kopyalarını kaynak dizinine, sohbete veya Actions çıktısına koyma. [GitHub Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
5. İmzalamak istediğinde Actions'ta `main` üzerinde `Android signed distribution` iş akışını seç. `reviewed_commit` alanına gözden geçirilen commit'in tam SHA'sını gir. İmzasız derleme ve yükseltme testi geçtikten sonra ortam onayını ver. APK'yı ve `SHA256SUMS.txt` dosyasını indirip özeti ve `APK-SIGNATURE.txt` içindeki sertifikayı doğrula. İş akışı GitHub Release oluşturmaz. Depo herkese açık olduğu için imzalı artefakt, 30 günlük saklama süresinde GitHub'a giriş yapan ve okuma erişimi olan kullanıcılar tarafından indirilebilir. [Artefakt erişimi](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)

İmzalama işi, Gradle çalıştırmaz ve önbelleğe anahtar yazmaz. Gizli değerler yalnızca imzalama adımına aktarılır. Keystore geçici ve erişimi kısıtlı bir klasöre açılır ve adım sonunda silinir. Yalnızca APK, açık sertifika bilgisi, sürüm bilgisi, kaynak SHA ve dosya özeti artefakta alınır. Anahtar veya sertifika eşleşmesi eksikse iş imzalı artefakt yüklemez.

## Geçiş ve otomatik kontrol

- İlk kalıcı kurulumdan önce eski uygulamada **Ayarlar → Yedek dışa aktar** ile JSON al. Eski uygulama kurulu kalsın. Kalıcı APK'yı ayrı kur ve **Ayarlar → Yedek yükle** ile dosyayı aç. Hesap, işlem, ekstre, kural ve bakiye sonuçlarını kontrol et.
- Sonraki kalıcı APK'lar aynı `com.zagor.ekstre` paketini ve imza sertifikasını kullanır. Sürüm kodu arttığında Android, uygulama verisini koruyarak güncelleme yapabilir. [Android güncelleme koşulları](https://developer.android.com/google/play/app-updates#how-android-handles-app-updates)
- GitHub Actions dağıtım betiğini geçici PKCS#12 anahtarıyla sınar. Android 35 emülatöründe 0.3.1 arşivi erişilebilirken gerçek eski APK'yı kurar, sentetik JSON'ı eski cüzdandan alır ve kalıcı test paketinin düşük kodlu sürümüne yükler. Arşiv süresi dolduğunda aynı JSON örneğiyle geri yükleme testi çalışır. Daha yüksek kodlu aynı imzalı APK'yı `adb install -r` ile kurar. Paket kullanıcısını, veri tabanı baytlarını ve yeniden başlatma sonrası rapor değerlerini karşılaştırır.
- İlk sürüm için düşük kodlu APK sentetik başlangıçtır. Daha sonraki çalıştırmalarda `previousSourceCommit` önceki dağıtım kaynaklarını kullanır. CI emülatör anahtarı üretim anahtarı değildir. Gerçek anahtarla ilk imzalama, ortam kurulduktan ve depo sahibi çalıştırmayı onayladıktan sonra doğrulanabilir.
