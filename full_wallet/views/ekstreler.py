import pandas as pd
import streamlit as st

import db
import parsers
import services as sv
import ui
import zaman

SAYI = {c: st.column_config.NumberColumn(format="%.2f") for c in ("İşlemlerden", "Ekstre", "Fark")}


def mutabakat_goster(m):
    if m["durum"] == "tamam":
        st.success("Ekstre toplamları ile ayrıştırılan işlemler tutuyor ✅")
    elif m["durum"] == "fark":
        st.warning("Ekstre toplamları ile ayrıştırılan işlemler arasında fark var. Aşağıdaki farklara bakın; "
                   "PDF'te okunamayan bir satır olabilir.")
    else:
        st.info("Ekstre başlığındaki toplamlar okunamadığı için mutabakat yapılamadı.")
    st.dataframe(pd.DataFrame(m["satirlar"]), hide_index=True, width="stretch", column_config=SAYI)


ui.page_header("Ekstreler", "PDF yükle, toplamları kontrol et ve geçmişini tek yerde tut.")
cards, stm, tx = sv.yukle()

# ---- Yükleme akışı: kart seç -> PDF yükle -> ayrıştır/kategorile -> mutabakat
st.subheader("Ekstre yükle")
etiket = {r.id: sv.kart_etiketi(r.bank, r.name) for r in cards.itertuples()}
kart = st.selectbox("1. Kartı seçin", ["oto"] + list(etiket), key="e_kart",
                    format_func=lambda i: "Otomatik algıla (PDF'ten)" if i == "oto" else etiket[i])
with st.expander("Yeni kart ekle"):
    banka = st.selectbox("Banka", parsers.DESTEKLENEN_BANKALAR, key="yk_banka")
    ad = st.text_input("Kart adı (isteğe bağlı)", key="yk_ad")
    if st.button("Kartı ekle", key="yk_ekle"):
        db.kart_bul_veya_olustur(banka, ad.strip())
        st.rerun()
dosyalar = st.file_uploader("2. Ekstre PDF'lerini yükleyin", type="pdf", accept_multiple_files=True, key="e_pdf")
use_ai = st.checkbox("Bilinmeyen mağaza adlarını kategori önerisi için Claude'a göndermeyi kabul ediyorum.", value=False, key="e_ai_consent")
st.caption("PDF, cüzdan sunucusunu çalıştıran bilgisayarda işlenir. Claude seçilirse yalnızca mağaza anahtarları gönderilir.")
if dosyalar and st.button("3. İçe aktar ve analiz et", type="primary", key="e_import"):
    for d in dosyalar:
        with st.spinner(f"{d.name} okunuyor..."):
            try:
                r = sv.ekstre_ice_aktar(d, None if kart == "oto" else kart, d.name, use_ai=use_ai)
            except Exception as e:
                st.error(f"{d.name}: {e}")
                continue
        st.success(f"{d.name} → {r['kart']}, {zaman.donem_adi(r['donem'])}: {r['okunan']} işlem okundu. "
                   "Ekstre kaydı güncellendi; tekrar işlemler çoğaltılmadı.")
        if r["uyari"]:
            st.warning(r["uyari"])
        mutabakat_goster(r["mutabakat"])
    cards, stm, tx = sv.yukle()   # sayfanın geri kalanı yeni veriyi göstersin

if stm.empty:
    st.info("Henüz ekstre yüklenmedi.")
    st.stop()

# ---- Geçmiş
st.subheader("Ekstre geçmişi")
g = sv.ekstre_gecmisi(stm, tx)
st.dataframe(g.drop(columns=["id", "durum"]), hide_index=True, width="stretch",
             column_config={"Dönem borcu": st.column_config.NumberColumn(format="%.2f TL")})
isimler = {int(r.id): f"{r.Kart} · {zaman.donem_adi(r.Dönem)}" for r in g.itertuples()}
sid = st.selectbox("Ekstre ayrıntısı", list(isimler), format_func=lambda i: isimler[i], key="e_detay")
s = stm[stm["id"] == sid].iloc[0]
t = tx[tx["statement_id"] == sid]
st.markdown("**Mutabakat**")
mutabakat_goster(sv.mutabakat(s, t))
inceleme = t[(t["category"] == "Diğer") & (t["tur"] == "harcama")]
if len(inceleme):
    st.markdown("**Gözden geçirilecek işlemler** (kategorisi belirlenemedi)")
    st.dataframe(inceleme[["date", "desc", "amount"]].rename(columns={"date": "Tarih", "desc": "Açıklama", "amount": "Tutar"}),
                 hide_index=True, width="stretch")
    st.page_link("views/islemler.py", label="İşlemler sayfasında kategori ata", icon="🧾")
