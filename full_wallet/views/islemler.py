"""Kart ve hesap hareketleri için birleşik işlem masası."""
import hashlib
from datetime import date

import pandas as pd
import streamlit as st

import categorizer as cz
import db
import services as sv
import transaction_panels as panels
import ui
import zaman


def manual_entry(cards, accounts):
    with st.expander("Yeni işlem ekle", expanded=bool(st.session_state.pop("open_manual_entry", False))):
        if cards.empty and accounts.empty:
            st.info("Önce Cüzdan sayfasından bir kart veya hesap oluşturun.")
            st.page_link("views/ekstreler.py", label="Kart ekle", icon="💳")
            st.page_link("views/hesaplar.py", label="Hesap ekle", icon="🏦")
            return
        channels = (["Kredi kartı"] if not cards.empty else []) + (["Banka / nakit hesabı"] if not accounts.empty else [])
        channel = st.radio("İşlemin hesabı", channels, horizontal=True, key="m_channel") if len(channels) > 1 else channels[0]
        cats = [k for k in db.kategori_listesi() if k not in ("Ödeme", "İndirim / İade")]
        if channel == "Kredi kartı":
            labels = {int(r.id): sv.kart_etiketi(r.bank, r.name) for r in cards.itertuples()}
            with st.form("manual_card"):
                a, b = st.columns(2)
                card = a.selectbox("Kart", list(labels), format_func=labels.get, key="m_kart")
                when = b.date_input("Tarih", value=zaman.bugun(), key="m_tarih")
                desc = st.text_input("Açıklama", key="m_acik")
                a, b = st.columns(2)
                amount = a.number_input("Tutar (TL)", min_value=0.0, step=10.0, key="m_tutar")
                kind_label = b.selectbox("Tür", ["Harcama", "İade", "Kart ödemesi"], key="m_tur")
                category = st.selectbox("Kategori", ["Otomatik"] + cats, key="m_kat")
                if st.form_submit_button("Ekle", type="primary", key="m_ekle"):
                    kind = {"Harcama": "harcama", "İade": "indirim", "Kart ödemesi": "odeme"}[kind_label]
                    automatic_category = category == "Otomatik"
                    if automatic_category:
                        category = cz.kategorile([{"desc": desc, "tur": kind}])[0]["category"]
                    try:
                        db.manuel_ekle(card, when.isoformat(), desc, amount, kind, category, category_auto=automatic_category)
                        st.toast("İşlem eklendi")
                        st.rerun()
                    except ValueError as exc:
                        st.error(str(exc))
        else:
            labels = {int(r.id): r.name for r in accounts.itertuples()}
            with st.form("manual_account"):
                a, b = st.columns(2)
                account = a.selectbox("Hesap", list(labels), format_func=labels.get, key="hm_account")
                when = b.date_input("Tarih", value=zaman.bugun(), key="hm_date")
                desc = st.text_input("Açıklama", key="hm_desc")
                a, b = st.columns(2)
                amount = a.number_input("Tutar (TL)", min_value=0.0, step=10.0, key="hm_amount")
                kind = b.selectbox("Tür", ["gider", "gelir"], format_func=lambda x: x.title(), key="hm_type")
                category = st.selectbox("Gider kategorisi", cats, key="hm_category")
                if st.form_submit_button("Hesap hareketini ekle", type="primary", key="hm_add"):
                    try:
                        db.hesap_hareketi_ekle(account, when.isoformat(), desc, amount, kind, category if kind == "gider" else "Gelir")
                        st.toast("Hareket eklendi")
                        st.rerun()
                    except ValueError as exc:
                        st.error(str(exc))


