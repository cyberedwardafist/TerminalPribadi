// Pengurai harga terakhir yang TAHAN BENTUK: GoAPI / OHLC.dev (RapidAPI) tidak punya skema yang kami pastikan, jadi kita cari
// larik/objek berisi simbol + harga di tempat-tempat umum. Bila bentuk respons berbeda, jalankan "npm run rt:test -- BBCA" untuk melihat
// respons mentah lalu tambahkan nama field-nya di PRICE_KEYS / CODE_KEYS / TS_KEYS.
const PRICE_KEYS = ['close', 'price', 'last', 'last_price', 'lastPrice', 'regularMarketPrice', 'c'];
const CODE_KEYS = ['symbol', 'ticker', 'code', 's'];
const TS_KEYS = ['updated_at', 'last_update', 'lastUpdate', 'datetime', 'timestamp', 'time', 'date'];
const num = v => { const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const first = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; };
const isQuote = o => o && typeof o === 'object' && !Array.isArray(o) && num(first(o, PRICE_KEYS)) != null;

/** waktu dari penyedia (ms) bila memuat jam dan wajar (±36 jam), selain itu null: tanggal saja / kosong tidak dipercaya */
function tsOf(it, now) {
  const v = first(it, TS_KEYS); if (v == null) return null;
  let ms = null;
  if (typeof v === 'number') ms = v < 1e11 ? v * 1000 : v;
  else if (/[T:]/.test(String(v))) { const d = Date.parse(String(v).replace(' ', 'T')); if (Number.isFinite(d)) ms = d; }
  return ms != null && Math.abs(now - ms) < 36 * 3600e3 ? Math.min(ms, now) : null;
}

/** -> {price, ts, tsp} | null. tsp=true bila ts berasal dari penyedia (bukan waktu terima server) */
export function pickQuote(j, sym, now = Date.now()) {
  const roots = [j?.data?.results, j?.data?.result, j?.data, j?.results, j?.result, j?.quotes, j?.quote, j];
  let list = null;
  for (const r of roots) { if (Array.isArray(r)) { list = r; break; } if (isQuote(r)) { list = [r]; break; } }
  if (!list) return null;
  const want = new Set([sym, sym + '.JK', sym + '.JKT'].map(x => x.toUpperCase()));
  const it = list.find(x => x && want.has(String(first(x, CODE_KEYS) ?? '').toUpperCase())) || (list.length === 1 ? list[0] : null);
  if (!it) return null;
  const price = num(first(it, PRICE_KEYS)); if (price == null) return null;
  const t = tsOf(it, now);
  return { price, ts: t ?? now, tsp: t != null };
}
