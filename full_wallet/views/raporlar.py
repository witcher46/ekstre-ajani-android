import altair as alt
import streamlit as st

import categorizer as cz
import db
import services as sv
import ui
import zaman

ui.page_header("Raporlar", "Dönemleri karşılaştır, harcama örüntülerini incele.")
cards, stm, tx = sv.yukle()
ledger = db.hesap_hareketleri_df()
if tx.empty and ledger.empty:
    ui.bos_durum()
    st.stop()
ozetler = sv.kart_ozetleri(cards, stm, tx)
kart_secim = ui.kart_sec(ozetler, tumu=True)
f = ui.kart_filtre(tx, kart_secim)
included_ledger = ledger if kart_secim == "Tümü" else ledger.iloc[0:0]
donemler = sorted(set(f["period"].dropna()) | set(included_ledger["date"].str[:7].dropna()))

st.subheader("Aylık net harcama trendi")
trend = sv.aylik_trend(f, ledger=included_ledger)
if len(donemler) < 2:
    st.caption("Trend için en az iki ekstre dönemi gerekir; şimdilik tek dönem var.")
st.altair_chart(alt.Chart(trend).mark_bar().encode(
    x=alt.X("period:N", title="Ekstre dönemi"), y=alt.Y("amount:Q", title="TL"), color="category:N",
    tooltip=["period", "category", alt.Tooltip("amount:Q", format=",.0f")]), width="stretch")
st.caption("İadeler düşülür; kart ödemeleri ve transferler hariçtir. Tüm kartlar seçiminde banka/nakit giderleri de dahildir.")

st.subheader("Aylık karşılaştırma")
mat = sv.kategori_matrisi(f, ledger=included_ledger)
if not mat.empty:
    if len(mat.columns) >= 2:
        son, onc = mat.columns[-1], mat.columns[-2]
        mat["Değişim %"] = ((mat[son] - mat[onc]) / mat[onc].where(mat[onc] > 0) * 100).round(0)
    st.dataframe(mat.rename(columns=lambda c: zaman.donem_adi(c) if c != "Değişim %" else c), width="stretch")
    st.caption("Tutarlar TL; kartlarda ekstre dönemi, hesap giderlerinde takvim ayı kullanılır. Ödemeler/transferler hariç, iadeler düşülmüştür.")

st.subheader("Dikkat çekenler")
dsec = st.selectbox("Dönem", sorted(donemler, reverse=True), format_func=zaman.donem_adi, key="r_donem") if donemler else None
notlar = []
if dsec:
    d = f[f["period"] == dsec]
    onceki = [p for p in donemler if p < dsec]
    if onceki:
        simdi = trend[trend["period"] == dsec].groupby("category")["amount"].sum()
        once = trend[trend["period"] == onceki[-1]].groupby("category")["amount"].sum()
        for kat, tutar in simdi.items():
            eski = once.get(kat, 0)
            if eski > 0 and tutar - eski > 100 and tutar / eski > 1.2:
                notlar.append(f"📈 {kat}: {zaman.donem_adi(onceki[-1])} dönemine göre %{(tutar / eski - 1) * 100:.0f} arttı "
                              f"({eski:,.0f} → {tutar:,.0f} TL).")
    selected_summaries = ozetler if kart_secim == "Tümü" else [o for o in ozetler if o["id"] == kart_secim]
    selected_stm = stm if kart_secim == "Tümü" else stm[stm["card_id"] == kart_secim]
    for seviye, metin in sv.uyarilar(selected_summaries, selected_stm, f, dsec):
        notlar.append(("⚠️ " if seviye == "warning" else "ℹ️ ") + metin)
st.write("\n\n".join(notlar) if notlar else "Şimdilik dikkat çeken bir şey yok.")

with st.expander("🤖 Claude'dan yorum iste"):
    st.caption("Yalnızca kategori toplamları gönderilir (mağaza adı veya kart bilgisi gitmez).")
    consent = st.checkbox("Seçtiğim dönemin kategori toplamlarını yorum için Claude'a göndermeyi kabul ediyorum.", key="r_ai_consent")
    if dsec and st.button("Yorumla", key="r_yorum", disabled=not consent):
        ai_ledger = included_ledger[included_ledger["date"].str.startswith(dsec)]
        category_totals = sv.kategori_toplamlari(f[f["period"] == dsec], context=tx, ledger=ai_ledger)
        ozet = f"Dönem: {zaman.donem_adi(dsec)}\n" + "\n".join(
            f"{r.Kategori}: {r.Tutar:,.0f} TL" for r in category_totals.itertuples())
        with st.spinner("Düşünüyor..."):
            try:
                st.markdown(cz.claude_yorum(ozet))
            except Exception as e:
                st.error(f"Yorum alınamadı: {e}")

st.subheader("Dışa aktar")
st.download_button("İşlemleri CSV olarak indir", key="r_csv", mime="text/csv", file_name="islemler.csv",
                   data=ui.csv_bytes(f.drop(columns=["id", "card_id", "statement_id"])))
if not included_ledger.empty:
    st.download_button("Hesap hareketlerini CSV olarak indir", key="r_ledger_csv", mime="text/csv", file_name="hesap_hareketleri.csv",
                       data=ui.csv_bytes(included_ledger.drop(columns=["id", "linked_tx_id"], errors="ignore")))
