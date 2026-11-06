"""Kullanıcıya göre ayrılmış cüzdan verisi, atomik ekstre yenileme ve kuruş hesapları."""
import calendar
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import threading
import uuid
from collections import Counter, defaultdict
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import money
import zaman
import mobile_storage
from parsers import taksit_ayir, temizle

DB = mobile_storage.data_dir() / "harcamalar.db"
BUTCE_JSON = mobile_storage.data_dir() / "budget.json"
SURUM = 3
TOPLAM_HEDEF = "__toplam__"
_USER = ContextVar("wallet_user", default=1)
_HEADER_MONEY = ("onceki_borc", "donem_borcu", "asgari", "kart_limit", "kullanilabilir_limit", "hdr_harcama", "hdr_odeme", "kalan_taksit")
_PASSWORD_ITERATIONS = 310_000
_INIT_LOCK = threading.RLock()


def _simdi():
    return datetime.now().isoformat(timespec="seconds")


def _bugun():
    return zaman.bugun() if hasattr(zaman, "bugun") else date.today()


def user_id():
    return int(_USER.get())


@contextmanager
def baglanti():
    DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB, timeout=20)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    c.execute("PRAGMA busy_timeout=20000")
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def _tablo_var(c, ad):
    return c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (ad,)).fetchone() is not None


def _kolonlar(c, tablo):
    return {r[1] for r in c.execute(f"PRAGMA table_info({tablo})")}


def _rows(c, table):
    return [dict(r) for r in c.execute(f'SELECT * FROM "{table}"')] if _tablo_var(c, table) else []


_SCHEMA = """
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE COLLATE NOCASE,
 salt TEXT NOT NULL DEFAULT '',password_hash TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE TABLE cards (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),
 bank TEXT NOT NULL,name TEXT NOT NULL DEFAULT '',card_ref TEXT NOT NULL DEFAULT '',
 faiz_aylik REAL CHECK(faiz_aylik IS NULL OR faiz_aylik BETWEEN 0 AND 1),created_at TEXT,UNIQUE(id,user_id));
CREATE UNIQUE INDEX cards_reference ON cards(user_id,bank,card_ref) WHERE card_ref!='';
CREATE TABLE statements (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),
 card_id INTEGER NOT NULL,period TEXT NOT NULL,kesim TEXT,son_odeme TEXT,next_kesim TEXT,next_son_odeme TEXT,
 onceki_borc REAL,donem_borcu REAL,asgari REAL,kart_limit REAL,kullanilabilir_limit REAL,hdr_harcama REAL,hdr_odeme REAL,kalan_taksit REAL,
 onceki_borc_cents INTEGER,donem_borcu_cents INTEGER,asgari_cents INTEGER,kart_limit_cents INTEGER,
 kullanilabilir_limit_cents INTEGER,hdr_harcama_cents INTEGER,hdr_odeme_cents INTEGER,kalan_taksit_cents INTEGER,
 faiz_aylik REAL,kaynak_dosya TEXT,yuklendi TEXT,
 FOREIGN KEY(card_id,user_id) REFERENCES cards(id,user_id),UNIQUE(card_id,period),UNIQUE(id,user_id,card_id));
CREATE TABLE tx (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),bank TEXT,period TEXT NOT NULL,
 date TEXT NOT NULL,"desc" TEXT NOT NULL,original_desc TEXT,merchant_key TEXT NOT NULL,
 amount_cents INTEGER NOT NULL,amount REAL NOT NULL,category TEXT NOT NULL,installment TEXT NOT NULL DEFAULT '',
 tur TEXT NOT NULL CHECK(tur IN ('harcama','indirim','odeme')),card_id INTEGER NOT NULL,statement_id INTEGER,
 source TEXT NOT NULL CHECK(source IN ('ekstre','manuel')),inst_no INTEGER,inst_total INTEGER,
 plan_id TEXT,purchase_date TEXT,import_key TEXT,category_override INTEGER NOT NULL DEFAULT 0 CHECK(category_override IN (0,1)),
 matched_tx_id TEXT REFERENCES tx(id) ON DELETE SET NULL,match_status TEXT NOT NULL DEFAULT 'bekliyor',
 FOREIGN KEY(card_id,user_id) REFERENCES cards(id,user_id),
 FOREIGN KEY(statement_id,user_id,card_id) REFERENCES statements(id,user_id,card_id),
 CHECK((tur='indirim' AND amount_cents<=0) OR (tur IN ('harcama','odeme') AND amount_cents>=0)),
 CHECK((inst_no IS NULL AND inst_total IS NULL) OR (inst_no>=1 AND inst_total>=inst_no)),UNIQUE(id,user_id));
CREATE INDEX tx_card_period ON tx(user_id,card_id,period);
CREATE INDEX tx_statement ON tx(statement_id);
CREATE INDEX tx_merchant ON tx(user_id,merchant_key);
CREATE UNIQUE INDEX tx_manual_match ON tx(matched_tx_id) WHERE matched_tx_id IS NOT NULL;
CREATE TABLE budgets (user_id INTEGER NOT NULL REFERENCES users(id),period TEXT NOT NULL DEFAULT '',category TEXT NOT NULL,
 monthly_limit REAL NOT NULL,limit_cents INTEGER NOT NULL CHECK(limit_cents>=0),PRIMARY KEY(user_id,period,category));
CREATE TABLE budget_periods (user_id INTEGER NOT NULL REFERENCES users(id),period TEXT NOT NULL,PRIMARY KEY(user_id,period));
CREATE TABLE merchant_rules (user_id INTEGER NOT NULL REFERENCES users(id),merchant_key TEXT NOT NULL,category TEXT NOT NULL,
 PRIMARY KEY(user_id,merchant_key));
CREATE TABLE match_rejections (user_id INTEGER NOT NULL REFERENCES users(id),manual_id TEXT NOT NULL REFERENCES tx(id) ON DELETE CASCADE,
 tx_id TEXT NOT NULL REFERENCES tx(id) ON DELETE CASCADE,PRIMARY KEY(manual_id,tx_id));
CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,
 tur TEXT NOT NULL CHECK(tur IN ('banka','nakit')),currency TEXT NOT NULL DEFAULT 'TRY',opening_cents INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,UNIQUE(user_id,name),UNIQUE(id,user_id));
CREATE TABLE account_ledger (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),account_id INTEGER NOT NULL,
 hedef_hesap_id INTEGER,card_id INTEGER,date TEXT NOT NULL,"desc" TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 tur TEXT NOT NULL CHECK(tur IN ('gelir','gider','transfer','kart_odeme')),category TEXT NOT NULL,
 linked_tx_id TEXT REFERENCES tx(id) ON DELETE SET NULL,created_at TEXT NOT NULL,
 FOREIGN KEY(account_id,user_id) REFERENCES accounts(id,user_id),FOREIGN KEY(hedef_hesap_id,user_id) REFERENCES accounts(id,user_id),
 FOREIGN KEY(card_id,user_id) REFERENCES cards(id,user_id),
 CHECK(tur!='transfer' OR (hedef_hesap_id IS NOT NULL AND hedef_hesap_id!=account_id)),
 CHECK(tur!='kart_odeme' OR card_id IS NOT NULL));
CREATE INDEX ledger_account ON account_ledger(user_id,account_id,date);
CREATE TABLE recurring (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),next_date TEXT NOT NULL,
 frequency TEXT NOT NULL CHECK(frequency IN ('gunluk','haftalik','aylik','uc_aylik','yillik')),
 anchor_day INTEGER NOT NULL CHECK(anchor_day BETWEEN 1 AND 31),category TEXT NOT NULL,card_id INTEGER,account_id INTEGER,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),last_paid TEXT,
 FOREIGN KEY(card_id,user_id) REFERENCES cards(id,user_id),FOREIGN KEY(account_id,user_id) REFERENCES accounts(id,user_id),
 CHECK(card_id IS NULL OR account_id IS NULL));
CREATE TABLE settings (user_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(user_id,name));
"""

