"""Ortak arayüz parçaları: biçimlendirme, kart/satır HTML'i, seçiciler, boş durum."""
import html

import pandas as pd
import streamlit as st

from zaman import donem_adi, kalan_gun, tarih_kisa  # noqa: F401  (views buradan alır)

IKON = {"Akaryakıt": "⛽", "Market / Gıda": "🛒", "Dışarıda yeme": "🍽️", "Fatura / İnternet": "🧾",
        "Abonelik": "🔁", "Oyun / Dijital": "🎮", "Online alışveriş": "📦", "Faiz / Ücret": "⚠️",
        "İndirim / İade": "↩️", "Ödeme": "✅", "Diğer": "🏷️"}
CSS = """<style>
:root{--w-accent:#8ed5b7;--w-accent-soft:#213d33;--w-panel:var(--secondary-background-color,#1c252d);--w-text:var(--text-color,#edf2f5);--w-muted:#a5b1bb;--w-line:rgba(151,172,186,.2)}
[data-testid="stAppViewContainer"]{background:var(--background-color,#11181e)}
[data-testid="stToolbar"]>div>div:has([data-testid="stMainMenu"]){display:none!important}
[data-testid="stHeader"]{background:var(--background-color,#11181e)}
[data-testid="stMainBlockContainer"]{max-width:1440px;padding:2.4rem 2.8rem 3rem}
[data-testid="stSidebar"]{border-right:1px solid var(--w-line)}
[data-testid="stSidebar"]>div{padding-top:1.1rem}
[data-testid="stSidebar"] [data-testid="stPageLink"] a{padding:.65rem .8rem;border-radius:9px;font-size:.91rem}
[data-testid="stSidebar"] [data-testid="stPageLink"] a[aria-current="page"]{background:var(--w-accent-soft);color:var(--w-accent)}
[data-testid="stSidebar"] [data-testid="stCaptionContainer"]{font-size:.75rem}
[data-testid="stMetric"]{padding:18px 20px;background:var(--w-panel);border:1px solid var(--w-line);border-radius:13px;min-height:116px}
[data-testid="stMetricLabel"]{color:var(--w-muted);font-size:.85rem}
[data-testid="stMetricValue"]{font-size:1.9rem;font-weight:600;letter-spacing:-.7px}
[data-testid="stMetricDelta"]{font-size:.8rem}
h1{font-size:2rem!important;letter-spacing:-.8px!important}h2{font-size:1.3rem!important}h3{font-size:1.02rem!important}
[data-testid="stVerticalBlockBorderWrapper"]{border-color:var(--w-line)!important;border-radius:13px!important;background:var(--w-panel)}
[data-testid="stForm"]{border-color:var(--w-line);border-radius:12px}
button[kind="primary"]{font-weight:600;border-radius:8px}
[data-testid="stTabs"] [data-baseweb="tab-list"]{gap:22px;border-bottom:1px solid var(--w-line)}
.w-brand{display:flex;align-items:center;gap:10px;font-weight:650;letter-spacing:-.5px;font-size:1.35rem;margin:0 0 8px}
.w-brand-mark{height:30px;width:30px;border:1px solid var(--w-accent);border-radius:9px;color:var(--w-accent);display:grid;place-items:center;font-size:19px}
.w-eyebrow{font-size:.7rem;letter-spacing:1.35px;color:var(--w-muted);text-transform:uppercase;margin-bottom:5px}
.w-page-title{font-size:1.85rem;font-weight:650;letter-spacing:-.8px;margin:0;color:var(--w-text)}
.w-page-sub{font-size:.85rem;color:var(--w-muted);margin:4px 0 14px;max-width:860px}
.w-section{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:2px 0 14px}
.w-section b{font-size:1rem;font-weight:600}.w-section small{font-size:.76rem;color:var(--w-muted)}
.w-card{border-radius:12px;padding:17px 18px;color:var(--w-text);min-height:165px;border:1px solid var(--w-line);background:var(--w-panel);margin:0 0 8px}
.w-card.on{background:var(--w-accent-soft);border-color:var(--w-accent)}
.w-top{display:flex;justify-content:space-between;align-items:center;font-weight:600;gap:12px}.w-name{font-size:.76rem;color:var(--w-muted);margin-top:2px}
.w-bank-badge{font-size:.67rem;padding:3px 7px;border-radius:5px;background:rgba(151,172,186,.14);font-weight:400}
.w-debt{margin-top:13px}.w-debt small{display:block;color:var(--w-muted);font-size:.72rem}.w-debt b{font-size:1.55rem;font-weight:600;letter-spacing:-.5px}
.w-bar{height:5px;background:rgba(151,172,186,.15);border-radius:6px;margin:12px 0 9px;overflow:hidden}.w-bar i{display:block;height:100%;background:var(--w-accent);border-radius:6px}
.w-foot{display:flex;justify-content:space-between;font-size:.7rem;color:var(--w-muted);gap:10px;flex-wrap:wrap}
.w-day{font-size:.72rem;color:var(--w-muted);margin:15px 0 3px;font-weight:500;letter-spacing:.5px}
.w-row{display:flex;align-items:center;gap:12px;padding:11px 2px;border-bottom:1px solid var(--w-line)}
.w-ic{width:31px;height:31px;border-radius:9px;background:rgba(151,172,186,.09);display:flex;align-items:center;justify-content:center;font-size:.9rem;flex:none}
.w-mid{flex:1;min-width:0}.w-mid b{display:block;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.87rem}.w-mid small{color:var(--w-muted);font-size:.75rem}
.w-amt{font-weight:500;font-size:.87rem;font-variant-numeric:tabular-nums;white-space:nowrap}.w-amt.pos{color:var(--w-accent)}
.w-tag{display:inline-block;font-size:.63rem;padding:2px 6px;border-radius:5px;background:rgba(151,172,186,.14);margin-left:5px;vertical-align:middle}
.w-data-age{font-size:.76rem;color:var(--w-muted);padding:9px 0}.w-empty{padding:18px 0;color:var(--w-muted);font-size:.88rem}
.w-calendar{width:100%;font-family:inherit;color:var(--w-text);border-collapse:separate;border-spacing:5px;table-layout:fixed}.w-calendar th{font-family:inherit;font-size:.75rem;font-weight:500;color:var(--w-muted);padding:8px;background:transparent}.w-calendar td{vertical-align:top;height:100px;padding:8px;border:1px solid var(--w-line);border-radius:8px;background:var(--w-panel);font-size:.8rem}.w-calendar td.blank{border-color:transparent;background:transparent}.w-calendar-day{color:var(--w-muted);margin-bottom:8px}.w-calendar-event{font-size:.7rem;padding:4px 6px;border-radius:5px;margin:4px 0;background:var(--w-accent-soft);overflow-wrap:anywhere}.w-calendar-event.estimate{background:rgba(151,172,186,.1)}.w-calendar-event b{display:block;font-weight:500}
@media(max-width:900px){[data-testid="stMainBlockContainer"]{padding:1.4rem 1.2rem 2rem}.w-calendar td{padding:5px;height:90px}.w-calendar-event{padding:3px;font-size:.65rem}}
@media(max-width:640px){.w-card{min-height:155px}.w-page-title{font-size:1.55rem}.w-row{gap:8px}.w-amt{font-size:.8rem}.w-mid b{max-width:190px}.w-calendar{border-spacing:2px}.w-calendar th{padding:4px}.w-calendar-event{font-size:.6rem}}
</style>"""


