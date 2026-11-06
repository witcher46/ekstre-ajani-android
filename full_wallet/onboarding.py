"""Skippable, per-profile first-use guide with no financial side effects."""
import streamlit as st

import db

SETTING = "onboarding_v1"
STEPS = [
    ("Kendi alanını hazırla", "İlk profil hazır. Ayarlar'da parola ekleyebilir veya başka bir kullanıcı için ayrı profil oluşturabilirsin. Her profil kendi kayıtlarını görür.", "views/ayarlar.py", "Profil ayarlarını aç"),
    ("Kart veya hesap ekle", "Kart ekstresiyle başlayacaksan Ekstreler'den PDF yükle; kart otomatik tanınır. Nakit veya banka hesabıyla başlayacaksan Cüzdan'da Banka ve nakit hesapları → Hesap ekle'yi kullan. İkisini birlikte kullanman zorunlu değil.", "views/ekstreler.py", "Ekstre yükle veya kart ekle"),
    ("İşlemlerini kontrol et", "İşlemler'de bir kayıt seç; kategori, etiket ve notunu düzenle. Kontrolün bitince İncelendi'yi işaretle. Aynı alışverişe ait manuel ve ekstre kayıtları varsa İnceleme kutusu'nda eşleştirmeyi çöz.", "views/islemler.py", "İşlemleri aç"),
    ("Bütçeni ve ödemelerini planla", "Planlama'da toplam veya kategori bütçesi belirle. Aboneliklerin sonraki tarihini ekle; Ödeme takvimi'nde gerçek ekstre tarihleriyle tahminlerin farklı etiketlendiğine dikkat et.", "views/planlama.py", "Planlamayı aç"),
    ("Özetini doğru oku", "Genel Bakış'ta güncel kart borcu ile seçilen dönemin harcaması ayrı gösterilir. Kart ödemeleri yeni harcama değildir. Banka ve nakit bakiyesi girdiğinde cüzdan görünümün tamamlanır.", "views/genel_bakis.py", "Genel Bakış'ı aç"),
    ("Bir yedek sakla", "Ayarlar'da İndirilecek yedeği hazırla → Yedeği indir ile tam yedeğini güvenli bir yerde sakla. Günlük yerel yedekler de otomatik alınır. Kullanım sorularında soldaki Yardım Merkezi'ne dönebilirsin.", "views/ayarlar.py", "Yedekleri aç"),
]


def state():
    saved = db.ayar_getir(SETTING, {})
    if not isinstance(saved, dict):
        saved = {}
    step = saved.get("step", 0)
    if not isinstance(step, int) or isinstance(step, bool):
        step = 0
    status = saved.get("status", "new")
    if status not in ("new", "started", "dismissed", "completed"):
        status = "new"
    return dict(step=max(0, min(len(STEPS) - 1, step)), status=status)


def save(status, step=0):
    db.ayar_kaydet(SETTING, dict(status=status, step=step))


def should_offer():
    current = state()
    if current["status"] == "started":
        return True
    if current["status"] != "new":
        return False
    with db.baglanti() as connection:
        return not any(connection.execute(f"SELECT 1 FROM {table} WHERE user_id=? LIMIT 1", (db.user_id(),)).fetchone()
                       for table in ("cards", "accounts", "budgets", "recurring"))


def offer():
    if not should_offer():
        return
    current = state()
    with st.container(border=True):
        st.markdown("**Cüzdanına hoş geldin**" if current["status"] == "new" else "**İlk kullanım rehberine devam et**")
        st.caption("Altı kısa adımda kart, hesap, bütçe ve yedeklerini tanı. Dilediğin zaman Yardım Merkezi'nden geri dönebilirsin.")
        a, b = st.columns(2)
        if a.button("Rehberi aç", key="onboarding_open", icon=":material/explore:"):
            save("started", current["step"])
            st.session_state["_help_request"] = {"section": "İlk kullanım"}
            st.switch_page("views/yardim.py")
        if b.button("Şimdilik atla", key="onboarding_skip"):
            save("dismissed", current["step"])
            st.rerun()


def render_guide():
    current = state()
    if current["status"] == "completed":
        st.success("İlk kullanım rehberini tamamladın. Her konuya Kullanım rehberi sekmesinden ulaşabilirsin.")
        if st.button("Rehberi yeniden başlat", key="guide_restart"):
            save("started")
            st.rerun()
        st.page_link("views/genel_bakis.py", label="Cüzdanıma git", icon=":material/account_balance_wallet:")
        return
    step = current["step"]
    title, explanation, page, label = STEPS[step]
    st.caption("Bu rehber tanıtım amaçlıdır; kayıt oluşturmaz. İlgili ekranı açıp işlemini yaptıktan sonra Yardım Merkezi → İlk kullanım'dan kaldığın yere dönebilirsin.")
    st.progress(step / len(STEPS), text=f"Adım {step + 1} / {len(STEPS)}")
    with st.container(border=True):
        st.subheader(title)
        st.write(explanation)
        st.page_link(page, label=label, icon=":material/arrow_forward:")
        if step == 1:
            st.page_link("views/hesaplar.py", label="Banka veya nakit hesabı ekle", icon=":material/account_balance:")
    a, b, c = st.columns(3)
    if a.button("Önceki adım", key="guide_back", disabled=step == 0):
        save("started", step - 1)
        st.rerun()
    if b.button("Rehberi tamamla" if step == len(STEPS) - 1 else "Anladım, devam et", key="guide_next", type="primary"):
        save("completed" if step == len(STEPS) - 1 else "started", min(step + 1, len(STEPS) - 1))
        st.rerun()
    if c.button("Sonra devam et", key="guide_later"):
        save("dismissed", step)
        st.switch_page("views/genel_bakis.py")
