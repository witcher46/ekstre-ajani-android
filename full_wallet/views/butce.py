from datetime import date

import streamlit as st

import categorizer as cz
import db
import services as sv
import ui
import zaman

if not globals().get("embedded"):
    ui.page_header("Planlama", "Dönem bütçeni ve ödeme planını yönet.")
    ui.planning_links()
cards, stm, tx = sv.yukle()
ledger = db.hesap_hareketleri_df()
current = zaman.bugun().strftime("%Y-%m")
periods = set(tx["period"].dropna()) | set(ledger["date"].str[:7].dropna())
periods |= {zaman.donem_ekle(current, n) for n in range(-12, 13)}
dsec = st.selectbox("Bütçe dönemi", sorted(periods, reverse=True), index=sorted(periods, reverse=True).index(current), format_func=zaman.donem_adi)
st.caption("Kart harcamaları ekstre dönemine; banka/nakit giderleri işlem ayına göre hesaplanır. Transfer ve kart ödemeleri hariçtir.")
mode = st.radio("Düzenleme kapsamı", ["Yalnızca seçilen dönem", "Varsayılan aylık bütçe"], horizontal=True, key="budget_scope")
edit_period = dsec if mode == "Yalnızca seçilen dönem" else None
budget = db.butceler(edit_period)
categories = [k for k in cz.kategoriler() if k not in ("Ödeme", "İndirim / İade")]
with st.expander("Bütçeleri düzenle", expanded=not budget):
    st.caption("Döneme özel kayıt, varsayılan bütçenin o ay için tamamının yerine geçer. 0 girilen sınırlar kaldırılır.")
    suffix = edit_period or "default"
    with st.form(f"budget_form_{suffix}"):
        total_limit = st.number_input("Aylık toplam harcama hedefi (TL)", min_value=0.0, step=500.0,
                                     value=float(budget.get(db.TOPLAM_HEDEF, 0)), key=f"b_genel_{suffix}")
        new = {}
        for category in categories:
            new[category] = st.number_input(f"{ui.IKON.get(category, '')} {category} (TL)", min_value=0.0, step=100.0,
                                           value=float(budget.get(category, 0)), key=f"b_{suffix}_{category}")
        if st.form_submit_button("Bütçeleri kaydet", type="primary"):
            db.butce_kaydet({**new, db.TOPLAM_HEDEF: total_limit}, edit_period)
            st.toast("Bütçeler kaydedildi")
            st.rerun()

rows, total = sv.butce_durumu(tx, db.butceler(dsec), dsec, ledger=ledger)
if not rows and not total:
    st.info("Bu dönem için henüz bütçe belirlenmedi. İşlem eklemeden de hedeflerinizi oluşturabilirsiniz.")
if total:
    remaining = total["limit"] - total["harcanan"]
    st.progress(ui.oran(total["oran"]), text=f"Genel hedef: {ui.tl(total['harcanan'], 0)} / {ui.tl(total['limit'], 0)}" + (" · aşıldı" if remaining < 0 else ""))
    st.caption(f"Kalan: {ui.tl(remaining, 0)}" if remaining >= 0 else f"Aşım: {ui.tl(-remaining, 0)}")
    if total["harcanan"] < 0:
        st.caption("Bu dönemde iadeler harcamaları aşıyor. Net tutar negatif olarak korunur.")
for row in sorted(rows, key=lambda r: -r["oran"]):
    remaining = row["limit"] - row["harcanan"]
    st.progress(ui.oran(row["oran"]), text=f"{ui.IKON.get(row['kategori'], '')} {row['kategori']}: {ui.tl(row['harcanan'], 0)} / {ui.tl(row['limit'], 0)}"
                + (f" · {ui.tl(-remaining, 0)} aşıldı" if remaining < 0 else f" · kalan {ui.tl(remaining, 0)}"))

st.subheader("Dönemlere göre hedef ve gerçekleşen")
history = []
for period in sorted(set(tx["period"].dropna()) | set(ledger["date"].str[:7].dropna()) | {dsec}, reverse=True):
    _, target = sv.butce_durumu(tx, db.butceler(period), period, ledger=ledger)
    if target:
        history.append({"Dönem": zaman.donem_adi(period), "Harcama": target["harcanan"], "Hedef": target["limit"]})
if history:
    st.dataframe(history, hide_index=True, width="stretch",
                 column_config={"Harcama": st.column_config.NumberColumn(format="%.2f TL"), "Hedef": st.column_config.NumberColumn(format="%.2f TL")})
else:
    st.caption("Dönem hedefi kaydedildiğinde burada görünür.")
