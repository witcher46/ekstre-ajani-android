from datetime import date

import streamlit as st

import categorizer as cz
import db
import services as sv
import ui
import zaman

ui.page_header("Cüzdan", "Banka ve nakit hesapları, gelir, gider ve transferler.")
ui.wallet_tabs("accounts")
st.caption("Banka ve nakit hesaplarınızın bakiyelerini, gelir/giderlerini ve transferlerini kaydedin. Tutarlar TL'dir.")
accounts = db.hesaplar_df()
cards = db.kartlar_df()

with st.expander("Hesap ekle", expanded=accounts.empty):
    with st.form("new_account", clear_on_submit=True):
        name = st.text_input("Hesap adı", placeholder="Örn. Maaş hesabım veya Nakit")
        kind = st.selectbox("Hesap türü", ["banka", "nakit"], format_func=lambda x: {"banka": "Banka hesabı", "nakit": "Nakit"}[x])
        opening = st.number_input("Başlangıç bakiyesi (TL)", value=0.0, step=100.0)
        if st.form_submit_button("Hesabı oluştur", type="primary"):
            try:
                db.hesap_ekle(name, kind, opening)
                st.rerun()
            except ValueError as exc:
                st.error(str(exc))

if accounts.empty:
    st.info("İlk hesabınızı oluşturduktan sonra gelir, gider, transfer ve kart ödemesi kaydedebilirsiniz.")
    st.stop()

balances = sv.hesap_bakiyeleri(accounts, db.hesap_hareketleri_df())
st.metric("Toplam hesap bakiyesi", ui.tl(balances["bakiye"].sum()))
cols = st.columns(min(3, len(accounts)))
for i, account in enumerate(accounts.itertuples()):
    cols[i % len(cols)].metric(account.name, ui.tl(account.bakiye))

labels = {int(r.id): r.name for r in accounts.itertuples()}
card_labels = {int(r.id): sv.kart_etiketi(r.bank, r.name) for r in cards.itertuples()}
types = {"gelir": "Gelir", "gider": "Gider", "transfer": "Hesaplar arası transfer", "kart_odeme": "Kredi kartı ödemesi"}
st.subheader("Hareket ekle")
kind = st.radio("Hareket türü", list(types), format_func=types.get, horizontal=True, key="ledger_kind")
with st.form("new_ledger", clear_on_submit=True):
    a, b = st.columns(2)
    account_id = a.selectbox("Hesap", list(labels), format_func=labels.get)
    when = b.date_input("İşlem tarihi", value=zaman.bugun())
    target = st.selectbox("Alıcı hesap", list(labels), format_func=labels.get) if kind == "transfer" else None
    card_id = st.selectbox("Ödenen kart", list(card_labels), format_func=card_labels.get) if kind == "kart_odeme" and card_labels else None
    if kind == "kart_odeme" and not card_labels:
        st.info("Kart ödemesi için önce Ekstreler sayfasından kart ekleyin.")
    amount = st.number_input("İşlem tutarı (TL)", min_value=0.0, step=100.0)
    desc = st.text_input("İşlem açıklaması")
    category = st.selectbox("Harcama kategorisi", [k for k in cz.kategoriler() if k not in ("Ödeme", "İndirim / İade")]) if kind == "gider" else ("Gelir" if kind == "gelir" else "Transfer")
    st.caption("Transfer ve kart ödemesi harcama sayılmaz. Kart ödemesi, kartınızda da aynı hareketi oluşturur; ekstreyle eşleştirilir.")
    if st.form_submit_button("Hareketi kaydet", type="primary", disabled=kind == "kart_odeme" and not card_labels):
        try:
            db.hesap_hareketi_ekle(account_id, when.isoformat(), desc, amount, kind, category,
                                   hedef_hesap_id=target, kart_id=card_id)
            st.rerun()
        except ValueError as exc:
            st.error(str(exc))

ledger = db.hesap_hareketleri_df()
st.subheader("Hesap hareketleri")
selected = st.selectbox("Gösterilen hesap", ["Tümü"] + list(labels), format_func=lambda i: i if i == "Tümü" else labels[i], key="ledger_filter")
frame = ledger if selected == "Tümü" else ledger[(ledger["account_id"] == selected) | (ledger["hedef_hesap_id"] == selected)]
if frame.empty:
    st.write("Henüz hareket yok.")
else:
    display = frame.sort_values(["date", "id"], ascending=False).copy()
    display["Hesap"] = display["account_id"].map(labels)
    display["Alıcı / Kart"] = [labels.get(target, "") or card_labels.get(card, "") for target, card in zip(display["hedef_hesap_id"], display["card_id"])]
    display["Tür"] = display["tur"].map(types)
    st.dataframe(display[["date", "Hesap", "Tür", "desc", "amount", "Alıcı / Kart", "category"]].rename(
        columns={"date": "Tarih", "desc": "Açıklama", "amount": "Tutar", "category": "Kategori"}),
        hide_index=True, width="stretch",
        column_config={"Tutar": st.column_config.NumberColumn(format="%.2f TL")})
    with st.expander("Hareket sil"):
        choices = {r.id: f"{zaman.tarih_uzun(r.date)} · {r.desc} · {ui.tl(r.amount)}" for r in frame.itertuples()}
        deleted = st.selectbox("Silinecek hareket", list(choices), format_func=choices.get)
        st.caption("Kart ödemesine bağlı kayıt varsa o da kaldırılır. Hesap bakiyesi yeniden hesaplanır.")
        if st.button("Hareketi sil", key="delete_ledger"):
            try:
                db.hesap_hareketi_sil(deleted)
                st.rerun()
            except ValueError as exc:
                st.error(str(exc))

with st.expander("Hesabı düzenle"):
    edited_id = st.selectbox("Düzenlenen hesap", list(labels), format_func=labels.get)
    account = accounts[accounts["id"] == edited_id].iloc[0]
    with st.form(f"edit_account_{edited_id}"):
        new_name = st.text_input("Yeni hesap adı", value=account["name"])
        new_opening = st.number_input("Başlangıç bakiyesini düzelt (TL)", value=float(account["baslangic"]), step=100.0)
        if st.form_submit_button("Hesabı güncelle"):
            try:
                db.hesap_guncelle(edited_id, new_name, new_opening)
                st.rerun()
            except ValueError as exc:
                st.error(str(exc))
    if st.button("Boş hesabı sil", key="delete_account"):
        try:
            db.hesap_sil(edited_id)
            st.rerun()
        except ValueError as exc:
            st.error(str(exc))
