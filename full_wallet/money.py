"""Parasal değerleri depolama ve toplamada kuruş cinsinden kullan."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


def cents(value):
    if value is None:
        return None
    try:
        d = Decimal(str(value))
        if not d.is_finite():
            raise ValueError("Tutar sonlu bir sayı olmalı.")
        return int((d * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Geçerli bir tutar girin.") from exc


def amount(value):
    return None if value is None else int(value) / 100


def total(values):
    return sum(cents(v) or 0 for v in values) / 100
