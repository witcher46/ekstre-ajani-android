"""Ortak finans hesapları. Parasal toplamlar kuruş tamsayılarıyla hesaplanır."""
from collections import defaultdict
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import hashlib
import json
from datetime import date, timedelta

import pandas as pd

import categorizer as cz
import db
import parsers
import zaman

IZLENEN_DUZENLI = ("Abonelik", "Fatura / İnternet")
SIK_HARCAMA = ("Market / Gıda", "Akaryakıt", "Dışarıda yeme")


def _v(x):
    if x is None:
        return None
    try:
        return None if bool(pd.isna(x)) else x
    except (TypeError, ValueError):
        return x


def _kurus(x):
    try:
        n = Decimal(str(_v(x) or 0))
        return int((n * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)) if n.is_finite() else 0
    except (InvalidOperation, TypeError, ValueError):
        return 0


def _tl(c):
    return int(c) / 100


def _kolon(t, key, default=None):
    return t[key] if key in t else pd.Series(default, index=t.index)


def _normal_tx(df):
    t = df.copy() if df is not None else pd.DataFrame()
    defaults = {"id": "", "card_id": None, "statement_id": None, "bank": "", "kart": "",
                "period": "", "date": "", "desc": "", "merchant_key": "", "category": "Diğer",
                "tur": "harcama", "source": "ekstre", "inst_no": None, "inst_total": None,
                "plan_id": None, "plan_key": None, "purchase_date": None}
    for key, default in defaults.items():
        if key not in t:
            t[key] = default
    cents = [_kurus(a) for a in _kolon(t, "amount", 0)]
    if "amount_cents" in t:
        cents = [int(c) if _v(c) is not None else a for c, a in zip(t.amount_cents, cents)]
    t["amount_cents"] = [-abs(c) if k == "indirim" else abs(c) for c, k in zip(cents, t.tur)]
    t["amount"] = t.amount_cents.map(_tl)
    if "matched_tx_id" in t:
        t = t[~((t.source == "manuel") & t.matched_tx_id.notna())].copy()
    return t


def _toplam(t, tur=None):
    if tur is not None:
        t = t[t.tur.isin(tur)]
    return int(t.amount_cents.sum()) if len(t) else 0


def _baslik(s, key):
    cents = _v(s.get(key + "_cents"))
    value = _v(s.get(key))
    return int(cents) if cents is not None else (None if value is None else _kurus(value))


def yukle():
    return db.kartlar_df(), db.ekstreler_df(), db.islemler_df()


def kart_etiketi(bank, name):
    return f"{bank} · {name}" if name else str(bank or "Kart")


def net_harcama(df):
    """İadeler düşülür; kart ödemesi tüketim harcaması sayılmaz."""
    return _tl(_toplam(_normal_tx(df), ("harcama", "indirim")))


def harcama_hareketleri(tx, context=None):
    t = _normal_tx(tx)
    t = t[t.tur.isin(("harcama", "indirim"))].copy()
    ctx = _normal_tx(context if context is not None else tx)
    purchases = ctx[ctx.tur == "harcama"].sort_values("date", kind="stable")
    for idx, r in t[t.tur == "indirim"].iterrows():
        if r.category not in ("İndirim / İade", "Diğer", "", None):
            continue
        g = purchases[(purchases.card_id == r.card_id) & (purchases.merchant_key == r.merchant_key)]
        if len(g):
            earlier = g[g.date <= r.date]
            t.at[idx, "category"] = (earlier if len(earlier) else g).iloc[-1].category
    return _bolumleri_ac(t)


def _bolumleri_ac(frame):
    """Kategori raporunda ana hareketin yerine kuruş toplamı aynı alt kalemleri koyar.

    Ekstre mutabakatı ve kart bakiyesi ham hareketlerden hesaplanmaya devam eder.
    """
    if frame.empty or "splits" not in frame:
        return frame
    rows = []
    for _, row in frame.iterrows():
        parts = row.get("splits")
        if isinstance(parts, str):
            try:
                parts = json.loads(parts)
            except ValueError:
                parts = []
        if not isinstance(parts, list) or not parts:
            rows.append(row.to_dict())
            continue
        parent = int(row["amount_cents"])
        values = [int(p["amount_cents"]) if p.get("amount_cents") is not None else _kurus(p.get("amount")) for p in parts]
        # Eski veya dışarıdan gelen gösterimlerde pozitif tutarlı iadeleri normalize et.
        values = [-abs(v) if parent < 0 else abs(v) for v in values]
        if sum(values) != parent:
            raise ValueError("Bölünmüş işlem toplamı ana hareketle uyuşmuyor.")
        for number, (part, value) in enumerate(zip(parts, values)):
            child = row.to_dict()
            child.update(category=part["category"], amount_cents=value, amount=_tl(value),
                         parent_id=row.get("id"), split_index=number)
            rows.append(child)
    return pd.DataFrame(rows).reset_index(drop=True)


