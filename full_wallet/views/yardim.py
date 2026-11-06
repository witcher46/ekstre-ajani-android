"""Offline help, onboarding and product information."""
import streamlit as st

from app_meta import APP_NAME, VERSION
import db
import help_content as content
import onboarding
import ui

ui.page_header("Yardım Merkezi", "Cüzdanını adım adım tanı. Bu rehber internet olmadan da kullanılabilir.")
request = st.session_state.pop("_help_request", None)
if request:
    st.session_state["help_section"] = request.get("section", "Kullanım rehberi")
    if request.get("topic") in content.BY_ID:
        st.session_state["help_focus"] = request["topic"]
        st.session_state["help_query"] = ""
        st.session_state["help_group"] = "Tüm konular"
section = st.radio("Yardım bölümü", ["Kullanım rehberi", "İlk kullanım", "Hakkında"], horizontal=True, key="help_section")

if section == "İlk kullanım":
    onboarding.render_guide()
elif section == "Hakkında":
    with st.container(border=True):
        st.subheader(f"{APP_NAME} Mobil")
        st.write(f"Cüzdan motoru **{VERSION}**")
        st.write("Kart ekstrelerini, banka ve nakit hesaplarını, gelir-giderleri, bütçeleri ve ödeme planlarını bir arada yöneten kişisel finans cüzdanı.")
        st.caption("Günlük kullanım ve yardım içerikleri yereldir. İsteğe bağlı Claude özellikleri ayrı onay ve internet bağlantısı gerektirir.")
    st.subheader("Veri ve yedek konumu")
    st.caption("Veritabanı bütün profilleri içerir. Profil parolası uygulama girişini korur; dosyayı şifrelemez.")
    st.text(str(db.DB.resolve()))
    st.caption("Otomatik yerel yedeklerin klasörü")
    st.text(str((db.DB.parent / "backups").resolve()))
    st.page_link("views/ayarlar.py", label="Yedek al veya geri yükle", icon=":material/backup:")
    st.subheader("Bu sürümde")
    st.write("Dengeli cüzdan arayüzü · İşlem ayrıntısı, etiket ve not · Toplu düzenleme · İnceleme kutusu · Kurallar · İşlem bölme · Bütçe ve birleşik ödeme takvimi · Çevrimdışı yardım ve ilk kullanım rehberi")
else:
    a, b = st.columns([3, 2])
    query = a.text_input("Yardımda ara", placeholder="Örn. PDF, kart ödemesi, yedek, işlem bölme", key="help_query")
    group = b.selectbox("Konu", ["Tüm konular"] + list(dict.fromkeys(item["group"] for item in content.ARTICLES)), key="help_group")
    matches = content.search(query, group)
    focus = st.session_state.get("help_focus")
    matches.sort(key=lambda item: item["id"] != focus)
    st.caption(f"{len(matches)} yardım konusu bulundu. Başlığa tıklayarak adımları açabilirsin.")
    if not matches:
        st.info("Bu aramaya uygun konu bulunamadı. Daha kısa bir ifade kullanabilir veya konu filtresini Tüm konular yapabilirsin.")
    for item in matches:
        with st.expander(item["title"], expanded=item["id"] == focus):
            st.caption(item["group"])
            st.write(item["summary"])
            st.markdown("\n\n".join(f"{i}. {text}" for i, text in enumerate(item["steps"], 1)))
            st.info(item["note"])
            if st.button(item["link"], key=f"help_open_{item['id']}", icon=":material/arrow_forward:"):
                planning_section = {"butce": "Bütçe", "abonelik": "Abonelikler", "takvim": "Ödeme takvimi"}.get(item["id"])
                if planning_section:
                    st.session_state["planning_section"] = planning_section
                if item["id"] == "inceleme":
                    st.session_state["review_only"] = True
                st.switch_page(item["page"])
