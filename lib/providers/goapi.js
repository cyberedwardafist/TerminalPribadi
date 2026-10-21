// GoAPI.io (Indonesia): harga terakhir saham IDX lewat REST. Kunci di env GOAPI_API_KEY (header X-API-KEY). Dipoll ±1 dtk oleh klien lewat /api/rt/quote.
// Alamat bawaan mengikuti dokumentasi GoAPI yang kami ketahui; bila berbeda, isi GOAPI_URL. Cek: npm run rt:test -- BBCA
import { pickQuote } from './quote-parse.js';
export const enabled = () => !!process.env.GOAPI_API_KEY;
const base = () => process.env.GOAPI_URL || 'https://api.goapi.io/stock/idx/prices';
export async function raw(sym) {
  const u = new URL(base()); u.searchParams.set('symbols', sym);
  const r = await fetch(u, { headers: { accept: 'application/json', 'X-API-KEY': process.env.GOAPI_API_KEY }, signal: AbortSignal.timeout(1800) });
  if (!r.ok) throw new Error(`GoAPI ${r.status}`);
  return r.json();
}
export const quote = async sym => pickQuote(await raw(sym), sym);