def filters(frame):
    saved = db.filtreler_df()
    labels = {int(r.id): r.name for r in saved.itertuples()}
    with st.expander("Kaydedilmiş görünümler"):
        a, b, c = st.columns([3, 1, 1])
        chosen = a.selectbox("Kayıtlı görünüm", [None] + list(labels), format_func=lambda x: labels.get(x, "Görünüm seçin"), key="i_saved")
        if b.button("Görünümü aç", disabled=chosen is None, key="i_load_filter"):
            values = saved[saved["id"] == chosen].iloc[0]["filters"]
            for field, value in values.items():
                if field == "date_start" or field == "date_end":
                    value = date.fromisoformat(value) if value else zaman.bugun()
                if field in FILTER_KEYS:
                    st.session_state[FILTER_KEYS[field]] = value
            st.session_state["i_dates_enabled"] = bool(values.get("date_start"))
        if c.button("Görünümü sil", disabled=chosen is None, key="i_delete_filter"):
            db.filtre_sil(chosen)
            st.session_state.pop("i_saved", None)
            st.rerun()
    accounts = sorted(frame["account_label"].dropna().unique().tolist()) if len(frame) else []
    periods = sorted(frame["period"].dropna().unique().tolist(), reverse=True) if len(frame) else []
    categories = db.kategori_listesi()
    _valid_choice("i_account", ["Tümü"] + accounts)
    _valid_choice("i_period", ["Tümü"] + periods)
    _valid_choice("i_category", ["Tümü"] + categories)
    a, b, c = st.columns([2, 1, 1])
    search = a.text_input("Ara (açıklama)", placeholder="Mağaza, not veya etiket", key="i_ara")
    account = b.selectbox("Kart / hesap", ["Tümü"] + accounts, key="i_account")
    category = c.selectbox("Kategori filtresi", ["Tümü"] + categories, key="i_category")
    with st.expander("Diğer filtreler ve görünümü kaydet"):
        a, b, c, d = st.columns(4)
        period = a.selectbox("Ekstre / hesap dönemi", ["Tümü"] + periods, key="i_period",
                             format_func=lambda p: p if p == "Tümü" else zaman.donem_adi(p))
        source = b.selectbox("Kaynak", ["Tümü", "Ekstre", "Manuel"], key="i_source")
        status = c.selectbox("İnceleme", ["Tümü", "Bekleyen", "İncelenen"], key="i_status")
        types = ["Tümü", "Harcama", "İade", "Kart ödemesi", "Gelir", "Gider", "Transfer"]
        _valid_choice("i_type", types)
        kind = d.selectbox("İşlem türü", types, key="i_type")
        a, b, c = st.columns(3)
        low = a.number_input("En az tutar (TL)", min_value=0.0, step=10.0, key="i_min")
        high = b.number_input("En çok tutar (TL, 0 = sınırsız)", min_value=0.0, step=10.0, key="i_max")
        tag = c.text_input("Etiket filtresi", placeholder="Örn. Tatil", key="i_tag")
        dates = st.checkbox("Tarih aralığı kullan", key="i_dates_enabled")
        if dates:
            a, b = st.columns(2)
            start = a.date_input("Başlangıç tarihi", value=zaman.bugun(), key="i_start")
            end = b.date_input("Bitiş tarihi", value=zaman.bugun(), key="i_end")
        else:
            start = end = None
        a, b = st.columns([3, 1])
        name = a.text_input("Görünüm adı", placeholder="Örn. QNB aboneliklerim", key="i_filter_name")
        values = dict(search=search, account=account, category=category, period=period, source=source, status=status, type=kind,
                      min_amount=low, max_amount=high, tag=tag, date_start=start.isoformat() if start else None,
                      date_end=end.isoformat() if end else None)
        if b.button("Görünümü kaydet", key="i_save_filter"):
            try:
                db.filtre_kaydet(name, values)
                st.toast("Görünüm kaydedildi")
                st.rerun()
            except ValueError as exc:
                st.error(str(exc))
    result = frame.copy()
    if search:
        def searchable(row):
            return " ".join([str(row.get("display_name") or ""), str(row["desc"]), str(row.get("note") or ""), " ".join(row.get("tags") or [])])
        result = result[result.apply(searchable, axis=1).str.contains(search, case=False, regex=False, na=False)] if len(result) else result
    if account != "Tümü":
        result = result[result["account_label"] == account]
    if category != "Tümü":
        result = result[result.apply(lambda r: r["category"] == category or any(s["category"] == category for s in r.get("splits") or []), axis=1)] if len(result) else result
    if period != "Tümü":
        result = result[result["period"] == period]
    if source != "Tümü":
        result = result[result["source"] == source.lower()]
    if status != "Tümü":
        result = result[result["reviewed"].astype(bool) == (status == "İncelenen")]
    if kind != "Tümü":
        kinds = {"Harcama": ["harcama"], "İade": ["indirim"], "Kart ödemesi": ["odeme", "kart_odeme"],
                 "Gelir": ["gelir"], "Gider": ["gider"], "Transfer": ["transfer"]}
        result = result[result["tur"].isin(kinds[kind])]
    result = result[result["amount"].abs() >= low]
    if high:
        result = result[result["amount"].abs() <= high]
    if tag:
        result = result[result["tags"].apply(lambda x: tag.casefold() in [str(t).casefold() for t in (x or [])])]
    if start and end:
        if start > end:
            st.warning("Başlangıç tarihi bitiş tarihinden sonra olamaz.")
            result = result.iloc[0:0]
        else:
            result = result[(result["date"] >= start.isoformat()) & (result["date"] <= end.isoformat())]
    return result.sort_values(["date", "movement_ref"], ascending=False, kind="stable").reset_index(drop=True)


