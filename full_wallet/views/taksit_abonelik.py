import pandas as pd
from datetime import date
import streamlit as st

import categorizer as cz
import db
import services as sv
import ui
import zaman

if not globals().get("embedded"):
    ui.page_header("Planlama", "Taksit ve aboneliklerini tek yerde yönet.")
    ui.planning_links()
section = globals().get("plan_section", "all")
cards, stm, tx = sv.yukle()
plans = db.abonelikler_df()
ozetler = sv.kart_ozetleri(cards, stm, tx)
kart_secim = ui.kart_sec(ozetler, tumu=True)
f = ui.kart_filtre(tx, kart_secim)

if section in ("all", "taksit"):
    st.subheader("Taksitli alışverişler")
    tk = sv.taksitler(f)
    aktif, biten = tk[tk["kalan_adet"] > 0], tk[tk["kalan_adet"] == 0]
    m1, m2, m3 = st.columns(3)
    m1.metric("Devam eden taksit", len(aktif))
    m2.metric("Aylık taksit tutarı", ui.tl(aktif["aylik"].sum(), 0))
    m3.metric("Kalan toplam yük", ui.tl(aktif["kalan_tutar"].sum(), 0))
    if aktif.empty:
        st.write("Devam eden taksitli işlem görünmüyor.")
    for _, r in aktif.iterrows():
        st.progress(ui.oran(r["no"] / r["toplam"]), text=f"{r['desc'].title()} · {r['kart']} · {r['no']}/{r['toplam']}. taksit")
        st.caption(f"Aylık {ui.tl(r['aylik'])} (dönem borcuna dahil) · kalan {r['kalan_adet']} taksit = {ui.tl(r['kalan_tutar'])} · "
                   f"tahmini toplam alış {ui.tl(r['toplam_tahmini'])} (vade farkı dahil olabilir) · "
                   f"tahmini bitiş {zaman.donem_adi(r['bitis_donem'])} ekstresi")
    if len(biten):
        with st.expander(f"Tamamlanan taksitler ({len(biten)})"):
            st.dataframe(biten[["desc", "kart", "aylik", "toplam", "son_donem"]], hide_index=True, width="stretch")


if section in ("all", "abonelik"):
    st.subheader("Geçmiş işlemlerden tahmin edilen düzenli ödemeler")
    du = sv.duzenli_odemeler(f)
    if du.empty:
        st.write("Abonelik veya düzenli ödeme olarak tanınan işlem yok.")
    else:
        st.dataframe(du.assign(merchant_key=du["merchant_key"].str.title(), son_tarih=du["son_tarih"].map(zaman.tarih_uzun),
                               tahmini_sonraki=du["tahmini_sonraki"].map(zaman.tarih_uzun))
                     .rename(columns={"kart": "Kart", "merchant_key": "Ödeme", "kategori": "Kategori", "son_tarih": "Son işlem",
                                      "tutar": "Son tutar", "donem_sayisi": "Görüldüğü dönem", "tahmini_sonraki": "Tahmini sonraki",
                                      "dayanak": "Dayanak"}),
                     hide_index=True, width="stretch",
                     column_config={"Son tutar": st.column_config.NumberColumn(format="%.2f TL")})
        st.caption("Sonraki tarih, son işlemin bir ay sonrası olarak tahmin edilir; gerçek tarih değişebilir.")


if section == "all":
    st.subheader("Yaklaşan ödemeler")
    bugun = zaman.bugun().isoformat()
    yaklasan = []
    for o in ozetler:
        if (kart_secim == "Tümü" or kart_secim == o["id"]) and o["son_odeme"] and o["son_odeme"] >= bugun and (o.get("kalan_ekstre_borcu") or 0) > 0:
            yaklasan.append({"Tarih": o["son_odeme"], "Ne": f"{o['label']} kalan ekstre borcu son ödeme", "Tutar": o.get("kalan_ekstre_borcu"), "Dayanak": "Ekstre + kayıtlı ödemeler"})
    for _, r in du.iterrows():
        if r["tahmini_sonraki"] >= bugun:
            yaklasan.append({"Tarih": r["tahmini_sonraki"], "Ne": r["merchant_key"].title(), "Tutar": r["tutar"], "Dayanak": "Tahmin"})
    for _, r in plans.iterrows():
        if r["active"] and r["next_date"] >= bugun and (kart_secim == "Tümü" or r["card_id"] == kart_secim):
            yaklasan.append({"Tarih": r["next_date"], "Ne": r["name"], "Tutar": r["amount"], "Dayanak": "Kaydettiğiniz abonelik"})
    if yaklasan:
        y = pd.DataFrame(yaklasan).sort_values("Tarih")
        y["Tarih"] = y["Tarih"].map(zaman.tarih_uzun)
        st.dataframe(y, hide_index=True, width="stretch", column_config={"Tutar": st.column_config.NumberColumn(format="%.2f TL")})
    else:
        st.info("Yaklaşan ödeme bulunamadı. Son ödeme tarihleri geçmişte kaldıysa güncel ekstreyi yükleyin.")


