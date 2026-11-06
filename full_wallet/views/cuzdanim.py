from datetime import date

import streamlit as st

import db
import services as sv
import ui
import zaman

ui.page_header("Cüzdan", "Kartlarını ve hesaplarını birlikte yönet.")
ui.wallet_tabs("cards")
cards, stm, tx = sv.yukle()
if cards.empty:
    ui.bos_durum()
    st.stop()
summaries = sv.kart_ozetleri(cards, stm, tx)
selected = ui.kart_sec(summaries)
o = next(x for x in summaries if x["id"] == selected)
cols = st.columns(min(len(summaries), 3))
for i, card in enumerate(summaries):
    cols[i % len(cols)].markdown(ui.kart_html(card, card["id"] == selected), unsafe_allow_html=True)

a, b, c = st.columns(3)
a.metric("Güncel tahmini borç", ui.tl(o.get("guncel_borc")))
b.metric("Son ekstrenin kalan borcu", ui.tl(o.get("kalan_ekstre_borcu")))
c.metric("Kullanılabilir limit · tahmini", ui.tl(o.get("kullanilabilir")))
st.caption("Güncel tutarlar son ekstre ve sonraki kayıtlardan hesaplanır. Henüz kaydetmediğiniz hareketler ve bankanın blokeleri dahil değildir.")
if o.get("son_odeme") and (o.get("kalan_ekstre_borcu") or 0) > 0:
    days = zaman.kalan_gun(o["son_odeme"])
    fn = st.warning if days is not None and days < 0 else st.info
    fn(f"Son ekstre son ödeme: {zaman.tarih_uzun(o['son_odeme'])} · kalan asgari: {ui.tl(o.get('asgari_kalan'))}")

k_tx, k_stm = tx[tx["card_id"] == selected], stm[stm["card_id"] == selected]
periods = sorted(set(k_tx["period"].dropna()) | set(k_stm["period"].dropna()) | {zaman.bugun().strftime("%Y-%m")}, reverse=True)
dsec = st.selectbox("İncelenen ekstre dönemi", periods, format_func=zaman.donem_adi)
s = k_stm[k_stm["period"] == dsec]
s = s.iloc[0] if len(s) else None
d = k_tx[k_tx["period"] == dsec]
a, b, c = st.columns(3)
debt = sv._v(s["donem_borcu"]) if s is not None else None
a.metric("Ekstredeki dönem borcu", ui.tl(debt))
b.metric("Dönem net harcaması", ui.tl(sv.net_harcama(d)))
c.metric("Dönem kart ödemeleri", ui.tl(d[d["tur"] == "odeme"]["amount"].sum()))
if s is None:
    st.caption("Bu dönemde ekstre başlığı yok; manuel işlemler gösteriliyor.")

if debt is not None and debt > 0:
    with st.expander("Asgari ödeme sonrası basit faiz tahmini"):
        rate = o.get("faiz_aylik")
        if o.get("faiz_kaynak"):
            st.caption("Kayıtlı oran kaynağı: " + ("kendi kaydettiğiniz oran" if o["faiz_kaynak"] == "kullanici" else "son yüklenen ekstre"))
        rate_pct = st.number_input("Ekstrenizdeki aylık akdi faiz oranı (%)", min_value=0.0, max_value=100.0,
                                   value=float(rate * 100) if rate else 0.0, step=0.01, key=f"interest_{selected}")
        payment = st.number_input("Ödemeyi düşündüğünüz tutar (TL)", min_value=0.0, value=float(sv._v(s["asgari"]) or 0), step=100.0,
                                  key=f"interest_payment_{selected}_{dsec}")
        if st.button("Oranı kart için kaydet", key=f"interest_save_{selected}"):
            db.kart_faiz_guncelle(selected, rate_pct / 100 if rate_pct > 0 else None)
            st.toast("Oran kaydedildi")
        if rate_pct > 0:
            remaining, interest = ui.asgari_faiz_tahmini(debt, payment, rate_pct / 100)
            st.write(f"Kalan {ui.tl(remaining)} için bir aylık basit faiz yaklaşık {ui.tl(interest)}.")
            st.caption("Vergi, gün hesabı, nakit avans ve ödeme zamanına bağlı etkiler dahil değildir. Bankanızın hesaplaması farklı olabilir.")
        else:
            st.caption("Hesaplama için kendi ekstrenizdeki oranı girin.")

t1, t2, t3 = st.tabs(["İşlemler", "Taksitler", "Ekstre geçmişi"])
with t1:
    all_rows = st.checkbox("Tüm işlemleri göster", key=f"cz_all_{selected}")
    st.markdown(ui.satirlar_html(d.sort_values("date", ascending=False, kind="stable"), None if all_rows else 40) or "Bu dönemde işlem yok.", unsafe_allow_html=True)
    if st.button("Bu kartın tüm işlemlerini aç →", key=f"cz_ac_{selected}"):
        ui.kart_ac(selected, "views/islemler.py")
with t2:
    plans = sv.taksitler(k_tx)
    if plans.empty:
        st.write("Bu kartta taksitli işlem görünmüyor.")
    for _, r in plans.iterrows():
        st.progress(ui.oran(r["no"] / r["toplam"]), text=f"{r['desc'].title()} · {r['no']}/{r['toplam']} · aylık {ui.tl(r['aylik'])} · kalan {ui.tl(r['kalan_tutar'])}")
with t3:
    history = sv.ekstre_gecmisi(k_stm, k_tx)
    if history.empty:
        st.info("Bu karta henüz ekstre yüklenmedi. Manuel işlemleriniz kullanılabilir.")
    else:
        st.dataframe(history[["Dönem", "Kesim", "Son ödeme", "Dönem borcu", "İşlem", "Mutabakat"]], hide_index=True, width="stretch")
