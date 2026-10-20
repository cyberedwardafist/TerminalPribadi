// Health, admin, cron.
import { get, post } from '../router.js';
import * as db from '../db.js';
import { json, v, badRequest } from '../http.js';
import { requireAdmin, requireCron } from '../auth.js';
import { refreshNews } from '../news.js';
import { refreshCalendar, upsertEvents } from '../calendar.js';
import { warm } from '../market.js';
import { evaluateAlerts } from './user.js';
import { mailConfig, sendMail, otpMail } from '../mail.js';

// GET /api/health -> 200. ?deep=1 ikut memeriksa database
get('/api/health', async ctx => {
  const out = { ok: true, time: new Date().toISOString(), service: 'terminal-chart' };
  if (ctx.query.deep === '1') {
    const c = await db.dbCheck();
    out.db = c.ok ? 'ok' : 'error'; if (!c.ok) { out.ok = false; out.db_hint = c.hint; }
    // hanya status (ada/tidak), tidak pernah nilai rahasia
    const mc = mailConfig(), e = process.env;
    out.config = { supabase_url: !!e.SUPABASE_URL, supabase_key: db.keyKind(), jwt_secret: (e.JWT_SECRET || '').length >= 32, cron_secret: !!e.CRON_SECRET, admin_token: !!e.ADMIN_TOKEN, mail_provider: mc.provider || 'belum diatur', smtp_url_valid: mc.urlError ? false : undefined,
 smtp: mc.smtp ? { host: !!mc.smtp.host, port: String(mc.smtp.port), user: !!mc.smtp.user, pass: !!mc.smtp.pass, from: mc.from.replace(/<[^@>]*@/, '<***@') } : undefined };
  }
  return json(out, out.ok ? 200 : 503, { 'cache-control': 'no-store' });
}, { public: true });

// ---------- cron (Vercel Cron mengirim Authorization: Bearer $CRON_SECRET) ----------
const job = (path, fn) => get(path, async ctx => { requireCron(ctx); return json({ ok: true, ...(await fn()) }); }, { public: true });
job('/api/cron/alerts', evaluateAlerts);
job('/api/cron/news', refreshNews);
job('/api/cron/calendar', refreshCalendar);
job('/api/cron/warm', warm);
job('/api/cron/cleanup', async () => {
  const now = new Date().toISOString();
  const r = await Promise.all([
    db.remove('otps', { expires_at: db.lt(now) }), db.remove('auth_tickets', { expires_at: db.lt(now) }),
    db.remove('rate_limits', { reset_at: db.lt(now) }), db.remove('kv_cache', { expires_at: db.lt(now) }),
    db.remove('notifications', { created_at: db.lt(new Date(Date.now() - 60 * 86400_000).toISOString()) }),
    db.remove('activity_log', { created_at: db.lt(new Date(Date.now() - 90 * 86400_000).toISOString()) }),
    db.remove('users', { verified: db.eq(false), created_at: db.lt(new Date(Date.now() - 2 * 86400_000).toISOString()) }),
  ]);
  return { removed: r.map(x => x.length) };
});
// satu job harian untuk Vercel Hobby (cron sering ada di supabase/migrations/002)
job('/api/cron/daily', async () => ({
  news: await refreshNews().catch(e => ({ error: e.message })), calendar: await refreshCalendar().catch(e => ({ error: e.message })),
  alerts: await evaluateAlerts().catch(e => ({ error: e.message })), warm: await warm().catch(e => ({ error: e.message })),
}));

// ---------- admin (header x-admin-token) ----------
// POST /api/admin/mail-test {to}  -> kirim 1 email uji dan tampilkan galat asli SMTP/Resend (hanya untuk admin) bila gagal
post('/api/admin/mail-test', async ctx => {
  requireAdmin(ctx);
  const to = v.str((await ctx.json()).to, 'to', { min: 5, max: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, msg: 'Alamat email tidak valid' });
  const m = otpMail('123456', 'register');
  try { await sendMail({ to, ...m, subject: 'Uji email Terminal Chart: ' + m.subject }); return json({ ok: true, provider: mailConfig().provider }); }
  catch (e) { return json({ ok: false, provider: mailConfig().provider, error: String(e.cause?.message || e.message).slice(0, 300) }, 502); }
}, { public: true });
post('/api/admin/refresh', async ctx => {
  requireAdmin(ctx);
  const what = v.oneOf((await ctx.json()).what ?? 'all', 'what', ['news', 'calendar', 'warm', 'alerts', 'all']), out = {};
  if (what === 'news' || what === 'all') out.news = await refreshNews();
  if (what === 'calendar' || what === 'all') out.calendar = await refreshCalendar();
  if (what === 'warm' || what === 'all') out.warm = await warm();
  if (what === 'alerts') out.alerts = await evaluateAlerts();
  return json({ ok: true, ...out });
}, { public: true });
// tambah/ubah agenda manual (RUPS, laporan keuangan, aksi korporasi, dll): POST /api/admin/calendar {events:[{id?,date,time,cat,type,title,sym,imp,detail,prev,fc,act,aff[]}]}
post('/api/admin/calendar', async ctx => {
  requireAdmin(ctx);
  const evs = v.arr((await ctx.json()).events, 'events', { max: 500 });
  const rows = evs.map((e, i) => {
    const date = v.str(e.date, `events[${i}].date`, { pattern: /^\d{4}-\d{2}-\d{2}$/ });
    return { id: String(e.id || `manual-${date}-${Math.abs([...String(e.title)].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7))}`).slice(0, 60), date, time: String(e.time || '').slice(0, 5), cat: v.oneOf(e.cat, 'cat', ['idx', 'kom', 'fx']), type: v.str(e.type, 'type', { min: 1, max: 12 }), title: v.str(e.title, 'title', { min: 1, max: 200 }), sym: String(e.sym || '').toUpperCase().slice(0, 20), imp: v.int(e.imp ?? 1, 'imp', { min: 1, max: 3 }), detail: String(e.detail || '').slice(0, 1000), prev: String(e.prev || '').slice(0, 40), fc: String(e.fc || '').slice(0, 40), act: String(e.act || '').slice(0, 40), aff: Array.isArray(e.aff) ? e.aff.map(String).slice(0, 5) : [], source: 'manual' };
  });
  if (!rows.length) throw badRequest('events kosong');
  return json({ ok: true, upserted: await upsertEvents(rows) });
}, { public: true });