_SCHEMA_V2 = _SCHEMA
import feature_store as _features
_SCHEMA = _SCHEMA_V2 + _features.SCHEMA


def init():
    """v0/v1 verisini önce yedekler, tek işlemde taşır; günde bir yerel yedek alır."""
    with _INIT_LOCK:
        _init_locked()


def _init_locked():
    with baglanti() as c:
        version = c.execute("PRAGMA user_version").fetchone()[0]
        exists = bool(c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchone())
    if version > SURUM:
        raise ValueError("Veritabanı bu uygulamadan daha yeni bir sürümde. Uygulamayı güncelleyin.")
    if version < SURUM:
        if exists:
            _yedekle(version)
        _upgrade(version)
    _daily_backup()


def _backup_to(target):
    target.parent.mkdir(parents=True, exist_ok=True)
    with baglanti() as c:
        dst = sqlite3.connect(target)
        try:
            c.backup(dst)
        finally:
            dst.close()
    return target


def _yedekle(surum):
    target = DB.with_name(f"{DB.stem}.v{surum}.yedek.db")
    if target.exists():
        target = DB.with_name(f"{DB.stem}.v{surum}.{uuid.uuid4().hex[:8]}.yedek.db")
    return _backup_to(target)


def _upgrade(version):
    with baglanti() as c:
        c.execute("PRAGMA foreign_keys=OFF")
        c.execute("BEGIN IMMEDIATE")
        if c.execute("PRAGMA user_version").fetchone()[0] >= SURUM:
            return
        if version == 2:
            for statement in _features.SCHEMA.split(";"):
                if statement.strip():
                    c.execute(statement)
            c.execute(f"PRAGMA user_version={SURUM}")
            return
        legacy = {name: _rows(c, name) for name in ("cards", "statements", "tx", "budgets", "ozet")}
        for name in ("tx", "statements", "cards", "budgets", "ozet"):
            if _tablo_var(c, name):
                c.execute(f'ALTER TABLE "{name}" RENAME TO "legacy_v{version}_{name}"')
        for statement in _SCHEMA.split(";"):
            if statement.strip():
                c.execute(statement)
        c.execute("INSERT INTO users(id,name,created_at) VALUES (1,'Yerel kullanıcı',?)", (_simdi(),))
        cmap = {}
        for old in legacy["cards"]:
            c.execute("INSERT INTO cards(id,user_id,bank,name,created_at) VALUES (?,1,?,?,?)",
                      (old["id"], old.get("bank") or "Diğer", old.get("name") or "", old.get("created_at") or _simdi()))
            cmap[old.get("bank")] = old["id"]
        for old in legacy["ozet"] + legacy["tx"]:
            bank = old.get("bank") or "Diğer"
            if bank not in cmap:
                cmap[bank] = c.execute("INSERT INTO cards(user_id,bank,name,created_at) VALUES (1,?,?,?)", (bank, old.get("kart") or "", _simdi())).lastrowid
        valid = {r[0] for r in c.execute("SELECT id FROM cards")}
        smap = {}
        for old in legacy["statements"]:
            if old.get("card_id") not in valid:
                continue
            summary = dict(old, period=_legacy_period(old.get("period"), old.get("kesim")), borc=old.get("donem_borcu"))
            smap[old["id"]] = _statement_upsert(c, old["card_id"], summary, old.get("kaynak_dosya") or "", uid=1)
        for old in legacy["ozet"]:
            _statement_upsert(c, cmap[old.get("bank") or "Diğer"], dict(old, period=_legacy_period(old.get("period"), old.get("kesim"))), "", uid=1)
        rules = {}
        mapping = DB.parent / "merchant_map.json"
        if mapping.exists():
            try:
                rules = json.loads(mapping.read_text(encoding="utf-8"))
            except (ValueError, OSError):
                rules = {}
        if not isinstance(rules, dict):
            rules = {}
        c.executemany("INSERT OR IGNORE INTO merchant_rules VALUES (1,?,?)", [(str(k), str(v)) for k, v in rules.items()])
        for old in legacy["tx"]:
            cid = old.get("card_id") if old.get("card_id") in valid else cmap[old.get("bank") or "Diğer"]
            when = _legacy_date(old.get("date"))
            period = _legacy_period(old.get("period"), when)
            source = "manuel" if old.get("source") == "manuel" else "ekstre"
            sid = smap.get(old.get("statement_id"))
            if source == "ekstre" and sid is None:
                sid = _statement_upsert(c, cid, {"period": period}, "", uid=1)
            raw = dict(old, date=when, period=period)
            if raw.get("category") == "Taksitli alışveriş":
                import categorizer as cz
                raw["category"] = rules.get(old.get("merchant_key")) or cz.kural_ile(temizle(old.get("desc") or "").upper()) or "Diğer"
            _insert_tx(c, str(old.get("id") or uuid.uuid4().hex), cid, sid, raw, source, uid=1,
                       override=bool(old.get("category")))
        for old in legacy["budgets"]:
            value = money.cents(old.get("monthly_limit")) or 0
            if value > 0:
                c.execute("INSERT OR REPLACE INTO budgets VALUES (1,'',?,?,?)", (old["category"], money.amount(value), value))
        if BUTCE_JSON.exists():
            try:
                for category, raw in json.loads(BUTCE_JSON.read_text(encoding="utf-8")).items():
                    value = money.cents(raw) or 0
                    if value > 0:
                        c.execute("INSERT OR IGNORE INTO budgets VALUES (1,'',?,?,?)", (category, money.amount(value), value))
            except (ValueError, OSError, AttributeError):
                pass
        for name in ("tx", "statements", "cards", "budgets", "ozet"):
            if _tablo_var(c, f"legacy_v{version}_{name}"):
                c.execute(f'DROP TABLE "legacy_v{version}_{name}"')
        if c.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("Eski verinin ilişkileri doğrulanamadı; geçiş öncesi yedek korundu.")
        c.execute(f"PRAGMA user_version={SURUM}")


