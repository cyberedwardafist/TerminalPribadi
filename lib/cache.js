// Cache dua lapis: memori instance (L1) + tabel kv_cache Supabase (L2, opsional). Ada de-duplikasi request yang sedang berjalan dan "stale-if-error".
import * as db from './db.js';

const mem = new Map();
const inflight = new Map();
const MAX = 800;

export async function cached(key, ttlMs, fn, { l2 = false } = {}) {
  const now = Date.now();
  const hit = mem.get(key);
  if (hit && hit.exp > now) return hit.v;
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    if (l2 && db.dbReady()) {
      try {
        const row = await db.one('kv_cache', { key: db.eq(key), expires_at: db.gt(new Date().toISOString()) });
        if (row) { put(key, row.value, Math.min(ttlMs, new Date(row.expires_at) - now)); return row.value; }
      } catch { /* L2 gagal: lanjut hitung ulang */ }
    }
    try {
      const v = await fn();
      put(key, v, ttlMs);
      if (l2 && db.dbReady()) db.insert('kv_cache', { key, value: v, expires_at: new Date(Date.now() + ttlMs).toISOString() }, { upsert: true, onConflict: 'key' }).catch(() => {});
      return v;
    } catch (e) {
      if (hit) return hit.v;                    // stale-if-error
      throw e;
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
function put(key, v, ttl) {
  if (mem.size >= MAX) { for (const k of mem.keys()) { mem.delete(k); if (mem.size < MAX * 0.8) break; } }
  mem.set(key, { v, exp: Date.now() + Math.max(ttl, 1000) });
}
export const clearCache = () => { mem.clear(); inflight.clear(); };
/** baca/tulis entri cache memori langsung (dipakai untuk membagi hasil permintaan massal ke kunci per-simbol) */
export const peek = key => { const h = mem.get(key); return h && h.exp > Date.now() ? h.v : undefined; };
export const store = (key, v, ttl) => put(key, v, ttl);

/** Rem darurat per penyedia: saat penyedia membalas 429/418 (membatasi), berhenti memanggilnya sementara. Panggilan yang tertahan
 *  langsung gagal (murah) sehingga cached() menyajikan data lama (stale-if-error) dan penyedia tidak dibanjiri lagi. */
export function makeBreaker(name) {
  let until = 0;
  return {
    check() { if (Date.now() < until) { const e = new Error(`${name} sedang membatasi permintaan`); e.status = 429; e.cooling = true; throw e; } },
    trip(retryAfterSec) { until = Date.now() + Math.min(300, Math.max(15, +retryAfterSec || 30)) * 1000; },
  };
}

// jalankan fn untuk tiap item dengan batas paralel
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = undefined; } }
  }));
  return out;
}
