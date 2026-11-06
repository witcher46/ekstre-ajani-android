"""İşlem masasının kategori, ayrıntı ve kural panelleri."""
import hashlib
import json

import pandas as pd
import streamlit as st

import db
import ui


TUR = {"harcama": "Harcama", "indirim": "İade", "odeme": "Kart ödemesi", "gider": "Gider",
       "gelir": "Gelir", "transfer": "Transfer", "kart_odeme": "Kart ödemesi"}


def tags_from_text(value):
    return list(dict.fromkeys(x.strip() for x in str(value or "").split(",") if x.strip()))


def _error(exc):
    st.error(str(exc))


def render_categories(prefix="categories"):
    st.subheader("Kategorilerim")
    st.caption("Özel kategori oluşturun; üst kategori seçerek harcamalarınızı gruplandırın.")
    categories = db.kategoriler_df()
    names = categories["name"].tolist()
    custom = categories[~categories["builtin"].astype(bool)]
    with st.container(border=True):
        with st.form(f"{prefix}_new", clear_on_submit=True):
            a, b = st.columns(2)
            name = a.text_input("Yeni kategori adı", key=f"{prefix}_new_name")
            parent = b.selectbox("Üst kategori", [None] + names,
                                 format_func=lambda x: x or "Üst kategori yok", key=f"{prefix}_new_parent")
            if st.form_submit_button("Kategoriyi oluştur", key=f"{prefix}_create"):
                try:
                    db.kategori_kaydet(name, parent=parent)
                    st.toast("Kategori oluşturuldu")
                    st.rerun()
                except ValueError as exc:
                    _error(exc)
    display = categories.rename(columns={"name": "Kategori", "parent": "Üst kategori"}).copy()
    display["Tür"] = display["builtin"].map({True: "Hazır", False: "Özel", 1: "Hazır", 0: "Özel"})
    st.dataframe(display[["Kategori", "Üst kategori", "Tür"]], hide_index=True, width="stretch")
    if custom.empty:
        return
    with st.expander("Özel kategoriyi düzenle veya sil"):
        selected = st.selectbox("Düzenlenen kategori", custom["name"].tolist(), key=f"{prefix}_edit_selected")
        row = custom[custom["name"] == selected].iloc[0]
        options = [None] + [n for n in names if n != selected]
        current_parent = row["parent"] if row["parent"] in options else None
        with st.form(f"{prefix}_edit_{selected}"):
            renamed = st.text_input("Kategori adı", value=selected, key=f"{prefix}_rename_{selected}")
            parent = st.selectbox("Yeni üst kategori", options, index=options.index(current_parent),
                                  format_func=lambda x: x or "Üst kategori yok")
            if st.form_submit_button("Kategoriyi güncelle"):
                try:
                    db.kategori_kaydet(renamed, parent=parent, old_name=selected)
                    st.toast("Kategori güncellendi")
                    st.rerun()
                except ValueError as exc:
                    _error(exc)
        replacement = st.selectbox("Silinen kategorinin kayıtları taşınacak kategori", [n for n in names if n != selected],
                                   index=[n for n in names if n != selected].index("Diğer"), key=f"{prefix}_replace")
        if st.button("Kategoriyi sil ve kayıtları taşı", key=f"{prefix}_delete"):
            try:
                db.kategori_sil(selected, replacement)
                st.rerun()
            except ValueError as exc:
                _error(exc)