FILTER_KEYS = {"search": "i_ara", "account": "i_account", "category": "i_category", "period": "i_period", "source": "i_source",
               "status": "i_status", "type": "i_type", "min_amount": "i_min", "max_amount": "i_max", "tag": "i_tag", "date_start": "i_start", "date_end": "i_end"}


def _valid_choice(key, options):
    if st.session_state.get(key) not in options:
        st.session_state[key] = options[0]


def transaction_desk(frame, prefix="all"):
    if frame.empty:
        st.info("Bu görünümde işlem yok.")
        return
    labels = {r["movement_ref"]: f"{r['date']} · {r.get('display_name') or r['desc']} · {ui.tl(r['amount'])}" for r in frame.to_dict("records")}
    left, right = st.columns([2.3, 1], gap="large")
    with left:
        display = pd.DataFrame({"Tarih": frame["date"].map(zaman.tarih_uzun), "İşlem": frame["display_name"].fillna(frame["desc"]),
                                "Hesap / Kart": frame["account_label"], "Kategori": frame.apply(lambda r: f"{int(r['split_count'])} kategori" if r["split_count"] else r["category"], axis=1),
                                "Tutar": frame["amount"], "Durum": frame["reviewed"].map({True: "İncelendi", False: "Bekliyor"})})
        digest = hashlib.sha256("|".join(frame["movement_ref"].astype(str)).encode()).hexdigest()[:10]
        event = st.dataframe(display, hide_index=True, width="stretch", key=f"{prefix}_grid_{digest}", on_select="rerun", selection_mode="multi-row",
                             column_config={"Tutar": st.column_config.NumberColumn(format="%.2f TL")})
        selected_rows = event.selection.rows if hasattr(event, "selection") else []
        selected_refs = [frame.iloc[i]["movement_ref"] for i in selected_rows if i < len(frame)]
        stamp = (digest, tuple(selected_rows))
        if st.session_state.get(f"{prefix}_selection_stamp") != stamp:
            st.session_state[f"{prefix}_selection_stamp"] = stamp
            st.session_state[f"{prefix}_bulk_refs"] = selected_refs
            if selected_refs:
                st.session_state[f"{prefix}_detail"] = selected_refs[0]
        with st.expander("Toplu düzenleme"):
            if any(ref not in labels for ref in st.session_state.get(f"{prefix}_bulk_refs", [])):
                st.session_state[f"{prefix}_bulk_refs"] = []
            refs = st.multiselect("Seçilen hareketler", list(labels), format_func=labels.get, key=f"{prefix}_bulk_refs")
            with st.form(f"{prefix}_bulk_form"):
                cats = [None] + [k for k in db.kategori_listesi() if k != "Ödeme"]
                category = st.selectbox("Toplu kategori", cats, format_func=lambda x: x or "Değiştirme", key=f"{prefix}_bulk_category")
                tags = st.text_input("Toplu eklenecek etiketler", key=f"{prefix}_bulk_tags")
                state = st.selectbox("Toplu inceleme durumu", ["Değiştirme", "İncelendi", "Bekliyor"], key=f"{prefix}_bulk_review")
                if st.form_submit_button("Seçilenlere uygula", disabled=not refs, key=f"{prefix}_bulk_apply"):
                    try:
                        db.toplu_guncelle(refs, category=category, tags=panels.tags_from_text(tags) or None,
                                         reviewed=None if state == "Değiştirme" else state == "İncelendi")
                        st.toast(f"{len(refs)} hareket güncellendi")
                        st.rerun()
                    except ValueError as exc:
                        st.error(str(exc))
            st.caption("Tabloda satır seçebilir veya buradaki listeden birden çok hareket işaretleyebilirsiniz. Toplu kategori yalnızca harcama/iade/gider kayıtlarında geçerlidir.")
    with right:
        _valid_choice(f"{prefix}_detail", list(labels))
        selected = st.selectbox("Ayrıntısı gösterilen işlem", list(labels), format_func=labels.get, key=f"{prefix}_detail")
        with st.container(border=True):
            panels.render_detail(frame[frame["movement_ref"] == selected].iloc[0].to_dict(), prefix)


