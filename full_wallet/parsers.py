"""Yapı Kredi/QNB ekstreleri: yerel ayrıştırma, işaretli tutar ve anonim referanslar."""
import hashlib
import re
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

import pdfplumber

AYLAR = {"ocak": 1, "subat": 2, "mart": 3, "nisan": 4, "mayis": 5, "haziran": 6,
         "temmuz": 7, "agustos": 8, "eylul": 9, "ekim": 10, "kasim": 11, "aralik": 12}
_TR = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")
DESTEKLENEN_BANKALAR = ["Yapı Kredi", "QNB"]
_MONEY_TR = r"[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}"
_MONEY_EN = r"[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}"
_DATE_TR = r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})"
_DATE_NUM = r"(\d{1,2})[/.](\d{1,2})[/.](\d{4})"


def temizle(s: str) -> str:
    s = str(s or "").replace("\xa0", " ").replace("−", "-")
    # QNB eksik ToUnicode harflerini fonttan bağımsız, kelime bağlamıyla kurtarır.
    s = re.sub(r"PE(?:\(cid:\d+\)){1,3}N", "PESIN", s, flags=re.I)
    s = re.sub(r"\(cid:\d+\)deme", "Odeme", s, flags=re.I)
    s = re.sub(r"Tesekk\(cid:\d+\)r", "Tesekkur", s, flags=re.I)
    s = re.sub(r"\(cid:\d+\)ndirim", "Indirim", s, flags=re.I)
    return re.sub(r"\(cid:\d+\)", "", s).translate(_TR)


def pdf_metni(dosya) -> str:
    if hasattr(dosya, "seek"):
        dosya.seek(0)
    try:
        with pdfplumber.open(dosya) as pdf:
            if len(pdf.pages) > 100:
                raise ValueError("Bir ekstre en fazla 100 sayfa olabilir.")
            text = "\n".join(p.extract_text(x_tolerance=3) or "" for p in pdf.pages)
    except (OSError, ValueError):
        raise
    except Exception as exc:
        raise ValueError("PDF açılamadı. Şifreli veya bozuk bir dosya olabilir.") from exc
    if not text.strip():
        raise ValueError("PDF içinde okunabilir metin yok. Bankadan indirilen metin içeren PDF'i kullanın.")
    return text


def banka_bul(metin: str):
    top = temizle(metin)[:2200].upper()
    if "QNB" in top:
        return "QNB"
    if any(k in top for k in ("YAPI KREDI", "YAPI VE KREDI", "WORLDPUAN", "WORLDCARD")):
        return "Yapı Kredi"
    return None


