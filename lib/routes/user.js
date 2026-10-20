// Pengaturan, watchlist, alert harga, notifikasi, riwayat aksi.
import { get, post, put, patch, del } from '../router.js';
import * as db from '../db.js';
import { v, json, badRequest, notFound, normSym, readJson, UUID_RE, ms, NO_STORE, HttpError } from '../http.js';
import { MAX_IMG, sniffImage } from '../image.js';
import { limit } from '../ratelimit.js';
import { DEFAULT_WATCH, resolve } from '../catalog.js';
import { getQuote, lastPrices } from '../market.js';
import { logActivity } from '../activity.js';

// ===================== pengaturan =====================
// preferences = {theme, defaultSymbol, defaultTf, background, reduceMotion}; gambar background sendiri disimpan terpisah (bucket privat + kolom bg_image).
const TFS = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M'];
const BACKGROUNDS = ['angin', 'hutan', 'laut', 'custom'];
async function settingsRow(uid) { return (await db.one('user_settings', { user_id: db.eq(uid) })) || { preferences: {}, layout: {}, bg_image: null }; }
const cleanPrefs = b => {
  const o = {};
  if (b.theme !== undefined) o.theme = v.oneOf(b.theme, 'theme', ['auto', 'light', 'dark']);
  if (b.defaultSymbol !== undefined) o.defaultSymbol = normSym(b.defaultSymbol);
  if (b.defaultTf !== undefined) o.defaultTf = v.oneOf(b.defaultTf, 'defaultTf', TFS);
  if (b.background !== undefined) o.background = v.oneOf(b.background, 'background', BACKGROUNDS);
  // null = ikuti pengaturan sistem (prefers-reduced-motion); true/false = pilihan pengguna
  if (b.reduceMotion !== undefined) { if (b.reduceMotion !== null && typeof b.reduceMotion !== 'boolean') throw badRequest('reduceMotion harus true, false, atau null'); o.reduceMotion = b.reduceMotion; }
  return o;
};
const prefsOut = r => ({ ...(r.preferences || {}), bgImage: r.bg_image || null });
get('/api/settings/preferences', async ctx => json(prefsOut(await settingsRow(ctx.user.id)), 200, NO_STORE));
put('/api/settings/preferences', async ctx => {
  const clean = cleanPrefs(await readJson(ctx.req, 4000)), cur = (await settingsRow(ctx.user.id)).preferences || {}, next = { ...cur, ...clean };
  await db.insert('user_settings', { user_id: ctx.user.id, preferences: next }, { upsert: true, onConflict: 'user_id' });
  return json(next);
});
del('/api/settings/preferences', async ctx => {   // "Reset semua pengaturan"; gambar background sendiri tetap tersimpan
  await db.insert('user_settings', { user_id: ctx.user.id, preferences: {} }, { upsert: true, onConflict: 'user_id' });
  return json({ ok: true });
});
get('/api/settings/layout', async ctx => json((await settingsRow(ctx.user.id)).layout, 200, NO_STORE));
put('/api/settings/layout', async ctx => {
  const b = await readJson(ctx.req, 70000);
  await db.insert('user_settings', { user_id: ctx.user.id, layout: b }, { upsert: true, onConflict: 'user_id' });
  return json(b);
});

// gambar background sendiri: PUT body mentah image/png|jpeg|webp (maks 3 MB) -> {ts,size,mime}; GET mengembalikan gambarnya; DELETE menghapus
const BG_BUCKET = 'backgrounds', bgPath = uid => `${uid}/background`;
put('/api/settings/background-image', async ctx => {
  await limit(ctx, 'bg-up', 20, 3600, ctx.user.id);
  if (+ctx.req.headers.get('content-length') > MAX_IMG + 1024) throw new HttpError(413, 'Ukuran gambar maksimal 3 MB');
  const buf = Buffer.from(await ctx.req.arrayBuffer());
  if (!buf.length || buf.length > MAX_IMG) throw new HttpError(413, 'Ukuran gambar maksimal 3 MB');
  const mime = sniffImage(buf); if (!mime) throw badRequest('Format gambar harus PNG, JPEG, atau WebP');
  await db.storage.upload(BG_BUCKET, bgPath(ctx.user.id), buf, mime);
  const meta = { ts: Date.now(), size: buf.length, mime };
  await db.insert('user_settings', { user_id: ctx.user.id, bg_image: meta }, { upsert: true, onConflict: 'user_id' });
  return json(meta);
});
get('/api/settings/background-image', async ctx => {
  const meta = (await settingsRow(ctx.user.id)).bg_image; if (!meta) throw notFound('Belum ada gambar background');
  const f = await db.storage.download(BG_BUCKET, bgPath(ctx.user.id)); if (!f) throw notFound('Belum ada gambar background');
  return new Response(f.buf, { headers: { 'content-type': meta.mime, 'cache-control': 'private, no-cache', 'x-content-type-options': 'nosniff', 'x-bg-ts': String(meta.ts) } });
});
del('/api/settings/background-image', async ctx => {
  await db.insert('user_settings', { user_id: ctx.user.id, bg_image: null }, { upsert: true, onConflict: 'user_id' });
  await db.storage.remove(BG_BUCKET, [bgPath(ctx.user.id)]).catch(() => {});
  return json({ ok: true });
});

