// Klien PostgREST + Storage Supabase tanpa dependensi (fetch saja). Hanya dipakai dari server dengan service role key.
import { HttpError } from './http.js';

let _fetch = (...a) => fetch(...a);
export const setFetch = f => { _fetch = f; };          // dipakai test
const base = () => (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const dbReady = () => !!(base() && key());

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
  const h = { apikey: key(), authorization: 'Bearer ' + key(), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(prefer ? { prefer } : {}), ...headers };
  const res = await _fetch(base() + path + qs(query), { method, headers: h, body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined });
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