def _legacy_date(value):
    raw = str(value or "").strip()
    if raw:
        try:
            return date.fromisoformat(raw).isoformat()
        except ValueError:
            pass
        for pattern in ("%d.%m.%Y", "%d/%m/%Y"):
            try:
                return datetime.strptime(raw, pattern).date().isoformat()
            except ValueError:
                pass
    raise ValueError("Eski veride tarih okunamadı. YYYY-AA-GG, GG.AA.YYYY veya GG/AA/YYYY biçimini kullanın; geçiş öncesi yedek korundu.")


def _legacy_period(value, when=None):
    return str(value) if re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", str(value)) else _legacy_date(when)[:7]


def _period(value):
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", str(value)):
        raise ValueError("Ekstre dönemi YYYY-AA biçiminde olmalı.")
    return str(value)


def _date(value):
    try:
        return date.fromisoformat(str(value)).isoformat()
    except (ValueError, TypeError) as exc:
        raise ValueError("Geçerli bir tarih girin.") from exc


def _digest(value):
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()


def _ref(value):
    value = str(value or "").strip()
    return value.lower() if re.fullmatch(r"[a-fA-F0-9]{64}", value) else (_digest(value) if value else "")


def _desc(value):
    return re.sub(r"\s+", " ", temizle(str(value or "")).upper()).strip()


def _merchant(value):
    import categorizer as cz
    return cz.anahtar(str(value or ""))


def _owned(c, table, ident, uid=None):
    row = c.execute(f'SELECT * FROM "{table}" WHERE id=? AND user_id=?', (ident, user_id() if uid is None else uid)).fetchone()
    if row is None:
        raise ValueError("Kayıt bulunamadı veya bu kullanıcıya ait değil.")
    return row


def set_user(ident):
    with baglanti() as c:
        if c.execute("SELECT 1 FROM users WHERE id=?", (int(ident),)).fetchone() is None:
            raise ValueError("Kullanıcı bulunamadı.")
    _USER.set(int(ident))


def users_df():
    with baglanti() as c:
        return pd.read_sql("SELECT id,name,CASE WHEN password_hash!='' THEN 1 ELSE 0 END AS has_password FROM users ORDER BY id", c)


def user_get():
    with baglanti() as c:
        row = c.execute("SELECT id,name,CASE WHEN password_hash!='' THEN 1 ELSE 0 END AS has_password FROM users WHERE id=?", (user_id(),)).fetchone()
    return dict(row) if row else None


def _password(password):
    password = str(password or "")
    if password and len(password) < 8:
        raise ValueError("Parola en az 8 karakter olmalı.")
    salt = secrets.token_hex(24) if password else ""
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _PASSWORD_ITERATIONS).hex() if password else ""
    return salt, digest


def user_create(name, password):
    name = str(name or "").strip()
    if not name or not password:
        raise ValueError("Kullanıcı adı ve en az 8 karakterli parola girin.")
    salt, hashed = _password(password)
    try:
        with baglanti() as c:
            return c.execute("INSERT INTO users(name,salt,password_hash,created_at) VALUES (?,?,?,?)", (name, salt, hashed, _simdi())).lastrowid
    except sqlite3.IntegrityError as exc:
        raise ValueError("Bu kullanıcı adı zaten var.") from exc


def user_auth(name, password):
    with baglanti() as c:
        row = c.execute("SELECT * FROM users WHERE name=? COLLATE NOCASE", (str(name).strip(),)).fetchone()
    if not row:
        return None
    if not row["password_hash"]:
        return int(row["id"]) if not password else None
    digest = hashlib.pbkdf2_hmac("sha256", str(password or "").encode(), row["salt"].encode(), _PASSWORD_ITERATIONS).hex()
    return int(row["id"]) if hmac.compare_digest(digest, row["password_hash"]) else None


def user_password(ident, password):
    if int(ident) != user_id():
        raise ValueError("Yalnızca kendi parolanızı değiştirebilirsiniz.")
    if not password and int(ident) != 1:
        raise ValueError("Parola boş bırakılamaz.")
    salt, hashed = _password(password)
    with baglanti() as c:
        c.execute("UPDATE users SET salt=?,password_hash=? WHERE id=?", (salt, hashed, int(ident)))


def kartlar_df():
    with baglanti() as c:
        return pd.read_sql("SELECT id,bank,name,card_ref,faiz_aylik FROM cards WHERE user_id=? ORDER BY id", c, params=(user_id(),))


def kart_getir(kart_id):
    with baglanti() as c:
        row = c.execute("SELECT id,bank,name,card_ref,faiz_aylik FROM cards WHERE id=? AND user_id=?", (int(kart_id), user_id())).fetchone()
    return dict(row) if row else None


def kart_bul_veya_olustur(bank, name="", card_ref=None):
    bank, name, ref = str(bank or "").strip(), str(name or "").strip(), _ref(card_ref)
    if not bank:
        raise ValueError("Banka adı girin.")
    with baglanti() as c:
        if ref:
            row = c.execute("SELECT id FROM cards WHERE user_id=? AND bank=? AND card_ref=?", (user_id(), bank, ref)).fetchone()
            if row:
                return int(row[0])
        candidates = c.execute("SELECT * FROM cards WHERE user_id=? AND bank=? AND name=?", (user_id(), bank, name)).fetchall()
        compatible = [row for row in candidates if not ref or not row["card_ref"] or row["card_ref"] == ref]
        if len(compatible) == 1:
            row = compatible[0]
            if ref and not row["card_ref"]:
                c.execute("UPDATE cards SET card_ref=? WHERE id=?", (ref, row["id"]))
            return int(row["id"])
        if len(compatible) > 1:
            raise ValueError("Aynı adla birden fazla kart var. Ekstreyi yüklerken kartı açıkça seçin.")
        unnamed = c.execute("SELECT * FROM cards WHERE user_id=? AND bank=? AND name='' AND card_ref=''", (user_id(), bank)).fetchall()
        if len(unnamed) == 1 and name:
            row = unnamed[0]
            c.execute("UPDATE cards SET name=?,card_ref=? WHERE id=?", (name, ref, row["id"]))
            return int(row["id"])
        return c.execute("INSERT INTO cards(user_id,bank,name,card_ref,created_at) VALUES (?,?,?,?,?)", (user_id(), bank, name, ref, _simdi())).lastrowid


def kart_adini_doldur(kart_id, name):
    with baglanti() as c:
        _owned(c, "cards", int(kart_id))
        if name:
            c.execute("UPDATE cards SET name=? WHERE id=? AND name=''", (str(name).strip(), int(kart_id)))


