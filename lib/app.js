// Titik masuk tunggal: mendaftarkan semua rute dan menangani request (Web Standard Request -> Response).
import './routes/auth.js';
import './routes/market.js';     // sebelum chart.js: /api/indicators/builtin|compute harus menang atas /api/indicators/:id
import './routes/user.js';
import './routes/content.js';
import './routes/notes.js';
import './routes/chart.js';
import './routes/system.js';
import { match } from './router.js';
import { HttpError, json, corsHeaders, readJson, clientIp, marketPublic } from './http.js';
import { authenticate } from './auth.js';
import { DbError, dbHint } from './db.js';

const secure = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };

export async function handle(req) {
  const cors = corsHeaders(req), t0 = Date.now();
  const finish = (res, extra = {}) => {
    const h = new Headers(res.headers);
    for (const [k, x] of Object.entries({ ...cors, ...secure, ...extra })) if (!h.has(k)) h.set(k, x);
    return new Response(res.body, { status: res.status, headers: h });
  };
  try {
    if (req.method === 'OPTIONS') return finish(new Response(null, { status: 204 }));
    const url = new URL(req.url);
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    const { route, params, methodNotAllowed } = match(method, url.pathname);
    if (!route) throw new HttpError(methodNotAllowed ? 405 : 404, methodNotAllowed ? 'Metode tidak diizinkan' : 'Endpoint tidak ditemukan');
    const ctx = { req, url, params, query: Object.fromEntries(url.searchParams), ip: clientIp(req), user: null, json: max => readJson(req, max) };
    if (!route.opts.public && !(route.opts.market && marketPublic())) ctx.user = await authenticate(ctx);
    let out = await route.handler(ctx);
    if (out === undefined) out = new Response(null, { status: 204 });
    else if (!(out instanceof Response)) out = json(out);
    return finish(out, { 'x-response-ms': String(Date.now() - t0) });
  } catch (e) {
    // galat konfigurasi/internal (HTTP 500 buatan sendiri) tidak boleh sampai ke pengguna: dicatat di log, pengguna hanya menerima pesan umum
    if (e instanceof HttpError && e.status !== 500) {
      const h = e.extra?.retryAfter ? { 'retry-after': String(e.extra.retryAfter) } : {};
      return finish(json({ message: e.message, ...e.extra }, e.status, h));
    }
    console.error('[api]', req.method, req.url, e instanceof DbError ? `${e.status} ${e.code} ${e.message}` : e);
    const hint = dbHint(e);
    if (hint) { console.error('[api] PETUNJUK:', hint); return finish(json({ message: 'Layanan data sedang tidak tersedia. Coba lagi sebentar' }, 503)); }
    return finish(json({ message: 'Terjadi kesalahan di server' }, 500));
  }
}
