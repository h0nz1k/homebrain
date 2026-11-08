"""Synthetic Tecomat Foxtrot WebMaker web server for the Topení tests.

Every address, page number, compile ID and value here is made up; nothing comes from a real
installation. The server mimics the protocol shape only: login form + ``SoftPLC`` cookie,
SHA-1 hashed password, ``x-tecomat: data`` XML pages in windows-1250, 302 to the login form
when the session is gone, two-hop logout.
"""

from __future__ import annotations

import hashlib
import secrets
import time
import urllib.parse
from typing import Any

from aiohttp import web

USER = "reader"
PASSWORD = "-".join(("not", "a", "secret"))  # synthetic test credential
UCID = {17: "4242", 8: "777", 26: "31"}

# Synthetic page layout: same grammar as the real thing, invented addresses.
PAGES: dict[int, dict[str, str]] = {
    17: {
        "__X300_REAL_04.1f": "021.4",  # reference room
        "__R7000_REAL_.1f": "21.5",  # reference room target (user)
        "__R7004_REAL_04.1f": "21.5",  # effective target
        "__R7008_REAL_.1f": "0.2",  # hysteresis
        "__X312_REAL_04.1f": "020.1",  # attic
        "__Y50.1_BOOL_i": "1",  # house circuit pump
        "__X324_REAL_04.1f": "031.0",  # supply to house
        "__Y50.7_BOOL_i": "0",  # compressor
        "__X336_REAL_04.1f": "040.2",  # condenser out
        "__X348_REAL_04.1f": "036.0",  # return
        "__X360_REAL_04.1f": "006.1",  # brine in
        "__X372_REAL_04.1f": "003.9",  # brine out
        "__X384_REAL_04.1f": "047.5",  # tank top / DHW
        "__X396_REAL_04.1f": "041.0",  # tank bottom
        "__R7012_REAL_04.1f": "042.0",  # tank target
        "__R7016_REAL_.1f": "4.0",  # tank hysteresis
        "__R7020_REAL_.1f": "45.0",  # DHW target
        "__R7024_REAL_.1f": "3.0",  # DHW hysteresis
        "__Y51.0_BOOL_i": "0",  # DHW valve
        "__X408_REAL_.1f": "-1.5",  # outdoor
        "__R7030.0_BOOL_i": "1",  # winter
        "__R7031.3_BOOL_i": "1",  # auto season
        "__R7032.0_BOOL_i": "1",  # setback flag (0 = active)
        "__R7031.6_BOOL_i": "1",  # main switch
        "__X60.5_BOOL_i": "1",  # low tariff
        "__R7040_INT_06d": "001234",  # motohours
        "__R7042_INT_03d": "030",  # motominutes
        "__R7050.3_BOOL_i": "0",  # compressor block
        "__R7051.0_BOOL_i": "0",  # fatal
        "__Y50.5_BOOL_i": "0",  # secondary pump
    },
    8: {
        "__R7100.0_BOOL_i": "0",
        "__R7100.1_BOOL_i": "0",
        "__R7050.3_BOOL_i": "0",
    },
    26: {
        "__R7200_TIME_Thh:mm": "05:30",
        "__R7204_TIME_Thh:mm": "21:00",
        "__X408_REAL_.0f": "-2",
    },
}


def page_xml(page: int, values: dict[str, str]) -> bytes:
    rows = "".join(f'<INPUT NAME="{name}" VALUE="{value}" />\n' for name, value in values.items())
    text = (
        '<?xml version="1.0" encoding="windows-1250"?>\n'
        f'<PAGE TITLE="Ukázka / TOPENÍ – čerpadlo">\n'
        f'<ACCESS PAGE_LEVEL="0" USER_LEVEL="0" UCID="{UCID.get(page, "1")}" />\n'
        f"{rows}</PAGE>\n"
    )
    return text.encode("cp1250")