def _hesap_giderleri(ledger):
    cols = ["period", "category", "amount_cents", "amount"]
    if ledger is None or ledger.empty or "tur" not in ledger:
        return pd.DataFrame(columns=cols)
    g = ledger[ledger.tur == "gider"].copy()
    if g.empty:
        return pd.DataFrame(columns=cols)
    g["period"] = g.date.astype(str).str[:7]
    g["category"] = _kolon(g, "category", "Diğer").fillna("Diğer")
    g["amount_cents"] = [abs(int(c)) if _v(c) is not None else abs(_kurus(a))
                         for c, a in zip(_kolon(g, "amount_cents"), _kolon(g, "amount", 0))]
    g["amount"] = g.amount_cents.map(_tl)
    return _bolumleri_ac(g)[cols]


def kategori_toplamlari(tx, positive_only=False, context=None, ledger=None):
    h = harcama_hareketleri(tx, context)
    h = pd.concat([h[["category", "amount_cents"]], _hesap_giderleri(ledger)[["category", "amount_cents"]]], ignore_index=True)
    if h.empty:
        return pd.DataFrame(columns=["Kategori", "Tutar"])
    cat = h.groupby("category").amount_cents.sum()
    if positive_only:
        cat = cat[cat > 0]
    result = cat.sort_values(ascending=False).reset_index()
    result.columns = ["Kategori", "Tutar"]
    result["Tutar"] = result.Tutar.map(_tl)
    return result


def aylik_trend(tx, ledger=None):
    h = harcama_hareketleri(tx)
    h = pd.concat([h[["period", "category", "amount_cents"]],
                   _hesap_giderleri(ledger)[["period", "category", "amount_cents"]]], ignore_index=True)
    if h.empty:
        return pd.DataFrame(columns=["period", "category", "amount"])
    result = h.groupby(["period", "category"], as_index=False).amount_cents.sum()
    result["amount"] = result.amount_cents.map(_tl)
    return result[["period", "category", "amount"]]


DURUM_ETIKET = {"tamam": "✅ Tutuyor", "fark": "⚠️ Fark var", "eksik": "— Ekstre toplamı yok"}
GECMIS_KOLON = ["id", "Kart", "Dönem", "Kesim", "Son ödeme", "Dönem borcu", "İşlem", "Mutabakat", "Dosya", "durum"]


def mutabakat(s, t):
    t = _normal_tx(t)
    t = t[t.source != "manuel"]
    h, i, o = (_toplam(t, (kind,)) for kind in ("harcama", "indirim", "odeme"))
    hh, ho, prev, debt = (_baslik(s, key) for key in ("hdr_harcama", "hdr_odeme", "onceki_borc", "donem_borcu"))
    calc = prev + h + i - o if prev is not None else None
    values = [("Harcama (işlemlerden / ekstreden)", h, hh),
              ("Ödeme + iade/indirim", o - i, ho),
              ("Dönem borcu (önceki + harcama − ödeme)", calc, debt)]
    rows = [{"Kalem": label, "İşlemlerden": None if a is None else _tl(a),
             "Ekstre": None if b is None else _tl(b), "Fark": None if a is None or b is None else _tl(a - b)}
            for label, a, b in values]
    diffs = [a - b for _, a, b in values if a is not None and b is not None]
    status = "eksik" if not diffs else ("fark" if any(f != 0 for f in diffs) else "tamam")
    return {"satirlar": rows, "durum": status}


