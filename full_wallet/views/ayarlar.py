from datetime import date

import streamlit as st

import db
import zaman
import ui

ui.page_header("Ayarlar", "Profilin, güvenliğin ve yerel yedeklerin.")
user = db.user_get()
st.subheader("Profil güvenliği")
st.caption("Parola eklerseniz uygulama açılışında giriş gerekir. Mobil kayıtlar sunucuyu çalıştıran bilgisayarda tutulur.")
with st.form("change_password", clear_on_submit=True):
    old = st.text_input("Mevcut parola", type="password")
    password = st.text_input("Yeni parola (en az 8 karakter)", type="password")
    repeated = st.text_input("Yeni parola tekrar", type="password")
    if st.form_submit_button("Parolayı kaydet"):
        if db.user_auth(user["name"], old) != db.user_id():
            st.error("Mevcut parola hatalı.")
        elif len(password) < 8:
            st.error("En az 8 karakterlik bir parola girin.")
        elif password != repeated:
            st.error("Parolalar eşleşmiyor.")
        else:
            db.user_password(db.user_id(), password)
            st.success("Parola kaydedildi.")

with st.expander("Yeni profil oluştur"):
    st.caption("Yeni profilin hesapları, işlemleri, bütçeleri ve ayarları ayrı tutulur.")
    with st.form("new_profile", clear_on_submit=True):
        name = st.text_input("Profil adı")
        password = st.text_input("Profil parolası (en az 8 karakter)", type="password")
        repeated = st.text_input("Profil parolası tekrar", type="password")
        if st.form_submit_button("Profili oluştur"):
            if len(password) < 8 or password != repeated:
                st.error("En az 8 karakterlik eşleşen parolalar girin.")
            else:
                try:
                    uid = db.user_create(name, password)
                    st.session_state.clear()
                    st.session_state["auth_user_id"] = uid
                    st.rerun()
                except ValueError as exc:
                    st.error(str(exc))

st.subheader("Veri yedekleme")
with st.expander("Verilerim nerede saklanıyor?"):
    st.write("Mobil veritabanı ve otomatik yedekler sunucuyu çalıştıran bilgisayarda saklanır.")
    st.code(str(db.DB.parent), language=None)
    st.caption("Mobil veri klasörü uygulama kodundan ayrıdır. Yedeği indirerek başka bir konumda da saklayabilirsiniz.")
if db.user_id() != 1:
    st.info("Tüm profilleri içeren veritabanı yedeklerini yalnızca yerel ana profil yönetebilir.")
else:
    st.caption("Yedek bütün profilleri içerir. İndirdiğiniz dosyayı kişisel bir konumda saklayın. Her gün ilk açılışta otomatik yedek alınır.")
    if st.button("Şimdi yerel yedek al", key="backup_now"):
        path = db.yedek_al()
        st.success(f"Yedek oluşturuldu: {path.name}")
    if st.button("İndirilecek yedeği hazırla", key="backup_prepare"):
        st.session_state["backup_download"] = db.yedek_bytes()
    if st.session_state.get("backup_download"):
        st.download_button("Yedeği indir", data=st.session_state["backup_download"], file_name=f"finans_cuzdanim_{zaman.bugun().isoformat()}.db",
                           mime="application/vnd.sqlite3", key="backup_download_btn")
    backups = db.yedek_listesi()
    if backups:
        st.write("Yerel yedekler")
        st.dataframe({"Yedek": [p.name for p in backups]}, hide_index=True, width="stretch")
    with st.expander("Yedeği geri yükle"):
        uploaded = st.file_uploader("Finans Cüzdanım yedeği (.db)", type=["db"], key="restore_file")
        accepted = st.checkbox("Tüm profillerin mevcut verilerini seçtiğim yedekle değiştirmek istiyorum.", key="restore_accept")
        st.caption("Dosyanın yapısı doğrulanır; işlem öncesinde mevcut veritabanının yedeği alınır.")
        if st.button("Seçilen yedeği geri yükle", disabled=not uploaded or not accepted, key="restore_go"):
            try:
                db.yedek_geri_yukle(uploaded.getvalue())
                st.session_state.clear()
                st.session_state["login_required"] = True
                st.rerun()
            except (ValueError, OSError) as exc:
                st.error(f"Yedek yüklenemedi: {exc}")
