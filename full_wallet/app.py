"""Yerel kişisel finans cüzdanı. Çalıştır: python -m streamlit run app.py"""
import os

import streamlit as st

import db
import mobile_ui
import ui
import onboarding
from app_meta import APP_NAME, VERSION

st.set_page_config(page_title=f"{APP_NAME} Mobil", page_icon=":material/account_balance_wallet:",
                   layout="wide", initial_sidebar_state="auto")
try:
    db.init()
except Exception as exc:
    st.error(f"Veritabanı hazırlanamadı: {exc}")
    st.stop()
st.markdown(ui.CSS, unsafe_allow_html=True)
st.html(mobile_ui.CSS)

users = db.users_df()
known = {int(r.id): r for r in users.itertuples()}
if st.session_state.get("auth_user_id") not in known:
    owner = known.get(1)
    if owner and not owner.has_password and not st.session_state.get("login_required"):
        st.session_state["auth_user_id"] = 1
    else:
        ui.page_header("Finans Cüzdanım", "Profilinize giriş yapın.")
        st.caption("Profilinize giriş yapın. Her profil kendi hesaplarını ve işlemlerini görür.")
        with st.form("login"):
            selected = st.selectbox("Profil", list(known), format_func=lambda i: known[i].name)
            password = st.text_input("Parola", type="password")
            if st.form_submit_button("Giriş yap", type="primary"):
                uid = db.user_auth(known[selected].name, password)
                if uid is None:
                    st.error("Profil veya parola hatalı.")
                else:
                    st.session_state.clear()
                    st.session_state["auth_user_id"] = int(uid)
                    st.rerun()
        st.stop()

db.set_user(int(st.session_state["auth_user_id"]))
pages = [
    st.Page("views/genel_bakis.py", title="Genel Bakış", default=True),
    st.Page("views/cuzdanim.py", title="Cüzdan"),
    st.Page("views/hesaplar.py", title="Banka ve Nakit"),
    st.Page("views/islemler.py", title="İşlemler"),
    st.Page("views/planlama.py", title="Planlama"),
    st.Page("views/raporlar.py", title="Raporlar"),
    st.Page("views/ekstreler.py", title="Ekstreler"),
    st.Page("views/kategoriler.py", title="Kategoriler"),
    st.Page("views/taksit_abonelik.py", title="Taksitler ve Abonelikler"),
    st.Page("views/butce.py", title="Bütçe"),
    st.Page("views/ayarlar.py", title="Ayarlar ve Yedekler"),
    st.Page("views/yardim.py", title="Yardım Merkezi"),
]
page = st.navigation(pages, position="hidden")
active = page.url_path or "genel_bakis"
st.session_state["_active_page"] = active
ui.sidebar_active(active)
menu = [
    ("views/genel_bakis.py", "Genel bakış", ":material/dashboard:"),
    ("views/hesaplar.py" if active == "hesaplar" else "views/cuzdanim.py", "Cüzdan", ":material/account_balance_wallet:"),
    ("views/kategoriler.py" if active == "kategoriler" else "views/islemler.py", "İşlemler", ":material/receipt_long:"),
    (("views/" + active + ".py") if active in ("butce", "taksit_abonelik") else "views/planlama.py", "Planlama", ":material/calendar_month:"),
    ("views/raporlar.py", "Raporlar", ":material/bar_chart:"),
    ("views/ekstreler.py", "Ekstreler", ":material/description:"),
]
if os.environ.get("EKSTRE_MOBILE_DEMO_DIR"):
    st.info("Örnek cüzdan. Bu oturumdaki kayıtlar geçicidir. Yalnızca örnek dosya yükle.")
with st.container(key="mobile_nav"):
    for path, label, icon in menu:
        st.page_link(path, label=label, icon=icon)
with st.sidebar:
    st.markdown('<div class="w-brand"><span class="w-brand-mark">₺</span>Cüzdanım</div>', unsafe_allow_html=True)
    st.caption("Kişisel finans alanın")
    st.space("small")
    for path, label, icon in menu:
        st.page_link(path, label=label, icon=icon)
    st.space("large")
    st.divider()
    st.page_link("views/ayarlar.py", label="Ayarlar", icon=":material/settings:")
    st.page_link("views/yardim.py", label="Yardım Merkezi", icon=":material/help:")
    st.caption(f"Profil: {known[db.user_id()].name}")
    if st.button("Profili değiştir / Kilitle", key="lock_profile", icon=":material/lock:", width="stretch"):
        st.session_state.clear()
        st.session_state["login_required"] = True
        st.rerun()
    st.caption("Mobil cüzdan kayıtları sunucuyu çalıştıran bilgisayarda ayrı saklanır.")
    st.caption(f"Mobil cüzdan · motor {VERSION}")
if active == "genel_bakis":
    onboarding.offer()
page.run()
