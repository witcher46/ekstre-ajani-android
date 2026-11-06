"""Kullanıcıya özel işlem işaretleri, bölümler, kategoriler ve otomasyonlar.

Finansal ana hareketler değişmez; ekstre mutabakatı daima ana hareketi kullanır.
Bu tablolar mantıksal hareket referanslarına bağlıdır; ekstre yenilenirken aynı
hareketin not/etiketleri fiziksel DELETE/INSERT sırasında kaybolmaz.
"""
import json
import re
import sqlite3
from importlib import import_module

import pandas as pd

import money
from parsers import temizle


class _Database:
    """Şema db.py yüklenirken okunabilir; gerçek erişim çağrı anında çözülür."""
    def __getattr__(self, name):
        return getattr(import_module("db"), name)


db = _Database()

SCHEMA = """
CREATE TABLE custom_categories (user_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,parent TEXT,
 PRIMARY KEY(user_id,name));
CREATE TABLE movement_meta (user_id INTEGER NOT NULL REFERENCES users(id),ref TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',
 tags TEXT NOT NULL DEFAULT '[]',reviewed INTEGER NOT NULL DEFAULT 0 CHECK(reviewed IN (0,1)),
 display_name TEXT NOT NULL DEFAULT '',splits TEXT NOT NULL DEFAULT '[]',manual_fields TEXT NOT NULL DEFAULT '[]',
 PRIMARY KEY(user_id,ref));
CREATE TABLE saved_filters (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),
 name TEXT NOT NULL,filters TEXT NOT NULL,UNIQUE(user_id,name));
CREATE TABLE automation_rules (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),
 name TEXT NOT NULL,priority INTEGER NOT NULL DEFAULT 100,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 conditions TEXT NOT NULL,actions TEXT NOT NULL);
CREATE INDEX rules_user_priority ON automation_rules(user_id,active,priority,id);
"""


def _json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _builtins():
    import categorizer as cz
    return list(cz.KURALLAR) + list(cz.OZEL)


def _categories(c, uid=None):
    uid = db.user_id() if uid is None else uid
    return _builtins() + [r[0] for r in c.execute("SELECT name FROM custom_categories WHERE user_id=? ORDER BY name", (uid,))]


def kategori_listesi(include_special=True):
    with db.baglanti() as c:
        values = _categories(c)
    return values if include_special else [v for v in values if v not in ("Ödeme", "İndirim / İade")]


def kategoriler_df():
    rows = [{"name": value, "parent": None, "builtin": True} for value in _builtins()]
    with db.baglanti() as c:
        rows.extend({"name": r[0], "parent": r[1], "builtin": False}
                    for r in c.execute("SELECT name,parent FROM custom_categories WHERE user_id=? ORDER BY name", (db.user_id(),)))
    return pd.DataFrame(rows, columns=["name", "parent", "builtin"])


def _category(c, category, uid=None):
    if str(category) not in _categories(c, uid):
        raise ValueError("Bu profile ait geçerli bir kategori seçin.")
    return str(category)


def _replace_category(c, old, new):
    uid = db.user_id()
    for table in ("tx", "account_ledger", "merchant_rules", "recurring"):
        c.execute(f"UPDATE {table} SET category=? WHERE user_id=? AND category=?", (new, uid, old))
    for row in c.execute("SELECT period,limit_cents FROM budgets WHERE user_id=? AND category=?", (uid, old)).fetchall():
        existing = c.execute("SELECT limit_cents FROM budgets WHERE user_id=? AND period=? AND category=?", (uid, row[0], new)).fetchone()
        value = row[1] + (existing[0] if existing else 0)
        c.execute("INSERT OR REPLACE INTO budgets VALUES (?,?,?,?,?)", (uid, row[0], new, money.amount(value), value))
    c.execute("DELETE FROM budgets WHERE user_id=? AND category=?", (uid, old))
    c.execute("UPDATE custom_categories SET parent=? WHERE user_id=? AND parent=?", (new, uid, old))
    for row in c.execute("SELECT ref,splits FROM movement_meta WHERE user_id=?", (uid,)).fetchall():
        parts = json.loads(row[1])
        changed = False
        for part in parts:
            if part["category"] == old:
                part["category"], changed = new, True
        if changed:
            c.execute("UPDATE movement_meta SET splits=? WHERE user_id=? AND ref=?", (_json(parts), uid, row[0]))
    for row in c.execute("SELECT id,actions FROM automation_rules WHERE user_id=?", (uid,)).fetchall():
        actions = json.loads(row[1])
        if actions.get("category") == old:
            actions["category"] = new
            c.execute("UPDATE automation_rules SET actions=? WHERE id=?", (_json(actions), row[0]))