def kart_ref_doldur(kart_id, card_ref):
    ref = _ref(card_ref)
    if ref:
        with baglanti() as c:
            row = _owned(c, "cards", int(kart_id))
            if row["card_ref"] and row["card_ref"] != ref:
                raise ValueError("PDF seçili kartla eşleşmiyor. Doğru kartı seçin.")
            c.execute("UPDATE cards SET card_ref=? WHERE id=?", (ref, int(kart_id)))


def kart_faiz_guncelle(kart_id, rate_or_None):
    value = None if rate_or_None is None else float(rate_or_None)
    if value is not None and not (0 <= value <= 1):
        raise ValueError("Aylık faiz oranı 0–1 aralığında olmalı.")
    with baglanti() as c:
        _owned(c, "cards", int(kart_id))
        c.execute("UPDATE cards SET faiz_aylik=? WHERE id=?", (value, int(kart_id)))


def _statement_upsert(c, card_id, summary, filename, uid=None):
    uid = user_id() if uid is None else uid
    _owned(c, "cards", int(card_id), uid)
    values = {name: summary.get("borc" if name == "donem_borcu" else name) for name in _HEADER_MONEY}
    cents = {name + "_cents": money.cents(value) for name, value in values.items()}
    values = {name: money.amount(cents[name + "_cents"]) for name in values}
    fields = dict(user_id=uid, card_id=int(card_id), period=_period(summary["period"]),
                  **{name: _date(summary[name]) if summary.get(name) else None for name in ("kesim", "son_odeme", "next_kesim", "next_son_odeme")},
                  **values, **cents, faiz_aylik=summary.get("faiz_aylik"), kaynak_dosya=Path(filename).name if filename else "", yuklendi=_simdi())
    names = list(fields)
    c.execute(f"INSERT INTO statements ({','.join(names)}) VALUES ({','.join('?' for _ in names)}) ON CONFLICT(card_id,period) DO UPDATE SET "
              + ",".join(f"{name}=excluded.{name}" for name in names if name not in ("user_id", "card_id", "period")), tuple(fields.values()))
    return int(c.execute("SELECT id FROM statements WHERE card_id=? AND period=?", (int(card_id), summary["period"])).fetchone()[0])


def _insert_tx(c, ident, card_id, sid, row, source, uid=None, import_key=None, override=0, automate=True):
    uid = user_id() if uid is None else uid
    card = _owned(c, "cards", int(card_id), uid)
    kind = row.get("tur") or "harcama"
    if kind not in ("harcama", "odeme", "indirim"):
        raise ValueError("İşlem türü geçersiz.")
    value = money.cents(row.get("amount", 0)) or 0
    value = -abs(value) if kind == "indirim" else abs(value)
    installment = str(row.get("installment") or "").strip()
    no, total = taksit_ayir(installment)
    if installment and (no is None or total is None):
        raise ValueError("Taksit bilgisi geçersiz; örneğin 2/6 biçiminde olmalı.")
    no, total = row.get("inst_no", no), row.get("inst_total", total)
    if no is not None and total is not None:
        no, total = int(no), int(total)
        if not (1 <= no <= total):
            raise ValueError("Taksit numarası ve toplamı geçersiz.")
    else:
        no = total = None
    description = str(row.get("desc") or "İşlem").strip()
    category = str(row.get("category") or ("Ödeme" if kind == "odeme" else "İndirim / İade" if kind == "indirim" else "Diğer"))
    if category == "Otomatik":
        category = "İndirim / İade" if kind == "indirim" else "Diğer"
    fields = dict(id=ident, user_id=uid, bank=card["bank"], period=_period(row["period"]), date=_date(row["date"]),
                  desc=description, original_desc=row.get("original_desc") or description,
                  merchant_key=row.get("merchant_key") or _merchant(description), amount_cents=value, amount=money.amount(value),
                  category=category, installment=f"{no}/{total}" if no is not None else "", tur=kind, card_id=int(card_id),
                  statement_id=sid, source=source, inst_no=no, inst_total=total,
                  plan_id=row.get("plan_id") or row.get("plan_key"), purchase_date=row.get("purchase_date"),
                  import_key=import_key, category_override=int(override), match_status="ekstre" if source == "ekstre" else "bekliyor")
    names = list(fields)
    c.execute(f"INSERT INTO tx ({','.join(chr(34)+name+chr(34) for name in names)}) VALUES ({','.join('?' for _ in names)})", tuple(fields.values()))
    if automate:
        _features.auto_apply(c, "K:" + ident, uid)


def _signature(row):
    return (row["card_id"], row["date"], row["tur"], int(row["amount_cents"]), _merchant(row["desc"]))


def _reconcile_manuals(c, card_id):
    for row in c.execute("SELECT id,date FROM tx WHERE user_id=? AND card_id=? AND source='manuel'", (user_id(), card_id)).fetchall():
        c.execute("UPDATE tx SET period=? WHERE id=?", (_manuel_donem(c, card_id, row["date"]), row["id"]))
    manuals = c.execute("SELECT * FROM tx WHERE user_id=? AND card_id=? AND source='manuel' AND matched_tx_id IS NULL", (user_id(), card_id)).fetchall()
    imported = c.execute("SELECT * FROM tx WHERE user_id=? AND card_id=? AND source='ekstre' AND id NOT IN (SELECT matched_tx_id FROM tx WHERE matched_tx_id IS NOT NULL)", (user_id(), card_id)).fetchall()
    mg, tg = defaultdict(list), defaultdict(list)
    for row in manuals:
        mg[_signature(row)].append(row)
    for row in imported:
        tg[_signature(row)].append(row)
    for key, group in mg.items():
        matches = tg.get(key, [])
        if len(group) == 1 and len(matches) == 1:
            manual, target = group[0], matches[0]
            if not c.execute("SELECT 1 FROM match_rejections WHERE manual_id=? AND tx_id=?", (manual["id"], target["id"])).fetchone():
                if manual["category_override"]:
                    c.execute("UPDATE tx SET category=?,category_override=1 WHERE id=?", (manual["category"], target["id"]))
                c.execute("UPDATE tx SET matched_tx_id=?,match_status='eslesti' WHERE id=?", (target["id"], manual["id"]))
                _features.transfer_manual_meta(c, manual["id"], target["id"])


