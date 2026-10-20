// Helper HTTP: error, respons JSON, CORS, pembacaan body, validasi input.
export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const badRequest = (m, x) => new HttpError(400, m, x);
export const unauthorized = (m = 'Sesi tidak valid atau sudah berakhir. Masuk lagi') => new HttpError(401, m);
export const forbidden = (m = 'Tidak diizinkan') => new HttpError(403, m);
export const notFound = (m = 'Data tidak ditemukan') => new HttpError(404, m);
export const conflict = (m) => new HttpError(409, m);
export const tooMany = (sec, m) => new HttpError(429, m || `Terlalu banyak percobaan. Coba lagi ${sec} detik lagi`, { retryAfter: sec });

export function corsHeaders(req) {
  const list = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get('origin');
  const h = {
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-admin-token',
    'access-control-expose-headers': 'x-next-cursor,retry-after',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (list.includes('*')) h['access-control-allow-origin'] = '*';
  else if (origin && list.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

// Cache CDN Vercel untuk data pasar publik (s-maxage = detik di edge, swr = boleh basi sambil menyegarkan)
export const pub = (s, swr) => ({ 'cache-control': `public, max-age=0, s-maxage=${s}, stale-while-revalidate=${swr ?? s * 5}` });
// Data pasar: bawaan butuh login dan hanya di-cache di browser. PUBLIC_MARKET=1 -> terbuka tanpa login dan di-cache CDN Vercel (lebih hemat, tapi siapa pun bisa memakainya).
export const marketPublic = () => process.env.PUBLIC_MARKET === '1';
export const marketJson = (data, s = 5, status = 200, headers = {}) =>
  json(data, status, { ...(marketPublic() ? pub(s, Math.max(s * 6, 30)) : { 'cache-control': `private, max-age=${Math.min(s, 10)}` }), ...headers });
export const NO_STORE = { 'cache-control': 'private, no-store' };

export async function readJson(req, max = 1_000_000) {
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, 'Isi permintaan terlalu besar');
  if (!text.trim()) return {};
  try { const j = JSON.parse(text); return j && typeof j === 'object' ? j : {}; }
  catch { throw badRequest('Body harus berupa JSON yang valid'); }
}

export const clientIp = req =>
  (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';

// ---------- validasi ----------
export const v = {
  str(x, name, { min = 0, max = 1000, optional = false, trim = true, pattern, msg } = {}) {
    if (x === undefined || x === null || x === '') { if (optional) return undefined; if (min === 0 && x === '') return ''; throw badRequest(`${name} wajib diisi`); }
    if (typeof x !== 'string') throw badRequest(`${name} harus teks`);
    const s = trim ? x.trim() : x;
    if (s.length < min || s.length > max) throw badRequest(min ? `${name} ${min} sampai ${max} karakter` : `${name} maksimal ${max} karakter`);
    if (pattern && !pattern.test(s)) throw badRequest(msg || `${name} tidak valid`);
    return s;
  },
  num(x, name, { min = -Infinity, max = Infinity, optional = false } = {}) {
    if (x === undefined || x === null || x === '') { if (optional) return undefined; throw badRequest(`${name} wajib diisi`); }
    const n = typeof x === 'number' ? x : Number(x);
    if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`${name} harus angka${min > -Infinity ? ' dari ' + min : ''}${max < Infinity ? ' sampai ' + max : ''}`);
    return n;
  },
  int(x, name, o = {}) { const n = v.num(x, name, o); return n === undefined ? n : Math.trunc(n); },
  bool: x => x === true || x === 'true' || x === '1' || x === 1,
  oneOf(x, name, list, { optional = false } = {}) {
    if (x === undefined || x === null || x === '') { if (optional) return undefined; throw badRequest(`${name} wajib diisi`); }
    if (!list.includes(x)) throw badRequest(`${name} harus salah satu dari: ${list.join(', ')}`);
    return x;
  },
  arr(x, name, { max = 100, optional = false } = {}) {
    if (x === undefined || x === null) { if (optional) return undefined; throw badRequest(`${name} wajib diisi`); }
    if (!Array.isArray(x) || x.length > max) throw badRequest(`${name} harus daftar maksimal ${max} item`);
    return x;
  },
};
export const SYMBOL_RE = /^[A-Z0-9.\-^=_]{1,20}$/;
export const normSym = (s) => { const u = String(s ?? '').trim().toUpperCase(); if (!SYMBOL_RE.test(u)) throw badRequest('Kode simbol tidak valid'); return u; };
export const ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ms = d => (d ? new Date(d).getTime() : null);
