#!/usr/bin/env python3
"""Headmaps MT5 bridge: membaca harga dari MetaTrader 5 di komputer ini lalu menyiarkannya lewat WebSocket lokal
ke app Headmaps (Terminal Chart). Hanya HARGA yang dikirim; tidak ada akun, saldo, atau fungsi trading.

Cara pakai (Windows; paket MetaTrader5 hanya ada untuk Windows):
  1. Buka MetaTrader 5, login ke broker, pastikan XAUUSD (dan simbol lain) ada di Market Watch.
  2. pip install -r requirements.txt
  3. python mt5_bridge.py        (biarkan jendela ini terbuka)
  4. Di Headmaps alamat bawaan sudah ws://127.0.0.1:8765

Pengaturan lewat environment variable (semua opsional):
  HEADMAPS_SYMBOLS   daftar simbol dipisah koma. Bawaan: XAUUSD,XAGUSD,EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,USDCHF,NZDUSD,EURJPY,GBPJPY
                     Nama broker berimbuhan (XAUUSDm, XAUUSD.a, XAUUSD#) dikenali otomatis; ke browser selalu dikirim nama baku (XAUUSD).
  HEADMAPS_HOST      alamat bind, bawaan 127.0.0.1 (hanya komputer ini). Isi 0.0.0.0 agar perangkat lain di LAN bisa memakai.
  HEADMAPS_PORT      bawaan 8765
  HEADMAPS_APP_URL   alamat app (bawaan https://terminalpribadi.vercel.app). Hanya halaman dari alamat yang diizinkan yang boleh membaca bridge.
  HEADMAPS_ORIGINS   origin TAMBAHAN yang diizinkan, dipisah koma (atau berkas origins.txt di folder ini). "*" = semua halaman (tidak disarankan).
  HEADMAPS_ORIGINS_URL  daftar origin resmi yang diambil bridge dari app (bawaan <APP_URL>/mt5-origins.json, disegarkan tiap jam, disimpan di
                     origins.cache.json). Dengan ini, kalau nanti app pindah ke domain baru, bridge lama ikut tahu tanpa diunduh ulang. Kosongkan untuk mematikan.
  Versi .exe: argumen --autostart / --no-autostart mengaktifkan / mematikan jalan otomatis saat Windows menyala; --version menampilkan nomor versi.
  HEADMAPS_POLL_MS   jeda baca tick, bawaan 200
  MT5_PATH           lokasi terminal64.exe bila MT5 tidak terdeteksi otomatis

Pesan ke klien (JSON):
  {"t":"hello","v":1,"symbols":["XAUUSD",...],"map":{"XAUUSD":"XAUUSDm"}}
  {"t":"tick","s":"XAUUSD","b":bid,"a":ask,"d":digits,"hi":high_hari_ini,"lo":low_hari_ini,"r":{"1h":..,"4h":..,"1d":..}}
      r = harga acuan: penutupan M1 sekitar 1 jam / 4 jam lalu dan penutupan D1 kemarin; Headmaps menghitung ubah% = (bid - r) / r
  {"t":"hb"}  detak tiap 5 detik
Permintaan dari klien -> jawaban (riwayat candle untuk heatmap):
  {"t":"rates","s":"XAUUSD","tf":"1m|5m|15m|1h|4h","n":1000,"id":1}
  -> {"t":"rates","s":..,"tf":..,"id":..,"off":ms,"bars":[[waktu_utc_ms,open,high,low,close,tick_volume],...]}
  Waktu bar MT5 memakai jam server broker; bridge mengoreksinya ke UTC (otomatis dari tick segar, atau paksa lewat MT5_UTC_OFFSET_HOURS, mis. 3).
"""
import asyncio
import json
import os
import re
import subprocess
import sys
import time
from http import HTTPStatus

import MetaTrader5 as mt5
from websockets.asyncio.server import serve
from websockets import broadcast

