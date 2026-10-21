// Lapisan data pasar: candle, quote, heatmap, pemindai, ringkasan. Memilih penyedia dari katalog dan men-cache hasilnya.
import { resolve, screenerUniverse, catalog, INDICES, MARKET_LABEL } from './catalog.js';
import { groups } from './heat-data.js';
import { cached, pool } from './cache.js';
import { rsi } from './indicators.js';
import * as binance from './providers/binance.js';
import * as yahoo from './providers/yahoo.js';
import * as coingecko from './providers/coingecko.js';
import { HttpError, notFound, badRequest } from './http.js';

export const TIMEFRAMES = Object.keys(binance.TF).filter(k => k !== '3m' && k !== '2h');
const TF_SEC = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '1D': 86400, '1W': 604800, '1M': 2592000 };
export const tfSeconds = tf => TF_SEC[tf];

export function need(sym, hint) {
  const e = resolve(sym, hint);
  if (!e) throw badRequest('Kode simbol tidak valid');
  if (!e.provider) throw new HttpError(404, `Sumber data untuk ${e.sym} belum tersedia`);
  return e;
}
const wrapErr = (e, sym) => {
  if (e instanceof HttpError) return e;
  if (e.status === 404 || e.status === 400) return notFound(`Simbol ${sym} tidak ditemukan di sumber data`);
  console.error('[market]', sym, e.message);
  return new HttpError(502, 'Sumber data pasar sedang tidak bisa dihubungi. Coba lagi sebentar');
};

// ---------- candle ----------
export async function getCandles(sym, tf, { limit = 700, to } = {}) {
  const e = need(sym);
  if (!TF_SEC[tf] || !TIMEFRAMES.includes(tf)) throw badRequest(`Timeframe tidak didukung. Pilih: ${TIMEFRAMES.join(', ')}`);
  limit = Math.min(5000, Math.max(1, limit | 0 || 700));
  if (e.provider === 'static') return [];
  const ttl = limit <= 5 ? 1500 : tf === '1m' ? 4000 : tf === '5m' || tf === '15m' ? 8000 : 20000;   // limit kecil = polling bar terakhir (rekonsiliasi realtime)
  try {
    const list = await cached(`c:${e.sym}:${tf}:${limit}:${to || ''}`, ttl, () =>
      e.provider === 'binance' ? binance.klines(e.ps, tf, { limit, to }) : yahoo.candles(e.ps, tf, { limit, to }));
    return list;
  } catch (err) { throw wrapErr(err, e.sym); }
}

// ---------- harian (dasar statistik) ----------
async function daily(e) {
  return cached(`d:${e.sym}`, 5 * 60_000, async () => {
    if (e.provider === 'binance') return { candles: await binance.klines(e.ps, '1D', { limit: 365 }) };
    return yahoo.dailyBundle(e.ps, '1y');
  });
}
const r6 = x => (x == null ? x : Math.abs(x) >= 1 ? +x.toFixed(4) : +x.toPrecision(6));

function stats(e, d, live) {
  const c = d.candles; if (c.length < 2) return null;
  const closes = c.map(x => x.c), n = closes.length;
  const price = live?.price ?? d.price ?? closes[n - 1];
  const prev = closes[n - 2];
  const changePct = live?.changePct ?? (prev ? (price - prev) / prev * 100 : 0);
  const rs = rsi(closes, 14).at(-1);
  const prevVols = c.slice(-21, -1).map(x => x.v).filter(v => v > 0), avgV = prevVols.length ? prevVols.reduce((a, b) => a + b, 0) / prevVols.length : 0;
  const win = c.slice(-(e.market === 'cry' ? 365 : 252));
  const hi = Math.max(...win.map(x => x.h), price), lo = Math.min(...win.map(x => x.l), price);
  return {
    sym: e.sym, name: d.name && !e.known ? d.name : e.name, market: e.market, price: r6(price), changePct: +changePct.toFixed(2),
    volRatio: avgV ? +(c[n - 1].v / avgV).toFixed(2) : null, rsi14: rs == null ? null : +rs.toFixed(1),
    pos52w: hi > lo ? +((price - lo) / (hi - lo)).toFixed(3) : null, spark: closes.slice(-30).map(r6),
  };
}

