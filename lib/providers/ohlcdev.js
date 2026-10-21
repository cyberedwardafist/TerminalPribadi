// OHLC.dev (lewat RapidAPI): harga terakhir saham IDX lewat REST. Env: OHLCDEV_API_KEY (kunci RapidAPI) dan OHLCDEV_URL (alamat endpoint "quote" dari
// halaman API di RapidAPI; {sym} -> BBCA, {jk} -> BBCA.JK). OHLCDEV_HOST opsional (bawaan: host dari URL). Cek: npm run rt:test -- BBCA
import { pickQuote } from './quote-parse.js';
export const enabled = () => !!(process.env.OHLCDEV_API_KEY && process.env.OHLCDEV_URL);
export async function raw(sym) {
  const url = process.env.OHLCDEV_URL.replaceAll('{sym}', encodeURIComponent(sym)).replaceAll('{jk}', encodeURIComponent(sym + '.JK'));
  const host = process.env.OHLCDEV_HOST || new URL(url).host;
  const r = await fetch(url, { headers: { accept: 'application/json', 'x-rapidapi-key': process.env.OHLCDEV_API_KEY, 'x-rapidapi-host': host }, signal: AbortSignal.timeout(1800) });
  if (!r.ok) throw new Error(`OHLC.dev ${r.status}`);
  return r.json();
}
export const quote = async sym => pickQuote(await raw(sym), sym);