if section in ("all", "abonelik"):
    st.subheader("Yönettiğim abonelikler")
    plans = db.abonelikler_df()
    accounts = db.hesaplar_df()
    card_labels = {int(r.id): sv.kart_etiketi(r.bank, r.name) for r in cards.itertuples()}
    account_labels = {int(r.id): r.name for r in accounts.itertuples()}
    frequencies = {"gunluk": "Her gün", "haftalik": "Her hafta", "aylik": "Her ay", "uc_aylik": "Üç ayda bir", "yillik": "Her yıl"}
    with st.expander("Abonelik ekle / düzenle", expanded=plans.empty):
        choices = {int(r.id): r.name for r in plans.itertuples()}
        edited = st.selectbox("Abonelik", ["yeni"] + list(choices), format_func=lambda i: "Yeni abonelik" if i == "yeni" else choices[i], key="recurring_edit")
        row = plans[plans["id"] == edited].iloc[0] if edited != "yeni" else None
        suffix = str(edited)
        with st.form(f"recurring_form_{suffix}"):
            name = st.text_input("Abonelik adı", value=row["name"] if row is not None else "")
            amount = st.number_input("Her dönem ödenecek tutar (TL)", min_value=0.0, step=10.0, value=float(row["amount"]) if row is not None else 0.0)
            when = st.date_input("Sonraki ödeme tarihi", value=date.fromisoformat(row["next_date"]) if row is not None else zaman.bugun())
            freq = st.selectbox("Ödeme sıklığı", list(frequencies), index=list(frequencies).index(row["frequency"]) if row is not None and row["frequency"] in frequencies else 2, format_func=frequencies.get)
            categories = [k for k in cz.kategoriler() if k not in ("Ödeme", "İndirim / İade")]
            category = st.selectbox("Abonelik kategorisi", categories, index=categories.index(row["category"]) if row is not None and row["category"] in categories else categories.index("Abonelik"))
            methods = {"none": "Belirtilmedi", **{f"card:{i}": label for i, label in card_labels.items()}, **{f"account:{i}": label for i, label in account_labels.items()}}
            method_value = "none"
            if row is not None:
                if pd.notna(row["card_id"]):
                    method_value = f"card:{int(row['card_id'])}"
                elif pd.notna(row["account_id"]):
                    method_value = f"account:{int(row['account_id'])}"
            method = st.selectbox("Ödeme yapılan kart / hesap", list(methods), index=list(methods).index(method_value) if method_value in methods else 0, format_func=methods.get)
            active = st.checkbox("Abonelik aktif", value=bool(row["active"]) if row is not None else True)
            if st.form_submit_button("Aboneliği kaydet", type="primary"):
                try:
                    card_id = int(method.split(":")[1]) if method.startswith("card:") else None
                    account_id = int(method.split(":")[1]) if method.startswith("account:") else None
                    db.abonelik_kaydet(name, amount, when.isoformat(), freq, category, card_id, account_id,
                                        id=None if edited == "yeni" else edited, aktif=active)
                    st.rerun()
                except ValueError as exc:
                    st.error(str(exc))

    if not plans.empty:
        display = plans.copy()
        display["Sıklık"] = display["frequency"].map(frequencies)
        display["Durum"] = display["active"].map({1: "Aktif", 0: "Durduruldu"})
        st.dataframe(display[["name", "amount", "next_date", "Sıklık", "Durum"]].rename(columns={"name": "Abonelik", "amount": "Tutar", "next_date": "Sonraki ödeme"}),
                     hide_index=True, width="stretch", column_config={"Tutar": st.column_config.NumberColumn(format="%.2f TL")})
        selected_plan = st.selectbox("İşlem yapılacak abonelik", list(choices), format_func=choices.get, key="recurring_action")
        action_plan = plans[plans["id"] == selected_plan].iloc[0]
        paid_date = st.date_input("Ödemenin gerçekleştiği tarih", value=zaman.bugun(), key="recurring_paid_date")
        has_method = pd.notna(action_plan["card_id"]) or pd.notna(action_plan["account_id"])
        if not has_method:
            st.caption("Ödeme kaydetmek için aboneliğe bir kart veya hesap bağlayın.")
        a, b = st.columns(2)
        if a.button("Ödendi olarak kaydet", key="recurring_advance", disabled=not has_method or not action_plan["active"]):
            try:
                db.abonelik_odendi(selected_plan, paid_date.isoformat())
                st.rerun()
            except ValueError as exc:
                st.error(str(exc))
        if b.button("Aboneliği sil", key="recurring_delete"):
            db.abonelik_sil(selected_plan)
            st.rerun()
        st.caption("Ödendi olarak kaydetmek, bağlı kartta/hesapta ödeme tutarında bir harcama oluşturur ve sonraki tarihi ilerletir. Aynı ödemeyi ayrıca elle eklemeyin.")