def detail_key(row, prefix="all"):
    snapshot = {k: row.get(k) for k in ("category", "display_name", "note", "tags", "reviewed", "splits")}
    revision = hashlib.sha256(json.dumps(snapshot, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()[:8]
    return prefix + "_" + hashlib.sha256(row["movement_ref"].encode()).hexdigest()[:14] + "_" + revision


def render_detail(row, prefix="all"):
    ref = row["movement_ref"]
    key = detail_key(row, prefix)
    editable_category = row["tur"] in ("harcama", "indirim", "gider")
    categories = [k for k in db.kategori_listesi() if not editable_category or k != "Ödeme"]
    if row["category"] not in categories:
        categories.append(row["category"])
    st.subheader("İşlem ayrıntısı")
    st.metric(TUR.get(row["tur"], row["tur"]), ui.tl(row["amount"]))
    st.caption(f"{row['date']} · {row['account_label']} · {'Ekstre' if row['source'] == 'ekstre' else 'Manuel'}")
    with st.form(f"detail_form_{key}"):
        name = st.text_input("Görünen işlem adı", value=row.get("display_name") or row["desc"], key=f"detail_name_{key}")
        category = st.selectbox("İşlemin kategorisi", categories, index=categories.index(row["category"]),
                                 disabled=not editable_category, key=f"detail_category_{key}")
        tags = st.text_input("Etiketler", value=", ".join(row.get("tags") or []), placeholder="Tatil, Ev, İş",
                             key=f"detail_tags_{key}")
        note = st.text_area("Not", value=row.get("note") or "", key=f"detail_note_{key}")
        reviewed = st.checkbox("İncelendi", value=bool(row.get("reviewed")), key=f"detail_reviewed_{key}")
        if st.form_submit_button("Ayrıntıları kaydet", type="primary", key=f"detail_save_{key}"):
            try:
                db.hareket_guncelle(ref, category=category if editable_category else None, note=note,
                                    tags=tags_from_text(tags), reviewed=reviewed, display_name=name)
                st.toast("İşlem ayrıntıları kaydedildi")
                st.rerun()
            except ValueError as exc:
                _error(exc)
    st.caption(f"Kaynak açıklama: {row['desc']}")
    if not editable_category:
        st.caption("Gelir, transfer ve kart ödemesi harcama bütçesine dahil edilmez.")
        return
    with st.expander(f"Kategorilere böl · {int(row.get('split_count') or 0)} bölüm"):
        st.caption("Bölümler ana tutarı değiştirmez. Bütçe ve raporlarda yalnızca bölümler kullanılır.")
        parts = row.get("splits") or []
        if parts:
            data = [{"Kategori": x["category"], "Tutar": abs(float(x.get("amount", x.get("amount_cents", 0) / 100))),
                     "Not": x.get("note") or ""} for x in parts]
        else:
            data = [{"Kategori": row["category"], "Tutar": abs(float(row["amount"])), "Not": ""}]
        edited = st.data_editor(pd.DataFrame(data), num_rows="dynamic", hide_index=True, width="stretch",
                               key=f"split_editor_{key}",
                               column_config={"Kategori": st.column_config.SelectboxColumn(options=categories, required=True),
                                              "Tutar": st.column_config.NumberColumn(min_value=0.01, format="%.2f TL", required=True)})
        total = pd.to_numeric(edited["Tutar"], errors="coerce").fillna(0).sum()
        st.caption(f"Bölümler {ui.tl(total)} / Ana tutar {ui.tl(abs(row['amount']))}")
        a, b = st.columns(2)
        if a.button("Bölümleri kaydet", key=f"split_save_{key}"):
            try:
                payload = [{"category": r["Kategori"], "amount": r["Tutar"], "note": r.get("Not") or ""} for r in edited.to_dict("records")]
                db.bolum_kaydet(ref, payload)
                st.toast("Bölümler kaydedildi")
                st.rerun()
            except (ValueError, TypeError) as exc:
                _error(exc)
        if parts and b.button("Bölümleri kaldır", key=f"split_remove_{key}"):
            db.bolum_sil(ref)
            st.rerun()


def render_rules():
    st.subheader("İşlem kuralları")
    st.caption("Bir koşul eşleştiğinde kategori, etiket veya görünen ad atayın. Kaydetmeden önce etkisini önizleyin.")
    rules = db.kurallar_df()
    labels = {int(r.id): f"{r.priority} · {r.name}" + (" · pasif" if not r.active else "") for r in rules.itertuples()}
    pending = st.session_state.pop("_rule_pending", None)
    if pending in labels:
        st.session_state["rule_selected"] = pending
    selected = st.selectbox("Düzenlenen kural", [None] + list(labels), key="rule_selected",
                            format_func=lambda x: "Yeni kural" if x is None else labels[x])
    record = rules[rules["id"] == selected].iloc[0].to_dict() if selected is not None else {}
    conditions, actions = record.get("conditions") or {}, record.get("actions") or {}
    cards, accounts = db.kartlar_df(), db.hesaplar_df()
    card_labels = {int(r.id): f"{r.bank} · {r.name}" for r in cards.itertuples()}
    account_labels = {int(r.id): r.name for r in accounts.itertuples()}
    categories = [k for k in db.kategori_listesi() if k != "Ödeme"]
    cats = [None] + categories
    sources = [None, "ekstre", "manuel"]
    types = [None, "harcama", "indirim", "gider", "gelir", "odeme", "kart_odeme", "transfer"]
    token = str(selected or "new")
    with st.container(border=True):
        with st.form(f"rule_form_{token}"):
            a, b, c = st.columns([3, 1, 1])
            name = a.text_input("Kural adı", value=record.get("name") or "", key=f"rule_name_{token}")
            priority = b.number_input("Öncelik", min_value=1, max_value=9999, value=int(record.get("priority") or 100), step=10)
            active = c.checkbox("Etkin", value=bool(record.get("active", True)))
            merchant = st.text_input("Açıklama içerir", value=conditions.get("merchant_contains") or "", key=f"rule_merchant_{token}")
            a, b, c = st.columns(3)
            card_options = [None] + list(card_labels)
            card = a.selectbox("Kural kartı", card_options, index=card_options.index(conditions.get("card_id")) if conditions.get("card_id") in card_options else 0,
                               format_func=lambda x: card_labels.get(x, "Tüm kartlar"))
            account_options = [None] + list(account_labels)
            account = b.selectbox("Kural hesabı", account_options, index=account_options.index(conditions.get("account_id")) if conditions.get("account_id") in account_options else 0,
                                  format_func=lambda x: account_labels.get(x, "Tüm hesaplar"))
            kind = c.selectbox("Kural işlem türü", types, index=types.index(conditions.get("tur")) if conditions.get("tur") in types else 0,
                               format_func=lambda x: TUR.get(x, "Tüm türler"))
            a, b, c = st.columns(3)
            low = a.number_input("En az tutar (TL)", min_value=0.0, value=float(conditions.get("min_amount") or 0), step=10.0)
            high = b.number_input("En çok tutar (TL, 0 = sınırsız)", min_value=0.0, value=float(conditions.get("max_amount") or 0), step=10.0)
            source = c.selectbox("Kural kaynağı", sources, index=sources.index(conditions.get("source")) if conditions.get("source") in sources else 0,
                                 format_func=lambda x: {"ekstre": "Ekstre", "manuel": "Manuel"}.get(x, "Tüm kaynaklar"))
            a, b = st.columns(2)
            category = a.selectbox("Atanacak kategori", cats, index=cats.index(actions.get("category")) if actions.get("category") in cats else 0,
                                   format_func=lambda x: x or "Değiştirme", key=f"rule_category_{token}")
            tag_text = b.text_input("Eklenecek etiketler", value=", ".join(actions.get("tags") or []), key=f"rule_tags_{token}")
            display_name = st.text_input("Atanacak görünen ad", value=actions.get("display_name") or "", key=f"rule_display_{token}")
            reviewed_options = ["Değiştirme", "İncelendi", "Bekliyor"]
            reviewed_default = "İncelendi" if actions.get("reviewed") is True else "Bekliyor" if actions.get("reviewed") is False else "Değiştirme"
            reviewed = st.selectbox("İnceleme durumu", reviewed_options, index=reviewed_options.index(reviewed_default))
            a, b = st.columns(2)
            preview = a.form_submit_button("Etkiyi önizle", key=f"rule_preview_{token}")
            save = b.form_submit_button("Kuralı kaydet", type="primary", key=f"rule_save_{token}")
        new_conditions = {k: v for k, v in {"merchant_contains": merchant.strip(), "card_id": card, "account_id": account,
                          "min_amount": low if low else None, "max_amount": high if high else None, "tur": kind, "source": source}.items() if v is not None and v != ""}
        new_actions = {k: v for k, v in {"category": category, "tags": tags_from_text(tag_text) or None,
                       "display_name": display_name.strip() or None,
                       "reviewed": None if reviewed == "Değiştirme" else reviewed == "İncelendi"}.items() if v is not None}
        if preview:
            try:
                frame = db.kural_onizle(conditions=new_conditions, actions=new_actions)
                st.session_state["rule_preview"] = frame.to_dict("records")
            except ValueError as exc:
                _error(exc)
        if save:
            try:
                ident = db.kural_kaydet(name, new_conditions, new_actions, priority=int(priority), active=active, id=selected)
                st.session_state["_rule_pending"] = ident
                st.session_state.pop("rule_preview", None)
                st.toast("Kural kaydedildi")
                st.rerun()
            except ValueError as exc:
                _error(exc)
    if "rule_preview" in st.session_state:
        frame = pd.DataFrame(st.session_state["rule_preview"])
        st.caption(f"Önizleme · {len(frame)} eşleşen hareket · Henüz kayıt değiştirilmedi")
        if not frame.empty:
            st.dataframe(frame.rename(columns={"movement_ref": "Kayıt", "before_category": "Önceki kategori", "after_category": "Yeni kategori",
                                               "before_name": "Önceki ad", "after_name": "Yeni ad"}), hide_index=True, width="stretch")
    if selected is not None:
        a, b = st.columns(2)
        if a.button("Kayıtlı kuralı mevcut hareketlere uygula", key="rule_apply"):
            try:
                count = db.kural_uygula(selected)
                st.toast(f"{count} hareket güncellendi")
                st.rerun()
            except ValueError as exc:
                _error(exc)
        if b.button("Kuralı sil", key="rule_delete"):
            db.kural_sil(selected)
            st.session_state.pop("rule_selected", None)
            st.session_state.pop("rule_preview", None)
            st.rerun()
    if not rules.empty:
        st.caption("Küçük öncelik değeri önce çalışır. Kayıtlı kurallar yeni hareketlerde de değerlendirilir.")
        st.dataframe(rules[["name", "priority", "active"]].rename(columns={"name": "Kural", "priority": "Öncelik", "active": "Etkin"}),
                     hide_index=True, width="stretch")