// ===================== watchlist =====================
const MAX_LISTS = 30, MAX_SYMS = 200;
const wlOut = w => ({ id: w.id, name: w.name, symbols: w.symbols || [], position: w.position });
const cleanSyms = (a, name = 'symbols') => {
  const list = v.arr(a, name, { max: MAX_SYMS }).map(normSym);
  return [...new Set(list)];
};
const unknownSyms = list => list.filter(s => !resolve(s)?.provider);

get('/api/watchlists', async ctx => {
  let rows = await db.select('watchlists', { user_id: db.eq(ctx.user.id), order: 'position.asc,created_at.asc' });
  if (!rows.length) rows = await db.insert('watchlists', { user_id: ctx.user.id, name: 'Utama', symbols: DEFAULT_WATCH, position: 0 });
  return json(rows.map(wlOut), 200, NO_STORE);
});
post('/api/watchlists', async ctx => {
  const b = await ctx.json(), name = v.str(b.name, 'Nama daftar', { min: 1, max: 40 });
  const symbols = b.symbols === undefined ? [] : cleanSyms(b.symbols);
  const n = await db.count('watchlists', { user_id: db.eq(ctx.user.id) });
  if (n >= MAX_LISTS) throw badRequest(`Maksimal ${MAX_LISTS} daftar`);
  const [w] = await db.insert('watchlists', { user_id: ctx.user.id, name, symbols, position: n });
  logActivity(ctx.user.id, 'watchlist', `Membuat daftar ${name}`);
  return json(wlOut(w), 201);
});
const own = (id, uid) => { if (!UUID_RE.test(id)) throw notFound(); return { id: db.eq(id), user_id: db.eq(uid) }; };
patch('/api/watchlists/:id', async ctx => {
  const b = await ctx.json(), patch = {};
  if (b.name !== undefined) patch.name = v.str(b.name, 'Nama daftar', { min: 1, max: 40 });
  if (b.position !== undefined) patch.position = v.int(b.position, 'position', { min: 0, max: 1000 });
  if (!Object.keys(patch).length) throw badRequest('Tidak ada yang diubah');
  const r = await db.update('watchlists', own(ctx.params.id, ctx.user.id), patch);
  if (!r.length) throw notFound('Daftar tidak ditemukan');
  return json(wlOut(r[0]));
});
del('/api/watchlists/:id', async ctx => {
  const r = await db.remove('watchlists', own(ctx.params.id, ctx.user.id));
  if (!r.length) throw notFound('Daftar tidak ditemukan');
  return json({ ok: true });
});
put('/api/watchlists/:id/symbols', async ctx => {
  const b = await ctx.json(), symbols = cleanSyms(b.symbols);
  const r = await db.update('watchlists', own(ctx.params.id, ctx.user.id), { symbols });
  if (!r.length) throw notFound('Daftar tidak ditemukan');
  return json({ ...wlOut(r[0]), unsupported: unknownSyms(symbols) });
});

// ===================== alert harga =====================
const alertOut = a => ({ id: a.id, symbol: a.symbol, price: +a.price, direction: a.direction, active: a.active, createdAt: ms(a.created_at), triggeredAt: ms(a.triggered_at), triggeredPrice: a.triggered_price == null ? null : +a.triggered_price });
get('/api/alerts', async ctx => {
  const q = { user_id: db.eq(ctx.user.id), order: 'created_at.desc', limit: Math.min(200, +ctx.query.limit || 100) };
  if (ctx.query.active === '1') q.active = db.eq(true);
  return json((await db.select('alerts', q)).map(alertOut), 200, NO_STORE);
});
post('/api/alerts', async ctx => {
  const b = await ctx.json(), symbol = normSym(b.symbol), price = v.num(b.price, 'price', { min: 1e-9, max: 1e12 });
  const e = resolve(symbol); if (!e?.provider) throw badRequest(`Sumber data untuk ${symbol} belum tersedia`);
  const n = await db.count('alerts', { user_id: db.eq(ctx.user.id), active: db.eq(true) });
  if (n >= 100) throw badRequest('Maksimal 100 alert aktif');
  const q = await getQuote(symbol);
  if (Math.abs(q.price - price) / price < 1e-9) throw badRequest('Harga alert sama dengan harga sekarang');
  const [a] = await db.insert('alerts', { user_id: ctx.user.id, symbol: e.sym, price, direction: price > q.price ? 'above' : 'below' });
  logActivity(ctx.user.id, 'alert', `Alert ${e.sym} di ${price}`);
  return json(alertOut(a), 201);
});
del('/api/alerts/:key', async ctx => {   // :key = id alert (uuid) atau simbol (hapus semua alert simbol itu)
  const k = ctx.params.key;
  const q = UUID_RE.test(k) ? { id: db.eq(k), user_id: db.eq(ctx.user.id) } : { symbol: db.eq(resolve(k)?.sym || normSym(k)), user_id: db.eq(ctx.user.id) };
  const r = await db.remove('alerts', q);
  return json({ ok: true, removed: r.length });
});