// ---------- quotes ----------
export async function getQuotes(symbols, { hint } = {}) {
  const ents = symbols.map(s => resolve(s, hint)).map((e, i) => (e && e.provider ? { ...e, asked: symbols[i] } : null));
  const crypto = [...new Set(ents.filter(e => e?.provider === 'binance').map(e => e.ps))];
  let live = new Map();
  if (crypto.length) { try { live = await cached(`bt:${crypto.sort().join(',')}`, 3000, () => binance.tickers(crypto)); } catch { /* pakai harian */ } }
  const out = await pool(ents, 8, async e => {
    if (!e) return null;
    if (e.provider === 'static') return { sym: e.sym, name: e.name, market: e.market, price: 1, changePct: 0, volRatio: null, rsi14: null, pos52w: null, spark: [] };
    const d = await daily(e);
    const s = stats(e, d, e.provider === 'binance' ? live.get(e.ps) : null);
    return s && { ...s, sym: e.asked.toUpperCase() === e.sym ? e.sym : e.asked.toUpperCase() };
  });
  return out.filter(Boolean);
}
export async function getQuote(sym) {
  const e = need(sym);
  try { return (await getQuotes([e.sym]))[0] || null; } catch (err) { throw wrapErr(err, e.sym); }
}
/** harga terakhir ringan, dipakai alert dan stream */
export async function lastPrices(symbols) {
  const m = new Map(), uniq = [...new Set(symbols)];
  const ents = uniq.map(s => resolve(s)).filter(e => e?.provider && e.provider !== 'static');
  const crypto = ents.filter(e => e.provider === 'binance');
  if (crypto.length) { try { const t = await cached(`bt:${crypto.map(e => e.ps).sort().join(',')}`, 3000, () => binance.tickers(crypto.map(e => e.ps))); for (const e of crypto) if (t.get(e.ps)) m.set(e.sym, t.get(e.ps)); } catch { /* lanjut */ } }
  await pool(ents.filter(e => e.provider === 'yahoo'), 8, async e => {
    const d = await daily(e); const c = d.candles; if (c.length < 2) return;
    const price = d.price ?? c.at(-1).c; m.set(e.sym, { price, changePct: (price - c.at(-2).c) / c.at(-2).c * 100 });
  });
  return m;
}

// ---------- heatmap ----------
const RANGE_BARS = { '1d': 1, '1w': 5, '1m': 21 };
export async function getHeatmap(market, range = '1d') {
  if (!groups(market).length) throw badRequest('market harus salah satu dari: ihsg, kripto, komoditas, luar, lain');
  if (!RANGE_BARS[range]) throw badRequest('range harus 1d, 1w, atau 1m');
  return cached(`heat:${market}:${range}`, 5 * 60_000, async () => {
    const tiles = groups(market).flatMap(g => g.items.map(i => ({ group: g.group, ...i })));
    // kripto: kapitalisasi nyata dari CoinGecko (USD miliar); bila gagal atau koin tidak ada, tetap pakai bobot statis
    const caps = market === 'kripto' ? await cached('cg:top', 10 * 60_000, () => coingecko.topCoins(), { l2: false }).catch(() => null) : null;
    const capOf = t => { const c = caps?.get(t.code); return c ? +(c.cap / 1e9).toFixed(2) : t.cap; };
    const res = await pool(tiles, 10, async t => {
      const e = resolve(t.code, market === 'kripto' ? 'kripto' : undefined);
      if (!e || !e.provider) return null;
      if (e.provider === 'static') return { group: t.group, sym: t.code, cap: capOf(t), changePct: 0 };
      const d = await daily(e), c = d.candles, k = RANGE_BARS[range];
      if (c.length <= k) return null;
      const price = (range === '1d' ? (d.price ?? c.at(-1).c) : c.at(-1).c), base = c.at(-1 - k).c;
      return base ? { group: t.group, sym: t.code, cap: capOf(t), changePct: +(((price - base) / base) * 100).toFixed(2) } : null;
    });
    const list = res.filter(Boolean);
    if (!list.length) throw new HttpError(502, 'Data peta pasar belum tersedia');
    return list;
  }, { l2: true });
}

