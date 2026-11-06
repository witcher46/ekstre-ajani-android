"""Türkiye saati ve ekstre dönemi yardımcıları (Streamlit bağımsız)."""
import calendar
from datetime import date, datetime, timedelta, timezone
import re

AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]


def bugun():
    return datetime.now(timezone(timedelta(hours=3), "Europe/Istanbul")).date()


def donem_gecerli(period):
    return isinstance(period, str) and re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", period) is not None and int(period[:4]) >= 1


def donem_ekle(period, n):
    if not donem_gecerli(str(period)):
        raise ValueError("Dönem YYYY-AA biçiminde olmalı.")
    y, m = (int(x) for x in str(period).split("-"))
    total = y * 12 + m - 1 + int(n)
    y, m = total // 12, total % 12 + 1
    if not 1 <= y <= 9999:
        raise ValueError("Dönem desteklenen tarih aralığının dışında.")
    return f"{y:04d}-{m:02d}"


def ay_ekle(iso, n=1, anchor_day=None):
    d = date.fromisoformat(str(iso))
    y, m = (int(x) for x in donem_ekle(d.strftime("%Y-%m"), n).split("-"))
    day = int(anchor_day) if anchor_day is not None else d.day
    if not 1 <= day <= 31:
        raise ValueError("Ödeme günü 1 ile 31 arasında olmalı.")
    return date(y, m, min(day, calendar.monthrange(y, m)[1])).isoformat()


def sonraki_odeme(iso, siklik="aylik", n=1, anchor_day=None):
    d = date.fromisoformat(str(iso))
    if siklik == "gunluk":
        return (d + timedelta(days=int(n))).isoformat()
    if siklik == "haftalik":
        return (d + timedelta(weeks=int(n))).isoformat()
    months = {"aylik": 1, "uc_aylik": 3, "yillik": 12}
    if siklik not in months:
        raise ValueError("Desteklenmeyen ödeme sıklığı.")
    return ay_ekle(d.isoformat(), months[siklik] * int(n), anchor_day)


def donem_tarih(tarih, kesim_gunu=None):
    d = date.fromisoformat(str(tarih))
    period = d.strftime("%Y-%m")
    if kesim_gunu is None:
        return period
    day = int(kesim_gunu)
    if not 1 <= day <= 31:
        raise ValueError("Kesim günü 1 ile 31 arasında olmalı.")
    cutoff = min(day, calendar.monthrange(d.year, d.month)[1])
    return donem_ekle(period, 1) if d.day > cutoff else period


def donem_adi(period):
    if not donem_gecerli(period):
        return "—" if period is None else str(period)
    y, m = period.split("-")
    return f"{AY[int(m) - 1]} {y}"


def tarih_kisa(iso):
    try:
        d = date.fromisoformat(str(iso))
        return f"{d.day} {AY[d.month - 1][:3]}"
    except (TypeError, ValueError):
        return "-"


def tarih_uzun(iso):
    try:
        return date.fromisoformat(str(iso)).strftime("%d.%m.%Y")
    except (TypeError, ValueError):
        return "-"


def kalan_gun(iso):
    try:
        return (date.fromisoformat(str(iso)) - bugun()).days
    except (TypeError, ValueError):
        return None