def kategori_kaydet(name, parent=None, old_name=None):
    name = str(name or "").strip()
    parent = str(parent).strip() if parent else None
    if not name or len(name) > 80 or name.startswith("__"):
        raise ValueError("1–80 karakterlik bir kategori adı girin.")
    with db.baglanti() as c:
        current = _categories(c)
        if old_name in _builtins():
            raise ValueError("Yerleşik kategorilerin adı değiştirilemez.")
        if old_name:
            if not c.execute("SELECT 1 FROM custom_categories WHERE user_id=? AND name=?", (db.user_id(), old_name)).fetchone():
                raise ValueError("Kategori bulunamadı.")
        if name != old_name and any(v.casefold() == name.casefold() for v in current):
            raise ValueError("Bu kategori zaten var.")
        if parent:
            _category(c, parent)
            ancestry, value = {name}, parent
            while value:
                if value in ancestry or (old_name and value == old_name):
                    raise ValueError("Kategori kendisinin alt kategorisi olamaz.")
                ancestry.add(value)
                r = c.execute("SELECT parent FROM custom_categories WHERE user_id=? AND name=?", (db.user_id(), value)).fetchone()
                value = r[0] if r else None
        if old_name:
            c.execute("UPDATE custom_categories SET name=?,parent=? WHERE user_id=? AND name=?", (name, parent, db.user_id(), old_name))
            if old_name != name:
                _replace_category(c, old_name, name)
        else:
            c.execute("INSERT INTO custom_categories VALUES (?,?,?)", (db.user_id(), name, parent))
    return name


def kategori_sil(name, replacement="Diğer"):
    if name in _builtins():
        raise ValueError("Yerleşik kategori silinemez.")
    if name == replacement:
        raise ValueError("Farklı bir taşıma kategorisi seçin.")
    with db.baglanti() as c:
        _category(c, name)
        _category(c, replacement)
        _replace_category(c, name, replacement)
        c.execute("UPDATE custom_categories SET parent=NULL WHERE user_id=? AND name=?", (db.user_id(), replacement))
        c.execute("DELETE FROM custom_categories WHERE user_id=? AND name=?", (db.user_id(), name))


def _tags(value):
    if isinstance(value, str):
        value = value.split(",")
    if value is None:
        return []
    result = list(dict.fromkeys(str(item).strip() for item in value if str(item).strip()))
    if len(result) > 30 or any(len(item) > 50 for item in result):
        raise ValueError("En fazla 30 etiket ve etiket başına 50 karakter kullanın.")
    return result


def _movement(c, ref, uid=None):
    uid = db.user_id() if uid is None else uid
    if not isinstance(ref, str) or len(ref) < 3 or ref[:2] not in ("K:", "H:"):
        raise ValueError("Geçerli bir hareket seçin.")
    table = "tx" if ref.startswith("K:") else "account_ledger"
    row = db._owned(c, table, ref[2:], uid)
    r = dict(row)
    r["movement_ref"], r["kind"] = ref, "kart" if ref.startswith("K:") else "hesap"
    r["category_override"] = r.get("category_override", 0)
    return r


def _meta(c, ref, uid=None):
    uid = db.user_id() if uid is None else uid
    row = c.execute("SELECT * FROM movement_meta WHERE user_id=? AND ref=?", (uid, ref)).fetchone()
    if row is None:
        return {"note": "", "tags": [], "reviewed": False, "display_name": "", "splits": [], "manual_fields": []}
    value = dict(row)
    for key in ("tags", "splits", "manual_fields"):
        value[key] = json.loads(value[key])
    value["reviewed"] = bool(value["reviewed"])
    return value


