# Ekstre Ajanı Android Bakiye Mutabakatı Faz 2 Dilim 3D kabul raporu

21 Kasım 2026

**A — Entegrasyona hazır.** Sentetik finans, veri bütünlüğü, Android ve yükseltme kapıları aynı uygulama kaynağında geçti. Fiziksel cihaz ve kalıcı dağıtım imzası için ayrı kabul maddeleri aşağıda.

## Git durumu ve kaynak

| Ref | Hedef | HEAD | Tree |
|---|---|---|---|
| `main` | — | `b09244d87ab4c850ca5055c85f155d0f67c54807` | `9577e157ccbad0a1edb68e80422fd40cc3c390f7` |
| [#21 · 3A](https://github.com/witcher46/ekstre-ajani-android/pull/21) | `main` | `e215a15833a009c6657055dc10dec0cf9c8ed471` | `8aa3b1e0e0afa2181c43622e1cb3f18b06aaf30d` |
| [#22 · 3B](https://github.com/witcher46/ekstre-ajani-android/pull/22) | `feature/android-reconciliation-evidence-storage` | `23afed08d115db0ab556a8ebb784f1427ddb7302` | `8ddc3bb1db4108335ec58cb5eeb850de39ba7450` |
| [#23 · 3C](https://github.com/witcher46/ekstre-ajani-android/pull/23) | `feature/android-reconciliation-approval-flow` | `39fc43d8ffb62e60dbc088f919e4357a1ccf0d47` | `f99ec38df56977da90293420b031410d53da774e` |
| [#24 · test edilen uygulama kaynağı](https://github.com/witcher46/ekstre-ajani-android/commit/0881e8d43f4715de6d9815523ed82e8f77a609a6) | `main` | `0881e8d43f4715de6d9815523ed82e8f77a609a6` | `836bd5ad83345b572c1187e4ddbcbc03c8ceb1ef` |

#21, #22, #23 ve #24 açık taslak. Entegrasyon dalı `integration/android-reconciliation-phase2-acceptance`. Bu rapor ayrı bir belgelendirme commit’i olarak eklenir. Teslim edilen dalın güncel HEAD, tree ve CI bağlantıları PR açıklamasında yer alır. [PR #24](https://github.com/witcher46/ekstre-ajani-android/pull/24)

3A, 3B, 3C sırasıyla `d8b809dc02fc493e5b83006bca38f4608d16c75a`, `1e6a17b5c6eb427398a69a59f59f495238e8102a` ve `31ddf3d73ad1e8bde29208726254091e7554b28a` merge commit’leriyle alındı. Üç adım çakışmasız tamamlandı. Son adımın tree’si #23 ile aynıydı. Test edilen uygulama kaynağında GitHub’ın deneme birleştirmesi `5e7b2eda7eca3b46967b0f5f2cc6e4e0e34e2f3b` aynı tree’yi verdi.

`main` ile uygulama adayı arasındaki 27 dosyalık fark, onay ve geçmiş ekranlarını, JSON v3 doğrulamasını, SQLite CAS ve kurtarmayı, testleri ve CI’ı kapsıyor. `core.mjs` farkı para girişi sınırı, yedek doğrulaması ve gözlem saklama sürümüyle sınırlı. #23 tree’sine göre aşağıdaki sekiz dosya P2 düzeltmeleri ve regresyonlar nedeniyle değişti. [Birleşik fark](https://github.com/witcher46/ekstre-ajani-android/pull/24/files)

| #23’e göre değişen dosya | Neden |
|---|---|
| `app.mjs` | WebView görünürlüğü kaybolduğunda veya Activity durakladığında geçmiş tutarları ve referansları tekrar gizler. |
| `MainActivity.java` | Activity yaşam döngüsünden gizlemeyi tetikler. API 33 ve üzeri Son Kullanılanlar ekranı için sistem görüntüsünü kapatır. API 26–32’de güvenli pencere bayrağı, ön plandaki ekran görüntülerini de engeller. |
| `balance-approval-storage.mjs`, `BalanceApprovalStorage.java` | Arşivde bağlı satır ve hedefin kuruş tutarlarını iki okuyucuda karşılaştırır. |
| `balance-approval-storage.test.mjs`, `SnapshotAtomicityTest.java` | Geçerli bağlantının kabulünü ve bir kuruşluk uyuşmazlığın reddini sınar. Native test hatalı geri yükleme sonrasında geçerli içeriği ve kurtarma kopyasını karşılaştırır. |
| `wallet-v2-journey.cjs`, `WalletJourneyTest.java` | Gizlemenin geri dönünce sürmesini, erişilebilir düğme adlarını, klavye odağını, dokunma hedeflerini ve salt okunur davranışı sınar. |

Android’in Son Kullanılanlar ayarı API 33’te eklendi. Fiziksel cihazdaki sistem önizlemesi ve API 26–32 davranışı ayrı kabul maddesidir. [Android Activity API](https://developer.android.com/reference/android/app/Activity#setRecentsScreenshotEnabled(boolean))

## Finansal davranış ve kayıt bütünlüğü

- 0.4.0 golden testleri maaşı ve alışverişi bir kez saydı, kart ödemesini giderden ayırdı ve transferi gelir/gidere katmadı. Ekim sentetik örneğinde gelir 3.000.000, gider 200.000 ve kart borcu 80.000 kuruş. Kasım iadesi kendi döneminde işlendi, Ekim gideri aynı kaldı. 10.000 kuruşluk üç taksit 3.333, 3.333 ve 3.334 kuruş olarak işlendi. Finans testleri, kesim tarihi ve PDF/CSV–manuel eşleşmelerinde ikinci mali etki oluşmadığını doğruladı. [Finansal davranış sözleşmesi](FINANCIAL_BEHAVIOR_CONTRACT.md)
- Gözlem eklemek işlem oluşturmadı. Sıfır dışı mutabakat farkı arşivde kaldı. İlk onay ve sonraki onay zinciri işlem dizisini, açılış bakiyelerini ve rapor toplamlarını değiştirmedi. Ek yerel tarayıcı senaryosunda onaylı cüzdana normal gelir formundan 200 kuruş eklendi. Gelir bir kez işlendi, tarihsel kanıt korundu ve etkilenen onay yeniden inceleme istedi.
- Sentetik v1 cüzdana gözlem eklenince v2, açık ilk onay kaydedilince v3 oluştu. Kanonik kanıt ve SHA-256 doğrulandı. Açık onay olmadan yazma gerçekleşmedi. SQLite, eski snapshot’ı reddetti. İki eşzamanlı denemeden biri yazdı. Çift tıklama tek yazma üretti. Son yazma hatasında güncel, önceki ve kurtarma snapshot’ları korundu.
- Yeni onay doğru önceki onaya bağlandı. v3 geri yükleme geçmişi korudu. Silinen dayanak veya gözlem arşivde kaldı ve güncellik değerlendirilemedi. Aynı toplamı koruyan satır değişiklikleri, tarih/tutar/yön değişiklikleri ve PDF/CSV bağlantıları yeni inceleme gerektirdi. Cihaz saati gerideyken kullanıcıya düzeltme bildirildi ve zincir korundu.
- Banka ve nakit geçmişleri ayrı kaldı. Açma ve yenilemede SQLite içeriği değişmedi. Kullanıcı gösterene kadar tutar ve referanslar DOM’a yazılmadı. API 35 ve tarayıcıda arka plan dönüşünden sonra ayrıntılar tekrar gizliydi. Beş sekme, hesaplar arası geri gezinme, 320 dp emülatörde %200 WebView metni ve tarayıcıda klavye odağı ve adlandırma doğrulandı.

## Yerel ve GitHub testleri

Yerelde 252/252 Node testi ve altı Playwright paketi geçti. Ek normal kayıt senaryosu aynı uygulama kaynağında çalıştı. Windows’taki ayrı API 35 emülatöründe 320 dp yapılandırmasıyla üç odaklı native test geçti. Bunlar `previousApkIsPreservedAndCaptured`, `approvalBackupSurvivesNativeRestoreAndRejectsTampering` ve `approvalHistoryEvaluatesNativeSnapshotWithoutRewritingEvidence`. Gerçek kullanıcı kayıtları kullanılmadı.

İlk GitHub denemesinde Android build ve lint başarılıydı. SDK’nın API 35 x86_64 sistem imajı kurulumu `Error reading Zip content from a SeekableByteChannel` ile durdu. Instrumentation emülatör başlamadığı için çalışmadı. Yalnızca başarısız `android` işi aynı SHA’da yeniden çalıştırıldı. [İlk iş logu](https://github.com/witcher46/ekstre-ajani-android/actions/runs/44637294563/job/135958965927)

Üç işte kaynak SHA `0881e8d43f4715de6d9815523ed82e8f77a609a6`, tree `836bd5ad83345b572c1187e4ddbcbc03c8ceb1ef`.

| İş | Kanıt |
|---|---|
| `verify` | 252/252 Node, altı Playwright paketi, 156 tarayıcı audit senaryosu ve 36 duyarlı düzen kontrolü geçti. [Log](https://github.com/witcher46/ekstre-ajani-android/actions/runs/44637294563/job/135958965545) |
| `android` | Yeniden denemede build ve lint geçti. API 35 toplam 37 test bildirdi. 30’u geçti, 7 koşullu test atlandı, hata yok. Zorunlu kapı 10 SQLite atomiklik ve 3 WebView testinin geçtiğini XML’den doğruladı. [Yeniden deneme logu](https://github.com/witcher46/ekstre-ajani-android/actions/runs/44637294563/job/136597966716) |
| `upgrade` | API 35 üzerinde geçici test sertifikasıyla 0.4.0 kod 7 → aday kod 8 ve aynı uygulama UID’si doğrulandı. Süreç kapatılıp açıldığında `wallet.db` baytları ve raporlar eşleşti. Altı yöntem ve sekiz çalıştırma geçti. [Log](https://github.com/witcher46/ekstre-ajani-android/actions/runs/44637294228/job/135958964460) |

### Android işinde koşullu atlanan testler

| Test | Gerekçe ve karşılığı |
|---|---|
| `restorePreviousTrialBackup` | Android debug işinde eski yedek parametresi yok. Upgrade işinde 0.4.0 kod 7’ye v1 yedek yüklenerek geçti. |
| `upgradedWalletSurvivesRestart` | Yerinde yükseltilmiş cüzdan gerekir. Upgrade işinde kod 8 süreç yeniden başlatmasında geçti. |
| `newWalletRestoresOriginalObservationBackup` | v2 gözlem yedeği gerekir. Upgrade işinde kod 8, eski okuyucu denemesinin öncesinde ve sonrasında geçti. |
| `oldWalletRejectsObservationBackupAndCanStillSave` | 0.4.0 APK’sı ve v2 yedek gerekir. Upgrade işinde v2 yazılmadan reddedildi ve v1 kayıt korunarak geçti. |
| `newWalletRestoresV3ApprovalBackup` | v3 onay yedeği gerekir. Upgrade işinde kod 8, eski v2 okuyucu denemesinin öncesinde ve sonrasında geçti. |
| `previousV2WalletRejectsV3BackupAndCanStillSave` | V2 okuyabilen önceki APK gerekir. Upgrade işinde v3 dosyası değişmeden kaldı ve v2 yazımı geçti. |
| `previousApkIsPreservedAndCaptured` | Ayrı 0.1.1 revision paketi gerekir. Doğrulanmış özgün APK ile yerelde API 35 üzerinde geçti. |

### Tarihsel revision APK

| Alan | Doğrulanan değer |
|---|---|
| Paket ve sürüm | `com.zagor.ekstre.preview.revision`, kod `2`, `0.1.1-deneme` |
| APK SHA-256 | `5884817065dc320e666d1336496ff4b636983996293909e9d8db8d20cbfe39e2` |
| Özgün arşiv SHA-256 | `28e324b11d2242eb3b970a985b2cfa3f467339ebdc49ba480814920eeb082122` |
| İmza | APK Signature Scheme v2, tek RSA 2048 debug imzalayan, `C=US, O=Android, CN=Android Debug` |
| İmza sertifikası SHA-256 | `7c5bf83823e5e6e76b6784384811e9362ef0d39d022ff1e494bce97d1ba866e6` |
| Kaynak | Artefakt `13619796337`, commit `fa723276472f484edd6e41e9f343cadb5fb9ddcd`. Özgün iş APK derleme, imza ve özet adımlarını geçti. [Tarihsel iş](https://github.com/witcher46/ekstre-ajani/actions/runs/42485996720) |

Arşiv özeti GitHub artefakt kaydıyla, APK özeti arşivdeki `SHA256SUMS.txt` ile eşleşti. Yerel test, kurulu ayrı paketin beklenen ekranını ve ön plandaki paket kimliğini doğruladı.

## Bağımsız inceleme ve fiziksel kabul

- **P2, geçmiş gizliliği.** Arka plana geçip dönüldüğünde açık değerlerin ekranda kalması sentetik tarayıcı testinde yeniden üretildi. JS ve Activity değişikliği sonrasında tarayıcı ve native yaşam döngüsü regresyonları geçti.
- **P2, bağlı arşiv tutarı.** PDF/CSV arşiv satırının hedef hareketten farklı tutarla kabulü sentetik testte yeniden üretildi. Geçerli banka ödemesi ve PDF takma satırının pozitif örneği iki okuyucuda kabul edildi. Bir kuruşluk fark iki okuyucuda reddedildi. Bağımsız yeniden incelemede açık P0–P2 kalmadı.

Fiziksel cihazda kalıcı imzalı APK’dan yerinde yükseltme ve dışarı alınmış yedeğin doğrulanması, ardından gerçek cüzdan ve rapor toplamları kontrol edilmeli. Banka ve nakit kaynaklarıyla uygulamalar arası inceleme, TalkBack, arka plan ve Son Kullanılanlar görünümü, ekran geçişleri ve uygulama kapatılıp açıldığında verilerin korunması telefonda ayrıca sınanmalı. Geçici CI imzası yalnızca test edilen yükseltme zincirini doğrular.

Proje sahibi onay verirse #24’ün tek merge commit’iyle alınması, 3A → 3B → 3C → 3D düzeltmeleri sırasını korur ve ara sürümlerin ayrı kabul edilmesini önler. Birleştirme öncesinde güncel `main` ve GitHub deneme birleştirmesi tekrar karşılaştırılmalı. Uygulama kaynak tree’si farklıysa yeni birleşik aday üzerinde kabul kapıları yeniden çalıştırılmalı.