def ekstre_ice_aktar(dosya, kart_id=None, dosya_adi="", use_ai=False, allow_partial=False):
    ozet, rows, warning = parsers.ekstre_tam(dosya)
    # Eksik ayrıştırma var olan sağlam bir ekstreyi değiştirmesin.
    provisional = dict(ozet, donem_borcu=ozet.get("borc"))
    check = mutabakat(provisional, pd.DataFrame(rows))
    if check["durum"] == "fark" and not allow_partial:
        raise ValueError("PDF satırları ekstre toplamlarıyla uyuşmuyor; mevcut kayıtlar değiştirilmedi. "
                         "Dosyanın tüm sayfalarını yükleyin ve okunamayan satırları kontrol edin.")
    if kart_id is not None:
        card = db.kart_getir(kart_id)
        if card is None:
            raise ValueError("Seçilen kart bulunamadı.")
        if card["bank"] != ozet["bank"]:
            raise ValueError(f"Seçilen kart {card['bank']}, PDF ise {ozet['bank']} bankasına ait.")
        old_ref, new_ref = _v(card.get("card_ref")), _v(ozet.get("card_ref"))
        if old_ref and new_ref and old_ref != new_ref:
            raise ValueError("PDF farklı bir karta ait. Doğru kartı seçin veya otomatik algılamayı kullanın.")
        db.kart_adini_doldur(kart_id, ozet.get("kart", ""))
        if new_ref and hasattr(db, "kart_ref_doldur"):
            db.kart_ref_doldur(kart_id, new_ref)
    else:
        kart_id = db.kart_bul_veya_olustur(ozet["bank"], ozet.get("kart", ""), card_ref=ozet.get("card_ref"))
    rows = cz.kategorile(rows, use_ai=use_ai)
    sid, count = db.ice_aktar(kart_id, ozet, rows, dosya_adi)
    stm, tx = db.ekstreler_df(), db.islemler_df()
    s = stm[stm.id == sid].iloc[0]
    card = db.kart_getir(kart_id)
    return {"kart": kart_etiketi(card["bank"], card["name"]), "donem": ozet["period"],
            "okunan": len(rows), "yeni": count, "tekrar": max(0, len(rows) - count),
            "uyari": warning, "mutabakat": mutabakat(s, tx[tx.statement_id == sid])}


def ekstre_gecmisi(stm, tx):
    t, rows = _normal_tx(tx), []
    for _, s in stm.iterrows():
        sub = t[t.statement_id == s["id"]]
        m = mutabakat(s, sub)
        rows.append({"id": int(s["id"]), "Kart": kart_etiketi(s.get("bank"), s.get("kart")), "Dönem": s["period"],
                     "Kesim": _v(s.get("kesim")), "Son ödeme": _v(s.get("son_odeme")), "Dönem borcu": _v(s.get("donem_borcu")),
                     "İşlem": int((sub.source != "manuel").sum()), "Mutabakat": DURUM_ETIKET[m["durum"]],
                     "Dosya": _v(s.get("kaynak_dosya")) or "", "durum": m["durum"]})
    return pd.DataFrame(rows, columns=GECMIS_KOLON)


TAKSIT_KOLON = ["plan_id", "kart_id", "kart", "desc", "tarih", "aylik", "net_aylik", "indirim_bu_donem",
                "no", "toplam", "kalan_adet", "kalan_tutar", "toplam_tahmini", "son_donem", "bitis_donem", "durum"]


def _plan_anahtari(r):
    value = _v(r.get("plan_id")) or _v(r.get("plan_key"))
    return str(r["card_id"]) + "|" + str(value) if value else None


def taksitler(tx):
    all_t = _normal_tx(tx)
    no, total = (pd.to_numeric(all_t[key], errors="coerce") for key in ("inst_no", "inst_total"))
    t = all_t[(all_t.tur == "harcama") & no.notna() & total.notna() & (no >= 1) & (total >= 2) & (no <= total)].copy()
    if t.empty:
        return pd.DataFrame(columns=TAKSIT_KOLON)
    t["inst_no"], t["inst_total"] = pd.to_numeric(t.inst_no).astype(int), pd.to_numeric(t.inst_total).astype(int)
    anchors, counts, keys, order_keys = defaultdict(list), defaultdict(int), {}, {}
    for idx, r in t.sort_values(["period", "date", "id"], kind="stable").iterrows():
        order = _plan_anahtari(r)
        order_keys[idx] = order
        if order is None:
            period = r.period if zaman.donem_gecerli(r.period) else str(r.date)[:7]
            origin = zaman.donem_ekle(period, 1 - int(r.inst_no)) if zaman.donem_gecerli(period) else period
            base = (str(r.card_id), str(r.merchant_key), int(r.inst_total), origin, _v(r.purchase_date) or "")
        else:
            # Bir sipariş birden fazla satır/taksit planı içerebilir. Referans,
            # aynı dönemdeki ayrı borç satırlarını tek plana düşürmemelidir.
            base = (order, int(r.inst_total), _v(r.purchase_date) or "")
        amount = int(r.amount_cents)
        anchor = next((a for a in anchors[base] if abs(a - amount) <= 1), amount)
        if anchor not in anchors[base]:
            anchors[base].append(anchor)
        occurrence = (base, anchor, str(r.period), int(r.inst_no))
        counts[occurrence] += 1
        prefix = "order:" if order else "derived:"
        key = prefix + hashlib.sha256(repr((base, anchor, counts[occurrence])).encode()).hexdigest()[:24]
        keys[idx] = key
    t["grup"] = pd.Series(keys)
    t["order_ref"] = pd.Series(order_keys)
    latest = t.sort_values(["period", "inst_no", "date", "id"], kind="stable").groupby("grup", sort=False).tail(1)
    refunds = all_t[all_t.tur == "indirim"].copy()
    refunds["grup"] = [_plan_anahtari(r) for _, r in refunds.iterrows()]
    rows = []
    for _, r in latest.iterrows():
        remaining, monthly = max(0, int(r.inst_total - r.inst_no)), int(r.amount_cents)
        same_order = latest[(latest.order_ref == r.order_ref) & (latest.period == r.period)]
        # Sipariş indirimi birden fazla plana bağlıysa hangi plana ait olduğu
        # bilinmez. Genel net harcamada düşülür; tek plana tahminen dağıtılmaz.
        discount = -_toplam(refunds[(refunds.grup == r.order_ref) & (refunds.period == r.period)]) if r.order_ref and len(same_order) == 1 else 0
        rows.append({"plan_id": r.grup, "kart_id": r.card_id, "kart": kart_etiketi(r.bank, r.kart), "desc": r.desc,
                     "tarih": _v(r.purchase_date) or r.date, "aylik": _tl(monthly), "net_aylik": _tl(monthly - discount),
                     "indirim_bu_donem": _tl(discount), "no": int(r.inst_no), "toplam": int(r.inst_total),
                     "kalan_adet": remaining, "kalan_tutar": _tl(remaining * monthly),
                     "toplam_tahmini": _tl(int(r.inst_total) * monthly), "son_donem": r.period,
                     "bitis_donem": zaman.donem_ekle(r.period, remaining) if zaman.donem_gecerli(r.period) else None,
                     "durum": "Devam ediyor" if remaining else "Tamamlandı"})
    return pd.DataFrame(rows, columns=TAKSIT_KOLON).sort_values("kalan_tutar", ascending=False, kind="stable")