def _write_meta(c, ref, value, uid=None):
    uid = db.user_id() if uid is None else uid
    c.execute("""INSERT INTO movement_meta(user_id,ref,note,tags,reviewed,display_name,splits,manual_fields)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,ref) DO UPDATE SET note=excluded.note,tags=excluded.tags,
      reviewed=excluded.reviewed,display_name=excluded.display_name,splits=excluded.splits,manual_fields=excluded.manual_fields""",
      (uid, ref, value["note"], _json(value["tags"]), int(value["reviewed"]), value["display_name"], _json(value["splits"]), _json(value["manual_fields"])))


def enrich_frame(frame, prefix):
    frame = frame.copy()
    with db.baglanti() as c:
        metadata = {r["ref"]: dict(r) for r in c.execute("SELECT * FROM movement_meta WHERE user_id=?", (db.user_id(),))}
    values = []
    for _, row in frame.iterrows():
        ref = prefix + str(row["id"])
        raw = metadata.get(ref, {})
        values.append({"movement_ref": ref, "ref": ref, "note": raw.get("note", ""), "notes": raw.get("note", ""),
                       "tags": json.loads(raw.get("tags", "[]")), "reviewed": bool(raw.get("reviewed", False)),
                       "display_name": raw.get("display_name") or row["desc"], "splits": json.loads(raw.get("splits", "[]"))})
    for column in ("movement_ref", "ref", "note", "notes", "tags", "reviewed", "display_name", "splits"):
        frame[column] = pd.Series([v[column] for v in values], index=frame.index, dtype=object)
    frame["split_count"] = [len(v["splits"]) for v in values]
    return frame


def hareketler_df():
    card, ledger = db.islemler_df(), db.hesap_hareketleri_df()
    card = card.copy()
    ledger = ledger.copy()
    card["kind"], ledger["kind"] = "kart", "hesap"
    card["account_id"] = None
    card["account_label"] = [str(r.bank) + (" · " + str(r.kart) if r.kart else "") for r in card.itertuples()]
    ledger["period"] = ledger["date"].astype(str).str[:7]
    ledger["source"] = "manuel"
    ledger["account_label"] = ledger["hesap"]
    # Kart ödeme kaydı kart tarafında zaten listelenir. Hesaptaki nakit çıkışı
    # hesap geçmişinde korunur; ortak masada tek finansal olay olarak gösterilir.
    linked = set(ledger.loc[ledger.tur == "kart_odeme", "linked_tx_id"].dropna())
    if linked:
        all_cards = db.islemler_df(include_matched=True)
        hidden_ids = set()
        for _, row in all_cards[all_cards.id.isin(linked)].iterrows():
            hidden_ids.add(row.id)
            if pd.notna(row.matched_tx_id):
                hidden_ids.add(row.matched_tx_id)
        card = card[~card.id.isin(hidden_ids)]
    result = pd.concat([card, ledger], ignore_index=True, sort=False)
    if len(result):
        result = result.sort_values(["date", "id"], ascending=[False, False], kind="stable")
    return result.reset_index(drop=True)


def _update(c, ref, category=None, note=None, tags=None, reviewed=None, display_name=None, manual=True, uid=None):
    uid = db.user_id() if uid is None else uid
    row = _movement(c, ref, uid)
    meta = _meta(c, ref, uid)
    if category is not None:
        _category(c, category, uid)
        if category == "Ödeme":
            raise ValueError("Harcama veya gelir ödeme kategorisine atanamaz.")
        if row["tur"] in ("odeme", "transfer", "kart_odeme"):
            raise ValueError("Transfer ve kart ödemelerinin kategorisi değiştirilemez.")
        table = "tx" if ref.startswith("K:") else "account_ledger"
        clause = ",category_override=1" if manual and table == "tx" else ""
        c.execute(f"UPDATE {table} SET category=?{clause} WHERE id=? AND user_id=?", (category, ref[2:], uid))
    provided = {"note": note, "tags": tags, "reviewed": reviewed, "display_name": display_name}
    for key, value in provided.items():
        if value is None:
            continue
        if key == "tags":
            value = _tags(value)
        elif key == "reviewed":
            value = bool(value)
        else:
            value = str(value).strip()
            if len(value) > (5000 if key == "note" else 200):
                raise ValueError("Not veya işlem adı çok uzun.")
        meta[key] = value
        if manual and key not in meta["manual_fields"]:
            meta["manual_fields"].append(key)
    _write_meta(c, ref, meta, uid)