def tl(x, ondalik=2):
    if x is None or pd.isna(x):
        return "-"
    s = f"{x:,.{ondalik}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".") + " TL"


def kart_html(o, aktif=False):
    debt = o.get("borc")
    limit = o.get("limit")
    pct = max(0, min(100, (debt or 0) / limit * 100)) if limit else 0
    due = f"Son ödeme {tarih_kisa(o['son_odeme'])}" if o.get("son_odeme") else "Son ödeme bilgisi yok"
    label = {"ekstre": "Son ekstre borcu", "guncel_tahmin": "Güncel tahmini borç", "islemlerden": "İşlemlerden hesaplanan"}.get(o.get("borc_kaynak"), "Henüz ekstre yok")
    return (f'<div class="w-card{" on" if aktif else ""}"><div class="w-top"><span>{html.escape(str(o.get("bank", "Kart")))}</span>'
            f'<span class="w-bank-badge">{html.escape(str(o.get("name") or "Kredi kartı"))}</span></div>'
            f'<div class="w-debt"><small>{label}</small><b>{tl(debt)}</b></div>'
            f'<div class="w-bar"><i style="width:{pct:.0f}%"></i></div><div class="w-foot">'
            f'<span>{"Limit " + tl(limit, 0) if limit is not None else "Limit bilgisi yok"}</span><span>{due}</span></div></div>')