// dipanggil cron dan GET /api/cron/alerts: periksa semua alert aktif
export async function evaluateAlerts() {
  const active = await db.select('alerts', { active: db.eq(true), limit: 2000 });
  if (!active.length) return { checked: 0, fired: 0 };
  const prices = await lastPrices(active.map(a => a.symbol));
  let fired = 0;
  for (const a of active) {
    const p = prices.get(a.symbol)?.price;
    if (p == null) continue;
    const hit = a.direction === 'above' ? p >= +a.price : p <= +a.price;
    if (!hit) continue;
    const upd = await db.update('alerts', { id: db.eq(a.id), active: db.eq(true) }, { active: false, triggered_at: new Date().toISOString(), triggered_price: p });
    if (!upd.length) continue;                                   // sudah diproses instance lain
    fired++;
    const title = `${a.symbol} ${a.direction === 'above' ? 'naik ke' : 'turun ke'} ${+a.price}`;
    await db.insert('notifications', { user_id: a.user_id, type: 'alert', title, body: `Harga terakhir ${p}`, data: { symbol: a.symbol, price: +a.price, last: p, alertId: a.id } }).catch(() => {});
    logActivity(a.user_id, 'alert', `Alert terpicu: ${title}`);
  }
  return { checked: active.length, fired };
}

// ===================== notifikasi =====================
const notiOut = n => ({ id: n.id, type: n.type, title: n.title, body: n.body, data: n.data, read: n.read, ts: ms(n.created_at) });
get('/api/notifications', async ctx => {
  const q = { user_id: db.eq(ctx.user.id), order: 'created_at.desc', limit: Math.min(100, +ctx.query.limit || 30) };
  if (ctx.query.unread === '1') q.read = db.eq(false);
  return json((await db.select('notifications', q)).map(notiOut), 200, NO_STORE);
});
post('/api/notifications/read', async ctx => {
  const b = await ctx.json(), q = { user_id: db.eq(ctx.user.id), read: db.eq(false) };
  if (!b.all) { const ids = v.arr(b.ids, 'ids', { max: 100 }).filter(i => UUID_RE.test(i)); if (!ids.length) throw badRequest('ids atau all wajib diisi'); q.id = db.inList(ids); }
  const r = await db.update('notifications', q, { read: true });
  return json({ ok: true, updated: r.length });
});
del('/api/notifications/:id', async ctx => {
  await db.remove('notifications', own(ctx.params.id, ctx.user.id));
  return json({ ok: true });
});

// ===================== riwayat aksi (Home) =====================
get('/api/activity', async ctx => {
  const rows = await db.select('activity_log', { user_id: db.eq(ctx.user.id), order: 'created_at.desc', limit: Math.min(50, Math.max(1, +ctx.query.limit || 10)) });
  return json(rows.map(r => ({ id: r.id, type: r.type, summary: r.summary, ts: ms(r.created_at), data: r.data })), 200, NO_STORE);
});

// ===================== state per app (sinkron localStorage antar perangkat) =====================
// GET /api/state -> {key: {data, updatedAt}}   GET/PUT/DELETE /api/state/:key   (PUT body: {data})
const STATE_KEYS = ['watchlist', 'news', 'maps', 'chart.tabs', 'kalender'];
const stateKey = k => { if (!STATE_KEYS.includes(k)) throw badRequest(`key harus salah satu dari: ${STATE_KEYS.join(', ')}`); return k; };
get('/api/state', async ctx => {
  const rows = await db.select('user_state', { user_id: db.eq(ctx.user.id), limit: 50 });
  return json(Object.fromEntries(rows.map(r => [r.key, { data: r.data, updatedAt: ms(r.updated_at) }])), 200, NO_STORE);
});
get('/api/state/:key', async ctx => {
  const r = await db.one('user_state', { user_id: db.eq(ctx.user.id), key: db.eq(stateKey(ctx.params.key)) });
  return json({ data: r ? r.data : null, updatedAt: r ? ms(r.updated_at) : null }, 200, NO_STORE);
});
put('/api/state/:key', async ctx => {
  const key = stateKey(ctx.params.key), b = await readJson(ctx.req, 300_000);
  if (!b.data || typeof b.data !== 'object') throw badRequest('data harus objek JSON');
  const [r] = await db.insert('user_state', { user_id: ctx.user.id, key, data: b.data }, { upsert: true, onConflict: 'user_id,key' });
  return json({ ok: true, updatedAt: ms(r.updated_at) });
});
del('/api/state/:key', async ctx => { await db.remove('user_state', { user_id: db.eq(ctx.user.id), key: db.eq(stateKey(ctx.params.key)) }); return json({ ok: true }); });
