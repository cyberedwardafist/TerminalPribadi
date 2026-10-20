// Klien PostgREST + Storage Supabase tanpa dependensi (fetch saja). Hanya dipakai dari server dengan service role key.
import { HttpError } from './http.js';

let _fetch = (...a) => fetch(...a);
export const setFetch = f => { _fetch = f; };          // dipakai test
// SUPABASE_URL sering terisi tidak rapi: tanpa https://, ada spasi/kutip, atau berakhir /rest/v1 atau /. Semuanya dinormalkan ke https://<ref>.supabase.co
const clean = x => String(x || '').trim().replace(/^['"]|['"]$/g, '').trim();
const base = () => {
  let u = clean(process.env.SUPABASE_URL).replace(/\/+$/, '').replace(/\/(rest|storage|auth)\/v1.*$/i, '');
  if (u && !/^https?:\/\//i.test(u)) u = /^[a-z0-9]{15,25}$/i.test(u) ? `https://${u}.supabase.co` : `https://${u}`;   // hanya "project ref" pun diterima
  return u;
};
const key = () => clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
export const dbReady = () => !!(base() && key());
// Key lama (service_role) berupa JWT "eyJ..." dan boleh dikirim sebagai Bearer. Key baru ("sb_secret_...") BUKAN JWT: hanya boleh lewat header apikey,
// bila dikirim sebagai Bearer PostgREST menolaknya (401 / "Expected 3 parts in JWT") dan semua query gagal.
const isJwt = k => /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(k);
const jwtRole = k => { try { return JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role; } catch { return null; } };
export const keyKind = () => { const k = key(); return !k ? 'kosong' : k.startsWith('sb_secret_') ? 'secret' : k.startsWith('sb_publishable_') ? 'publishable' : isJwt(k) ? jwtRole(k) || 'jwt' : 'tidak dikenal'; };

export class DbError extends Error {
  constructor(status, body) { super(body?.message || 'DB error'); this.status = status; this.code = body?.code; this.details = body; }
}
export const isUnique = e => e instanceof DbError && e.code === '23505';

// helper filter PostgREST
export const eq = x => `eq.${x}`, neq = x => `neq.${x}`, gt = x => `gt.${x}`, gte = x => `gte.${x}`, lt = x => `lt.${x}`, lte = x => `lte.${x}`;
export const ilike = x => `ilike.${x}`, isNull = 'is.null', cs = arr => `cs.{${arr.join(',')}}`;
export const inList = arr => `in.(${arr.map(x => (/[,()"\s]/.test(String(x)) ? `"${String(x).replace(/"/g, '\\"')}"` : x)).join(',')})`;

const qs = (q = {}) => {
  const p = [];
  for (const [k, val] of Object.entries(q)) if (val !== undefined && val !== null) p.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`);
  return p.length ? '?' + p.join('&') : '';
};
const hasFilter = q => Object.keys(q || {}).some(k => !['select', 'order', 'limit', 'offset'].includes(k));

async function call(method, path, { query, body, prefer, headers, raw, rawBody } = {}) {
  if (!dbReady()) throw new HttpError(500, 'Database belum dikonfigurasi (SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY)');
  const h = { apikey: key(), ...(isJwt(key()) ? { authorization: 'Bearer ' + key() } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(prefer ? { prefer } : {}), ...headers };
  let res;
  try { res = await _fetch(base() + path + qs(query), { method, headers: h, body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined }); }
  catch (e) { throw new DbError(0, { message: `Tidak bisa menghubungi Supabase: ${e?.cause?.code || e?.cause?.message || e?.message}`, code: 'NETWORK' }); }
  if (raw) return res;
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { message: text }; } }
  if (!res.ok) throw new DbError(res.status, data && typeof data === 'object' ? data : { message: String(data) });
  return data;
}

export const select = (table, q) => call('GET', `/rest/v1/${table}`, { query: { select: '*', ...q } });
export const one = async (table, q) => (await select(table, { ...q, limit: 1 }))[0] || null;
export const insert = (table, rows, { upsert = false, onConflict, ignoreDuplicates = false } = {}) =>
  call('POST', `/rest/v1/${table}`, {
    body: rows, query: onConflict ? { on_conflict: onConflict } : undefined,
    prefer: ['return=representation', upsert ? 'resolution=merge-duplicates' : ignoreDuplicates ? 'resolution=ignore-duplicates' : ''].filter(Boolean).join(','),
  });
export function update(table, q, patch) {
  if (!hasFilter(q)) throw new Error('update tanpa filter ditolak');
  return call('PATCH', `/rest/v1/${table}`, { query: q, body: patch, prefer: 'return=representation' });
}
export function remove(table, q) {
  if (!hasFilter(q)) throw new Error('delete tanpa filter ditolak');
  return call('DELETE', `/rest/v1/${table}`, { query: q, prefer: 'return=representation' });
}
export const rpc = (fn, args = {}) => call('POST', `/rest/v1/rpc/${fn}`, { body: args });
export async function count(table, q) {
  const res = await call('GET', `/rest/v1/${table}`, { query: { select: '*', ...q, limit: 1 }, prefer: 'count=exact', headers: { range: '0-0' }, raw: true });
  if (!res.ok) throw new DbError(res.status, await res.json().catch(() => ({})));
  const m = /\/(\d+)$/.exec(res.headers.get('content-range') || '');
  return m ? Number(m[1]) : 0;
}

export const storage = {
  async upload(bucket, path, buf, contentType) {
    const res = await call('POST', `/storage/v1/object/${bucket}/${path}`, { rawBody: buf, headers: { 'content-type': contentType, 'x-upsert': 'true' }, raw: true });
    if (!res.ok) throw new DbError(res.status, await res.json().catch(() => ({ message: 'Upload gagal' })));
  },
  async download(bucket, path) {
    const res = await call('GET', `/storage/v1/object/${bucket}/${path}`, { raw: true });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new DbError(res.status, await res.json().catch(() => ({})));
    return { buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || 'application/octet-stream' };
  },
  async remove(bucket, paths) {
    await call('DELETE', `/storage/v1/object/${bucket}`, { body: { prefixes: paths }, raw: true });
  },
};

// Petunjuk perbaikan untuk galat konfigurasi Supabase (null bila galat biasa). Hanya teks umum, tidak memuat rahasia.
export function dbHint(e) {
  if (e instanceof HttpError && /Database belum dikonfigurasi/.test(e.message)) return 'SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diisi di Environment Variables Vercel (lalu Redeploy)';
  if (!(e instanceof DbError)) return null;
  const m = String(e.message || '');
  if (e.code === 'NETWORK') return 'SUPABASE_URL tidak bisa dijangkau. Pakai Project URL persis dari Supabase > Project Settings > API (https://<ref>.supabase.co)';
  if (e.status === 401 || /invalid api key|jwt|apikey/i.test(m)) return `Key ditolak Supabase (jenis terbaca: ${keyKind()}). Pakai secret key / service_role dari Project Settings > API (bukan anon/publishable), dari project yang sama dengan SUPABASE_URL`;
  if (e.code === '42501' || /permission denied/i.test(m)) return 'service_role belum punya hak akses. Jalankan supabase/migrations/006_service_role_grants.sql di SQL Editor';
  if (['42P01', 'PGRST205', 'PGRST202', '42883'].includes(e.code) || /does not exist|could not find the (table|function)/i.test(m)) return 'Tabel atau fungsi belum ada. Jalankan supabase/migrations/001_init.sql di SQL Editor (lalu 006_service_role_grants.sql)';
  if (e.status === 404) return 'URL Supabase salah (path REST tidak ditemukan). Cek SUPABASE_URL';
  if (e.status === 0 || e.status >= 520) return 'Supabase tidak menjawab (project di-pause? buka dashboard Supabase dan Restore project)';
  return null;
}

// Pemeriksaan untuk /api/health?deep=1: {ok, hint?}
export async function dbCheck() {
  try { await call('GET', '/rest/v1/users', { query: { select: 'id', limit: 1 } }); await call('POST', '/rest/v1/rpc/rate_hit', { body: { p_key: 'health', p_limit: 1000000, p_window: 60 } }); return { ok: true }; }
  catch (e) { return { ok: false, hint: dbHint(e) || `${e.status || ''} ${e.code || ''} ${String(e.message).slice(0, 120)}`.trim() }; }
}