def kart_ozetleri(cards, stm, tx):
    all_t, result = _normal_tx(tx), []
    for _, c in cards.iterrows():
        s = stm[stm.card_id == c["id"]].sort_values("period", ascending=False) if "card_id" in stm else stm.iloc[:0]
        t = all_t[all_t.card_id == c["id"]]
        o = {"id": int(c["id"]), "bank": c.get("bank", ""), "name": c.get("name", ""),
             "label": kart_etiketi(c.get("bank"), c.get("name")), "period": None, "ekstre_period": None,
             "borc": None, "donem_borcu": None, "borc_kaynak": None, "limit": None,
             "kullanilabilir": None, "kullanilabilir_kaynak": None, "son_odeme": None, "asgari": None,
             "kesim": None, "donem_harcama": 0.0, "odeme": 0.0, "guncel_borc": None,
             "kalan_ekstre_borcu": None, "asgari_kalan": None, "gelecek_taksit": 0.0, "toplam_yuk": None,
             "faiz_aylik": _v(c.get("faiz_aylik")),
             "faiz_kaynak": "kullanici" if _v(c.get("faiz_aylik")) is not None else None,
             "veri_var": not (s.empty and t.empty), "son_islem_donemi": None}
        if not o["veri_var"]:
            result.append(o)
            continue
        last = s.iloc[0] if len(s) else None
        o["son_islem_donemi"] = t.period.max() if len(t) else None
        o["period"] = last.period if last is not None else o["son_islem_donemi"]
        period_t = t[t.period == o["period"]]
        o["donem_harcama"], o["odeme"] = net_harcama(period_t), _tl(_toplam(period_t, ("odeme",)))
        plans = taksitler(t)
        future = sum(_kurus(x) for x in plans.kalan_tutar)
        o["gelecek_taksit"] = _tl(future)
        base = None
        if last is not None:
            o["ekstre_period"] = last.period
            for key in ("son_odeme", "kesim"):
                value = _v(last.get(key))
                if value is not None:
                    o[key] = value
            if o["faiz_aylik"] is None and _v(last.get("faiz_aylik")) is not None:
                o["faiz_aylik"] = _v(last.get("faiz_aylik"))
                o["faiz_kaynak"] = "ekstre"
            for key, source in (("limit", "kart_limit"), ("asgari", "asgari")):
                value = _baslik(last, source)
                o[key] = None if value is None else _tl(value)
            base = _baslik(last, "donem_borcu")
            o["donem_borcu"] = None if base is None else _tl(base)
        if base is not None:
            if o["kesim"]:
                new = t[(t.date > o["kesim"]) & (t.statement_id.isna() | (t.statement_id != last["id"]))]
            else:
                new = t[t.period > o["period"]]
            expenses, payments = _toplam(new, ("harcama", "indirim")), _toplam(new, ("odeme",))
            refunds = -_toplam(new, ("indirim",))
            current = base + expenses - payments
            o["borc_kaynak"] = "guncel_tahmin" if len(new) else "ekstre"
            o["kalan_ekstre_borcu"] = _tl(max(0, base - payments - refunds))
            o["asgari_kalan"] = None if o["asgari"] is None else _tl(max(0, _kurus(o["asgari"]) - payments))
            available = _baslik(last, "kullanilabilir_limit")
            if available is not None:
                o["kullanilabilir"] = _tl(max(0, available - expenses + payments))
                o["kullanilabilir_kaynak"] = "guncel_tahmin" if len(new) else "ekstre"
        else:
            current = _toplam(t, ("harcama", "indirim")) - _toplam(t, ("odeme",))
            o["borc_kaynak"] = "islemlerden"
        o["borc"] = o["guncel_borc"] = _tl(current)
        o["toplam_yuk"] = _tl(current + future)
        if o["kullanilabilir"] is None and o["limit"] is not None:
            o["kullanilabilir"] = _tl(max(0, _kurus(o["limit"]) - current - future))
            o["kullanilabilir_kaynak"] = "hesaplanan"
        result.append(o)
    return result


