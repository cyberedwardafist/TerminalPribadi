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
  HEADMAPS_ORIGINS   daftar Origin halaman yang boleh tersambung, dipisah koma (mis. https://appku.vercel.app,http://localhost:3000). Kosong = semua.
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
import sys
import time

import MetaTrader5 as mt5
from websockets.asyncio.server import serve
from websockets import broadcast

DEFAULT = "XAUUSD,XAGUSD,EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,USDCHF,NZDUSD,EURJPY,GBPJPY"
HOST = os.environ.get("HEADMAPS_HOST", "127.0.0.1")
PORT = int(os.environ.get("HEADMAPS_PORT", "8765"))
WANT = [s.strip().upper() for s in os.environ.get("HEADMAPS_SYMBOLS", DEFAULT).split(",") if s.strip()]
ORIGINS = [o.strip() for o in os.environ.get("HEADMAPS_ORIGINS", "").split(",") if o.strip()] or None
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
        await ws.send(json.dumps({"t": "hello", "v": 1, "symbols": list(MAP), "map": MAP, "off": server_offset() * 1000}))
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
    async with serve(handler, HOST, PORT, origins=ORIGINS):
        log("Headmaps bridge aktif di ws://%s:%d" % (HOST, PORT))
        await asyncio.gather(poll(), beat())


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    finally:
        try:
            mt5.shutdown()
        except Exception:
            pass