def hareket_guncelle(ref, category=None, note=None, tags=None, reviewed=None, display_name=None):
    with db.baglanti() as c:
        _update(c, ref, category, note, tags, reviewed, display_name)


def toplu_guncelle(refs, category=None, tags=None, reviewed=None):
    refs = list(dict.fromkeys(refs))
    if not refs:
        return 0
    with db.baglanti() as c:
        for ref in refs:
            merged = None if tags is None else list(dict.fromkeys(_meta(c, ref)["tags"] + _tags(tags)))
            _update(c, ref, category=category, tags=merged, reviewed=reviewed)
    return len(refs)


def bolum_kaydet(ref, parts):
    with db.baglanti() as c:
        row, result = _movement(c, ref), []
        if row["tur"] not in ("harcama", "indirim", "gider"):
            raise ValueError("Yalnızca alışveriş, gider veya iade bölünebilir.")
        if not isinstance(parts, list) or not 2 <= len(parts) <= 50:
            raise ValueError("2–50 bölüm girin.")
        sign = -1 if row["tur"] == "indirim" else 1
        for part in parts:
            category = _category(c, part.get("category"))
            if category == "Ödeme":
                raise ValueError("Harcama bölümü ödeme kategorisine atanamaz.")
            raw = part.get("amount_cents") if "amount_cents" in part else money.cents(part.get("amount"))
            value = abs(int(raw or 0))
            if value <= 0:
                raise ValueError("Bölüm tutarları sıfırdan büyük olmalı.")
            result.append({"category": category, "amount_cents": sign * value, "amount": sign * money.amount(value),
                           "note": str(part.get("note") or "").strip()[:500]})
        if sum(abs(r["amount_cents"]) for r in result) != abs(row["amount_cents"]):
            raise ValueError("Bölüm tutarlarının toplamı ana hareket tutarıyla kuruşu kuruşuna aynı olmalı.")
        meta = _meta(c, ref)
        meta["splits"] = result
        if "splits" not in meta["manual_fields"]:
            meta["manual_fields"].append("splits")
        _write_meta(c, ref, meta)
    return result


def bolum_sil(ref):
    with db.baglanti() as c:
        _movement(c, ref)
        meta = _meta(c, ref)
        meta["splits"] = []
        _write_meta(c, ref, meta)


def filtreler_df():
    with db.baglanti() as c:
        frame = pd.read_sql("SELECT id,name,filters FROM saved_filters WHERE user_id=? ORDER BY name,id", c, params=(db.user_id(),))
    frame["filters"] = frame.filters.map(json.loads)
    return frame


def filtre_kaydet(name, filters, id=None):
    name = str(name or "").strip()
    if not name or len(name) > 100 or not isinstance(filters, dict):
        raise ValueError("Filtre adı ve ayarlarını kontrol edin.")
    value = _json(filters)
    if len(value) > 20000:
        raise ValueError("Filtre çok büyük.")
    try:
        with db.baglanti() as c:
            if id is None:
                return c.execute("INSERT INTO saved_filters(user_id,name,filters) VALUES (?,?,?)", (db.user_id(), name, value)).lastrowid
            db._owned(c, "saved_filters", int(id))
            c.execute("UPDATE saved_filters SET name=?,filters=? WHERE id=?", (name, value, int(id)))
            return int(id)
    except sqlite3.IntegrityError as exc:
        raise ValueError("Bu adla bir kayıtlı filtre var.") from exc


def filtre_sil(id):
    with db.baglanti() as c:
        db._owned(c, "saved_filters", int(id))
        c.execute("DELETE FROM saved_filters WHERE id=?", (int(id),))


