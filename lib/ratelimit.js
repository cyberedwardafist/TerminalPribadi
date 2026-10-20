// Pembatas laju berbasis tabel rate_limits (fungsi SQL rate_hit, atomik). Jika DB bermasalah: gagal-buka (log), agar layanan tidak mati.
import * as db from './db.js';
import { tooMany, clientIp } from './http.js';

const local = new Map();
export async function hit(key, limit, windowSec) {
  if (process.env.RATE_LIMIT === 'off') return { allowed: true, retryAfter: 0 };
  try {
    const rows = await db.rpc('rate_hit', { p_key: key, p_limit: limit, p_window: windowSec });
    const r = Array.isArray(rows) ? rows[0] : rows;
    return { allowed: !!r.allowed, retryAfter: r.retry_after || 0 };
  } catch (e) {
    console.error('[ratelimit] DB gagal, pakai memori:', e.message);
    const now = Date.now(); let b = local.get(key);
    if (!b || b.reset <= now) b = { n: 0, reset: now + windowSec * 1000 };
    b.n++; local.set(key, b);
    return { allowed: b.n <= limit, retryAfter: Math.ceil((b.reset - now) / 1000) };
  }
}
export async function limit(ctx, name, max, windowSec, extra = '') {
  const r = await hit(`${name}:${clientIp(ctx.req)}${extra ? ':' + extra : ''}`, max, windowSec);
  if (!r.allowed) throw tooMany(r.retryAfter);
}
export const reset = key => db.remove('rate_limits', { key: db.eq(key) }).catch(() => {});

// pembatas ringan per instance (tanpa DB) untuk endpoint data pasar
const soft = new Map();
export function softLimit(ctx, name, max, windowMs = 60000) {
  if (process.env.RATE_LIMIT === 'off') return;
  const k = `${name}:${ctx.user?.id || clientIp(ctx.req)}`, now = Date.now();
  let b = soft.get(k);
  if (!b || b.reset <= now) { b = { n: 0, reset: now + windowMs }; soft.set(k, b); if (soft.size > 5000) soft.clear(); }
  if (++b.n > max) throw tooMany(Math.ceil((b.reset - now) / 1000));
}
