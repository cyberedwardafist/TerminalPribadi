// Catatan ilmu/umum, jurnal trading, gambar bukti, impor dari localStorage klien.
import { get, post, put, del } from '../router.js';
import crypto from 'node:crypto';
import * as db from '../db.js';
import { limit } from '../ratelimit.js';
import { v, json, badRequest, notFound, ID_RE, UUID_RE, ms, NO_STORE, readJson, HttpError } from '../http.js';
import { cleanHtml } from '../sanitize.js';
import { MAX_IMG, sniffImage } from '../image.js';
import { logActivity } from '../activity.js';

const iso = t => new Date(Number.isFinite(+t) && +t > 0 ? +t : Date.now()).toISOString();
const newId = () => crypto.randomUUID();
const pickId = x => (x === undefined || x === null || x === '' ? newId() : (ID_RE.test(String(x)) ? String(x) : (() => { throw badRequest('id tidak valid (6-40 karakter huruf/angka/_/-)'); })()));

// ===================== catatan =====================
const tagList = a => (Array.isArray(a) ? [...new Set(a.map(t => String(t).trim().toLowerCase().replace(/^#+/, '').slice(0, 24)).filter(Boolean))].slice(0, 12) : []);
const noteOut = n => ({ id: n.id, cat: n.cat, html: n.html, tags: n.tags || [], pin: n.pin, cre: ms(n.created_at), upd: ms(n.updated_at) });
function noteIn(b, uid, id) {
  const html = cleanHtml(v.str(b.html ?? '', 'html', { max: 500000, trim: false }));
  if (html.length > 500000) throw badRequest('Isi catatan terlalu panjang');   // hasil saringan bisa lebih panjang dari input; cocokkan dengan check(char_length(html) <= 500000)
  return { user_id: uid, id, cat: b.cat === 'umum' ? 'umum' : 'ilmu', html, tags: tagList(b.tags), pin: !!b.pin, created_at: iso(b.cre), updated_at: iso(b.upd) };
}
get('/api/notes', async ctx => {
  const Q = ctx.query, q = { user_id: db.eq(ctx.user.id), order: 'pin.desc,updated_at.desc', limit: Math.min(1000, +Q.limit || 500), offset: Math.max(0, +Q.offset || 0) };
  if (Q.cat) q.cat = db.eq(v.oneOf(Q.cat, 'cat', ['ilmu', 'umum']));
  if (Q.tag) q.tags = db.cs([String(Q.tag).toLowerCase().replace(/^#+/, '').replace(/[,{}"]/g, '')]);
  if (Q.q) q.html = db.ilike(`*${String(Q.q).replace(/[,()*:"\\{}%]/g, '').slice(0, 60)}*`);
  return json((await db.select('notes', q)).map(noteOut), 200, NO_STORE);
});
post('/api/notes', async ctx => {
  const b = await ctx.json(), [r] = await db.insert('notes', noteIn(b, ctx.user.id, pickId(b.id)), { upsert: true, onConflict: 'user_id,id' });
  logActivity(ctx.user.id, 'note', 'Catatan disimpan');
  return json(noteOut(r), 201);
});
put('/api/notes/:id', async ctx => {   // upsert: aman dipakai sinkronisasi dari klien
  if (!ID_RE.test(ctx.params.id)) throw notFound();
  const b = await ctx.json(), old = await db.one('notes', { select: 'created_at', user_id: db.eq(ctx.user.id), id: db.eq(ctx.params.id) });
  const row = noteIn({ ...b, upd: Date.now(), cre: old ? ms(old.created_at) : b.cre }, ctx.user.id, ctx.params.id);
  const [r] = await db.insert('notes', row, { upsert: true, onConflict: 'user_id,id' });
  return json(noteOut(r));
});
del('/api/notes/:id', async ctx => {
  const r = await db.remove('notes', { user_id: db.eq(ctx.user.id), id: db.eq(ctx.params.id) });
  if (!r.length) throw notFound('Catatan tidak ditemukan');
  return json({ ok: true });
});

// ===================== jurnal trading =====================
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/;
// Date.parse('2026-02-31') lolos di V8 (digeser ke Maret) tetapi Postgres menolaknya -> pastikan tanggalnya benar-benar ada
const realDate = s => { const d = new Date(s + 'T00:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };
// kolom side/res di DB memperbolehkan '' (belum dipilih); v.oneOf menolak '' sehingga dipisah di sini
const enumOrEmpty = (x, name, list) => (x === undefined || x === null || x === '' ? '' : v.oneOf(x, name, list));
const tradeOut = t => ({ id: t.id, date: t.date, time: t.time, timeEnd: t.time_end, sym: t.sym, side: t.side, res: t.res, amount: +t.amount, method: t.method, fields: t.fields, note: t.note, eval: t.eval, imgs: t.imgs || [], cre: ms(t.created_at), upd: ms(t.updated_at) });
function tradeIn(b, uid, id) {
  const date = v.str(b.date, 'date', { pattern: DATE_RE, msg: 'date harus YYYY-MM-DD' });
  if (!realDate(date)) throw badRequest('date tidak valid');
  const hm = (x, n) => { const s = v.str(x ?? '', n, { max: 5 }); if (s && !HM.test(s)) throw badRequest(`${n} harus HH:mm`); return s; };
  const fields = v.arr(b.fields ?? [], 'fields', { max: 30 }).map(f => ({ k: String(f?.k ?? '').slice(0, 60), v: String(f?.v ?? '').slice(0, 200) })).filter(f => f.k);
  const imgs = v.arr(b.imgs ?? [], 'imgs', { max: 8 }).map(String).filter(s => s.length <= 60);
  return {
    user_id: uid, id, date, time: hm(b.time, 'time'), time_end: hm(b.timeEnd, 'timeEnd'), sym: v.str(b.sym ?? '', 'sym', { max: 20 }).toUpperCase(),
    side: enumOrEmpty(b.side, 'side', ['buy', 'sell']), res: enumOrEmpty(b.res, 'res', ['profit', 'loss', 'impas']), amount: Math.abs(v.num(b.amount ?? 0, 'amount', { min: 0, max: 1e15 })),
    method: v.str(b.method ?? '', 'method', { max: 80 }), fields, note: v.str(b.note ?? '', 'note', { max: 20000, trim: false }), eval: v.str(b.eval ?? '', 'eval', { max: 20000, trim: false }), imgs,
    created_at: iso(b.cre), updated_at: iso(b.upd),
  };
}
const inRange = (Q, col) => { const a = []; if (Q.from) a.push(`${col}.gte.${v.str(Q.from, 'from', { pattern: DATE_RE })}`); if (Q.to) a.push(`${col}.lte.${v.str(Q.to, 'to', { pattern: DATE_RE })}`); return a; };

get('/api/journal/trades', async ctx => {
  const Q = ctx.query, q = { user_id: db.eq(ctx.user.id), order: 'date.desc,time.desc', limit: Math.min(2000, +Q.limit || 1000), offset: Math.max(0, +Q.offset || 0) };
  const and = inRange(Q, 'date'); if (and.length) q.and = `(${and.join(',')})`;
  if (Q.sym) q.sym = db.eq(String(Q.sym).toUpperCase());
  return json((await db.select('journal_trades', q)).map(tradeOut), 200, NO_STORE);
});
post('/api/journal/trades', async ctx => {
  const b = await ctx.json(), [r] = await db.insert('journal_trades', tradeIn(b, ctx.user.id, pickId(b.id)), { upsert: true, onConflict: 'user_id,id' });
  logActivity(ctx.user.id, 'journal', `Jurnal ${r.sym || ''} ${r.res || ''}`.trim());
  return json(tradeOut(r), 201);
});
put('/api/journal/trades/:id', async ctx => {
  if (!ID_RE.test(ctx.params.id)) throw notFound();
  const b = await ctx.json(), old = await db.one('journal_trades', { select: 'created_at', user_id: db.eq(ctx.user.id), id: db.eq(ctx.params.id) });
  const [r] = await db.insert('journal_trades', tradeIn({ ...b, upd: Date.now(), cre: old ? ms(old.created_at) : b.cre }, ctx.user.id, ctx.params.id), { upsert: true, onConflict: 'user_id,id' });
  return json(tradeOut(r));
});
del('/api/journal/trades/:id', async ctx => {
  const r = await db.remove('journal_trades', { user_id: db.eq(ctx.user.id), id: db.eq(ctx.params.id) });
  if (!r.length) throw notFound('Trade tidak ditemukan');
  return json({ ok: true });
});
// net harian per bulan (untuk kalender jurnal): GET /api/journal/summary?month=YYYY-MM
get('/api/journal/summary', async ctx => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ctx.query.month || '')); if (!m || +m[2] < 1 || +m[2] > 12) throw badRequest('month harus YYYY-MM');
  const y = +m[1], mo = +m[2], first = `${m[1]}-${m[2]}-01`, next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
  const rows = await db.select('journal_trades', { select: 'date,res,amount', user_id: db.eq(ctx.user.id), and: `(date.gte.${first},date.lt.${next})`, limit: 5000 });
  const days = {}, t = { net: 0, trades: rows.length, wins: 0, losses: 0 };
  for (const r of rows) {
    const d = (days[r.date] ||= { net: 0, profit: 0, loss: 0, trades: 0 }), a = +r.amount;
    d.trades++;
    if (r.res === 'profit') { d.net += a; d.profit += a; t.net += a; t.wins++; } else if (r.res === 'loss') { d.net -= a; d.loss += a; t.net -= a; t.losses++; }
  }
  return json({ month: ctx.query.month, days, totals: { ...t, winRate: t.wins + t.losses ? +(t.wins / (t.wins + t.losses) * 100).toFixed(1) : null } }, 200, NO_STORE);
});

// ===================== gambar bukti =====================
// GET /api/journal/images -> [{id,size,ts}] gambar milik user (dipakai klien untuk mengunggah gambar lokal yang belum ada di server)
get('/api/journal/images', async ctx => {
  const rows = await db.select('journal_images', { select: 'id,size,created_at', user_id: db.eq(ctx.user.id), order: 'created_at.desc', limit: 2000 });
  return json(rows.map(r => ({ id: r.id, size: r.size, ts: ms(r.created_at) })), 200, NO_STORE);
});
// POST /api/journal/images[?id=ID] : multipart (field "file") ATAU body mentah image/png|jpeg|webp -> {id}
// ?id= memakai id dari klien (sama dengan isi trade.imgs[]) supaya gambar yang sama terbaca di semua perangkat. Gambar tidak berubah:
// id yang sudah ada -> 200 {id, existed:true} tanpa unggah ulang (aman diulang).
post('/api/journal/images', async ctx => {
  const given = ctx.query.id, id = given ? pickId(given) : newId();
  if (given) { const had = await db.one('journal_images', { select: 'id', user_id: db.eq(ctx.user.id), id: db.eq(id) }); if (had) return json({ id, existed: true }); }
  const ct = ctx.req.headers.get('content-type') || '';
  let buf;
  if (/multipart\/form-data/i.test(ct)) { const f = (await ctx.req.formData()).get('file'); if (!f || typeof f === 'string') throw badRequest('Field "file" wajib diisi'); buf = Buffer.from(await f.arrayBuffer()); }
  else buf = Buffer.from(await ctx.req.arrayBuffer());
  if (!buf.length || buf.length > MAX_IMG) throw new HttpError(413, 'Ukuran gambar maksimal 3 MB');
  const mime = sniffImage(buf); if (!mime) throw badRequest('Format gambar harus PNG, JPEG, atau WebP');
  await limit(ctx, 'jimg-up', 60, 3600, ctx.user.id);
  // kuota per pengguna: jumlah dan total ukuran (melindungi penyimpanan Supabase dari satu akun yang menghabiskannya)
  const mine = await db.select('journal_images', { select: 'id,size', user_id: db.eq(ctx.user.id), limit: 2001 });
  if (mine.length >= 2000) throw badRequest('Batas gambar tercapai');
  if (mine.filter(r => r.id !== id).reduce((a, r) => a + r.size, 0) + buf.length > 150 * 1024 * 1024) throw new HttpError(413, 'Kuota gambar jurnal 150 MB sudah penuh. Hapus gambar lama dulu');
  const path = `${ctx.user.id}/${id}`;
  await db.storage.upload('journal', path, buf, mime);
  await db.insert('journal_images', { user_id: ctx.user.id, id, path, mime, size: buf.length }, { upsert: true, onConflict: 'user_id,id' });
  return json({ id }, 201);
});
get('/api/journal/images/:id', async ctx => {
  if (!ID_RE.test(ctx.params.id)) throw notFound();
  const row = await db.one('journal_images', { user_id: db.eq(ctx.user.id), id: db.eq(ctx.params.id) });
  if (!row) throw notFound('Gambar tidak ditemukan');
  const f = await db.storage.download('journal', row.path); if (!f) throw notFound('Gambar tidak ditemukan');
  return new Response(f.buf, { headers: { 'content-type': row.mime, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
});
del('/api/journal/images/:id', async ctx => {
  if (!ID_RE.test(ctx.params.id)) throw notFound();
  const r = await db.remove('journal_images', { user_id: db.eq(ctx.user.id), id: db.eq(ctx.params.id) });
  if (r.length) await db.storage.remove('journal', [r[0].path]).catch(() => {});
  return json({ ok: true });
});

// ===================== impor massal dari ekspor JSON / localStorage klien =====================
// POST /api/import {notes:[...], trades:[...]} -> upsert (maks 1000 tiap jenis). Memindahkan catatan/jurnal lokal ke server.
post('/api/import', async ctx => {
  const b = await readJson(ctx.req, 8_000_000), notes = v.arr(b.notes ?? [], 'notes', { max: 1000 }), trades = v.arr(b.trades ?? [], 'trades', { max: 1000 });
  const nrows = [], trows = [], bad = [];
  notes.forEach((n, i) => { try { nrows.push(noteIn(n, ctx.user.id, pickId(n.id))); } catch (e) { bad.push(`notes[${i}]: ${e.message}`); } });
  trades.forEach((t, i) => { try { trows.push(tradeIn(t, ctx.user.id, pickId(t.id))); } catch (e) { bad.push(`trades[${i}]: ${e.message}`); } });
  for (let i = 0; i < nrows.length; i += 100) await db.insert('notes', nrows.slice(i, i + 100), { upsert: true, onConflict: 'user_id,id' });
  for (let i = 0; i < trows.length; i += 100) await db.insert('journal_trades', trows.slice(i, i + 100), { upsert: true, onConflict: 'user_id,id' });
  return json({ ok: true, notes: nrows.length, trades: trows.length, skipped: bad.slice(0, 20) });
});