def matching(candidates):
    if candidates.empty:
        return
    with st.container(border=True):
        st.subheader("Eşleştirme bekleyen kayıtlar")
        labels = {i: f"{r['date']} · {r['manual_desc']} ↔ {r['desc']} · {ui.tl(r['amount'])}" for i, r in candidates.iterrows()}
        _valid_choice("match_candidate", list(labels))
        idx = st.selectbox("Eşleştirme adayı", list(labels), format_func=labels.get, key="match_candidate")
        row = candidates.loc[idx]
        a, b = st.columns(2)
        if a.button("Aynı işlem · eşleştir", key="match_accept"):
            db.eslestir(row["manual_id"], row["tx_id"])
            st.rerun()
        if b.button("Farklı işlemler · ayrı tut", key="match_reject"):
            db.eslesme_reddet(row["manual_id"], row["tx_id"])
            st.rerun()


if hasattr(ui, "page_header"):
    ui.page_header("İşlemler", "Kart ve hesap hareketlerini inceleyin, düzenleyin ve kategorilere ayırın.")
else:
    st.title("İşlemler")
cards, stm, tx = sv.yukle()
accounts = db.hesaplar_df()
manual_entry(cards, accounts)
all_movements = db.hareketler_df()
frame = filters(all_movements)
candidates = db.eslesme_adaylari_df()
if not candidates.empty:
    visible_refs = set(frame["movement_ref"])
    candidates = candidates[("K:" + candidates["manual_id"].astype(str)).isin(visible_refs)
                            | ("K:" + candidates["tx_id"].astype(str)).isin(visible_refs)]
pending_refs = {"K:" + str(r) for column in ("manual_id", "tx_id") for r in candidates[column]} if not candidates.empty else set()
pending = frame[(~frame["reviewed"].astype(bool)) | frame["movement_ref"].isin(pending_refs)]
a, b, c = st.columns(3)
a.metric("Gösterilen hareket", len(frame))
expenses = frame[frame["tur"].isin(("harcama", "indirim", "gider"))]
b.metric("Net harcama", ui.tl(int(expenses["amount_cents"].sum()) / 100))
c.metric("İnceleme bekleyen", len(pending))
review_label = f"İnceleme kutusu · {len(pending)}"
transactions_tab, review_tab, categories_tab, rules_tab = st.tabs(
    ["Tüm işlemler", review_label, "Kategoriler", "Kurallar"],
    default=review_label if st.session_state.pop("review_only", False) else None)
with transactions_tab:
    transaction_desk(frame, "all")
with review_tab:
    matching(candidates)
    transaction_desk(pending, "review")
with categories_tab:
    panels.render_categories("transaction_categories")
with rules_tab:
    panels.render_rules()

manual = tx[tx["source"] == "manuel"]
if not manual.empty:
    with st.expander("Manuel kart işlemlerini sil"):
        options = {r.id: f"{zaman.tarih_uzun(r.date)} · {r.desc} · {ui.tl(r.amount)}" for r in manual.itertuples()}
        deleted = st.multiselect("Silinecek manuel işlemler", list(options), format_func=options.get, key="m_sil_sec")
        if deleted and st.button("Seçilenleri sil", key="m_sil"):
            db.manuel_sil(deleted)
            st.rerun()
