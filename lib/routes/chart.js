// Penyimpanan chart: layout (tab, window, indikator terpasang, gambar), drawing per simbol, template, dan indikator custom.
// Indikator custom hanya DISIMPAN di sini. Kodenya dijalankan di sandbox klien (Web Worker), tidak pernah dieksekusi server.
import { get, post, put, del } from '../router.js';
import * as db from '../db.js';
import { v, json, badRequest, notFound, conflict, readJson, normSym, UUID_RE, ms, NO_STORE } from '../http.js';

const MAX_LAYOUT = 512_000;
const wrap = b => (b && typeof b === 'object' && 'layout' in b ? b.layout : b);
const sized = (x, max, what) => { if (JSON.stringify(x ?? null).length > max) throw badRequest(`${what} terlalu besar (maks ${Math.round(max / 1000)} KB)`); return x; };

// ---- layout bawaan: GET/PUT /api/chart/layout  ->  {layout, updatedAt}
get('/api/chart/layout', async ctx => {
  const r = await db.one('chart_layouts', { user_id: db.eq(ctx.user.id), name: db.eq('default') });
  return json({ layout: r ? r.data : null, updatedAt: r ? ms(r.updated_at) : null }, 200, NO_STORE);
});
put('/api/chart/layout', async ctx => {
  const body = await readJson(ctx.req, MAX_LAYOUT + 1000), data = sized(wrap(body), MAX_LAYOUT, 'Layout');
  if (!data || typeof data !== 'object') throw badRequest('layout harus objek JSON');
  const [r] = await db.insert('chart_layouts', { user_id: ctx.user.id, name: 'default', data }, { upsert: true, onConflict: 'user_id,name' });
  return json({ layout: r.data, updatedAt: ms(r.updated_at) });
});

// ---- layout bernama: /api/chart/layouts
const layoutOut = (r, full) => ({ id: r.id, name: r.name, updatedAt: ms(r.updated_at), ...(full ? { layout: r.data } : {}) });
get('/api/chart/layouts', async ctx => json((await db.select('chart_layouts', { select: 'id,name,updated_at', user_id: db.eq(ctx.user.id), name: db.neq('default'), order: 'updated_at.desc', limit: 100 })).map(r => layoutOut(r)), 200, NO_STORE));
post('/api/chart/layouts', async ctx => {
  const b = await ctx.json(), name = v.str(b.name, 'Nama layout', { min: 1, max: 60 });
  if (name === 'default') throw badRequest('Nama "default" dicadangkan');
  if (await db.count('chart_layouts', { user_id: db.eq(ctx.user.id) }) >= 50) throw badRequest('Maksimal 50 layout');
  const [r] = await db.insert('chart_layouts', { user_id: ctx.user.id, name, data: sized(b.layout ?? {}, MAX_LAYOUT, 'Layout') }).catch(e => { if (db.isUnique(e)) throw conflict('Nama layout sudah dipakai'); throw e; });
  return json(layoutOut(r, true), 201);
});
const lid = ctx => { if (!UUID_RE.test(ctx.params.id)) throw notFound(); return { id: db.eq(ctx.params.id), user_id: db.eq(ctx.user.id) }; };
get('/api/chart/layouts/:id', async ctx => { const r = await db.one('chart_layouts', lid(ctx)); if (!r) throw notFound('Layout tidak ditemukan'); return json(layoutOut(r, true), 200, NO_STORE); });
put('/api/chart/layouts/:id', async ctx => {
  const b = await readJson(ctx.req, MAX_LAYOUT + 2000), patch = {};
  if (b.name !== undefined) { patch.name = v.str(b.name, 'Nama layout', { min: 1, max: 60 }); if (patch.name === 'default') throw badRequest('Nama "default" dicadangkan'); }
  if (b.layout !== undefined) patch.data = sized(b.layout, MAX_LAYOUT, 'Layout');
  if (!Object.keys(patch).length) throw badRequest('Tidak ada yang diubah');
  const r = await db.update('chart_layouts', lid(ctx), patch).catch(e => { if (db.isUnique(e)) throw conflict('Nama layout sudah dipakai'); throw e; });
  if (!r.length) throw notFound('Layout tidak ditemukan');
  return json(layoutOut(r[0], true));
});
del('/api/chart/layouts/:id', async ctx => { const r = await db.remove('chart_layouts', lid(ctx)); if (!r.length) throw notFound('Layout tidak ditemukan'); return json({ ok: true }); });