DUZENLI_KOLON = ["kart", "merchant_key", "kategori", "son_tarih", "tutar", "donem_sayisi", "tahmini_sonraki", "dayanak"]


def duzenli_odemeler(tx):
    t = _normal_tx(tx)
    h = t[(t.tur == "harcama") & t.inst_total.isna()].sort_values("date", kind="stable")
    rows = []
    for (_, key), g in h.groupby(["card_id", "merchant_key"]):
        if not key:
            continue
        category, count = g.category.iloc[-1], g.period.nunique()
        sums = g.groupby("period").amount_cents.sum()
        repeat = count >= 2 and category not in SIK_HARCAMA and sums.min() > 0 and sums.max() <= sums.min() * 1.15
        if category in IZLENEN_DUZENLI or repeat:
            last = g.iloc[-1]
            try:
                next_date = zaman.ay_ekle(last.date)
            except (TypeError, ValueError):
                continue
            rows.append({"kart": kart_etiketi(last.bank, last.kart), "merchant_key": key, "kategori": category,
                         "son_tarih": last.date, "tutar": _tl(int(sums.loc[last.period])), "donem_sayisi": count,
                         "tahmini_sonraki": next_date, "dayanak": "Benzer dönem toplamları" if repeat else f"Kategori ({count} dönemde görüldü)"})
    return pd.DataFrame(rows, columns=DUZENLI_KOLON)


def abonelik_takvimi(plans=None):
    p = (db.abonelikler_df() if plans is None else plans).copy()
    if p.empty:
        return p
    if "active" in p:
        p = p[p.active.astype(bool)].copy()
    p["gecikmis"] = p.next_date.astype(str) < zaman.bugun().isoformat()
    return p.sort_values("next_date", kind="stable")


def butce_durumu(tx, butceler, period, ledger=None):
    h = harcama_hareketleri(tx)
    h = pd.concat([h[["period", "category", "amount_cents"]],
                   _hesap_giderleri(ledger)[["period", "category", "amount_cents"]]], ignore_index=True)
    sums = h[h.period == period].groupby("category").amount_cents.sum()
    rows, total = [], None
    for category, limit in butceler.items():
        if category == db.TOPLAM_HEDEF:
            continue
        limit_c, spent = _kurus(limit), int(sums.get(category, 0))
        rows.append({"kategori": category, "limit": _tl(limit_c), "harcanan": _tl(spent), "oran": spent / limit_c if limit_c > 0 else 0})
    if db.TOPLAM_HEDEF in butceler:
        limit_c, spent = _kurus(butceler[db.TOPLAM_HEDEF]), int(sums.sum())
        total = {"limit": _tl(limit_c), "harcanan": _tl(spent), "oran": spent / limit_c if limit_c > 0 else 0}
    return rows, total


def kategori_matrisi(tx, ledger=None):
    h = aylik_trend(tx, ledger)
    return pd.DataFrame() if h.empty else h.pivot_table(index="category", columns="period", values="amount", aggfunc="sum", fill_value=0.0)


def hesap_bakiyeleri(accounts=None, ledger=None):
    a = (db.hesaplar_df() if accounts is None else accounts).copy()
    if "bakiye" not in a:
        a["bakiye"] = a.balance_cents.map(_tl) if "balance_cents" in a else _kolon(a, "baslangic", 0)
    return a