DEFAULT = "XAUUSD,XAGUSD,EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,USDCHF,NZDUSD,EURJPY,GBPJPY"
HOST = os.environ.get("HEADMAPS_HOST", "127.0.0.1")
PORT = int(os.environ.get("HEADMAPS_PORT", "8765"))
WANT = [s.strip().upper() for s in os.environ.get("HEADMAPS_SYMBOLS", DEFAULT).split(",") if s.strip()]
APP_URL = os.environ.get("HEADMAPS_APP_URL", "https://terminalpribadi.vercel.app").strip().rstrip("/")
ORIGINS_URL = os.environ.get("HEADMAPS_ORIGINS_URL", APP_URL + "/mt5-origins.json").strip()
BRIDGE_VERSION = 1   # NAIKKAN setiap kali bridge berubah, lalu bangun ulang .exe dan jalankan "npm run release:bridge" (app memberi tahu pengguna versi lama)
FROZEN = bool(getattr(sys, "frozen", False))
_HERE = os.path.dirname(sys.executable) if FROZEN else os.path.dirname(os.path.abspath(__file__))   # .exe: folder tempat file berada
CACHE_FILE = os.path.join(_HERE, "origins.cache.json")
BUILTIN = [APP_URL, "http://localhost:3000", "http://127.0.0.1:3000"]


def norm_origin(o):
    return str(o or "").strip().rstrip("/").lower()


def valid_origin(o):
    return bool(re.fullmatch(r"https?://[a-z0-9.\-\[\]:]{1,100}", o))


def _local_origins():
    """Origin tambahan dari env HEADMAPS_ORIGINS atau origins.txt (satu baris / beberapa baris, dipisah koma atau spasi; # = komentar)."""
    raw = os.environ.get("HEADMAPS_ORIGINS", "")
    if not raw.strip():
        try:
            with open(os.path.join(_HERE, "origins.txt"), encoding="utf-8") as f:
                raw = " ".join(l.split("#", 1)[0] for l in f)
        except OSError:
            raw = ""
    return [norm_origin(o) for o in raw.replace(",", " ").split() if o.strip()]


def _cached_origins():
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return [norm_origin(o) for o in json.load(f).get("origins", []) if valid_origin(norm_origin(o))][:50]
    except Exception:
        return []


REMOTE = _cached_origins()   # daftar dari app (cache dulu; disegarkan di latar belakang)


def allowed_origins():
    return {norm_origin(o) for o in BUILTIN} | set(_local_origins()) | set(REMOTE)


def origin_ok(origin):
    """Peramban selalu mengirim Origin; klien non-peramban (tanpa Origin) boleh, karena sudah berada di komputer ini."""
    if origin is None:
        return True
    al = allowed_origins()
    return "*" in al or norm_origin(origin) in al


def fetch_origins():
    """Ambil daftar origin dari app (HTTPS saja). Hanya origin http(s) yang valid yang diterima; '*' dari sumber jarak jauh diabaikan."""
    if not ORIGINS_URL.lower().startswith("https://"):
        return None
    import urllib.request
    req = urllib.request.Request(ORIGINS_URL, headers={"User-Agent": "headmaps-mt5-bridge"})
    with urllib.request.urlopen(req, timeout=6) as r:
        data = json.loads(r.read(20000).decode("utf-8"))
    out = [norm_origin(o) for o in data.get("origins", []) if isinstance(o, str)]
    return [o for o in out if valid_origin(o)][:50]


async def sync_origins():
    global REMOTE
    while True:
        try:
            got = await asyncio.to_thread(fetch_origins)
            if got:
                if got != REMOTE:
                    log("Daftar origin dari app diperbarui:", ", ".join(got))
                REMOTE = got
                try:
                    with open(CACHE_FILE, "w", encoding="utf-8") as f:
                        json.dump({"origins": got}, f)
                except OSError:
                    pass
        except Exception as e:
            log("Tidak bisa mengambil daftar origin dari app (pakai cadangan):", type(e).__name__)
        await asyncio.sleep(3600)


async def guard(connection, request):
    """Tolak sambungan dari halaman web yang origin-nya tidak diizinkan (sebelum handshake WebSocket selesai)."""
    o = request.headers.get("Origin")
    if origin_ok(o):
        return None
    log("Sambungan ditolak, origin tidak diizinkan:", o)
    return connection.respond(HTTPStatus.FORBIDDEN, "Origin tidak diizinkan\n")
POLL = max(0.05, int(os.environ.get("HEADMAPS_POLL_MS", "200")) / 1000)
REF_EVERY = 20  # detik
TF = {"1m": "TIMEFRAME_M1", "5m": "TIMEFRAME_M5", "15m": "TIMEFRAME_M15", "1h": "TIMEFRAME_H1", "4h": "TIMEFRAME_H4"}
_OFF = None  # selisih jam server broker terhadap UTC (detik), diingat dari tick segar terakhir

