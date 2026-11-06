"""Kategori yönetimi ve net harcama kırılımı; İşlemler alanının alt görünümü."""
import streamlit as st

import db
import services as sv
import transaction_panels as panels
import ui
import zaman

if hasattr(ui, "page_header"):
    ui.page_header("Kategoriler", "Kendi kategorilerinizi düzenleyin; harcamalarınızı kategori ve mağaza bazında inceleyin.")
else:
    st.title("Kategoriler")
st.page_link("views/islemler.py", label="İşlem masasına dön", icon=":material/arrow_back:")
manage, analysis = st.tabs(["Kategori yönetimi", "Harcama kırılımı"])
with manage:
    panels.render_categories("standalone_categories")
with analysis:
    cards, stm, tx = sv.yukle()
    ledger = db.hesap_hareketleri_df()
    periods = sorted(set(tx["period"].dropna()) | set(ledger["date"].str[:7].dropna()), reverse=True)
    selected = st.selectbox("İncelenen dönem", ["Tümü"] + periods, format_func=lambda p: p if p == "Tümü" else zaman.donem_adi(p))
    filtered_tx = tx if selected == "Tümü" else tx[tx["period"] == selected]
    filtered_ledger = ledger if selected == "Tümü" else ledger[ledger["date"].str.startswith(selected)]
    totals = sv.kategori_toplamlari(filtered_tx, ledger=filtered_ledger, positive_only=True)
    if totals.empty:
        st.info("Bu seçimde pozitif net harcama yok.")
    else:
        a, b = st.columns(2)
        a.altair_chart(ui.donut(totals), width="stretch")
        b.markdown(ui.kategori_listesi(totals), unsafe_allow_html=True)
        st.caption("İadeler düşülür; kart ödemesi ve transferler hariçtir. Bölünmüş hareketlerde kategori payları kullanılır.")