def satir_html(r):
    pos = r["amount"] < 0 or r["tur"] == "odeme"
    ek = ""
    if r.get("installment"):
        ek += f" · {html.escape(str(r['installment']))} taksit"
    etiket = '<span class="w-tag">manuel</span>' if r.get("source") == "manuel" else ""
    isaret = "+" if pos else ""
    return (f'<div class="w-row"><div class="w-ic">{IKON.get(r["category"], "🏷️")}</div>'
            f'<div class="w-mid"><b>{html.escape(str(r["desc"]).title())}{etiket}</b>'
            f'<small>{html.escape(r["category"])}{ek}</small></div>'
            f'<div class="w-amt{" pos" if pos else ""}">{isaret}{tl(abs(r["amount"]))}</div></div>')


def satirlar_html(df, limit=None):
    """İşlem tablosunu güne göre gruplayıp HTML liste üretir."""
    if limit:
        df = df.head(limit)
    parcalar = []
    for tarih, g in df.groupby("date", sort=False):
        parcalar.append(f'<div class="w-day">{tarih_kisa(tarih)}</div>')
        parcalar += [satir_html(r) for _, r in g.iterrows()]
    return "".join(parcalar)


def kategori_satiri_html(kat, tutar, pay):
    return (f'<div class="w-row"><div class="w-ic">{IKON.get(kat, "🏷️")}</div>'
            f'<div class="w-mid"><b>{html.escape(kat)}</b><small>%{pay:.0f}</small></div>'
            f'<div class="w-amt">{tl(tutar)}</div></div>')


def asgari_faiz_tahmini(borc, asgari, aylik_oran):
    kalan = max(borc - (asgari or 0), 0)
    return kalan, kalan * float(aylik_oran)


def oran(x):
    """İade fazlası ve aşım durumlarında da görsel ilerleme geçerli kalır."""
    return max(0.0, min(float(x or 0), 1.0))


# ---------------------------------------------------------------- Streamlit yardımcıları
def bos_durum():
    st.info("Bir banka/nakit hesabı veya kart ekleyerek başlayın. İşlemlerinizi elle girebilir ya da ekstre PDF'si yükleyebilirsiniz.")
    a, b = st.columns(2)
    a.page_link("views/hesaplar.py", label="Hesap oluştur", icon="🏦")
    b.page_link("views/ekstreler.py", label="Kart ekle / ekstre yükle", icon="📄")


def kart_sec(ozetler, etiket="Kart", tumu=False, key=None):
    """Kart seçici; seçim sayfalar arasında hatırlanır (st.session_state['nav_kart'])."""
    etiketler = {o["id"]: o["label"] for o in ozetler}
    secenekler = (["Tümü"] if tumu else []) + [o["id"] for o in ozetler]
    if not secenekler:
        return "Tümü" if tumu else None
    varsayilan = st.session_state.get("nav_kart")
    if varsayilan not in secenekler:
        varsayilan = secenekler[0]
    widget_key = key or "kart_sec_" + st.session_state.get("_active_page", "sayfa")
    if widget_key not in st.session_state or st.session_state.get(widget_key) not in secenekler:
        st.session_state[widget_key] = varsayilan
    wanted = st.session_state.pop("_nav_kart_pending", None)
    if wanted in secenekler:
        st.session_state[widget_key] = wanted
    secim = st.selectbox(etiket, secenekler, key=widget_key,
                         format_func=lambda i: "Tüm kartlar" if i == "Tümü" else etiketler[i])
    st.session_state["nav_kart"] = secim
    return secim


def kart_filtre(df, secim):
    return df if secim == "Tümü" else df[df["card_id"] == secim]


def kart_ac(kart_id, sayfa):
    """Başka sayfaya geçerken kartı seçili taşır."""
    st.session_state["nav_kart"] = kart_id
    st.session_state["_nav_kart_pending"] = kart_id
    st.switch_page(sayfa)


# ---------------------------------------------------------------- grafikler
def donut(poz):
    """poz: 'Kategori' ve 'Tutar' sütunlu DataFrame."""
    import altair as alt
    return alt.Chart(poz).mark_arc(innerRadius=70).encode(
        theta="Tutar:Q", color=alt.Color("Kategori:N", legend=None),
        tooltip=["Kategori", alt.Tooltip("Tutar:Q", format=",.0f")])


def yatay_bar(df, etiket, deger="Tutar"):
    import altair as alt
    return alt.Chart(df).mark_bar().encode(
        x=f"{deger}:Q", y=alt.Y(f"{etiket}:N", sort="-x"),
        tooltip=[etiket, alt.Tooltip(f"{deger}:Q", format=",.0f")])


def kategori_listesi(poz):
    toplam = poz["Tutar"].sum()
    return "".join(kategori_satiri_html(r.Kategori, r.Tutar, r.Tutar / toplam * 100) for r in poz.itertuples())


