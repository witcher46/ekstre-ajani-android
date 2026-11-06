"""Launch the independent mobile full wallet on a Windows computer."""

import argparse
import ipaddress
import os
from pathlib import Path
import secrets
import sys
from tempfile import TemporaryDirectory


WALLET = Path(__file__).resolve().parent / "full_wallet"
LOCAL = "127.0.0.1"
PRIVATE_NETWORKS = tuple(ipaddress.ip_network(network) for network in
                         ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))


def launch_options(argv):
    parser = argparse.ArgumentParser(description="Finans Cüzdanım Mobil")
    parser.add_argument("--demo", action="store_true", help="Geçici örnek kayıtlarla aç.")
    parser.add_argument("--lan", metavar="IP", help="Bilgisayarın özel ağ IPv4 adresi.")
    parser.add_argument("--port", type=int, default=4174)
    parser.add_argument("--cert", type=lambda path: Path(path).resolve(), help="HTTPS sertifikası (PEM).")
    parser.add_argument("--key", type=lambda path: Path(path).resolve(), help="HTTPS anahtarı (PEM).")
    args = parser.parse_args(argv)
    if not 1024 <= args.port <= 65535:
        parser.error("Bağlantı noktası 1024 ile 65535 arasında olmalı.")
    if args.lan:
        try:
            address = ipaddress.IPv4Address(args.lan)
        except ValueError:
            parser.error("--lan için özel ağ IPv4 adresi gir.")
        if not any(address in network for network in PRIVATE_NETWORKS):
            parser.error("--lan için bilgisayarın özel Wi-Fi adresini gir.")
    if args.cert or args.key:
        if not args.lan or not all(path and path.is_file() for path in (args.cert, args.key)):
            parser.error("HTTPS için --lan, mevcut --cert ve --key dosyaları gerekli.")
    if args.lan and not args.demo and not args.cert:
        parser.error("Kişisel kayıtları Wi-Fi üzerinden açmak için --cert ve --key gerekli. Örnek verilerle --demo kullan.")
    return args


def seed_demo():
    from datetime import timedelta

    import db
    import zaman

    day = zaman.bugun()
    db.init()
    card = db.kart_bul_veya_olustur("QNB", "Örnek kart")
    account = db.hesap_ekle("Örnek banka hesabı", baslangic=12000)
    db.manuel_ekle(card, (day - timedelta(days=3)).isoformat(), "Örnek market", 635.50, "harcama", "Market / Gıda")
    db.manuel_ekle(card, day.isoformat(), "Örnek kafe", 150, "harcama", "Dışarıda yeme")
    db.hesap_hareketi_ekle(account, day.isoformat(), "Örnek ulaşım", 90, "gider", "Ulaşım")
    db.butce_kaydet({db.TOPLAM_HEDEF: 7000, "Market / Gıda": 2500})
    db.abonelik_kaydet("Örnek abonelik", 99, (day + timedelta(days=7)).isoformat(), kart_id=card)


def serve(args):
    import streamlit as st
    from starlette.middleware import Middleware
    from starlette.middleware.trustedhost import TrustedHostMiddleware

    from access_gate import AccessGate

    address = args.lan or LOCAL
    hosts = [address] if args.lan else [address, "localhost"]
    origin = f"{'https' if args.cert else 'http'}://{address}:{args.port}"
    middleware = [Middleware(TrustedHostMiddleware, allowed_hosts=hosts)]
    config = {"server.address": address, "server.port": args.port, "server.headless": True,
              "server.fileWatcherType": "none", "server.baseUrlPath": "", "server.allowedHosts": hosts,
              "server.enableCORS": True, "server.enableXsrfProtection": True,
              "browser.serverAddress": address, "browser.gatherUsageStats": False}
    if args.cert:
        access_code = secrets.token_urlsafe(18)
        middleware.append(Middleware(AccessGate, origin=origin, access_code=access_code,
                                     session_token=secrets.token_urlsafe(32)))
        config.update({"server.sslCertFile": str(args.cert), "server.sslKeyFile": str(args.key)})
        print(f"Telefon erişim kodu: {access_code}", flush=True)
    if args.demo:
        print("Örnek cüzdan. Yalnızca sentetik test verisi kullan.", flush=True)
    print(f"Mobil cüzdan: {origin}", flush=True)
    st.App(WALLET / "app.py", middleware=middleware).run(config=config)


def main(argv=None):
    args = launch_options(argv)
    sys.argv[0] = str(Path(__file__).resolve())
    os.chdir(WALLET)
    sys.path.insert(0, str(WALLET))
    os.environ.pop("EKSTRE_MOBILE_DEMO_DIR", None)
    os.environ["STREAMLIT_SERVER_COOKIE_SECRET"] = secrets.token_hex(32)
    if args.demo:
        os.environ.pop("ANTHROPIC_API_KEY", None)
        with TemporaryDirectory(prefix="ekstre-mobil-demo-", ignore_cleanup_errors=True) as folder:
            os.environ["EKSTRE_MOBILE_DEMO_DIR"] = folder
            seed_demo()
            serve(args)
    else:
        serve(args)


if __name__ == "__main__":
    main()
