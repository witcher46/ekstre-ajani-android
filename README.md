# Ekstre Ajanı — Android

Android uygulaması Java/WebView tabanlıdır; verileri cihazda tutar ve desteklenen PDF/CSV ekstrelerini yerel olarak işler. Mevcut proje sürümü 0.2.0 deneme hattıdır. Eski kurulu uygulama veya imza anahtarı bu depoya dahil değildir.

## Gereksinimler ve derleme

JDK 17, Android SDK 35 ve Gradle 8.11.1 gerekir. Repo kökünden:

```sh
gradle -p android_app assembleDebug lintDebug
```

## Testler

```sh
node --test android_app/tests/*.test.mjs
node android_app/tests/ui.cjs
node android_app/tests/audit.cjs
node android_app/tests/journey.cjs
gradle -p android_app connectedDebugAndroidTest
```

Chrome/Playwright, tarayıcı akışları için; Android 35 emülatörü, enstrümantasyon testleri için gerekir. GitHub Actions bu adımları temiz bir hosted runner'da çalıştırır; APK'yı eski bir kurulumla değiştirmez ve eski özel depodaki artefaktlara erişmez.

## Veri ve sözleşmeler

Uygulama verisi cihazdaki uygulama alanında SQLite olarak tutulur; JSON yedeği `format="ekstre-android"`, `version=1` kullanır. Gerçek yedek, PDF, CSV, imzalama anahtarı veya APK Git'e eklenmez. Ortak finans kuralları [`docs/FINANCIAL_BEHAVIOR_CONTRACT.md`](docs/FINANCIAL_BEHAVIOR_CONTRACT.md), taşıma notları [`docs/DATA_FORMATS_AND_MIGRATIONS.md`](docs/DATA_FORMATS_AND_MIGRATIONS.md) içindedir.

`archive/` ile başlayan dallar geçmiş Android sürüm geçmişi ve eski mobil PWA kaynaklarını saklar; varsayılan `main` yerel Android uygulamasıdır.