def ice_aktar(card_id, ozet, satirlar, dosya_adi=""):
    """Aynı kart/dönemin ekstre satırlarını atomik yeniler; manuel kayıtları korur."""
    card_id, period = int(card_id), _period(ozet["period"])
    with baglanti() as c:
        card = _owned(c, "cards", card_id)
        if ozet.get("bank") and card["bank"] != ozet["bank"]:
            raise ValueError("PDF bankası seçili kartla eşleşmiyor.")
        ref = _ref(ozet.get("card_ref"))
        if ref and card["card_ref"] and card["card_ref"] != ref:
            raise ValueError("PDF seçili kartla eşleşmiyor.")
        if ref and not card["card_ref"]:
            c.execute("UPDATE cards SET card_ref=? WHERE id=?", (ref, card_id))
        sid = _statement_upsert(c, card_id, ozet, dosya_adi)
        old = [dict(row) for row in c.execute("SELECT * FROM tx WHERE statement_id=? AND source='ekstre' AND user_id=?", (sid, user_id()))]
        old_ids = {row["id"] for row in old}
        all_prior = {row["import_key"]: row for row in old if row["import_key"]}
        all_fallback = defaultdict(list)
        for row in old:
            all_fallback[(row["date"], _desc(row["desc"]), row["tur"], row["installment"])].append(row)
        overrides = {row["import_key"]: row for row in old if row["category_override"] and row["import_key"]}
        fallback = defaultdict(list)
        for row in old:
            if row["category_override"]:
                fallback[(row["date"], _desc(row["desc"]), row["tur"], row["installment"])].append(row)
        matches = {row["id"]: row["matched_tx_id"] for row in c.execute("SELECT id,matched_tx_id FROM tx WHERE user_id=? AND matched_tx_id IN (SELECT id FROM tx WHERE statement_id=?)", (user_id(), sid))}
        rejected = [tuple(row) for row in c.execute("SELECT r.user_id,r.manual_id,r.tx_id FROM match_rejections r JOIN tx t ON t.id=r.tx_id WHERE t.statement_id=? AND r.user_id=?", (sid, user_id()))]
        c.execute("DELETE FROM tx WHERE statement_id=? AND source='ekstre' AND user_id=?", (sid, user_id()))
        c.execute("UPDATE tx SET match_status='bekliyor' WHERE source='manuel' AND matched_tx_id IS NULL AND user_id=?", (user_id(),))
        counts, new_ids = Counter(), set()
        for raw in satirlar:
            row = dict(raw, period=period)
            value = money.cents(row.get("amount", 0)) or 0
            kind = row.get("tur") or "harcama"
            value = -abs(value) if kind == "indirim" else abs(value)
            inst = str(row.get("installment") or "")
            base = (row["date"], _desc(row.get("desc")), value, kind, inst)
            counts[base] += 1
            key = _digest(json.dumps([*base, counts[base]], ensure_ascii=False))
            ident = "E" + _digest(f"{user_id()}|{card_id}|{period}|{key}")[:31]
            prior = overrides.get(key)
            potential = fallback.get((row["date"], _desc(row.get("desc")), kind, inst), [])
            if prior is None and len(potential) == 1:
                prior = potential[0]
            if prior:
                row["category"] = prior["category"]
            _insert_tx(c, ident, card_id, sid, row, "ekstre", import_key=key, override=bool(prior), automate=False)
            metadata_prior = all_prior.get(key)
            metadata_candidates = all_fallback.get((row["date"], _desc(row.get("desc")), kind, inst), [])
            if metadata_prior is None and len(metadata_candidates) == 1:
                metadata_prior = metadata_candidates[0]
            if metadata_prior:
                _features.preserve_reimport(c, metadata_prior, {"id": ident, "amount_cents": value})
            _features.auto_apply(c, "K:" + ident)
            new_ids.add(ident)
        for manual_id, target_id in matches.items():
            if target_id in new_ids:
                c.execute("UPDATE tx SET matched_tx_id=?,match_status='eslesti' WHERE id=?", (target_id, manual_id))
        c.executemany("INSERT OR IGNORE INTO match_rejections VALUES (?,?,?)", [row for row in rejected if row[2] in new_ids])
        _reconcile_manuals(c, card_id)
        _features.cleanup(c)
    return sid, len(new_ids - old_ids)


def islemler_df(include_matched=False):
    sql = """SELECT t.id,t.card_id,c.bank AS bank,c.name AS kart,t.statement_id,t.period,t.date,t."desc" AS "desc",
      t.original_desc,t.merchant_key,t.amount_cents,t.amount_cents/100.0 AS amount,t.category,t.installment,t.inst_no,t.inst_total,
      t.tur,t.source,t.plan_id,t.plan_id AS plan_key,t.purchase_date,t.import_key,t.category_override,t.matched_tx_id,t.match_status
      FROM tx t JOIN cards c ON c.id=t.card_id WHERE t.user_id=?"""
    if not include_matched:
        sql += " AND t.matched_tx_id IS NULL"
    with baglanti() as c:
        frame = pd.read_sql(sql + " ORDER BY t.date,t.rowid", c, params=(user_id(),))
    return _features.enrich_frame(frame, "K:")


yukle = islemler_df


def ekstreler_df():
    with baglanti() as c:
        return pd.read_sql("SELECT s.*,c.bank AS bank,c.name AS kart FROM statements s JOIN cards c ON c.id=s.card_id WHERE s.user_id=? ORDER BY s.period DESC,c.id", c, params=(user_id(),))


def merchant_map():
    with baglanti() as c:
        return {row[0]: row[1] for row in c.execute("SELECT merchant_key,category FROM merchant_rules WHERE user_id=?", (user_id(),))}


def merchant_rule_set(merchant_key, category):
    with baglanti() as c:
        _features._category(c, category)
        c.execute("INSERT INTO merchant_rules VALUES (?,?,?) ON CONFLICT(user_id,merchant_key) DO UPDATE SET category=excluded.category", (user_id(), str(merchant_key), str(category)))


def kategori_guncelle(merchant_key, kategori, islem_id=None):
    import categorizer as cz
    if kategori not in cz.kategoriler() or kategori == "Ödeme":
        raise ValueError("Geçerli bir harcama kategorisi seçin.")
    with baglanti() as c:
        if islem_id:
            _owned(c, "tx", islem_id)
            c.execute("UPDATE tx SET category=?,category_override=1 WHERE id=? AND user_id=? AND tur!='odeme'", (kategori, islem_id, user_id()))
        else:
            c.execute("UPDATE tx SET category=?,category_override=1 WHERE user_id=? AND merchant_key=? AND tur!='odeme'", (kategori, user_id(), merchant_key))
            c.execute("INSERT INTO merchant_rules VALUES (?,?,?) ON CONFLICT(user_id,merchant_key) DO UPDATE SET category=excluded.category", (user_id(), merchant_key, kategori))


