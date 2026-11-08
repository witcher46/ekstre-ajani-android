# Android UX / finans düzeltme planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. İşler bu oturumda uygulanır; son aşamada bağımsız kod incelemesi yapılır.

**Goal:** Günlük gelir-gider takibi ve kart yönetiminde çift saymayan, küçük ekranda okunabilir Android sürümü.
**Architecture:** Mevcut WebView / JavaScript / SQLite korunur. Kaynak eşleşmeleri ve abonelik vadeleri isteğe bağlı version=1 alanlarıyla genişler.
**Tech Stack:** Java 17, Android 35, mevcut Gradle, Node test, Playwright ve Android instrumentation.
**Spec:** `docs/revision-spec.md` ve kullanıcının ayrıntılı talebi.

## Global Constraints

- Masaüstü ve gerçek veriler değişmez. main'e yazılmaz. Yükleme onayı ayrıca alınır.
- Yeni servis/kütüphane yok. Eski version=1 yedekleri korunur.
- Finans davranışı koddan önce elle hesaplanan örnekler ve başarısız testlerle sabitlenir.

## Review Focus

- Aynı tutarlı iki gerçek alışverişin hatalı birleştirilmesi: import testleri ve aday çözüm testi.
- Manuel ödeme sonradan geldiğinde de kaynakların çift sayılması: iki yönlü ödeme testi.
- Kesim tarihi / takvim ayı sınırı: Eylül-Ekim testleri.
- Yenilenen PDF'de kaldırılmış veya tutarı değişmiş satıra bağlı karar: yeniden aktarım testleri.
- Eski yedek, bozuk hedef hesap, kurtarma ve başarısız kayıt: uyumluluk/atomiklik testleri.

### Task 1: Yeniden üretme ve öncelik listesi

Files: `android_app/tests/audit.cjs`, `docs/findings.md`.
- [ ] Mevcut sürümde sekiz ana akışı Chrome'da kullan; ekran/çakışma ölçümleri ve önce görüntülerini kaydet.
- [ ] Finans hatalarını `tests/revision.test.mjs` ile yeniden üret; RED sonuçlarını kaydet.
- [ ] P0/P1/P2 ve kök nedenleri yaz.

### Task 2: Finans çekirdeği ve güvenli aktarım

Files: `assets/core.mjs`, `parser.mjs`, `csv.mjs`, `tests/revision.test.mjs`.
Interfaces: `summary(s,period,mode='calendar')`, `cardStatus(s,account)`, `importCsv(s,rows,account)`, `resolveCandidate(s,id,decision,targetId)`, `paySubscription(s,id,{paidOn,expectedDue})`.
- [ ] Ödeme, aday eşleşme, takvim/ekstre, açıklama koruma, CSV sıralama, abonelik ve eski yedek testlerini önce başarısız çalıştır.
- [ ] Minimal, geriye uyumlu düzeltmeleri yap. Adaylar ayrı gösterilir; kesin kabul edilmez.
- [ ] Eski 14 ve yeni çekirdek testlerinin tamamını çalıştır; commit.

### Task 3: Okunabilir ekranlar ve işlem akışları

Files: `assets/app.mjs`, `style.css`, `index.html`, `tests/audit.cjs`, `ui.cjs`.
- [ ] Dört genişlik/büyük yazı/uzun metin testini RED çalıştır.
- [ ] Sayı blokları, tek sütuna geçiş, eylem sarma, modal ve alt menüyü düzelt.
- [ ] Türe göre form alanları, kart özeti, aday çözümü, gerçek abonelik tarihi, açık dönem etiketleri ve ödeme durumunu bağla.
- [ ] Önce/sonra görüntülerini ve çakışma ölçümlerini karşılaştır; mevcut UI kontrollerini koru.

### Task 4: Android ve veri güvenliği

Files: `MainActivity.java`, `OfflineTest.java`, `app/build.gradle`, workflow.
- [ ] Kurtarma, font ölçeği, dosya seçici, geri tuşu ve klavye için Android testlerini genişlet.
- [ ] Aynı JSON sürümünde geri yükleme kurtarma kopyası ve native yazı ölçeğini uygula; 0.1.1 sürüm kodunu artır.
- [ ] Güncelleme imzası sorununu çözmeden eski APK üzerine kurulabilir diye iddia etme; eski APK/yedeği koru.

### Task 5: İnceleme / teslim

- [ ] Bağımsız kod incelemesi, P0/P1 düzeltmeleri ve testleri.
- [ ] Değişen dosyalar + tarama + test kanıtlarıyla GitHub onayı al.
- [ ] Onay sonrası yeni uzak dal ve taslak PR, eski APK önce/sonra emülatör akışları, yeni APK/imza testleri; hata varsa düzelt.
- [ ] Gerçek cihazda kalan kontrolleri ve tamamlanmayanları açıkça raporla.