def wallet_ozeti(cards=None, stm=None, tx=None, accounts=None, ledger=None, period=None):
    if cards is None or stm is None or tx is None:
        loaded = yukle()
        cards, stm, tx = (loaded[i] if value is None else value for i, value in enumerate((cards, stm, tx)))
    accounts = hesap_bakiyeleri(accounts, ledger)
    ledger = db.hesap_hareketleri_df() if ledger is None else ledger
    cards_summary = kart_ozetleri(cards, stm, tx)
    local = accounts[accounts.currency.eq("TRY")] if "currency" in accounts else accounts
    balance = sum(_kurus(x) for x in local.bakiye)
    debt = sum(_kurus(o["guncel_borc"]) for o in cards_summary if o["guncel_borc"] is not None)
    future = sum(_kurus(o["gelecek_taksit"]) for o in cards_summary)
    period = period or zaman.bugun().strftime("%Y-%m")
    ct = _normal_tx(tx)
    ct = ct[ct.period == period]
    sub = ledger[ledger.date.astype(str).str[:7].eq(period)] if len(ledger) else ledger
    income = 0
    if len(sub):
        inc = sub[sub.tur == "gelir"]
        income = sum(abs(int(c)) if _v(c) is not None else abs(_kurus(a)) for c, a in zip(_kolon(inc, "amount_cents"), _kolon(inc, "amount", 0)))
    expense = _toplam(ct, ("harcama", "indirim")) + int(_hesap_giderleri(sub).amount_cents.sum())
    others = sorted(set(accounts.get("currency", pd.Series(dtype=str)).dropna()) - {"TRY"})
    return {"nakit_banka": _tl(balance), "kart_borcu": _tl(debt), "gelecek_taksit": _tl(future),
            "toplam_kart_yuku": _tl(debt + future), "net_varlik": _tl(balance - debt - future),
            "gelir": _tl(income), "gider": _tl(expense), "donem": period, "hesap_sayisi": len(accounts),
            "diger_para_birimleri": others, "net_varlik_tahmini": True}


def uyarilar(ozetler, stm, tx, period):
    notes = []
    for o in ozetler:
        if not o["veri_var"]:
            continue
        unpaid, days = o.get("kalan_ekstre_borcu"), zaman.kalan_gun(o.get("son_odeme"))
        if days is not None and (unpaid is None or unpaid > 0):
            if days < 0:
                notes.append(("warning", f"{o['label']}: kayıtlı son ödeme tarihi ({zaman.tarih_kisa(o['son_odeme'])}) geçti. Ödeme yaptıysanız kaydedin veya güncel ekstreyi yükleyin."))
            elif days <= 7:
                notes.append(("warning", f"{o['label']}: son ödemeye {days} gün kaldı ({zaman.tarih_kisa(o['son_odeme'])})."))
        elif days is None and o["borc_kaynak"] == "islemlerden":
            notes.append(("info", f"{o['label']}: başlık olmadığı için borç işlemlerden tahmin ediliyor."))
    history = ekstre_gecmisi(stm, tx)
    for _, r in history[history.durum == "fark"].iterrows():
        notes.append(("warning", f"{r['Kart']} {zaman.donem_adi(r['Dönem'])}: ekstre toplamı ile işlemler arasında fark var (Ekstreler sayfasında ayrıntı)."))
    missing = history[(history.durum == "eksik") & (history["İşlem"] > 0)]
    if len(missing):
        notes.append(("info", f"{len(missing)} ekstrede toplam kontrolü için başlık bilgisi eksik. PDF'leri yeniden yükleyebilirsiniz."))
    d = _normal_tx(tx)
    d = d[d.period == period]
    other = int(((d.category == "Diğer") & (d.tur == "harcama")).sum())
    if other:
        notes.append(("info", f"{other} işlem 'Diğer' kategorisinde. İşlemler sayfasından kategori atayabilirsiniz."))
    interest = _toplam(d[d.category == "Faiz / Ücret"])
    if interest > 0:
        notes.append(("warning", f"{zaman.donem_adi(period)} döneminde {_tl(interest):,.2f} TL faiz/ücret kaydı var."))
    return notes


TAKVIM_KOLON = ["id", "date", "label", "amount", "kind", "source", "card_id", "status"]