def _manuel_donem(c, card_id, tarih):
    d = date.fromisoformat(_date(tarih))
    actual = c.execute("SELECT period,kesim,next_kesim FROM statements WHERE user_id=? AND card_id=? AND kesim IS NOT NULL ORDER BY kesim", (user_id(), int(card_id))).fetchall()
    references = {row["period"]: {"period": row["period"], "kesim": row["kesim"]} for row in actual}
    for row in actual:
        if row["next_kesim"]:
            period = zaman.donem_ekle(row["period"], 1)
            references.setdefault(period, {"period": period, "kesim": row["next_kesim"]})
    rows = list(references.values())
    if not rows:
        return d.strftime("%Y-%m")
    same_month = [row for row in rows if row["kesim"][:7] == d.strftime("%Y-%m")]
    reference = same_month[0] if same_month else min(rows, key=lambda row: abs((date.fromisoformat(row["kesim"]) - d).days))
    cutoff = date.fromisoformat(reference["kesim"])
    diff = (d.year - cutoff.year) * 12 + d.month - cutoff.month
    projected = date(d.year, d.month, min(cutoff.day, calendar.monthrange(d.year, d.month)[1]))
    return zaman.donem_ekle(reference["period"], diff + int(d > projected))


def _manuel_insert(c, card_id, tarih_iso, aciklama, tutar, tur, kategori, category_auto=False):
    _owned(c, "cards", int(card_id))
    if tur not in ("harcama", "odeme", "indirim") or (money.cents(tutar) or 0) == 0 or not str(aciklama).strip():
        raise ValueError("İşlem türü, açıklama ve tutarı kontrol edin.")
    if tur != "odeme":
        _features._category(c, kategori)
    ident = "M" + uuid.uuid4().hex
    _insert_tx(c, ident, int(card_id), None,
               dict(date=_date(tarih_iso), period=_manuel_donem(c, card_id, tarih_iso), desc=str(aciklama).strip(),
                    amount=tutar, tur=tur, category="Ödeme" if tur == "odeme" else kategori), "manuel", override=not category_auto)
    return ident


def manuel_ekle(card_id, tarih_iso, aciklama, tutar, tur, kategori, category_auto=False):
    with baglanti() as c:
        ident = _manuel_insert(c, card_id, tarih_iso, aciklama, tutar, tur, kategori, category_auto=category_auto)
        _reconcile_manuals(c, int(card_id))
        return ident


def manuel_sil(idler):
    ids = list(idler)
    if not ids:
        return 0
    with baglanti() as c:
        placeholders = ",".join("?" for _ in ids)
        own = [row[0] for row in c.execute(f"SELECT id FROM tx WHERE user_id=? AND source='manuel' AND id IN ({placeholders})", (user_id(), *ids))]
        for ident in own:
            c.execute("DELETE FROM account_ledger WHERE linked_tx_id=? AND user_id=?", (ident, user_id()))
            c.execute("DELETE FROM tx WHERE id=?", (ident,))
        _features.cleanup(c)
        return len(own)


def eslesme_adaylari_df():
    sql = """SELECT m.id AS manual_id,t.id AS tx_id,m.card_id,m.date,m."desc" AS manual_desc,t."desc" AS "desc",
      m.amount_cents/100.0 AS amount,m.tur FROM tx m JOIN tx t
      ON t.card_id=m.card_id AND t.date=m.date AND t.amount_cents=m.amount_cents AND t.tur=m.tur
      WHERE m.user_id=? AND t.user_id=m.user_id AND m.source='manuel' AND t.source='ekstre' AND m.matched_tx_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM tx x WHERE x.matched_tx_id=t.id)
      AND NOT EXISTS(SELECT 1 FROM match_rejections r WHERE r.manual_id=m.id AND r.tx_id=t.id) ORDER BY m.date,m.id,t.id"""
    with baglanti() as c:
        return pd.read_sql(sql, c, params=(user_id(),))


def eslestir(manual_id, statement_tx_id):
    with baglanti() as c:
        manual, target = _owned(c, "tx", manual_id), _owned(c, "tx", statement_tx_id)
        if manual["source"] != "manuel" or target["source"] != "ekstre" or manual["card_id"] != target["card_id"] or manual["amount_cents"] != target["amount_cents"] or manual["tur"] != target["tur"]:
            raise ValueError("Eşleştirilecek işlemlerin kartı, türü ve tutarı aynı olmalı.")
        if c.execute("SELECT 1 FROM tx WHERE matched_tx_id=? AND id!=?", (statement_tx_id, manual_id)).fetchone():
            raise ValueError("Bu ekstre işlemi zaten başka bir kayıtla eşleşmiş.")
        if manual["category_override"] and target["tur"] != "odeme":
            c.execute("UPDATE tx SET category=?,category_override=1 WHERE id=?", (manual["category"], statement_tx_id))
        c.execute("UPDATE tx SET matched_tx_id=?,match_status='eslesti' WHERE id=?", (statement_tx_id, manual_id))
        _features.transfer_manual_meta(c, manual_id, statement_tx_id)


def eslesme_reddet(manual_id, statement_tx_id):
    with baglanti() as c:
        _owned(c, "tx", manual_id)
        _owned(c, "tx", statement_tx_id)
        c.execute("INSERT OR IGNORE INTO match_rejections VALUES (?,?,?)", (user_id(), manual_id, statement_tx_id))


def butceler(period=None):
    p = "" if period is None else _period(period)
    with baglanti() as c:
        if p and not c.execute("SELECT 1 FROM budget_periods WHERE user_id=? AND period=?", (user_id(), p)).fetchone():
            p = ""
        return {row[0]: money.amount(row[1]) for row in c.execute("SELECT category,limit_cents FROM budgets WHERE user_id=? AND period=?", (user_id(), p))}


def butce_kaydet(d, period=None):
    p, values = "" if period is None else _period(period), []
    for category, raw in d.items():
        value = money.cents(raw) or 0
        if value < 0:
            raise ValueError("Bütçe negatif olamaz.")
        if value:
            values.append((user_id(), p, str(category), money.amount(value), value))
    with baglanti() as c:
        for _, _, category, _, _ in values:
            if category != TOPLAM_HEDEF:
                _features._category(c, category)
        c.execute("DELETE FROM budgets WHERE user_id=? AND period=?", (user_id(), p))
        c.executemany("INSERT INTO budgets VALUES (?,?,?,?,?)", values)
        if p:
            c.execute("INSERT OR IGNORE INTO budget_periods VALUES (?,?)", (user_id(), p))


def hesaplar_df():
    sql = """SELECT a.id,a.name,a.tur,a.currency,a.opening_cents,a.opening_cents/100.0 AS baslangic,
      a.opening_cents+COALESCE((SELECT SUM(CASE WHEN l.tur='gelir' OR (l.tur='transfer' AND l.hedef_hesap_id=a.id)
        THEN l.amount_cents ELSE -l.amount_cents END) FROM account_ledger l WHERE l.user_id=a.user_id
        AND (l.account_id=a.id OR (l.tur='transfer' AND l.hedef_hesap_id=a.id))),0) AS balance_cents
      FROM accounts a WHERE a.user_id=? ORDER BY a.id"""
    with baglanti() as c:
        frame = pd.read_sql(sql, c, params=(user_id(),))
    frame["bakiye"] = frame["balance_cents"] / 100.0
    return frame


