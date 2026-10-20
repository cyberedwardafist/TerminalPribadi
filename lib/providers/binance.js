// Binance data pasar publik (tanpa key). Host data-api.binance.vision tidak dibatasi geo seperti api.binance.com (yang menolak IP AS).
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
export const TF = { '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '2h': '2h', '4h': '4h', '1D': '1d', '1W': '1w', '1M': '1M' };

async function get(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  let last;
  for (const h of HOSTS) {
    try {
      const r = await fetch(`${h}${path}${qs ? '?' + qs : ''}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (r.ok) return r.json();
      last = new Error(`Binance ${r.status}`);
      if (r.status === 400) { last.status = 400; throw last; }   // simbol tidak ada: jangan coba host lain
    } catch (e) { last = e; if (e.status === 400) throw e; }
  }
  throw last || new Error('Binance tidak terjangkau');
}
const row = k => ({ t: Math.floor(k[0] / 1000), o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] });

/** candle terurut naik. limit > 1000 diambil bertahap mundur. to = detik epoch (candle yang dibuka sebelum itu) */
export async function klines(ps, tf, { limit = 700, to } = {}) {
  const interval = TF[tf]; if (!interval) throw new Error('Timeframe tidak didukung');
  let out = [], end = to ? Math.floor(to) * 1000 : undefined;
  while (out.length < limit) {
    const need = Math.min(1000, limit - out.length);
    const rows = await get('/api/v3/klines', { symbol: ps, interval, limit: need, ...(end ? { endTime: end } : {}) });
    if (!rows.length) break;
    out = rows.map(row).concat(out);
    if (rows.length < need) break;
    end = rows[0][0] - 1;
  }
  return out;
}
/** ticker 24 jam, banyak simbol sekaligus -> Map(ps -> {price, changePct, quoteVolume}) */
export async function tickers(list) {
  const m = new Map(); if (!list.length) return m;
  const rows = await get('/api/v3/ticker/24hr', { symbols: JSON.stringify(list) });
  for (const r of rows) m.set(r.symbol, { price: +r.lastPrice, changePct: +r.priceChangePercent, quoteVolume: +r.quoteVolume });
  return m;
}
