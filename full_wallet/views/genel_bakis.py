import html
from datetime import timedelta

import pandas as pd
import streamlit as st

import db
import services as sv
import ui
import zaman

cards, stm, tx = sv.yukle()
accounts, ledger = db.hesaplar_df(), db.hesap_hareketleri_df()
summaries = sv.kart_ozetleri(cards, stm, tx)
today_period = zaman.bugun().strftime("%Y-%m")
periods = sorted(set(tx.period.dropna()) | set(ledger.date.str[:7].dropna()) | {today_period}, reverse=True)
recorded = sorted(set(tx.period.dropna()) | set(ledger.date.str[:7].dropna()), reverse=True)
default_period = recorded[0] if recorded else today_period
head, actions = st.columns([3, 1.4], vertical_alignment="center")
with head:
    ui.page_header("Parana genel bakış", "Kartların, dönem harcamaların ve sıradaki işlemlerin tek yerde.")
with actions:
    period = st.selectbox("Ekstre / hesap dönemi", periods, index=periods.index(default_period), format_func=zaman.donem_adi)
    if st.button("İşlem ekle", icon=":material/add:", type="primary", width="stretch", key="overview_add"):
        st.session_state["open_manual_entry"] = True
        st.switch_page("views/islemler.py")

wallet = sv.wallet_ozeti(cards, stm, tx, accounts, ledger, period=period)
current = sv.wallet_ozeti(cards, stm, tx, accounts, ledger)
a, b, c = st.columns(3)
a.metric("Kayıtlı kart borcu · güncel tahmin", ui.tl(current["kart_borcu"]))
b.metric("Dönem net harcaması", ui.tl(wallet["gider"]))
c.metric("Gelecek taksit yükü", ui.tl(current["gelecek_taksit"]))
latest = stm.kesim.dropna().max() if len(stm) else None
age = f"Son ekstre kesimi: {zaman.tarih_uzun(latest)}" if latest else "Henüz ekstre yüklenmedi"
st.markdown(f'<div class="w-data-age">{html.escape(age)} · Kart borçları son ekstre ve kayıtlı hareketlere göre; dönem seçimi yalnızca harcama analizini değiştirir.</div>', unsafe_allow_html=True)

left, right = st.columns([1.25, 1], gap="large")
with left:
    with st.container(border=True):
        ui.section_header("Kartların", f"{len(summaries)} kart")
        if not summaries:
            st.caption("Kart ekleyerek veya ekstre yükleyerek başla.")
            st.page_link("views/ekstreler.py", label="Kart ekle / Ekstre yükle", icon=":material/add_card:")
        for card in summaries:
            st.markdown(ui.kart_html(card, card["id"] == st.session_state.get("nav_kart")), unsafe_allow_html=True)
            if st.button("Kart ayrıntısı", key=f"gb_kart_{card['id']}", icon=":material/arrow_forward:"):
                ui.kart_ac(card["id"], "views/cuzdanim.py")
        st.page_link("views/hesaplar.py", label="Banka ve nakit hesaplarını yönet", icon=":material/account_balance:")
with right:
    with st.container(border=True):
        ui.section_header("Bütçe özeti", zaman.donem_adi(period))
        budget_rows, budget_total = sv.butce_durumu(tx, db.butceler(period), period, ledger=ledger)
        if budget_total:
            remaining = budget_total["limit"] - budget_total["harcanan"]
            st.metric("Kalan dönem bütçesi" if remaining >= 0 else "Bütçe aşımı", ui.tl(abs(remaining)))
            st.progress(ui.oran(budget_total["oran"]), text=f"{ui.tl(budget_total['harcanan'])} / {ui.tl(budget_total['limit'])}")
        for row in sorted(budget_rows, key=lambda r: -r["oran"])[:4]:
            st.progress(ui.oran(row["oran"]), text=f"{row['kategori']} · {ui.tl(row['harcanan'])} / {ui.tl(row['limit'])}")
        if not budget_rows and not budget_total:
            st.caption("Bu dönem için bütçe tanımlanmadı.")
            period_ledger = ledger[ledger.date.str[:7] == period]
            categories = sv.kategori_toplamlari(tx[tx.period == period], ledger=period_ledger, positive_only=True)
            for row in categories.head(4).itertuples():
                st.markdown(ui.kategori_satiri_html(row.Kategori, row.Tutar, 100 * row.Tutar / categories.Tutar.sum()), unsafe_allow_html=True)
        st.page_link("views/butce.py", label="Bütçeyi yönet", icon=":material/arrow_forward:")

with st.container(border=True):
    ui.section_header("Son işlemler", "Kart, banka ve nakit hareketleri")
    if hasattr(db, "hareketler_df"):
        movements = db.hareketler_df().sort_values("date", ascending=False, kind="stable").head(6)
        if len(movements):
            show = movements[["date", "display_name", "category", "account_label", "amount"]].rename(columns={
                "date": "Tarih", "display_name": "İşlem", "category": "Kategori", "account_label": "Kart / Hesap", "amount": "Tutar"})
            st.dataframe(show, hide_index=True, width="stretch", column_config={"Tutar": st.column_config.NumberColumn(format="%.2f TL")})
        else:
            st.caption("Henüz hareket yok. İlk işlemini ekleyebilirsin.")
    elif len(tx):
        st.markdown(ui.satirlar_html(tx.sort_values("date", ascending=False, kind="stable"), limit=6), unsafe_allow_html=True)
    else:
        st.caption("Henüz hareket yok.")
    st.page_link("views/islemler.py", label="İşlem masasına git", icon=":material/arrow_forward:")

inbox = sv.inceleme_kutusu() if hasattr(sv, "inceleme_kutusu") else pd.DataFrame()
col_a, col_b = st.columns(2, gap="large")
with col_a:
    with st.container(border=True):
        ui.section_header("İnceleme kutusu", f"{len(inbox)} hareket")
        st.caption("Kategorisiz, yeni veya eşleştirme bekleyen hareketlerini birlikte kontrol et.")
        if st.button("Kontrol bekleyenleri aç", key="overview_review", icon=":material/fact_check:"):
            st.session_state["review_only"] = True
            st.switch_page("views/islemler.py")
with col_b:
    with st.container(border=True):
        ui.section_header("Hesapların", f"{len(accounts)} banka / nakit")
        if accounts.empty:
            st.caption("Hesap bakiyesi eklemediğin için nakit ve net varlık görünümü henüz tamamlanmadı.")
            st.page_link("views/hesaplar.py", label="Hesap bakiyesi ekle", icon=":material/add:")
        else:
            st.write(f"Nakit ve banka: **{ui.tl(current['nakit_banka'])}**")
            st.caption(f"Kayıtlarına göre net varlık: {ui.tl(current['net_varlik'])}")

if hasattr(sv, "uyari_merkezi"):
    alerts = sv.uyari_merkezi(period)
    with st.expander(f"Uyarı merkezi · {len(alerts)} bildirim", expanded=False):
        if alerts.empty:
            st.caption("Şu anda kontrol gerektiren bir bildirim yok.")
        for _, alert in alerts.iterrows():
            title, tools = st.columns([5, 2])
            with title:
                st.markdown(f"**{alert['title']}**")
                st.caption(alert["body"])
            with tools:
                if st.button("Okundu", key="read_" + str(alert["id"])):
                    sv.uyari_durumu(alert["id"], read=True)
                    st.rerun()
                if st.button("Yarın hatırlat", key="snooze_" + str(alert["id"])):
                    sv.uyari_durumu(alert["id"], snooze_until=(zaman.bugun() + timedelta(days=1)).isoformat())
                    st.rerun()