def hesap_ekle(name, tur="banka", baslangic=0, currency="TRY"):
    name = str(name or "").strip()
    if not name or tur not in ("banka", "nakit"):
        raise ValueError("Hesap adı ve türünü kontrol edin.")
    if currency != "TRY":
        raise ValueError("Bu sürümde hesap para birimi Türk lirasıdır (TRY).")
    try:
        with baglanti() as c:
            return c.execute("INSERT INTO accounts(user_id,name,tur,currency,opening_cents,created_at) VALUES (?,?,?,?,?,?)", (user_id(), name, tur, currency, money.cents(baslangic) or 0, _simdi())).lastrowid
    except sqlite3.IntegrityError as exc:
        raise ValueError("Bu isimle bir hesap zaten var.") from exc


def hesap_guncelle(ident, name, baslangic=None):
    if not str(name).strip():
        raise ValueError("Hesap adı boş olamaz.")
    with baglanti() as c:
        row = _owned(c, "accounts", int(ident))
        c.execute("UPDATE accounts SET name=?,opening_cents=? WHERE id=?", (str(name).strip(), row["opening_cents"] if baslangic is None else money.cents(baslangic), int(ident)))


def hesap_sil(ident):
    with baglanti() as c:
        _owned(c, "accounts", int(ident))
        if c.execute("SELECT 1 FROM account_ledger WHERE account_id=? OR hedef_hesap_id=?", (int(ident), int(ident))).fetchone():
            raise ValueError("Hareketi olan hesap silinemez. Önce ilgili hareketleri kaldırın.")
        if c.execute("SELECT 1 FROM recurring WHERE account_id=?", (int(ident),)).fetchone():
            raise ValueError("Hesaba bağlı aboneliği önce düzenleyin.")
        c.execute("DELETE FROM accounts WHERE id=?", (int(ident),))


def hesap_hareketleri_df():
    with baglanti() as c:
        frame = pd.read_sql("SELECT l.id,l.account_id,l.hedef_hesap_id,l.card_id,l.date,l.\"desc\",l.amount_cents,l.amount_cents/100.0 AS amount,l.tur,l.category,l.linked_tx_id,a.name AS hesap,a.currency,h.name AS hedef_hesap FROM account_ledger l JOIN accounts a ON a.id=l.account_id LEFT JOIN accounts h ON h.id=l.hedef_hesap_id WHERE l.user_id=? ORDER BY l.date,l.rowid", c, params=(user_id(),))
    return _features.enrich_frame(frame, "H:")


def _ledger_insert(c, hesap_id, tarih, aciklama, tutar, tur, kategori="Diğer", hedef_hesap_id=None, kart_id=None):
    account = _owned(c, "accounts", int(hesap_id))
    value = money.cents(tutar) or 0
    if value <= 0 or not str(aciklama).strip() or tur not in ("gelir", "gider", "transfer", "kart_odeme"):
        raise ValueError("Hareket türü, açıklama ve tutarı kontrol edin.")
    if tur == "gider":
        _features._category(c, kategori)
    target, card, linked = None, None, None
    if tur == "transfer":
        if hedef_hesap_id is None or int(hedef_hesap_id) == int(hesap_id):
            raise ValueError("Transfer için farklı bir hedef hesap seçin.")
        target = _owned(c, "accounts", int(hedef_hesap_id))
        if target["currency"] != account["currency"]:
            raise ValueError("Transfer hesaplarının para birimi aynı olmalı.")
    if tur == "kart_odeme":
        if kart_id is None:
            raise ValueError("Ödeme yapılacak kartı seçin.")
        card = _owned(c, "cards", int(kart_id))
        linked = _manuel_insert(c, card["id"], _date(tarih), str(aciklama), money.amount(value), "odeme", "Ödeme")
        _reconcile_manuals(c, int(card["id"]))
    ident = "L" + uuid.uuid4().hex
    c.execute("INSERT INTO account_ledger(id,user_id,account_id,hedef_hesap_id,card_id,date,\"desc\",amount_cents,tur,category,linked_tx_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
              (ident, user_id(), int(hesap_id), target["id"] if target else None, card["id"] if card else None,
               _date(tarih), str(aciklama).strip(), value, tur, "Ödeme" if tur == "kart_odeme" else str(kategori), linked, _simdi()))
    _features.auto_apply(c, "H:" + ident)
    return ident


def hesap_hareketi_ekle(hesap_id, tarih, aciklama, tutar, tur, kategori="Diğer", hedef_hesap_id=None, kart_id=None):
    with baglanti() as c:
        return _ledger_insert(c, hesap_id, tarih, aciklama, tutar, tur, kategori, hedef_hesap_id, kart_id)


def hesap_hareketi_sil(ident):
    with baglanti() as c:
        row = _owned(c, "account_ledger", ident)
        c.execute("DELETE FROM account_ledger WHERE id=?", (ident,))
        if row["linked_tx_id"]:
            c.execute("DELETE FROM tx WHERE id=? AND source='manuel' AND user_id=?", (row["linked_tx_id"], user_id()))
        _features.cleanup(c)


def abonelikler_df():
    with baglanti() as c:
        return pd.read_sql("SELECT id,name,amount_cents,amount_cents/100.0 AS amount,next_date,frequency,anchor_day,category,card_id,account_id,active,last_paid FROM recurring WHERE user_id=? ORDER BY active DESC,next_date,id", c, params=(user_id(),))


def abonelik_kaydet(name, tutar, sonraki_tarih, siklik="aylik", kategori="Abonelik", kart_id=None, hesap_id=None, id=None, aktif=True):
    name, value, when = str(name or "").strip(), money.cents(tutar) or 0, _date(sonraki_tarih)
    if not name or value <= 0 or siklik not in ("gunluk", "haftalik", "aylik", "uc_aylik", "yillik"):
        raise ValueError("Abonelik adı, tutarı ve sıklığını kontrol edin.")
    if kart_id is not None and hesap_id is not None:
        raise ValueError("Abonelik için bir kart veya bir hesap seçin.")
    with baglanti() as c:
        _features._category(c, kategori)
        if kart_id is not None:
            _owned(c, "cards", int(kart_id))
        if hesap_id is not None:
            _owned(c, "accounts", int(hesap_id))
        fields = (name, value, when, siklik, date.fromisoformat(when).day, str(kategori),
                  int(kart_id) if kart_id is not None else None, int(hesap_id) if hesap_id is not None else None, int(bool(aktif)))
        if id is None:
            return c.execute("INSERT INTO recurring(user_id,name,amount_cents,next_date,frequency,anchor_day,category,card_id,account_id,active) VALUES (?,?,?,?,?,?,?,?,?,?)", (user_id(), *fields)).lastrowid
        _owned(c, "recurring", int(id))
        c.execute("UPDATE recurring SET name=?,amount_cents=?,next_date=?,frequency=?,anchor_day=?,category=?,card_id=?,account_id=?,active=? WHERE id=?", (*fields, int(id)))
        return int(id)