def kategori_toplamlari(df):
    """Ödemeler hariç, pozitif kategori toplamları (grafik için)."""
    import services as sv
    if hasattr(sv, "kategori_toplamlari"):
        return sv.kategori_toplamlari(df, positive_only=True)
    kat = df[df["tur"] != "odeme"].groupby("category")["amount"].sum()
    poz = kat[kat > 0].sort_values(ascending=False).reset_index()
    poz.columns = ["Kategori", "Tutar"]
    return poz


def csv_bytes(df):
    """Excel'de açıldığında açıklamaların formül olarak çalışmasını engeller."""
    safe = df.copy()
    for column in safe.columns:
        safe[column] = safe[column].map(
            lambda value: "'" + value if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else value)
    return safe.to_csv(index=False).encode("utf-8-sig")


def page_header(title, subtitle="", eyebrow="FİNANS CÜZDANIM"):
    st.markdown(f'<div class="w-eyebrow">{html.escape(eyebrow)}</div><h1 class="w-page-title">{html.escape(title)}</h1>'
                + (f'<p class="w-page-sub">{html.escape(subtitle)}</p>' if subtitle else ""), unsafe_allow_html=True)
    context_help()


def context_help():
    from help_content import BY_ID, PAGE_TOPICS
    active = st.session_state.get("_active_page")
    topics = PAGE_TOPICS.get(active, ())
    if not topics:
        return
    with st.popover("Bu ekranı nasıl kullanırım?", icon=":material/help_outline:"):
        for topic in topics:
            item = BY_ID[topic]
            st.caption(item["summary"])
            if st.button(item["title"], key=f"help_topic_{active}_{topic}", width="stretch"):
                st.session_state["_help_request"] = {"section": "Kullanım rehberi", "topic": topic}
                st.switch_page("views/yardim.py")


def sidebar_active(page):
    # Native page_link exposes href, but does not emit aria-current in this version.
    href = "" if page == "genel_bakis" else str(page)
    if not href.replace("_", "").isalnum() and href:
        return
    selector = f':is([data-testid="stSidebar"],.st-key-mobile_nav) a[data-testid="stPageLink-NavLink"][href="{href}"]'
    st.markdown('<style>' + selector + '{background:var(--w-accent-soft);color:var(--w-accent);font-weight:600}'
                + selector + ' *{color:var(--w-accent)!important}</style>', unsafe_allow_html=True)


def section_header(title, detail=""):
    st.markdown(f'<div class="w-section"><b>{html.escape(title)}</b><small>{html.escape(detail)}</small></div>', unsafe_allow_html=True)


def wallet_tabs(current="cards"):
    a, b = st.columns(2)
    a.page_link("views/cuzdanim.py", label="Kredi kartları", icon=":material/credit_card:")
    b.page_link("views/hesaplar.py", label="Banka ve nakit hesapları", icon=":material/account_balance:")


def transaction_tabs(current="islemler"):
    a, b = st.columns(2)
    a.page_link("views/islemler.py", label="İşlem masası", icon=":material/receipt_long:")
    b.page_link("views/kategoriler.py", label="Kategoriler", icon=":material/category:")


def calendar_html(year, month, events):
    import calendar
    grouped = {}
    for _, row in events.iterrows():
        grouped.setdefault(str(row["date"]), []).append(row)
    parts = ['<table class="w-calendar" aria-label="Ödeme takvimi"><thead><tr>']
    parts += [f'<th>{day}</th>' for day in ("Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz")]
    parts.append('</tr></thead><tbody>')
    for week in calendar.monthcalendar(year, month):
        parts.append('<tr>')
        for day in week:
            if not day:
                parts.append('<td class="blank"></td>')
                continue
            key = f"{year:04d}-{month:02d}-{day:02d}"
            parts.append(f'<td><div class="w-calendar-day">{day}</div>')
            for row in grouped.get(key, []):
                cls = " estimate" if row.get("kind") in ("taksit", "tahmini") else ""
                parts.append(f'<div class="w-calendar-event{cls}">{html.escape(str(row["label"]))}<b>{tl(row["amount"])}</b><span>{html.escape(str(row["source"]))}</span></div>')
            parts.append('</td>')
        parts.append('</tr>')
    parts.append('</tbody></table>')
    return ''.join(parts)


def planning_links():
    a, b, c = st.columns(3)
    a.page_link("views/planlama.py", label="Ödeme takvimi ve planlama", icon=":material/calendar_month:")
    b.page_link("views/butce.py", label="Bütçe", icon=":material/savings:")
    c.page_link("views/taksit_abonelik.py", label="Taksit ve abonelikler", icon=":material/event_repeat:")
