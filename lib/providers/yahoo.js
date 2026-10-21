// Yahoo Finance chart API (tanpa key, tidak resmi). Dipakai untuk saham IDX/AS, forex, indeks, komoditas (futures).
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// tf klien -> interval Yahoo, rentang maksimum yang diizinkan Yahoo, lebar bar (detik)
export const TF = {
  '1m': { interval: '1m', range: '7d', maxDays: 7, sec: 60 },
  '5m': { interval: '5m', range: '60d', maxDays: 59, sec: 300 },
  '15m': { interval: '15m', range: '60d', maxDays: 59, sec: 900 },
  '30m': { interval: '30m', range: '60d', maxDays: 59, sec: 1800 },
  '1h': { interval: '60m', range: '730d', maxDays: 729, sec: 3600 },
  '4h': { interval: '60m', range: '730d', maxDays: 729, sec: 14400, agg: 4 },
  '1D': { interval: '1d', range: '10y', maxDays: 3650 * 3, sec: 86400 },
  '1W': { interval: '1wk', range: '20y', maxDays: 3650 * 3, sec: 604800 },
  '1M': { interval: '1mo', range: '20y', maxDays: 3650 * 3, sec: 2592000 },
};

async function chart(ps, params) {
  const qs = new URLSearchParams({ includePrePost: 'false', ...params }).toString();
  let last;
  for (let i = 0; i < 3; i++) {
    const host = HOSTS[i % 2];
    try {
      const r = await fetch(`${host}/v8/finance/chart/${encodeURIComponent(ps)}?${qs}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
      if (r.status === 404) { const e = new Error('Simbol tidak ditemukan'); e.status = 404; throw e; }
      if (r.status === 429 || r.status >= 500) { last = new Error(`Yahoo ${r.status}`); await new Promise(res => setTimeout(res, 250 * (i + 1))); continue; }
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      if (!res) { const e = new Error(j?.chart?.error?.description || 'Data kosong'); e.status = 404; throw e; }
      return res;
    } catch (e) { if (e.status === 404) throw e; last = e; }
  }
  throw last || new Error('Yahoo tidak terjangkau');
}
const bars = res => {
  const q = res.indicators?.quote?.[0] || {}, ts = res.timestamp || [], out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if ([o, h, l, c].some(x => x == null || !Number.isFinite(x))) continue;
    out.push({ t: ts[i], o, h, l, c, v: q.volume?.[i] || 0 });
  }
  return out;
};
export function aggregate(list, sec) {
  const out = []; let cur = null;
  for (const b of list) {
    const k = Math.floor(b.t / sec) * sec;
    if (!cur || cur.t !== k) { cur = { ...b, t: k }; out.push(cur); }
    else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; }
  }
  return out;
}

export async function candles(ps, tf, { limit = 700, to } = {}) {
  const spec = TF[tf]; if (!spec) throw new Error('Timeframe tidak didukung');
  const params = { interval: spec.interval };
  if (to) {
    const span = Math.min(spec.maxDays * 86400, Math.ceil(limit * spec.sec * (spec.sec < 86400 ? 2.2 : 1.5)) + 86400 * 3);
    params.period2 = String(Math.floor(to)); params.period1 = String(Math.floor(to) - span);
  } else params.range = spec.range;
  let list = bars(await chart(ps, params));
  if (spec.agg) list = aggregate(list, spec.sec);
  return list.slice(-limit);
}
/** candle harian ±1 tahun + metadata harga terakhir, dasar untuk quote/RSI/52 minggu */
export async function dailyBundle(ps, range = '1y') {
  const res = await chart(ps, { interval: '1d', range, events: 'div' });
  const m = res.meta || {};
  return { candles: bars(res), price: m.regularMarketPrice, name: m.longName || m.shortName || '', currency: m.currency || '', exchange: m.exchangeName || '', time: m.regularMarketTime, dividends: Object.values(res.events?.dividends || {}).map(d => ({ date: d.date, amount: d.amount })) };
}
/** pencarian simbol bebas (untuk simbol di luar katalog) */
export async function search(q, limit = 10) {
  const r = await fetch(`${HOSTS[1]}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${limit}&newsCount=0`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.quotes || []).filter(x => x.symbol).map(x => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, exchange: x.exchDisp || x.exchange || '', type: x.quoteType || '' }));
}

// ---------- kapitalisasi pasar (v7/quote butuh cookie + crumb) ----------
let session = null; // {cookie, crumb, exp}
async function getSession(force) {
  if (!force && session && session.exp > Date.now()) return session;
  const r1 = await fetch('https://fc.yahoo.com', { headers: { 'user-agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(6000) });
  const cookie = (r1.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('Yahoo: cookie sesi tidak diterima');
  const r2 = await fetch(`${HOSTS[1]}/v1/test/getcrumb`, { headers: { 'user-agent': UA, cookie }, signal: AbortSignal.timeout(6000) });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || /[<{\s]/.test(crumb)) throw new Error(`Yahoo: crumb gagal (${r2.status})`);
  return (session = { cookie, crumb, exp: Date.now() + 3600_000 });
}
/** simbol Yahoo[] -> Map(simbol -> {cap (mata uang asli), currency}). Hanya entri dengan marketCap valid. */
export async function marketCaps(symbols) {
  const out = new Map();
  for (let i = 0; i < symbols.length; i += 50) {
    const part = symbols.slice(i, i + 50);
    let rows;
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = await getSession(attempt > 0);
      const qs = new URLSearchParams({ symbols: part.join(','), fields: 'marketCap,currency', crumb: s.crumb });
      const r = await fetch(`${HOSTS[1]}/v7/finance/quote?${qs}`, { headers: { 'user-agent': UA, accept: 'application/json', cookie: s.cookie }, signal: AbortSignal.timeout(8000) });
      if (r.status === 401 || r.status === 403) { session = null; continue; }
      if (!r.ok) throw new Error(`Yahoo quote ${r.status}`);
      rows = (await r.json())?.quoteResponse?.result;
      break;
    }
    if (!Array.isArray(rows)) throw new Error('Yahoo: respons kapitalisasi tidak dikenal');
    for (const q of rows) if (q?.symbol && Number.isFinite(q.marketCap) && q.marketCap > 0) out.set(q.symbol, { cap: q.marketCap, currency: q.currency || '' });
  }
  return out;
}