// ---- drawing per simbol: GET/PUT /api/chart/drawings/:symbol  ->  {symbol, drawings, updatedAt}
get('/api/chart/drawings/:symbol', async ctx => {
  const symbol = normSym(ctx.params.symbol), r = await db.one('chart_drawings', { user_id: db.eq(ctx.user.id), symbol: db.eq(symbol) });
  return json({ symbol, drawings: r ? r.data : [], updatedAt: r ? ms(r.updated_at) : null }, 200, NO_STORE);
});
put('/api/chart/drawings/:symbol', async ctx => {
  const symbol = normSym(ctx.params.symbol), b = await readJson(ctx.req, MAX_LAYOUT + 1000), data = sized(Array.isArray(b) ? b : b.drawings, MAX_LAYOUT, 'Drawing');
  if (!Array.isArray(data)) throw badRequest('drawings harus daftar');
  const [r] = await db.insert('chart_drawings', { user_id: ctx.user.id, symbol, data }, { upsert: true, onConflict: 'user_id,symbol' });
  return json({ symbol, drawings: r.data, updatedAt: ms(r.updated_at) });
});
get('/api/chart/drawings', async ctx => json((await db.select('chart_drawings', { select: 'symbol,updated_at', user_id: db.eq(ctx.user.id), order: 'updated_at.desc', limit: 500 })).map(r => ({ symbol: r.symbol, updatedAt: ms(r.updated_at) })), 200, NO_STORE));
del('/api/chart/drawings/:symbol', async ctx => { await db.remove('chart_drawings', { user_id: db.eq(ctx.user.id), symbol: db.eq(normSym(ctx.params.symbol)) }); return json({ ok: true }); });

// ---- template: /api/chart/templates?kind=indicators|drawing|chart
const KINDS = ['indicators', 'drawing', 'chart'];
const tplOut = (r, full) => ({ id: r.id, kind: r.kind, name: r.name, updatedAt: ms(r.updated_at), ...(full ? { data: r.data } : {}) });
get('/api/chart/templates', async ctx => {
  const q = { select: ctx.query.full === '1' ? '*' : 'id,kind,name,updated_at', user_id: db.eq(ctx.user.id), order: 'name.asc', limit: 200 };
  if (ctx.query.kind) q.kind = db.eq(v.oneOf(ctx.query.kind, 'kind', KINDS));
  return json((await db.select('chart_templates', q)).map(r => tplOut(r, ctx.query.full === '1')), 200, NO_STORE);
});
post('/api/chart/templates', async ctx => {   // upsert berdasarkan (kind, name)
  const b = await ctx.json(), kind = v.oneOf(b.kind, 'kind', KINDS), name = v.str(b.name, 'Nama template', { min: 1, max: 60 });
  const [r] = await db.insert('chart_templates', { user_id: ctx.user.id, kind, name, data: sized(b.data ?? {}, 200_000, 'Template') }, { upsert: true, onConflict: 'user_id,kind,name' });
  return json(tplOut(r, true), 201);
});
get('/api/chart/templates/:id', async ctx => { const r = await db.one('chart_templates', lid(ctx)); if (!r) throw notFound('Template tidak ditemukan'); return json(tplOut(r, true), 200, NO_STORE); });
del('/api/chart/templates/:id', async ctx => { const r = await db.remove('chart_templates', lid(ctx)); if (!r.length) throw notFound('Template tidak ditemukan'); return json({ ok: true }); });