def _sayi(s, decimal_sep):
    value = str(s).strip().replace(" ", "").replace("+", "")
    value = value.replace("." if decimal_sep == "," else ",", "").replace(decimal_sep, ".")
    try:
        return float(Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    except InvalidOperation as exc:
        raise ValueError("Geçersiz para tutarı") from exc


def _tr_sayi(s):
    return _sayi(s, ",")


def _en_sayi(s):
    return _sayi(s, ".")


def _ay(s):
    key = temizle(s).lower()
    key = {"austos": "agustos", "eyll": "eylul", "ubat": "subat", "mays": "mayis"}.get(key, key)
    if key in AYLAR:
        return AYLAR[key]
    match = next((v for k, v in AYLAR.items() if k[:3] == key[:3]), None)
    if match is None:
        raise ValueError("Ekstredeki ay adı okunamadı.")
    return match


def _tarih_eslesme(m, numeric=False):
    if not m:
        return None
    return date(int(m.group(3)), int(m.group(2)) if numeric else _ay(m.group(2)), int(m.group(1))).isoformat()


def _find_date(t, label, numeric=False):
    m = re.search(label + r"\s*:?\s*" + (_DATE_NUM if numeric else _DATE_TR), t, re.I)
    return _tarih_eslesme(m, numeric) if m else None


_SEHIR = re.compile(r"\s*(?:KAHRAMANMARAS|K\.\s?MARAS|ISTANBUL|ISTANBU|ANKARA|IZMIR)\s*(?:TRTR|TR|TU)?\s*$", re.I)
_ULKE = re.compile(r"\s+(?:TR|TU)\s*$", re.I)


def _aciklama_sadelestir(a: str) -> str:
    a = re.sub(r"\s+", " ", a).strip()
    a = re.sub(r"^\d{8}\s+", "", a)
    a = re.sub(r"\b\d+\.\s*(?=Indirim)", "", a, flags=re.I)
    a = re.sub(r"\s+" + _MONEY_EN + r"\s+al\w*v\s+ind\b", " Indirim", a, flags=re.I)
    a = _ULKE.sub("", _SEHIR.sub("", a))
    a = re.sub(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)", "[kart]", a)
    return a.strip() or "İşlem"


def _id(banka, donem, tarih, aciklama, tutar, sira):
    # Nihai kart kapsamındaki kimlik db.ice_aktar tarafından oluşturulur.
    key = f"{banka}|{donem}|{tarih}|{aciklama}|{Decimal(str(tutar)):.2f}|{sira}"
    return hashlib.sha256(key.encode()).hexdigest()[:24]


def _satir_ekle(sonuc, sayac, banka, donem, tarih, aciklama, tutar, taksit, credit=False):
    ham = temizle(aciklama).upper()
    if re.search(r"^(?:ODEME|DEME)\b|TESEKK[U]?R", ham):
        tur, amount = "odeme", abs(tutar)
    elif tutar < 0 or credit or re.search(r"INDIRIM|IADE|IPTAL|AL\w*V\s+IND\b", ham):
        tur, amount = "indirim", -abs(tutar)
    else:
        tur, amount = "harcama", abs(tutar)
    desc = _aciklama_sadelestir(aciklama)
    key = (banka, donem, tarih, desc, amount, taksit or "")
    sayac[key] = sayac.get(key, 0) + 1
    no, total = taksit_ayir(taksit)
    sonuc.append({
        "id": _id(banka, donem, tarih, desc, amount, sayac[key]),
        "bank": banka, "period": donem, "date": tarih, "desc": desc,
        "amount": amount, "amount_cents": int(Decimal(str(amount)) * 100),
        "installment": f"{no}/{total}" if no else "", "tur": tur,
        "occurrence": sayac[key], "purchase_date": tarih if no else None, "plan_key": None,
    })


def taksit_ayir(s):
    m = re.fullmatch(r"\s*(\d{1,3})\s*/\s*(\d{1,3})\s*", str(s or ""))
    if not m:
        return None, None
    a, b = map(int, m.groups())
    return (a, b) if 1 <= a <= b <= 120 else (None, None)


def _donem(t, numeric):
    value = _find_date(t, r"Hesap Kesim Tarihi", numeric)
    return value[:7] if value else None


def _islem_satirlari(t, numeric):
    prefix = re.compile(r"^" + (_DATE_NUM if numeric else _DATE_TR) + r"\s+(.+)$")
    lines = t.splitlines()
    for i, line in enumerate(lines):
        line = re.sub(r"\s+", " ", line.strip())
        m = prefix.match(line)
        if not m:
            continue
        try:
            iso = _tarih_eslesme(m, numeric)
        except ValueError:
            continue
        body = m.group(4)
        if not re.search(_MONEY_EN if numeric else _MONEY_TR, body) and i + 1 < len(lines):
            following = re.sub(r"\s+", " ", lines[i + 1].strip())
            if not prefix.match(following) and re.search(_MONEY_EN if numeric else _MONEY_TR, following):
                body += " " + following
        yield i, iso, body


def _yapikredi(metin):
    t = temizle(metin)
    period = _donem(t, False)
    if not period:
        raise ValueError("Hesap kesim tarihi okunamadı; yanlış döneme kayıt yapılmadı.")
    rows, counter = [], {}
    for _, iso, body in _islem_satirlari(t, False):
        amounts = list(re.finditer(_MONEY_TR, body))
        if not amounts:
            continue
        token = amounts[0]
        desc, tail = body[:token.start()].strip(), body[token.end():].strip()
        inst = re.search(r"\b(\d{1,3}/\d{1,3})(?:\.?\s*[Tt]aksit)?\b", desc + " " + tail)
        installment = inst.group(1) if inst else ""
        if inst:
            desc = re.sub(r"\b" + re.escape(installment) + r"\b\.?\s*(?:[Tt]aksit)?", "", desc).strip()
        _satir_ekle(rows, counter, "Yapı Kredi", period, iso, desc, _tr_sayi(token.group()), installment,
                    credit=token.group().startswith("+"))
    return rows


def _qnb(metin):
    t = temizle(metin)
    period = _donem(t, True)
    if not period:
        raise ValueError("Hesap kesim tarihi okunamadı; yanlış döneme kayıt yapılmadı.")
    rows, counter = [], {}
    lines = t.splitlines()
    point_line = next((i for i, line in enumerate(lines) if re.match(r"ParaPuan\s+.*lemleriniz", line, re.I)), len(lines))
    for idx, iso, body in _islem_satirlari(t, True):
        if idx >= point_line:
            continue
        amounts = list(re.finditer(_MONEY_EN, body))
        if not amounts:
            continue
        # Net tutar bazen açıklamada da vardır; sağdaki tutar TL hareketidir.
        token = amounts[-1]
        desc, tail = body[:token.start()].strip(), body[token.end():].strip()
        inst = re.match(r"(\d{1,3}/\d{1,3})(?:\s|$)", tail)
        installment = inst.group(1) if inst else ""
        _satir_ekle(rows, counter, "QNB", period, iso, desc, _en_sayi(token.group()), installment,
                    credit=token.group().startswith("+"))
        for following in lines[idx + 1:idx + 3]:
            order = re.search(r"sipari\w*\s+kodu\s*:\s*([\w-]+)", following, re.I)
            if order:
                rows[-1]["plan_key"] = hashlib.sha256(("QNB|" + order.group(1)).encode()).hexdigest()
                break
            if re.match(_DATE_NUM, following):
                break
    return rows


def _ozet_coz(metin, banka):
    t = temizle(metin)
    numeric = banka == "QNB"
    if banka not in DESTEKLENEN_BANKALAR:
        raise ValueError("Banka tanınmadı (Yapı Kredi ve QNB destekleniyor).")
    kesim = _find_date(t, r"Hesap Kesim Tarihi", numeric)
    if not kesim:
        raise ValueError("Ekstre kesim tarihi okunamadı.")
    number, money = (_en_sayi, _MONEY_EN) if numeric else (_tr_sayi, _MONEY_TR)

    def amount(label):
        m = re.search(label + r"\s*:?\s*(" + money + ")", t, re.I)
        return number(m.group(1)) if m else None

    son = _find_date(t, r"Son\s+\w*deme Tarihi") or _find_date(t, r"Son\s+\w*deme Tarihi", True)
    onceki = amount(r"Onceki Donem Hesap Ozeti Borcu")
    hdr_h, hdr_o = amount(r"Donem Ici Harcamalar"), amount(r"Donem Ici Odemeler")
    if numeric:
        match = re.search(r"^\s*" + r"\s+".join(["(" + money + ")"] * 7) + r"\s+TL\b", t, re.M)
        if match:
            v = [number(value) for value in match.groups()]
            onceki, hdr_h, hdr_o = v[0], float(sum(Decimal(str(x)) for x in v[1:5])), abs(v[5])
        title = re.search(r"QNB\s+([A-Za-z]+)", t)
        name = title.group(1) if title else "QNB"
    else:
        name = "Opet WorldCard" if "OPET WORLDCARD" in t.upper() else "WorldCard"
    card = re.search(r"Kart\w* Numarasi\s*:\s*((?:\d|\*|[xX]| ){12,25})", t)
    card_ref = hashlib.sha256((banka + "|" + re.sub(r"\s", "", card.group(1))).encode()).hexdigest() if card else None
    rate = re.search(r"Akdi Faiz Orani\s*%\s*([\d.,]+)", t, re.I) if not numeric else re.search(r"Aylik\s+TL\s*%\s*([\d.,]+)", t, re.I)
    faiz = float(Decimal(rate.group(1).replace(",", ".")) / 100) if rate else None
    next_cut = _find_date(t, r"Bir Sonraki Ay Hesap Kesim Tarihi") if not numeric else _find_date(t, r"bir sonraki hesap kesim tarihiniz", True)
    next_due = _find_date(t, r"Bir Sonraki Ay Son\s+\w*deme Tarihi") if not numeric else _find_date(t, r"bir sonraki son\s+\w*deme tarihiniz", True)
    return {
        "bank": banka, "kart": name, "card_ref": card_ref, "period": kesim[:7], "kesim": kesim,
        "son_odeme": son, "borc": amount(r"D\w{0,2}nem Borcu"),
        "asgari": amount(r"Asgari\s+\w*deme Tutar\w*" if numeric else r"Asgari Tutar/Oran"),
        "kart_limit": amount(r"Kredi Kart\w* Limiti" if numeric else r"Kart Limiti"),
        "kullanilabilir_limit": amount(r"Kullanilabilir Limit"), "onceki_borc": onceki,
        "hdr_harcama": hdr_h, "hdr_odeme": hdr_o, "faiz_aylik": faiz,
        "next_kesim": next_cut, "next_son_odeme": next_due,
        "kalan_taksit": amount(r"Kalan Toplam Taksit Tutari"),
    }


def ekstre_tam(dosya):
    text = pdf_metni(dosya)
    bank = banka_bul(text)
    summary = _ozet_coz(text, bank)
    rows = (_qnb if bank == "QNB" else _yapikredi)(text)
    if not rows and (summary.get("hdr_harcama") or summary.get("hdr_odeme")):
        raise ValueError("Ekstre toplamları var fakat işlem satırları okunamadı; kayıt yapılmadı.")
    missing = [name for name, key in [("dönem borcu", "borc"), ("son ödeme", "son_odeme"), ("limit", "kart_limit")] if summary.get(key) is None]
    warning = "Okunamayan başlık bilgileri: " + ", ".join(missing) + "." if missing else ""
    return summary, rows, warning


def ekstre_oku(dosya):
    return ekstre_tam(dosya)[1]


def ozet_oku(dosya):
    text = pdf_metni(dosya)
    return _ozet_coz(text, banka_bul(text))
