# Finans cüzdanı v2 uygulama planı

Goal: Maaş, cüzdan ve kart ödemeleri anlaşılır tek akışta; mevcut JSON ve kayıtlar korunur.
Spec: docs/superpowers/specs/2026-11-08-wallet-finance-design.md

## Görevler
- [x] 1. Çekirdek: tarih farkı/kesim sınırı çift sayımı, muhasebe özetleri, onaylı gelir planları, kaynak banka bağlama, taksit tahminleri. Önce core/wallet v2 testlerinde kırmızı örnekler; sonra core.mjs + wallet.mjs. 43 eski test korunur.
- [x] 2. Ayrıştırıcı: ham açıklama, güvenli gösterim temizliği, ndirim anlamı, başlık varyantları ve mutabakat nesnesi. parser-v2 testleri önce; parser.mjs ve gerekirse eski mutabakat testi güncellenir.
- [x] 3. Görünümler: views.mjs ve wallet-v2.css; ana sayfa, hesap/kart ayrıntısı, gelir planı, aylık rapor ve zengin ekstre önizlemesi. Finansal toplama görünümde yapılmaz.
- [x] 4. app.mjs bağlama: dört hızlı eylem, ödeme/kaynak banka, gelir kategorileri/planı, doğrulanmamış aktarım onayı, uyumlu yedek geri yükleme. Yeni kullanıcı akışı testi önce, sonra bağlama.
- [x] 5. Eski 14+29 finans testi, 9 UI, 13 akış, 56 düzen kontrolü ile yeni doğrulamalar. Sentetik v1 JSON geçişi/ham alan/başarısız geri yükleme atomikliği ve tekrar açılma testleri. Android klavye sürücüsünde erişilebilirlik sınıfı yerine gerçek alana fiziksel dokunma; test zayıflatılmaz.
- [ ] 6. Değişen dosyalar/sır taraması ve inceleme; GitHub gönderimi için kullanıcı onayı. Ardından ayrı, süre sınırlandırılmış Android/APK aşaması; doğrulanmadan APK var denmez.

## Paylaşılan arayüzler
core.mjs: eski API korunur. importStatement mismatch durumunu reddeder; r.sourceDesc varsa korur; tarih toleransı yalnız aday/insan kararıdır. Onaylı kaynak gruplarının kart etkisi PDF kayıt tarihine dayanır.
wallet.mjs: normalizeWallet(s), overview(s,period), cardDetail(s,cardId), addIncomePlan(s,plan), receiveIncome(s,id,{receivedOn,expectedDue,account?}), attachPaymentSource(s,tid,bankId,{paidOn}), installmentOverview(s,cardId).
overview: cash, cardDebt, cardCredit, netWorth, income, spent, refunds, netExpense, margin, cashIn, cashOut, cardPayments, transfers, incomeByCategory, categories, plannedIncome (kuruş).
cardDetail: C.cardStatus alanları + debt, credit, postCutExpenses, postCutRefunds, unassignedPayments, movements, installments.
incomePlan alanları: id,name,account,amount,next,category,billingDay isteğe bağlı. Hesap banka/nakit; ödeme transaction.incomePlanId/incomePlanDue ile tekilleşir.
parser.mjs: p.reconciliation={status:verified|unverified|mismatch, previousDebt,statementDebt,expectedDebt,difference,missing:[],totals:{expenses,payments,refunds},reasons:[]}. Eski p.debt/cut/due/period/rows/warning korunur. rows.sourceDesc ham banka açıklaması; rows.desc gösterim; importKey eski 0.1.1 anahtarıyla uyumludur.
views.mjs: homeView(ctx), walletView(ctx), accountView(ctx,accountId), reportsView(ctx), importView(ctx,pending), incomePlansView(ctx).
ctx={state,period,fmt,esc,transactionList,periodControl,dateStatus}; görünümler C/W modüllerini okuyabilir, para hesaplarını tekrar yazamaz. data-action addTransaction/addIncome/transfer/payCard, data-card-view, data-account-view, data-bind-payment, data-income-receive, data-income-delete, data-action incomePlan ve incomeCategory kullanılır.

Pre-flight: core ile parser mutabakat/sourceDesc sözleşmesini paylaşır; alanlar yukarıda sabitlendi. UI bu API'leri tüketir. Dosya sahipliği çakışmaz. Tüm işler yeni çalışma ağacında; eski rapor/alanlara dokunulmaz.


## Yerel teslim durumu
76/76 Node testi; 9 mevcut UI + 13 mevcut akış + 16 yeni cüzdan akışı; son tasarımda 104/104 tarayıcı düzen senaryosu geçti. Korunan 116 dosyada SHA-256 farkı yok.
Görev 5'in Android kısmı yalnız hazırlandı; native yürütme tamamlanmış sayılmaz. 9 native test metodu ve 52 native düzen durumu, APK/lint/imza CI onayı sonrasında doğrulanacak.
Görev 6'nın kaynak inceleme ve tarama bölümü tamamlandı: docs/superpowers/reports/2026-11-08-wallet-finance-v2.md içinde aktarılacak 20 dosya ve sınırlar yazılıdır. GitHub gönderimi ve tek Actions çalışması için kullanıcı onayı beklenir. Main'e birleştirme yapılmaz.