class FakePlc:
    """aiohttp app with request log, session expiry and a switchable password."""

    def __init__(self) -> None:
        self.pages = {n: dict(v) for n, v in PAGES.items()}
        self.password = PASSWORD
        self.sessions: set[str] = set()
        self.log: list[tuple[float, str, str]] = []
        self.logins = 0
        self.app = web.Application()
        self.app.router.add_route("*", "/{tail:.*}", self.handle)

    def expire_all(self) -> None:
        self.sessions.clear()

    def _login_form(self, acer: str = "0") -> web.Response:
        body = f'<LOGIN><USER VALUE=""/><PASS VALUE=""/><ACER VALUE="{acer}"/></LOGIN>'
        return web.Response(body=body.encode("cp1250"), content_type="text/xml")

    async def handle(self, request: web.Request) -> web.StreamResponse:
        path = request.path
        self.log.append((time.monotonic(), request.method, path))
        cookie = request.cookies.get("SoftPLC")
        low = path.lower()
        if low == "/syswww/login.xml" and request.method == "GET":
            if not cookie:
                resp = web.HTTPFound("/syswww/login.xml")
                resp.set_cookie("SoftPLC", secrets.token_hex(8), path="/")
                raise resp
            return self._login_form()
        if path == "/syswww/LOGIN.XML" and request.method == "POST":
            form = await request.post()
            expected = hashlib.sha1(
                (urllib.parse.unquote(cookie or "") + self.password).encode()
            ).hexdigest()
            if form.get("USER") == USER and cookie and form.get("PASS") == expected:
                self.sessions.add(cookie)
                self.logins += 1
                raise web.HTTPFound("/PAGE15.XML")
            raise web.HTTPFound("/syswww/login.xml")
        if low == "/logout.xml":
            raise web.HTTPFound("/syswww/logout.xml")
        if low == "/syswww/logout.xml":
            self.sessions.discard(cookie or "")
            raise web.HTTPFound("/syswww/login.xml")
        if path.startswith("/PAGE") and path.endswith(".XML") and request.method == "GET":
            if not cookie or cookie not in self.sessions:
                raise web.HTTPFound("/syswww/login.xml")
            if request.headers.get("x-tecomat") != "data":
                return web.Response(status=400)
            try:
                page = int(path[5:-4])
            except ValueError:
                return web.Response(status=404)
            if page not in self.pages:
                return web.Response(status=404)
            return web.Response(body=page_xml(page, self.pages[page]), content_type="text/xml")
        return web.Response(status=405 if request.method != "GET" else 404)

    def posts(self) -> list[str]:
        return [path for _, method, path in self.log if method != "GET"]


EXAMPLE_MAP = """
version: 1
pages:
  17: 30
  8: 60
  26: 900
ucid:
  17: 4242
keys:
  house.ref_temp: {page: 17, var: X300}
  house.ref_target: {page: 17, var: R7000}
  house.ref_target_effective: {page: 17, var: R7004}
  house.hysteresis: {page: 17, var: R7008}
  house.attic_temp: {page: 17, var: X312}
  house.circuit_on: {page: 17, var: Y50.1}
  house.supply_temp: {page: 17, var: X324}
  heat_pump.compressor_on: {page: 17, var: Y50.7}
  heat_pump.condenser_out: {page: 17, var: X336}
  heat_pump.return_temp: {page: 17, var: X348}
  heat_pump.brine_in: {page: 17, var: X360}
  heat_pump.brine_out: {page: 17, var: X372}
  heat_pump.motohours: {page: 17, var: R7040}
  heat_pump.motominutes: {page: 17, var: R7042}
  tank.top: {page: 17, var: X384}
  tank.bottom: {page: 17, var: X396}
  tank.target: {page: 17, var: R7012}
  tank.hysteresis: {page: 17, var: R7016}
  dhw.temp: {page: 17, var: X384}
  dhw.target: {page: 17, var: R7020}
  dhw.hysteresis: {page: 17, var: R7024}
  dhw.valve_to_dhw: {page: 17, var: Y51.0}
  outdoor.temp: {page: 17, var: X408}
  mode.winter: {page: 17, var: R7030.0}
  mode.auto_season: {page: 17, var: R7031.3}
  mode.setback_active: {page: 17, var: R7032.0, invert: true}
  mode.main_switch: {page: 17, var: R7031.6}
  mode.hdo_low_tariff: {page: 17, var: X60.5}
  pumps.secondary: {page: 17, var: Y50.5}
  faults.compressor_block: {page: 17, var: R7050.3}
  faults.fatal: {page: 17, var: R7051.0}
  something.unknown: {page: 17, var: X1}
faults:
  - {key: f_01, page: 8, var: R7100.0, label: "Vysoký tlak"}
  - {key: f_02, page: 8, var: R7100.1, label: "Čidlo venku"}
schedules:
  - key: setback
    label: Komfort
    page: 26
    slots: [[R7200, R7204]]
"""


def write_map(path: Any, text: str = EXAMPLE_MAP) -> str:
    path.write_text(text, encoding="utf-8")
    return str(path)
