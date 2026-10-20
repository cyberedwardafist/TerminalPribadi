// Berita dan kalender.
import { get, post, del } from '../router.js';
import * as db from '../db.js';
import { v, json, marketJson, badRequest, notFound, UUID_RE, NO_STORE } from '../http.js';
import { newsOut, keyPoints, ensureFresh } from '../news.js';
import { eventOut, newsToCal, refreshCalendar } from '../calendar.js';
import { cached } from '../cache.js';

const CATS = ['idx', 'us', 'cry', 'com', 'fx'];
const word = w => w.replace(/[,()*:"\\{}%]/g, '').slice(0, 40);
const isoDate = (x, name) => { const t = /^\d{4}-\d{2}-\d{2}$/.test(x) ? new Date(x + 'T00:00:00+07:00').getTime() : Number(x) || Date.parse(x); if (!Number.isFinite(t)) throw badRequest(`${name} tidak valid (YYYY-MM-DD atau epoch ms)`); return new Date(t).toISOString(); };

// GET /api/news?category=&q=&symbol=&sentiment=&from=&to=&sort=new|old&limit=20&cursor=  -> array; header X-Next-Cursor bila masih ada
get('/api/news', async ctx => {
  const Q = ctx.query;
  await ensureFresh();
  const limit = Math.min(50, Math.max(1, +Q.limit || 20)), offset = Math.max(0, +Q.cursor || 0), old = Q.sort === 'old';
  const q = { order: `published_at.${old ? 'asc' : 'desc'},id.asc`, limit, offset };
  if (Q.category && Q.category !== 'all') q.category = db.eq(v.oneOf(Q.category, 'category', CATS));
  if (Q.sentiment && Q.sentiment !== 'all') q.sentiment = db.eq(v.oneOf(Q.sentiment, 'sentiment', ['pos', 'neg', 'neu']));
  if (Q.symbol) q.symbols = db.cs([String(Q.symbol).toUpperCase().replace(/[^A-Z0-9.\-^=_]/g, '')]);
  const and = [];
  if (Q.from) and.push(`published_at.gte.${isoDate(Q.from, 'from')}`);
  if (Q.to) and.push(`published_at.lte.${isoDate(Q.to, 'to')}`);
  for (const w of String(Q.q || '').split(/\s+/).map(word).filter(Boolean).slice(0, 6)) {   // tiap kata harus cocok (AND)
    const ors = [`title.ilike.*${w}*`, `summary.ilike.*${w}*`];
    if (/^[A-Za-z0-9.\-^=_]{2,20}$/.test(w)) ors.push(`symbols.cs.{${w.toUpperCase()}}`);
    and.push(`or(${ors.join(',')})`);
  }
  if (and.length) q.and = `(${and.join(',')})`;
  const rows = await db.select('news', { select: 'id,published_at,category,symbols,title,summary,source,sentiment,url', ...q });
  return marketJson(rows.map(newsOut), 20, 200, rows.length === limit ? { 'x-next-cursor': String(offset + limit) } : {});
}, { market: true });

// ---- berita tersimpan (daftarkan SEBELUM /api/news/:id) ----
get('/api/news/saved', async ctx => {
  const s = await db.select('news_saved', { user_id: db.eq(ctx.user.id), order: 'created_at.desc', limit: 200 });
  if (!s.length) return json([], 200, NO_STORE);
  const rows = await db.select('news', { select: 'id,published_at,category,symbols,title,summary,source,sentiment,url', id: db.inList(s.map(x => x.news_id)) });
  const by = new Map(rows.map(r => [r.id, r]));
  return json(s.map(x => by.get(x.news_id)).filter(Boolean).map(newsOut), 200, NO_STORE);
});
post('/api/news/saved', async ctx => {
  const b = await ctx.json(); if (!UUID_RE.test(b.id || '')) throw badRequest('id berita tidak valid');
  if (!(await db.one('news', { select: 'id', id: db.eq(b.id) }))) throw notFound('Berita tidak ditemukan');
  await db.insert('news_saved', { user_id: ctx.user.id, news_id: b.id }, { ignoreDuplicates: true, onConflict: 'user_id,news_id' });
  return json({ ok: true }, 201);
});
del('/api/news/saved/:id', async ctx => {
  if (!UUID_RE.test(ctx.params.id)) throw notFound();
  await db.remove('news_saved', { user_id: db.eq(ctx.user.id), news_id: db.eq(ctx.params.id) });
  return json({ ok: true });
});

get('/api/news/:id', async ctx => {
  if (!UUID_RE.test(ctx.params.id)) throw notFound('Berita tidak ditemukan');
  const n = await db.one('news', { id: db.eq(ctx.params.id) });
  if (!n) throw notFound('Berita tidak ditemukan');
  const q = { select: 'id,published_at,category,symbols,title,summary,source,sentiment,url', id: db.neq(n.id), order: 'published_at.desc', limit: 4 };
  if (n.symbols?.length) q.symbols = `ov.{${n.symbols.join(',')}}`; else q.category = db.eq(n.category);
  const related = (await db.select('news', q)).map(newsOut);
  return marketJson({ ...newsOut(n), content: n.content, keyPoints: keyPoints(n), related }, 60);
}, { market: true });

// ===================== kalender =====================
async function ensureCalendar() {
  return cached('cal:ensure', 5 * 60_000, async () => {
    const row = await db.one('kv_cache', { key: db.eq('cal:last') }).catch(() => null);
    if (row && Date.now() - row.value.at < 6 * 3600_000) return 'fresh';
    await db.insert('kv_cache', { key: 'cal:last', value: { at: Date.now() }, expires_at: new Date(Date.now() + 86400_000).toISOString() }, { upsert: true, onConflict: 'key' }).catch(() => {});
    await refreshCalendar(); return 'refreshed';
  }).catch(() => 'skip');
}
// GET /api/calendar?month=YYYY-MM -> {events:[...], news:[...]} (bentuk sama dengan norm() di kalender.js)
get('/api/calendar', async ctx => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ctx.query.month || ''));
  if (!m || +m[2] < 1 || +m[2] > 12) throw badRequest('month harus berformat YYYY-MM');
  await ensureCalendar();
  const y = +m[1], mo = +m[2], first = `${m[1]}-${m[2]}-01`, next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
  const [events, news] = await Promise.all([
    db.select('calendar_events', { and: `(date.gte.${first},date.lt.${next})`, order: 'date.asc,time.asc', limit: 1000 }),
    db.select('news', { select: 'id,published_at,category,title,summary,source', category: db.inList(['idx', 'com', 'fx']), and: `(published_at.gte.${first}T00:00:00+07:00,published_at.lt.${next}T00:00:00+07:00)`, order: 'published_at.desc', limit: 400 }),
  ]);
  return marketJson({ events: events.map(eventOut), news: news.map(newsToCal).filter(Boolean) }, 60);
}, { market: true });
