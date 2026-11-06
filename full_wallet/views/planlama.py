import calendar
from datetime import date
from pathlib import Path
import runpy

import pandas as pd
import streamlit as st

import db
import services as sv
import ui
import zaman

ui.page_header("Planlama", "Bütçe, taksit, abonelik ve ödeme tarihlerin aynı yerde.")
section = st.segmented_control("Planlama bölümü", ["Bütçe", "Taksitler", "Abonelikler", "Ödeme takvimi"],
                               default="Bütçe", key="planning_section", label_visibility="collapsed")
root = Path(__file__).resolve().parent
if section == "Bütçe":
    runpy.run_path(str(root / "butce.py"), init_globals={"embedded": True})
elif section in ("Taksitler", "Abonelikler"):
    runpy.run_path(str(root / "taksit_abonelik.py"), init_globals={"embedded": True, "plan_section": "taksit" if section == "Taksitler" else "abonelik"})
else:
    current = zaman.bugun().strftime("%Y-%m")
    periods = [zaman.donem_ekle(current, i) for i in range(-12, 13)]
    a, b, c = st.columns([2, 2, 2])
    selected_period = a.selectbox("Takvim ayı", periods, index=12, format_func=zaman.donem_adi, key="calendar_period")
    year, month = map(int, selected_period.split("-"))
    start, end = date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])
    view = b.radio("Görünüm", ["Takvim", "Liste"], horizontal=True, key="calendar_view")
    cards = db.kartlar_df()
    card_labels = {int(r.id): sv.kart_etiketi(r.bank, r.name) for r in cards.itertuples()}
    selected_card = c.selectbox("Kart filtresi", ["Tümü"] + list(card_labels), format_func=lambda i: "Tüm kartlar ve hesaplar" if i == "Tümü" else card_labels[i], key="calendar_card")
    if not hasattr(sv, "odeme_takvimi"):
        st.info("Ödeme takvimi hazırlanıyor.")
        st.stop()
    events = sv.odeme_takvimi(start.isoformat(), end.isoformat(), card_ids=None if selected_card == "Tümü" else [selected_card])
    kinds = {"kart": "Kart son ödemesi", "taksit": "Taksit tahmini", "abonelik": "Abonelik planı", "tahmini": "Tespit edilen düzenli ödeme"}
    choices = st.multiselect("Gösterilen ödemeler", list(kinds), default=list(kinds), format_func=kinds.get, key="calendar_kinds")
    events = events[events["kind"].isin(choices)]
    st.caption("Ekstre, kaydettiğin planlar ve tahminler ayrı etiketlenir. Gelecek taksitler kesim gününe göre tahmin edilir; kart son ödeme borcuyla birlikte yeniden borç sayılmaz.")
    if view == "Takvim":
        st.markdown(ui.calendar_html(year, month, events), unsafe_allow_html=True)
    if events.empty:
        st.info("Bu ay ve filtreler için kayıtlı ödeme yok.")
    else:
        ui.section_header("Ödeme ajandası", f"{len(events)} kayıt")
        display = events.copy()
        display["date"] = display["date"].map(zaman.tarih_uzun)
        display["kind"] = display["kind"].map(kinds)
        st.dataframe(display[["date", "label", "amount", "kind", "source", "status"]].rename(columns={
            "date": "Tarih", "label": "Ödeme", "amount": "Tutar", "kind": "Tür", "source": "Dayanak", "status": "Durum"}),
            hide_index=True, width="stretch", column_config={"Tutar": st.column_config.NumberColumn(format="%.2f TL")})