CLIENTS = set()
MAP = {}      # nama baku -> nama di broker
LAST = {}     # nama baku -> pesan tick terakhir (dikirim ke klien baru)
REFS = {}     # nama baku -> {"1h","4h","1d","hi","lo","d"}


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def connect():
    kw = {}
    if os.environ.get("MT5_PATH"):
        kw["path"] = os.environ["MT5_PATH"]
    return mt5.initialize(**kw)


def resolve(canon, names):
    """Cari nama simbol broker untuk nama baku: persis sama, atau yang berawalan sama (XAUUSDm, XAUUSD.a) dan paling pendek."""
    if canon in names:
        return canon
    cand = sorted((n for n in names if n.upper().startswith(canon)), key=len)
    return cand[0] if cand else None


def resolve_all():
    syms = mt5.symbols_get() or []
    names = [s.name for s in syms]
    MAP.clear()
    for c in WANT:
        b = resolve(c, names)
        if b and mt5.symbol_select(b, True):
            MAP[c] = b
        else:
            log("Simbol tidak ditemukan di broker ini, dilewati:", c)


def close_before(bsym, ts, tf):
    """Penutupan bar terakhir yang dibuka pada/ sebelum ts (waktu server MT5)."""
    r = mt5.copy_rates_from(bsym, tf, int(ts), 1)
    return float(r[-1]["close"]) if r is not None and len(r) else 0.0


def refresh_refs(canon, ts):
    b = MAP[canon]
    info = mt5.symbol_info(b)
    d1 = mt5.copy_rates_from_pos(b, mt5.TIMEFRAME_D1, 0, 2)
    o = {"d": int(info.digits) if info else 5, "hi": 0.0, "lo": 0.0, "1d": 0.0}
    if d1 is not None and len(d1):
        o["hi"], o["lo"] = float(d1[-1]["high"]), float(d1[-1]["low"])
        if len(d1) >= 2:
            o["1d"] = float(d1[-2]["close"])
    o["1h"] = close_before(b, ts - 3600, mt5.TIMEFRAME_M1)
    o["4h"] = close_before(b, ts - 4 * 3600, mt5.TIMEFRAME_M1)
    REFS[canon] = o


def server_offset():
    """Selisih waktu server broker terhadap UTC. Hanya dipercaya dari tick segar (selisih kelipatan 15 menit, maks +-14 jam)."""
    global _OFF
    env = os.environ.get("MT5_UTC_OFFSET_HOURS", "")
    if env.strip():
        return int(float(env) * 3600)
    for b in MAP.values():
        t = mt5.symbol_info_tick(b)
        if t and t.time:
            diff = t.time - time.time()
            off = round(diff / 900) * 900
            if abs(off) <= 14 * 3600 and abs(diff - off) < 150:
                _OFF = off
                break
    return _OFF or 0


def rates_reply(m):
    canon, b = m.get("s"), MAP.get(m.get("s"))
    tf = getattr(mt5, TF.get(m.get("tf"), ""), None)
    base = {"t": "rates", "s": canon, "tf": m.get("tf"), "id": m.get("id"), "bars": []}
    if not b or tf is None:
        return base
    n = max(10, min(int(m.get("n", 1000)), 5000))
    r = mt5.copy_rates_from_pos(b, tf, 0, n)
    off = server_offset()
    base["off"] = off * 1000
    if r is not None:
        base["bars"] = [[(int(x["time"]) - off) * 1000, float(x["open"]), float(x["high"]), float(x["low"]), float(x["close"]), float(x["tick_volume"])] for x in r]
    return base


def tick_msg(canon, t):
    r = REFS.get(canon, {})
    return {"t": "tick", "s": canon, "b": float(t.bid), "a": float(t.ask), "d": r.get("d", 5),
            "hi": r.get("hi", 0.0), "lo": r.get("lo", 0.0),
            "r": {k: r.get(k, 0.0) for k in ("1h", "4h", "1d")}}


async def poll():
    seen, last_ref, ok = {}, 0.0, True
    while True:
        try:
            if not mt5.terminal_info():
                if ok:
                    log("MT5 tidak terhubung, mencoba lagi...")
                ok = False
                if connect():
                    resolve_all()
                    ok = True
                    log("MT5 terhubung kembali")
                await asyncio.sleep(5)
                continue
            now = time.time()
            for canon, b in MAP.items():
                t = mt5.symbol_info_tick(b)
                if t is None or not t.bid:
                    continue
                if now - last_ref > REF_EVERY or canon not in REFS:
                    refresh_refs(canon, t.time or now)
                key = (t.time_msc, t.bid, t.ask)
                if seen.get(canon) != key:
                    seen[canon] = key
                    m = tick_msg(canon, t)
                    LAST[canon] = m
                    if CLIENTS:
                        broadcast(CLIENTS, json.dumps(m))
            if now - last_ref > REF_EVERY:
                last_ref = now
        except Exception as e:  # satu siklus gagal jangan mematikan bridge
            log("Kesalahan baca MT5:", e)
            await asyncio.sleep(2)
        await asyncio.sleep(POLL)


