// Harga realtime IDX dari beberapa penyedia REST sekaligus (PARALEL). Satu panggilan keluar per simbol per ±1 dtk walau banyak klien (dedupe + cache 900 ms).
// Tanpa stale-if-error: data realtime yang basi lebih buruk daripada tidak ada data.
import * as goapi from './providers/goapi.js';
import * as ohlcdev from './providers/ohlcdev.js';

export const PROVIDERS = { goapi, ohlcdev };
export const enabledSources = () => Object.entries(PROVIDERS).filter(([, p]) => p.enabled()).map(([k]) => k);
const mem = new Map();
function once(key, ttl, fn) {
  const t = Date.now(), hit = mem.get(key);
  if (hit && hit.exp > t) return hit.p;
  if (mem.size > 500) mem.clear();
  const p = fn(); mem.set(key, { p, exp: t + ttl });
  p.catch(() => { if (mem.get(key)?.p === p) mem.delete(key); });
  return p;
}
/** -> {enabled:[...], sources:[{src,price,ts,tsp}]}; penyedia yang gagal/lambat dilewati, tidak menahan yang lain */
export async function rtQuotes(sym) {
  const en = enabledSources();
  const res = await Promise.all(en.map(async k => { try { const q = await once(`${k}:${sym}`, 900, () => PROVIDERS[k].quote(sym)); return q ? { src: k, ...q } : null; } catch { return null; } }));
  return { enabled: en, sources: res.filter(Boolean) };
}