// ---------- pemindai ----------
async function universeQuotes() {
  return cached('scr:universe', 8 * 60_000, async () => (await getQuotes(screenerUniverse())).filter(q => q.price != null), { l2: true });
}
export const SCREENS = {
  up: { f: q => q.changePct > 0, s: (a, b) => b.changePct - a.changePct },
  dn: { f: q => q.changePct < 0, s: (a, b) => a.changePct - b.changePct },
  vol: { f: q => (q.volRatio ?? 0) >= 1.5, s: (a, b) => b.volRatio - a.volRatio },
  hi: { f: q => (q.pos52w ?? 0) >= 0.95, s: (a, b) => b.pos52w - a.pos52w },
  os: { f: q => q.rsi14 != null && q.rsi14 < 35, s: (a, b) => a.rsi14 - b.rsi14 },
  ob: { f: q => q.rsi14 != null && q.rsi14 > 70, s: (a, b) => b.rsi14 - a.rsi14 },
  mo: { f: q => q.changePct > 0 && q.rsi14 != null && q.rsi14 >= 55 && q.rsi14 <= 70, s: (a, b) => b.changePct - a.changePct },
};
export async function getScreener(type, limit = 20) {
  const sc = SCREENS[type]; if (!sc) throw badRequest(`type harus salah satu dari: ${Object.keys(SCREENS).join(', ')}`);
  return (await universeQuotes()).filter(sc.f).sort(sc.s).slice(0, limit);
}

// ---------- status pasar (WIB) ----------
export function marketStatus(now = new Date()) {
  const wib = new Date(now.getTime() + 7 * 3600_000), dow = wib.getUTCDay(), mins = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  const day = wib.toISOString().slice(0, 10), holiday = (process.env.IDX_HOLIDAYS || '').split(',').map(s => s.trim()).includes(day);
  const weekday = dow >= 1 && dow <= 5;
  return {
    ihsg: weekday && !holiday && mins >= 9 * 60 && mins <= 15 * 60 + 49 ? 'open' : 'closed',
    forex: weekday ? 'open' : 'closed',
    kripto: 'open',
    holiday,
  };
}
export async function getSummary() {
  const [idx, uni] = await Promise.all([getQuotes([...INDICES, 'BTCUSDT', 'ETHUSDT', 'XAUUSD', 'WTI', 'USDIDR', 'EURUSD']).catch(() => []), universeQuotes().catch(() => [])]);
  const movers = [...uni].filter(q => q.market !== 'ind').sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 8).map(q => ({ sym: q.sym, name: q.name, price: q.price, changePct: q.changePct }));
  const pick = q => ({ sym: q.sym, name: q.name, price: q.price, changePct: q.changePct, spark: q.spark });
  return { indices: idx.filter(q => INDICES.includes(q.sym)).map(pick), highlights: idx.filter(q => !INDICES.includes(q.sym)).map(pick), movers, status: marketStatus(), time: new Date().toISOString() };
}
export async function warm() {
  const r = { heatmap: 0, screener: 0 };
  await universeQuotes().then(q => { r.screener = q.length; }).catch(() => {});
  for (const m of ['ihsg', 'kripto', 'komoditas', 'luar', 'lain']) await getHeatmap(m, '1d').then(h => { r.heatmap += h.length; }).catch(() => {});
  return r;
}
export { MARKET_LABEL, catalog };