def odeme_takvimi(start, end, card_ids=None):
    """Belgedeki ödeme, açık abonelik planı ve tahmini taksit tarihlerini birleştirir.

    Bu olaylar bakiye/harcama tablosuna yazılmaz. Tahminler gerçekleşmiş ödeme değildir.
    """
    start_d, end_d = date.fromisoformat(str(start)), date.fromisoformat(str(end))
    if end_d < start_d or (end_d - start_d).days > 730:
        raise ValueError("Takvim aralığı en fazla iki yıl olmalı; bitiş başlangıçtan önce olamaz.")
    cards, stm, tx = yukle()
    summaries = kart_ozetleri(cards, stm, tx)
    plans = db.abonelikler_df()
    allowed = None if card_ids is None else {int(i) for i in card_ids}
    today, events = zaman.bugun(), []

    def add(ident, when, label, amount, kind, source, cid=None, status=None):
        if not when:
            return
        when_d = date.fromisoformat(str(when))
        if not start_d <= when_d <= end_d or (allowed is not None and cid not in allowed):
            return
        events.append(dict(id=ident, date=when_d.isoformat(), label=label, amount=amount,
                           kind=kind, source=source, card_id=cid,
                           status=status or ("Gecikmiş" if when_d < today else "Bekliyor")))

    by_card = {o["id"]: o for o in summaries}
    for o in summaries:
        if o["ekstre_period"] and o["son_odeme"]:
            left = o["kalan_ekstre_borcu"]
            add(f"statement:{o['id']}:{o['ekstre_period']}", o["son_odeme"],
                o["label"] + " · ekstre ödemesi", left, "kart", "Ekstre", o["id"],
                "Ödendi" if left is not None and left <= 0 else None)
    for _, p in taksitler(tx).iterrows():
        cid = int(p.kart_id)
        o = by_card.get(cid, {})
        latest = stm[stm.card_id == cid].sort_values("period", ascending=False)
        s = latest.iloc[0] if len(latest) else None
        for n in range(1, int(p.kalan_adet) + 1):
            period = zaman.donem_ekle(p.son_donem, n)
            # Yeni bir ekstre zaten bu taksiti kapsıyorsa ayrı tahmin üretme.
            if o.get("ekstre_period") and period <= o["ekstre_period"]:
                continue
            if s is not None and _v(s.get("next_kesim")) and period == zaman.donem_ekle(s.period, 1):
                when = s.next_kesim
            elif o.get("kesim"):
                offset = (int(period[:4]) - int(o["kesim"][:4])) * 12 + int(period[5:]) - int(o["kesim"][5:7])
                when = zaman.ay_ekle(o["kesim"], offset)
            else:
                when = period + "-01"
            add(f"installment:{p.plan_id}:{period}", when,
                f"{p['desc']} · {int(p['no']) + n}/{int(p.toplam)} taksit · tahmini ekstre tarihi",
                float(p.aylik), "taksit", "Taksit planı", cid, "Tahmini")
    managed = set()
    for _, p in plans.iterrows():
        if not bool(p.active):
            continue
        cid = int(p.card_id) if _v(p.card_id) is not None else None
        managed.add((cid, cz.anahtar(p["name"])))
        when = str(p.next_date)
        if when < start_d.isoformat():
            old = date.fromisoformat(when)
            if p.frequency in ("gunluk", "haftalik"):
                stride = 1 if p.frequency == "gunluk" else 7
                when = (old + timedelta(days=((start_d - old).days // stride) * stride)).isoformat()
            else:
                stride = {"aylik": 1, "uc_aylik": 3, "yillik": 12}[p.frequency]
                months = (start_d.year - old.year) * 12 + start_d.month - old.month
                when = zaman.ay_ekle(when, (months // stride) * stride, anchor_day=int(p.anchor_day))
        for _ in range(740):
            if when > end_d.isoformat():
                break
            add(f"recurring:{int(p.id)}:{when}", when, p["name"], float(p.amount), "abonelik", "Abonelik planı", cid)
            next_date = zaman.sonraki_odeme(when, p.frequency, anchor_day=int(p.anchor_day))
            if next_date <= when:
                break
            when = next_date
    for _, p in duzenli_odemeler(tx).iterrows():
        matches = [o for o in summaries if o["label"] == p.kart]
        cid = matches[0]["id"] if len(matches) == 1 else None
        if (cid, cz.anahtar(p.merchant_key)) in managed:
            continue
        add("detected:" + hashlib.sha256(f"{cid}|{p.merchant_key}|{p.tahmini_sonraki}".encode()).hexdigest()[:20],
            p.tahmini_sonraki, p.merchant_key + " · geçmişten tahmin", float(p.tutar), "tahmini", "Tahmin", cid, "Tahmini")
    return pd.DataFrame(events, columns=TAKVIM_KOLON).sort_values(["date", "label"], kind="stable").reset_index(drop=True)


def inceleme_kutusu():
    """Kart ve hesap hareketleri için tek, profile özel inceleme kuyruğu."""
    movements = db.hareketler_df().copy()
    candidates = db.eslesme_adaylari_df()
    ambiguous = {"K:" + str(x) for col in ("manual_id", "tx_id") for x in candidates.get(col, [])}
    reasons, selected = [], []
    for idx, row in movements.iterrows():
        why = []
        if not bool(row.get("reviewed", False)):
            why.append("Kontrol bekliyor")
            if row.get("category") in ("Diğer", "İndirim / İade", "", None) and row.get("tur") not in ("odeme", "kart_odeme", "transfer"):
                why.append("Kategori belirsiz")
        if row.movement_ref in ambiguous:
            why.append("Eşleştirme adayı")
        if why:
            selected.append(idx)
            reasons.append(why)
    result = movements.loc[selected].copy()
    result["reasons"] = reasons
    result["reason_text"] = [" · ".join(r) for r in reasons]
    return result.reset_index(drop=True)


UYARI_KOLON = ["id", "level", "title", "body", "date", "kind", "movement_ref", "read"]


def uyari_durumu(ident, read=None, snooze_until=None):
    states = db.ayar_getir("alert_states", {})
    state = states.get(str(ident), {})
    if read is not None:
        state["read"] = bool(read)
    if snooze_until is not None:
        state["snooze_until"] = date.fromisoformat(str(snooze_until)).isoformat()
    states[str(ident)] = state
    db.ayar_kaydet("alert_states", dict(list(states.items())[-300:]))


def uyari_merkezi(period=None, include_read=False):
    cards, stm, tx = yukle()
    ledger = db.hesap_hareketleri_df()
    period = period or zaman.bugun().strftime("%Y-%m")
    today, items = zaman.bugun(), []

    def add(ident, level, title, body, kind, when=None, ref=None):
        items.append(dict(id=ident, level=level, title=title, body=body, kind=kind,
                          date=when or today.isoformat(), movement_ref=ref))

    inbox = inceleme_kutusu()
    if len(inbox):
        key = hashlib.sha256("|".join(sorted(inbox.movement_ref)).encode()).hexdigest()[:12]
        add("review:" + key, "info", "İnceleme bekleyen hareketler", f"{len(inbox)} hareketi İşlemler > İnceleme kutusunda kontrol edebilirsiniz.", "inceleme")
    rows, total = butce_durumu(tx, db.butceler(period), period, ledger)
    for b in rows + ([dict(total, kategori="Genel bütçe")] if total else []):
        if b["oran"] < .8:
            continue
        exceeded = b["oran"] >= 1
        stage = "asildi" if exceeded else "80"
        add(f"budget:{period}:{b['kategori']}:{stage}", "warning" if exceeded else "info",
            b["kategori"] + (" sınırına ulaştı" if exceeded else " %80 eşiğinde"),
            f"{zaman.donem_adi(period)}: {b['harcanan']:,.2f} / {b['limit']:,.2f} TL.", "butce")
    for o in kart_ozetleri(cards, stm, tx):
        if o.get("son_odeme") and (o.get("kalan_ekstre_borcu") or 0) > 0:
            days = zaman.kalan_gun(o["son_odeme"])
            if days is not None and days <= 7:
                add(f"payment:{o['id']}:{o['son_odeme']}", "warning", o["label"] + " · ödeme kontrolü",
                    f"Son ödeme {zaman.tarih_uzun(o['son_odeme'])}; kayıtlarınıza göre kalan ekstre borcu {o['kalan_ekstre_borcu']:,.2f} TL.",
                    "odeme", o["son_odeme"])
        previous = zaman.donem_ekle(today.strftime("%Y-%m"), -1)
        if o.get("ekstre_period") is None or o["ekstre_period"] < previous:
            add(f"statement:{o['id']}:{o.get('ekstre_period')}", "info", o["label"] + " · ekstre güncelliği",
                "Henüz ekstre yok." if o.get("ekstre_period") is None else f"Son kayıtlı ekstre {zaman.donem_adi(o['ekstre_period'])}. Yeni belgeniz varsa yükleyin.", "ekstre")
    for _, row in ekstre_gecmisi(stm, tx).iterrows():
        if row.durum == "fark":
            add(f"reconciliation:{int(row.id)}", "warning", "Ekstre toplamı farklı", f"{row.Kart} · {zaman.donem_adi(row['Dönem'])} kaydını kontrol edin.", "mutabakat")
    active = db.abonelikler_df()
    for _, p in active.iterrows():
        if not bool(p.active):
            continue
        days = zaman.kalan_gun(p.next_date)
        if days is not None and days <= 7:
            add(f"subscription:{int(p.id)}:{p.next_date}", "warning" if days < 0 else "info", p["name"] + " · planlı ödeme",
                f"{zaman.tarih_uzun(p.next_date)} için {p.amount:,.2f} TL kayıtlı ödeme planınız var.", "abonelik", p.next_date)
    states = db.ayar_getir("alert_states", {})
    filtered = []
    for item in items:
        state = states.get(item["id"], {})
        item["read"] = bool(state.get("read", False))
        snoozed = str(state.get("snooze_until", "")) > today.isoformat()
        if include_read or (not item["read"] and not snoozed):
            filtered.append(item)
    return pd.DataFrame(filtered, columns=UYARI_KOLON)