def _rule_validate(c, conditions, actions):
    if not isinstance(conditions, dict) or not isinstance(actions, dict) or not actions:
        raise ValueError("Kural koşulları ve en az bir eylem girin.")
    if set(conditions) - {"merchant_contains", "card_id", "account_id", "min_amount", "max_amount", "tur", "source"}:
        raise ValueError("Desteklenmeyen kural koşulu.")
    if set(actions) - {"category", "tags", "display_name", "reviewed"}:
        raise ValueError("Desteklenmeyen kural eylemi.")
    cond, act = dict(conditions), dict(actions)
    if "merchant_contains" in cond:
        cond["merchant_contains"] = str(cond["merchant_contains"] or "").strip()
        if len(cond["merchant_contains"]) > 200:
            raise ValueError("Mağaza koşulu en fazla 200 karakter olabilir.")
    if cond.get("tur") and cond["tur"] not in ("harcama", "indirim", "odeme", "gelir", "gider", "transfer", "kart_odeme"):
        raise ValueError("Kural işlem türü geçersiz.")
    if cond.get("source") and cond["source"] not in ("ekstre", "manuel"):
        raise ValueError("Kural kaynağı geçersiz.")
    for key, table in (("card_id", "cards"), ("account_id", "accounts")):
        if cond.get(key) is not None:
            db._owned(c, table, int(cond[key]))
            cond[key] = int(cond[key])
    for key in ("min_amount", "max_amount"):
        if cond.get(key) is not None:
            val = money.cents(cond[key])
            if val < 0:
                raise ValueError("Kural tutarı negatif olamaz.")
            cond[key] = money.amount(val)
    if cond.get("min_amount") is not None and cond.get("max_amount") is not None and cond["min_amount"] > cond["max_amount"]:
        raise ValueError("En küçük tutar en büyük tutarı aşamaz.")
    if "category" in act:
        _category(c, act["category"])
        if act["category"] == "Ödeme":
            raise ValueError("Kural ile ödeme kategorisi atanamaz.")
    if "tags" in act:
        act["tags"] = _tags(act["tags"])
    if "display_name" in act:
        act["display_name"] = str(act["display_name"]).strip()
        if not act["display_name"] or len(act["display_name"]) > 200:
            raise ValueError("Kural işlem adı 1–200 karakter olmalı.")
    if "reviewed" in act:
        act["reviewed"] = bool(act["reviewed"])
    return cond, act


def kurallar_df():
    with db.baglanti() as c:
        frame = pd.read_sql("SELECT id,name,priority,active,conditions,actions FROM automation_rules WHERE user_id=? ORDER BY priority,id", c, params=(db.user_id(),))
    for key in ("conditions", "actions"):
        frame[key] = frame[key].map(json.loads)
    return frame


def kural_kaydet(name, conditions, actions, priority=100, active=True, id=None):
    name = str(name or "").strip()
    if not name or len(name) > 100 or not 0 <= int(priority) <= 10000:
        raise ValueError("Kural adı ve önceliğini kontrol edin.")
    with db.baglanti() as c:
        cond, act = _rule_validate(c, conditions, actions)
        fields = (name, int(priority), int(bool(active)), _json(cond), _json(act))
        if id is None:
            return c.execute("INSERT INTO automation_rules(user_id,name,priority,active,conditions,actions) VALUES (?,?,?,?,?,?)", (db.user_id(), *fields)).lastrowid
        db._owned(c, "automation_rules", int(id))
        c.execute("UPDATE automation_rules SET name=?,priority=?,active=?,conditions=?,actions=? WHERE id=?", (*fields, int(id)))
        return int(id)


def kural_sil(id):
    with db.baglanti() as c:
        db._owned(c, "automation_rules", int(id))
        c.execute("DELETE FROM automation_rules WHERE id=?", (int(id),))


def _rule_match(row, conditions):
    for key, value in conditions.items():
        if value is None or value == "":
            continue
        if key == "merchant_contains":
            if temizle(str(value)).casefold() not in temizle(str(row.get("desc", ""))).casefold():
                return False
        elif key == "min_amount":
            if abs(int(row["amount_cents"])) < money.cents(value):
                return False
        elif key == "max_amount":
            if abs(int(row["amount_cents"])) > money.cents(value):
                return False
        elif key in ("card_id", "account_id"):
            raw = row.get(key)
            if raw is None or pd.isna(raw) or int(raw) != int(value):
                return False
        elif row.get(key) != value:
            return False
    return True


