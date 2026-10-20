// CoinGecko API publik (tanpa key untuk /coins/markets; key demo opsional menaikkan jatah). Dipakai untuk kapitalisasi pasar kripto
// pada peta pasar, menggantikan bobot statis di heat-data.js. Gagal -> pemanggil kembali ke bobot statis.
// Syarat pemakaian paket gratis: cantumkan atribusi "Data oleh CoinGecko" (ada di Setting > Tentang).
const BASE = () => (process.env.COINGECKO_BASE || 'https://api.coingecko.com/api/v3').replace(/\/+$/, '');

/** 250 koin teratas menurut kapitalisasi -> Map(KODE -> {cap (USD), price, changePct24h, rank}). Kode kembar: yang kapitalisasinya terbesar menang. */
export async function topCoins(perPage = 250) {
  const key = process.env.COINGECKO_API_KEY;
  const qs = new URLSearchParams({ vs_currency: 'usd', order: 'market_cap_desc', per_page: String(perPage), page: '1', sparkline: 'false' });
  const r = await fetch(`${BASE()}/coins/markets?${qs}`, {
    headers: { accept: 'application/json', ...(key ? { 'x-cg-demo-api-key': key } : {}) },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) { const e = new Error(`CoinGecko ${r.status}`); e.status = r.status; throw e; }
  const rows = await r.json();
  if (!Array.isArray(rows)) throw new Error('CoinGecko: respons tidak dikenal');
  const m = new Map();
  for (const c of rows) {
    const code = String(c.symbol || '').toUpperCase();
    if (!code || m.has(code) || !Number.isFinite(c.market_cap) || c.market_cap <= 0) continue;
    m.set(code, { cap: c.market_cap, price: c.current_price, changePct24h: c.price_change_percentage_24h, rank: c.market_cap_rank });
  }
  return m;
}
