"""Require the host's access code before serving the private LAN wallet."""

import secrets
from urllib.parse import parse_qs

from starlette.requests import HTTPConnection, Request
from starlette.responses import HTMLResponse, RedirectResponse


LOGIN = "/_ekstre_access"
COOKIE = "__Host-ekstre-session"
LOGIN_PAGE = """<!doctype html>
<html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Finans Cüzdanım Mobil</title>
<style>
body{margin:0;padding:1.25rem;background:#11181e;color:#edf2f5;font:1rem system-ui,sans-serif}
main{max-width:26rem;margin:12vh auto 0;background:#1c252d;border-radius:1rem;padding:1.35rem}
h1{font-size:1.45rem}p{line-height:1.5}label{display:block;margin-bottom:.35rem}
input,button{box-sizing:border-box;width:100%;min-height:44px;font:inherit;border-radius:.5rem;padding:.5rem}
input{background:#11181e;color:inherit;border:1px solid #85939c}
button{margin-top:.9rem;background:#8ed5b7;color:#11181e;border:0;font-weight:650}
</style>
<main><h1>Finans Cüzdanım Mobil</h1>
<p>Bilgisayardaki başlatma ekranında görünen erişim kodunu gir.</p>
{error}
<form method="post" action="/_ekstre_access">
<label for="code">Erişim kodu</label><input id="code" name="code" type="password" required maxlength="128">
<button>Mobil cüzdanı aç</button></form></main></html>"""
HEADERS = {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
}


class AccessGate:
    def __init__(self, app, *, origin, access_code, session_token):
        self.app = app
        self.origin = origin
        self.access_code = access_code.encode()
        self.session_token = session_token

    async def __call__(self, scope, receive, send):
        if scope["type"] not in {"http", "websocket"}:
            return await self.app(scope, receive, send)

        connection = HTTPConnection(scope)
        cookie = connection.cookies.get(COOKIE, "")
        allowed = secrets.compare_digest(cookie.encode(), self.session_token.encode())
        same_origin = connection.headers.get("origin") == self.origin

        if scope["type"] == "websocket":
            if allowed and same_origin:
                return await self.app(scope, receive, send)
            return await send({"type": "websocket.close", "code": 1008})

        if scope["path"] == LOGIN:
            request = Request(scope, receive)
            response = await self.login(request, same_origin)
        elif allowed:
            return await self.app(scope, receive, send)
        else:
            response = RedirectResponse(LOGIN, status_code=303, headers=HEADERS)
        await response(scope, receive, send)

    async def login(self, request, same_origin):
        if request.method == "GET":
            return HTMLResponse(LOGIN_PAGE.replace("{error}", ""), headers=HEADERS)

        if (request.method == "POST" and same_origin and
                request.headers.get("content-type") == "application/x-www-form-urlencoded"):
            body = bytearray()
            async for chunk in request.stream():
                if len(body) + len(chunk) > 512:
                    break
                body.extend(chunk)
            else:
                try:
                    form = parse_qs(body.decode("ascii"), strict_parsing=True, max_num_fields=1)
                    code = form.get("code", [""])[0]
                except ValueError:
                    code = ""
                if secrets.compare_digest(code.encode(), self.access_code):
                    response = RedirectResponse("/", status_code=303, headers=HEADERS)
                    response.set_cookie(COOKIE, self.session_token, secure=True, httponly=True, samesite="strict")
                    return response

        return HTMLResponse(LOGIN_PAGE.replace("{error}", "<p role='alert'>Erişim kodu doğrulanamadı.</p>"),
                            status_code=403, headers=HEADERS)