def _preview_frame(rows, actions):
    cols = ["movement_ref", "ref", "date", "desc", "amount", "before_category", "after_category", "before_name", "after_name", "actions"]
    return pd.DataFrame([{"movement_ref": r["movement_ref"], "ref": r["movement_ref"], "date": r["date"],
                         "desc": r["desc"], "amount": money.amount(r["amount_cents"]), "before_category": r["category"],
                         "after_category": actions.get("category", r["category"]), "before_name": r.get("display_name") or r["desc"],
                         "after_name": actions.get("display_name", r.get("display_name") or r["desc"]), "actions": dict(actions)} for r in rows], columns=cols)


def kural_onizle(id=None, conditions=None, actions=None, refs=None):
    refs = None if refs is None else list(dict.fromkeys(refs))
    with db.baglanti() as c:
        if id is not None:
            r = db._owned(c, "automation_rules", int(id))
            conditions, actions = json.loads(r["conditions"]), json.loads(r["actions"])
        else:
            conditions, actions = _rule_validate(c, conditions or {}, actions or {})
        if refs is not None:
            for ref in refs:
                _movement(c, ref)
    frame = hareketler_df()
    rows = [r for r in frame.to_dict("records") if (refs is None or r["movement_ref"] in refs)
            and _rule_match(r, conditions) and not ("category" in actions and r["tur"] in ("odeme", "transfer", "kart_odeme"))]
    return _preview_frame(rows, actions)


def kural_uygula(id, refs=None):
    preview = kural_onizle(id=id, refs=refs)
    with db.baglanti() as c:
        for row in preview.itertuples():
            actions = dict(row.actions)
            if "tags" in actions:
                actions["tags"] = list(dict.fromkeys(_meta(c, row.movement_ref)["tags"] + actions["tags"]))
            _update(c, row.movement_ref, **actions)
    return len(preview)


def auto_apply(c, ref, uid=None):
    uid = db.user_id() if uid is None else uid
    row = _movement(c, ref, uid)
    row.setdefault("source", "manuel")
    meta = _meta(c, ref, uid)
    for rule in c.execute("SELECT * FROM automation_rules WHERE user_id=? AND active=1 ORDER BY priority,id", (uid,)).fetchall():
        if not _rule_match(row, json.loads(rule["conditions"])):
            continue
        actions = json.loads(rule["actions"])
        if row["tur"] in ("odeme", "transfer", "kart_odeme") or row.get("category_override"):
            actions.pop("category", None)
        for field in meta["manual_fields"]:
            actions.pop(field, None)
        if "tags" in actions:
            actions["tags"] = list(dict.fromkeys(meta["tags"] + actions["tags"]))
        if actions:
            _update(c, ref, manual=False, uid=uid, **actions)
        break


def preserve_reimport(c, old_row, new_row):
    old_ref, new_ref = "K:" + old_row["id"], "K:" + new_row["id"]
    old_meta = _meta(c, old_ref)
    if old_row["amount_cents"] != new_row["amount_cents"]:
        old_meta["splits"], old_meta["reviewed"] = [], False
    _write_meta(c, new_ref, old_meta)


def transfer_manual_meta(c, manual_id, target_id):
    source = _meta(c, "K:" + manual_id)
    target = _meta(c, "K:" + target_id)
    target["tags"] = list(dict.fromkeys(target["tags"] + source["tags"]))
    target["note"] = target["note"] or source["note"]
    target["display_name"] = target["display_name"] or source["display_name"]
    target["reviewed"] = target["reviewed"] or source["reviewed"]
    target["splits"] = target["splits"] or source["splits"]
    target["manual_fields"] = list(dict.fromkeys(target["manual_fields"] + source["manual_fields"]))
    _write_meta(c, "K:" + target_id, target)


def cleanup(c):
    uid = db.user_id()
    c.execute("""DELETE FROM movement_meta WHERE user_id=? AND
       ((substr(ref,1,2)='K:' AND NOT EXISTS(SELECT 1 FROM tx WHERE tx.id=substr(movement_meta.ref,3) AND tx.user_id=movement_meta.user_id))
       OR (substr(ref,1,2)='H:' AND NOT EXISTS(SELECT 1 FROM account_ledger WHERE account_ledger.id=substr(movement_meta.ref,3) AND account_ledger.user_id=movement_meta.user_id)))""", (uid,))