// ---- indikator custom: /api/indicators (milik sendiri, ?scope=public untuk komunitas)
const indOut = (r, full) => ({ id: r.id, name: r.name, description: r.description, language: r.language, overlay: r.overlay, isPublic: r.is_public, tags: r.tags || [], version: r.version, inputs: r.inputs, forkedFrom: r.forked_from, mine: undefined, updatedAt: ms(r.updated_at), ...(full ? { source: r.source } : {}) });
function indIn(b, partial = false) {
  const o = {};
  const has = k => b[k] !== undefined;
  if (!partial || has('name')) o.name = v.str(b.name, 'Nama indikator', { min: 1, max: 60 });
  if (has('description')) o.description = v.str(b.description ?? '', 'Deskripsi', { max: 2000 });
  if (has('language')) o.language = v.oneOf(b.language, 'language', ['js', 'pine']);
  if (has('source')) o.source = v.str(b.source ?? '', 'Kode', { max: 200000, trim: false });
  if (has('inputs')) o.inputs = sized(v.arr(b.inputs, 'inputs', { max: 40 }), 20000, 'inputs');
  if (has('overlay')) o.overlay = !!b.overlay;
  if (has('isPublic')) o.is_public = !!b.isPublic;
  if (has('tags')) o.tags = [...new Set(v.arr(b.tags, 'tags', { max: 10 }).map(t => String(t).trim().toLowerCase().slice(0, 24)).filter(Boolean))];
  return o;
}
get('/api/indicators', async ctx => {
  const pubScope = ctx.query.scope === 'public';
  const q = { select: 'id,name,description,language,overlay,is_public,tags,version,inputs,forked_from,updated_at,user_id', order: 'updated_at.desc', limit: Math.min(100, +ctx.query.limit || 50), offset: Math.max(0, +ctx.query.offset || 0) };
  if (pubScope) { q.is_public = db.eq(true); if (ctx.query.q) q.name = db.ilike(`*${String(ctx.query.q).replace(/[,()*:"\\{}%]/g, '').slice(0, 40)}*`); } else q.user_id = db.eq(ctx.user.id);
  return json((await db.select('custom_indicators', q)).map(r => ({ ...indOut(r), mine: r.user_id === ctx.user.id })), 200, NO_STORE);
});
post('/api/indicators', async ctx => {
  const b = await ctx.json();
  if (await db.count('custom_indicators', { user_id: db.eq(ctx.user.id) }) >= 200) throw badRequest('Maksimal 200 indikator');
  const [r] = await db.insert('custom_indicators', { user_id: ctx.user.id, language: 'js', ...indIn(b) });
  return json(indOut(r, true), 201);
});
get('/api/indicators/:id', async ctx => {
  if (!UUID_RE.test(ctx.params.id)) throw notFound();
  const r = await db.one('custom_indicators', { id: db.eq(ctx.params.id) });
  if (!r || (r.user_id !== ctx.user.id && !r.is_public)) throw notFound('Indikator tidak ditemukan');
  return json({ ...indOut(r, true), mine: r.user_id === ctx.user.id }, 200, NO_STORE);
});
put('/api/indicators/:id', async ctx => {
  const b = await ctx.json(), patch = indIn(b, true);
  if (!Object.keys(patch).length) throw badRequest('Tidak ada yang diubah');
  const cur = await db.one('custom_indicators', { select: 'version,source', ...lid(ctx) }); if (!cur) throw notFound('Indikator tidak ditemukan');
  if (patch.source !== undefined && patch.source !== cur.source) patch.version = cur.version + 1;
  const r = await db.update('custom_indicators', lid(ctx), patch);
  if (!r.length) throw notFound('Indikator tidak ditemukan');
  return json(indOut(r[0], true));
});
del('/api/indicators/:id', async ctx => { const r = await db.remove('custom_indicators', lid(ctx)); if (!r.length) throw notFound('Indikator tidak ditemukan'); return json({ ok: true }); });
post('/api/indicators/:id/fork', async ctx => {
  if (!UUID_RE.test(ctx.params.id)) throw notFound();
  const s = await db.one('custom_indicators', { id: db.eq(ctx.params.id) });
  if (!s || (s.user_id !== ctx.user.id && !s.is_public)) throw notFound('Indikator tidak ditemukan');
  const [r] = await db.insert('custom_indicators', { user_id: ctx.user.id, name: `${s.name} (salinan)`.slice(0, 60), description: s.description, language: s.language, source: s.source, inputs: s.inputs, overlay: s.overlay, tags: s.tags, forked_from: s.id });
  return json(indOut(r, true), 201);
});
