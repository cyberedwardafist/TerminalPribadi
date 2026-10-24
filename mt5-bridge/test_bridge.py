"""Tes bridge tanpa MT5 sungguhan: modul MetaTrader5 ditiru. Jalankan: python test_bridge.py (butuh: pip install websockets)."""
import asyncio, json, sys, types
from collections import namedtuple

Tick = namedtuple("Tick", "time time_msc bid ask")
Info = namedtuple("Info", "digits")
Sym = namedtuple("Sym", "name")
state = {"bid": 2650.10}
fake = types.ModuleType("MetaTrader5")
fake.TIMEFRAME_D1, fake.TIMEFRAME_M1, fake.TIMEFRAME_M5, fake.TIMEFRAME_M15, fake.TIMEFRAME_H1, fake.TIMEFRAME_H4 = 16408, 1, 5, 15, 16385, 16388
fake.initialize = lambda **k: True
fake.terminal_info = lambda: object()
fake.shutdown = lambda: None
fake.last_error = lambda: (0, "ok")
fake.symbols_get = lambda: [Sym("XAUUSDm"), Sym("EURUSD"), Sym("EURUSDm"), Sym("GBPUSD")]
fake.symbol_select = lambda n, on: True
fake.symbol_info = lambda n: Info(2 if "XAU" in n else 5)
fake.symbol_info_tick = lambda n: Tick(1_700_000_000, 1_700_000_000_000 + int(state["bid"] * 100), state["bid"], state["bid"] + .25) if "XAU" in n else None
def rates_pos(n, tf, a, c): return [{"time": 1_700_000_000 + 7200 + 60 * i, "open": 2600.0, "close": 2640.0 + i, "high": 2660.0, "low": 2590.0, "tick_volume": 100 + i} for i in range(min(c, 3))]
def rates_from(n, tf, t, c): return [{"close": 2645.0 if t % 2 == 0 else 2646.0}]
fake.copy_rates_from_pos, fake.copy_rates_from = rates_pos, rates_from
sys.modules["MetaTrader5"] = fake

import os
os.environ["HEADMAPS_SYMBOLS"] = "XAUUSD,EURUSD,FOO"; os.environ["HEADMAPS_PORT"] = "18765"; os.environ["HEADMAPS_POLL_MS"] = "50"; os.environ["HEADMAPS_ORIGINS_URL"] = ""; os.environ["HEADMAPS_ORIGINS"] = "https://domain-baru.example"
import mt5_bridge as b
from websockets.asyncio.client import connect

async def run():
    b.resolve_all()
    assert b.MAP == {"XAUUSD": "XAUUSDm", "EURUSD": "EURUSD"}, b.MAP   # FOO dilewati, imbuhan m dikenali, persis menang
    task = asyncio.create_task(b.main())
    await asyncio.sleep(.4)
    async with connect("ws://127.0.0.1:18765") as ws:
        hello = json.loads(await ws.recv()); assert hello["t"] == "hello" and hello["symbols"] == ["XAUUSD", "EURUSD"], hello
        assert hello["ver"] == b.BRIDGE_VERSION and isinstance(b.BRIDGE_VERSION, int), hello   # app membandingkan ini dengan mt5-version.json
        assert b.autostart_install() is False and b.FROZEN is False   # jalan otomatis hanya untuk .exe di Windows
        tk = json.loads(await asyncio.wait_for(ws.recv(), 2))
        assert tk["s"] == "XAUUSD" and tk["b"] == 2650.10 and tk["a"] == 2650.35 and tk["d"] == 2, tk
        assert tk["hi"] == 2660.0 and tk["lo"] == 2590.0 and tk["r"]["1d"] == 2640.0 and tk["r"]["1h"] > 0, tk
        os.environ["MT5_UTC_OFFSET_HOURS"] = "2"   # paksa offset: bar 1_700_007_200 (jam server) = 1_700_000_000 UTC
        await ws.send(json.dumps({"t": "rates", "s": "XAUUSD", "tf": "5m", "n": 3, "id": 7}))
        while True:   # tick bisa menyela; cari jawaban rates
            rr = json.loads(await asyncio.wait_for(ws.recv(), 2))
            if rr["t"] == "rates": break
        assert rr["id"] == 7 and rr["tf"] == "5m" and rr["off"] == 7_200_000 and len(rr["bars"]) == 3, rr
        assert rr["bars"][0] == [1_700_000_000_000, 2600.0, 2660.0, 2590.0, 2640.0, 100.0], rr["bars"][0]
        await ws.send(json.dumps({"t": "rates", "s": "NOPE", "tf": "5m"}))
        while True:
            rr = json.loads(await asyncio.wait_for(ws.recv(), 2))
            if rr["t"] == "rates": break
        assert rr["bars"] == [], rr
        state["bid"] = 2651.0   # tick baru harus disiarkan
        tk2 = json.loads(await asyncio.wait_for(ws.recv(), 2))
        while tk2["t"] != "tick" or tk2["b"] != 2651.0:
            tk2 = json.loads(await asyncio.wait_for(ws.recv(), 2))
    # ---- penjagaan Origin: halaman web asing ditolak, app resmi dan domain tambahan boleh, klien tanpa Origin (non-peramban) boleh ----
    from websockets.exceptions import InvalidStatus
    try:
        async with connect("ws://127.0.0.1:18765", additional_headers={"Origin": "https://situs-jahat.example"}) as bad:
            raise AssertionError("origin asing seharusnya ditolak")
    except InvalidStatus as e:
        assert e.response.status_code == 403, e.response.status_code
    for ok in ("https://terminalpribadi.vercel.app", "http://localhost:3000", "https://domain-baru.example", "HTTPS://TerminalPribadi.vercel.app/"):
        async with connect("ws://127.0.0.1:18765", additional_headers={"Origin": ok}) as good:
            assert json.loads(await good.recv())["t"] == "hello", ok
    # daftar dari app: origin baru dari server ikut diizinkan; "*" dari server diabaikan; entri aneh dibuang
    b.REMOTE = [o for o in ["https://nanti-beli-domain.id", "*", "javascript:alert(1)"] if b.valid_origin(o)]
    assert b.REMOTE == ["https://nanti-beli-domain.id"], b.REMOTE
    assert b.origin_ok("https://nanti-beli-domain.id") and not b.origin_ok("https://lain.id") and b.origin_ok(None)
    task.cancel()
    print("OK bridge")
asyncio.run(run())