async def beat():
    while True:
        await asyncio.sleep(5)
        if CLIENTS:
            broadcast(CLIENTS, '{"t":"hb"}')


async def handler(ws):
    CLIENTS.add(ws)
    log("Klien tersambung (%d)" % len(CLIENTS))
    try:
        await ws.send(json.dumps({"t": "hello", "v": 1, "ver": BRIDGE_VERSION, "symbols": list(MAP), "map": MAP, "off": server_offset() * 1000}))
        for m in list(LAST.values()):
            await ws.send(json.dumps(m))
        async for raw in ws:
            try:
                m = json.loads(raw)
                if m.get("t") == "rates":
                    await ws.send(json.dumps(rates_reply(m)))
            except Exception as e:
                log("Pesan klien ditolak:", e)
    finally:
        CLIENTS.discard(ws)
        log("Klien putus (%d)" % len(CLIENTS))


async def main():
    if not connect():
        log("Gagal menyambung ke MT5:", mt5.last_error())
        log("Pastikan MetaTrader 5 terbuka dan sudah login (atau isi MT5_PATH).")
        sys.exit(1)
    resolve_all()
    if not MAP:
        log("Tidak ada simbol yang cocok. Tambahkan simbol ke Market Watch MT5 atau atur HEADMAPS_SYMBOLS.")
        sys.exit(1)
    log("Simbol:", ", ".join("%s%s" % (c, "" if c == b else " (%s)" % b) for c, b in MAP.items()))
    async with serve(handler, HOST, PORT, process_request=guard):
        log("Headmaps bridge aktif di ws://%s:%d" % (HOST, PORT))
        log("Halaman yang boleh membaca bridge:", ", ".join(sorted(allowed_origins())))
        tasks = [poll(), beat()] + ([sync_origins()] if ORIGINS_URL else [])
        await asyncio.gather(*tasks)


# ---------- jalan otomatis saat Windows menyala (hanya versi .exe) ----------
def _lnk():
    return os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Headmaps MT5 Bridge.lnk")


def autostart_on():
    return sys.platform == "win32" and os.path.exists(_lnk())


def autostart_install():
    if sys.platform != "win32" or not FROZEN:
        return False
    ps = "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:HM_LNK); $s.TargetPath=$env:HM_TARGET; $s.WorkingDirectory=(Split-Path $env:HM_TARGET); $s.WindowStyle=7; $s.Save()"
    env = dict(os.environ, HM_LNK=_lnk(), HM_TARGET=sys.executable)
    try:
        return subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], env=env, capture_output=True, timeout=30).returncode == 0
    except Exception:
        return False


def autostart_remove():
    try:
        os.remove(_lnk())
        return True
    except OSError:
        return False


def first_run_prompt():
    """Sekali saja (penanda .autostart-asked di samping .exe): tawarkan jalan otomatis saat Windows menyala."""
    mark = os.path.join(_HERE, ".autostart-asked")
    if not FROZEN or sys.platform != "win32" or os.path.exists(mark) or autostart_on() or not sys.stdin or not sys.stdin.isatty():
        return
    try:
        a = input("Jalankan bridge otomatis setiap Windows menyala? [Y/n] ").strip().lower()
        if a in ("", "y", "ya", "yes"):
            print("Jalan otomatis diaktifkan." if autostart_install() else "Gagal mengaktifkan jalan otomatis. Coba jalankan dengan --autostart.")
        open(mark, "w").close()
    except (EOFError, OSError):
        pass


if __name__ == "__main__":
    if "--version" in sys.argv:
        print(BRIDGE_VERSION)
        sys.exit(0)
    if "--autostart" in sys.argv or "--no-autostart" in sys.argv:
        ok = autostart_install() if "--autostart" in sys.argv else autostart_remove()
        print("Berhasil." if ok else "Gagal (jalan otomatis hanya untuk versi .exe di Windows).")
        sys.exit(0 if ok else 1)
    first_run_prompt()
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    finally:
        try:
            mt5.shutdown()
        except Exception:
            pass