def abonelik_durum_guncelle(ident, aktif):
    with baglanti() as c:
        _owned(c, "recurring", int(ident))
        c.execute("UPDATE recurring SET active=? WHERE id=?", (int(bool(aktif)), int(ident)))


def abonelik_sil(ident):
    with baglanti() as c:
        _owned(c, "recurring", int(ident))
        c.execute("DELETE FROM recurring WHERE id=?", (int(ident),))


def _next_due(when, frequency, anchor):
    d = date.fromisoformat(when)
    if frequency in ("gunluk", "haftalik"):
        return (d + timedelta(days=1 if frequency == "gunluk" else 7)).isoformat()
    target = d.year * 12 + d.month - 1 + {"aylik": 1, "uc_aylik": 3, "yillik": 12}[frequency]
    year, month = target // 12, target % 12 + 1
    return date(year, month, min(anchor, calendar.monthrange(year, month)[1])).isoformat()


def abonelik_odendi(ident, tarih=None):
    when = _date(tarih or _bugun().isoformat())
    with baglanti() as c:
        row = _owned(c, "recurring", int(ident))
        if not row["active"] or row["last_paid"] == when:
            raise ValueError("Abonelik pasif veya bu tarihli ödeme zaten kaydedildi.")
        if row["card_id"] is not None:
            movement = _manuel_insert(c, row["card_id"], when, row["name"], money.amount(row["amount_cents"]), "harcama", row["category"])
            _reconcile_manuals(c, int(row["card_id"]))
        elif row["account_id"] is not None:
            movement = _ledger_insert(c, row["account_id"], when, row["name"], money.amount(row["amount_cents"]), "gider", row["category"])
        else:
            raise ValueError("Ödeme kaydı için aboneliğe bir kart veya hesap bağlayın.")
        next_date = _next_due(row["next_date"], row["frequency"], row["anchor_day"])
        while next_date <= when:
            next_date = _next_due(next_date, row["frequency"], row["anchor_day"])
        c.execute("UPDATE recurring SET next_date=?,last_paid=? WHERE id=?", (next_date, when, int(ident)))
        return movement


def ayar_getir(ad, default=None):
    with baglanti() as c:
        row = c.execute("SELECT value FROM settings WHERE user_id=? AND name=?", (user_id(), str(ad))).fetchone()
    if row is None:
        return default
    try:
        return json.loads(row[0])
    except ValueError:
        return default


def ayar_kaydet(ad, value):
    with baglanti() as c:
        c.execute("INSERT INTO settings VALUES (?,?,?) ON CONFLICT(user_id,name) DO UPDATE SET value=excluded.value", (user_id(), str(ad), json.dumps(value, ensure_ascii=False)))


def _backup_owner():
    if user_id() != 1:
        raise ValueError("Tüm kullanıcıları içeren yedeği yalnızca yerel yönetici kullanabilir.")


def yedek_bytes():
    _backup_owner()
    with baglanti() as c:
        dst = sqlite3.connect(":memory:")
        try:
            c.backup(dst)
            return dst.serialize()
        finally:
            dst.close()


def _daily_backup():
    target = DB.parent / "backups" / f"{DB.stem}.{_bugun().isoformat()}.db"
    if not target.exists():
        _backup_to(target)


def yedek_al():
    _backup_owner()
    return _backup_to(DB.parent / "backups" / f"{DB.stem}.{datetime.now():%Y%m%d-%H%M%S}.{uuid.uuid4().hex[:6]}.db")


def yedek_listesi():
    _backup_owner()
    return sorted((DB.parent / "backups").glob(f"{DB.stem}.*.db"), reverse=True)


def yedek_geri_yukle(data):
    """Yönetici: yedeği doğrula, güncel veriyi yedekle, SQLite backup ile geri yükle."""
    _backup_owner()
    if not isinstance(data, (bytes, bytearray)) or not data.startswith(b"SQLite format 3\x00") or len(data) > 100 * 1024 * 1024:
        raise ValueError("Geçerli, en fazla 100 MB bir cüzdan veritabanı yükleyin.")
    candidate = sqlite3.connect(":memory:")
    try:
        candidate.deserialize(bytes(data))
        if candidate.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Yedek dosyasının bütünlüğü doğrulanamadı.")
        version = candidate.execute("PRAGMA user_version").fetchone()[0]
        if version not in (2, SURUM):
            raise ValueError("Bu uygulama sürümünde alınmış bir yedek seçin.")
        # Table names alone do not establish compatibility: reject altered columns,
        # constraints, indexes, executable triggers and views before touching live data.
        expected = sqlite3.connect(":memory:")
        try:
            expected.executescript(_SCHEMA_V2 if version == 2 else _SCHEMA)
            def objects(connection):
                return {(row[0], row[1], row[2]): " ".join((row[3] or "").split())
                        for row in connection.execute("SELECT type,name,tbl_name,sql FROM sqlite_master")}
            compatible = objects(candidate) == objects(expected)
        finally:
            expected.close()
        if not compatible or candidate.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("Yedek dosyası cüzdan şemasıyla uyumlu değil.")
        if not candidate.execute("SELECT 1 FROM users WHERE id=1").fetchone():
            raise ValueError("Yedekte yerel yönetici bulunamadı.")
        if version == 2:
            candidate.executescript(_features.SCHEMA)
            candidate.execute(f"PRAGMA user_version={SURUM}")
            candidate.commit()
        yedek_al()
        with baglanti() as c:
            candidate.backup(c)
    except sqlite3.DatabaseError as exc:
        raise ValueError("Yedek dosyası okunamadı.") from exc
    finally:
        candidate.close()


# Kullanıcı akışlarının veri erişim sözleşmesi tek modülden sunulur.
kategori_listesi = _features.kategori_listesi
kategoriler_df = _features.kategoriler_df
kategori_kaydet = _features.kategori_kaydet
kategori_sil = _features.kategori_sil
hareketler_df = _features.hareketler_df
hareket_guncelle = _features.hareket_guncelle
toplu_guncelle = _features.toplu_guncelle
bolum_kaydet = _features.bolum_kaydet
bolum_sil = _features.bolum_sil
filtreler_df = _features.filtreler_df
filtre_kaydet = _features.filtre_kaydet
filtre_sil = _features.filtre_sil
kurallar_df = _features.kurallar_df
kural_kaydet = _features.kural_kaydet
kural_sil = _features.kural_sil
kural_onizle = _features.kural_onizle
kural_uygula = _features.kural_uygula
