// /api/auth/*  — kontrak sama dengan komentar di public/auth/auth.js
import { post, get, patch } from '../router.js';
import * as db from '../db.js';
import { v, json, badRequest, conflict, tooMany, forbidden, HttpError, clientIp } from '../http.js';
import { hashPassword, verifyPassword, fakeVerify, signToken, publicUser, makeOtp, otpHash, sha, randomHex, safeEq, dropUserCache } from '../auth.js';
import { sendMail, otpMail } from '../mail.js';
import { hit, limit, reset } from '../ratelimit.js';
import { logActivity } from '../activity.js';

const OTP_MIN = 10, COOLDOWN = 30, MAX_TRIES = 5;
const EMAIL_RE = /^[^\s@,()"'<>]+@[^\s@,()"'<>]+\.[^\s@,()"'<>]{2,}$/;
const checks = {
  name: x => v.str(x, 'Nama', { min: 2, max: 40, msg: 'Nama 2 sampai 40 karakter' }),
  username: x => v.str(String(x ?? '').toLowerCase(), 'Username', { min: 3, max: 20, pattern: /^[a-z0-9_.]{3,20}$/, msg: 'Username 3 sampai 20 karakter: huruf kecil, angka, titik, garis bawah' }),
  email: x => v.str(String(x ?? '').toLowerCase(), 'Email', { min: 5, max: 120, pattern: EMAIL_RE, msg: 'Format email belum benar' }),
  password: x => v.str(x, 'Password', { min: 8, max: 128, trim: false, msg: 'Password minimal 8 karakter' }),
};
const purposeOf = x => v.oneOf(x, 'purpose', ['register', 'reset']);

async function issueOtp(email, purpose) {
  const code = makeOtp();
  await db.insert('otps', { email, purpose, code_hash: otpHash(code, email, purpose), expires_at: new Date(Date.now() + OTP_MIN * 60000).toISOString(), tries: 0, sent_at: new Date().toISOString() }, { upsert: true, onConflict: 'email,purpose' });
  const m = otpMail(code, purpose);
  // Email gagal terkirim: buang kodenya. Kalau tidak, jeda 30 detik tetap berlaku dan pengguna terkunci menunggu padahal tidak ada email yang bisa dimasukkan.
  try { await sendMail({ to: email, ...m }); }
  catch (e) { await db.remove('otps', { email: db.eq(email), purpose: db.eq(purpose) }).catch(() => {}); throw e; }
}
async function cooldownLeft(email, purpose) {
  const o = await db.one('otps', { select: 'sent_at', email: db.eq(email), purpose: db.eq(purpose) });
  return o ? Math.max(0, Math.ceil((new Date(o.sent_at).getTime() + COOLDOWN * 1000 - Date.now()) / 1000)) : 0;
}

post('/api/auth/register', async ctx => {
  const b = await ctx.json();
  const name = checks.name(b.name), username = checks.username(b.username), email = checks.email(b.email), password = checks.password(b.password);
  await limit(ctx, 'register', 10, 3600);
  const taken = await db.select('users', { select: 'id', verified: db.eq(true), or: `(username.eq.${username},email.eq.${email})`, limit: 1 });
  if (taken.length) throw conflict('Username atau email sudah dipakai');
  // batas kirim OTP per alamat email juga berlaku di sini (sama dengan /otp/send); tanpa ini pendaftaran berulang bisa dipakai
  // membanjiri kotak masuk orang lain dan menghabiskan jatah email harian
  const rl = await hit(`otp-send-email:${sha(email)}:register`, 5, 600); if (!rl.allowed) throw tooMany(rl.retryAfter);
  const wait = await cooldownLeft(email, 'register'); if (wait) throw tooMany(wait, `Tunggu ${wait} detik sebelum mendaftar ulang dengan email ini`);
  // pendaftaran lama yang belum terverifikasi digantikan
  await db.remove('users', { verified: db.eq(false), username: db.eq(username) });
  await db.remove('users', { verified: db.eq(false), email: db.eq(email) });
  const created = await db.insert('users', { name, username, email, password_hash: await hashPassword(password), verified: false }).catch(e => { if (db.isUnique(e)) throw conflict('Username atau email sudah dipakai'); throw e; });
  try { await issueOtp(email, 'register'); }
  catch (e) { await db.remove('users', { id: db.eq(created[0].id) }).catch(() => {}); throw e; }
  return json({ ok: true });
}, { public: true });

post('/api/auth/otp/send', async ctx => {
  const b = await ctx.json();
  const purpose = purposeOf(b.purpose), email = checks.email(b.email);
  await limit(ctx, 'otp-send', 20, 3600);
  const r = await hit(`otp-send-email:${sha(email)}:${purpose}`, 5, 600);
  if (!r.allowed) throw tooMany(r.retryAfter);
  const wait = await cooldownLeft(email, purpose);
  if (wait) throw tooMany(wait, `Tunggu ${wait} detik sebelum kirim ulang`);
  const u = await db.one('users', { select: 'id,verified', email: db.eq(email) });
  // jawaban selalu 200 agar status email terdaftar tidak bocor
  if (u && ((purpose === 'register' && !u.verified) || (purpose === 'reset' && u.verified))) await issueOtp(email, purpose);
  return json({ ok: true });
}, { public: true });

post('/api/auth/otp/verify', async ctx => {
  const b = await ctx.json();
  const purpose = purposeOf(b.purpose), email = checks.email(b.email), code = v.str(b.code, 'Kode', { pattern: /^\d{6}$/, msg: 'Kode terdiri dari 6 digit' });
  await limit(ctx, 'otp-verify', 30, 600);
  const bad = new HttpError(400, 'Kode salah atau sudah kedaluwarsa');
  // Setiap tebakan HARUS mengambil jatah 'tries' lebih dulu lewat update bersyarat (tries = nilai yang baru dibaca). Tanpa ini,
  // permintaan paralel sama-sama membaca tries=0 dan semuanya dievaluasi, sehingga batas 5 tebakan bisa dilewati.
  let o = null;
  for (let i = 0; i < 4 && !o; i++) {
    const cur = await db.one('otps', { email: db.eq(email), purpose: db.eq(purpose) });
    if (!cur || new Date(cur.expires_at) < new Date()) throw bad;
    if (cur.tries >= MAX_TRIES) throw badRequest('Terlalu banyak percobaan. Kirim ulang kode baru');
    if ((await db.update('otps', { email: db.eq(email), purpose: db.eq(purpose), tries: db.eq(cur.tries) }, { tries: cur.tries + 1 })).length) o = cur;
  }
  if (!o) throw tooMany(2, 'Server sibuk. Coba lagi sebentar');
  if (!safeEq(o.code_hash, otpHash(code, email, purpose))) throw bad;
  await db.remove('otps', { email: db.eq(email), purpose: db.eq(purpose) });
  const u = await db.one('users', { email: db.eq(email) });
  if (!u) throw bad;
  if (purpose === 'register') {
    if (u.verified) throw bad;
    const [nu] = await db.update('users', { id: db.eq(u.id) }, { verified: true });
    await db.insert('user_settings', { user_id: u.id }, { ignoreDuplicates: true, onConflict: 'user_id' }).catch(() => {});
    logActivity(u.id, 'auth', 'Akun diverifikasi');
    return json({ user: publicUser(nu) });
  }
  if (!u.verified) throw bad;
  const ticket = randomHex(24);
  await db.insert('auth_tickets', { email, ticket_hash: sha(ticket), expires_at: new Date(Date.now() + OTP_MIN * 60000).toISOString() }, { upsert: true, onConflict: 'email' });
  return json({ ticket });
}, { public: true });

post('/api/auth/reset', async ctx => {
  const b = await ctx.json();
  const email = checks.email(b.email), password = checks.password(b.password), ticket = v.str(b.ticket, 'Tiket', { max: 100 });
  await limit(ctx, 'reset', 10, 600);
  const bad = new HttpError(400, 'Verifikasi OTP sudah kedaluwarsa. Ulangi dari awal');
  const t = await db.one('auth_tickets', { email: db.eq(email) });
  if (!t || new Date(t.expires_at) < new Date() || !safeEq(t.ticket_hash, sha(ticket))) throw bad;
  const u = await db.one('users', { select: 'id,token_version', email: db.eq(email) });
  if (!u) throw bad;
  await db.update('users', { id: db.eq(u.id) }, { password_hash: await hashPassword(password), token_version: u.token_version + 1 });
  await db.remove('auth_tickets', { email: db.eq(email) });
  dropUserCache(u.id);
  logActivity(u.id, 'auth', 'Password diatur ulang');
  return json({ ok: true });
}, { public: true });

post('/api/auth/login', async ctx => {
  const b = await ctx.json();
  const id = v.str(String(b.username ?? '').toLowerCase(), 'Username', { min: 1, max: 120 }), password = v.str(b.password, 'Password', { min: 1, max: 128, trim: false });
  // kunci pembatas memakai hash (bukan username/email asli) supaya tabel rate_limits tidak menyimpan data pribadi
  const ip = clientIp(ctx.req), key = `login:${ip}:${sha(id)}`;
  const g = await hit(`login-ip:${ip}`, 40, 60); if (!g.allowed) throw tooMany(g.retryAfter);
  const r = await hit(key, 8, 60); if (!r.allowed) throw tooMany(r.retryAfter);
  // batas per akun lintas IP (anti brute force terdistribusi). Longgar (60 percobaan / 10 menit) supaya pemilik akun tidak mudah terkunci.
  const a = await hit(`login-acct:${sha(id)}`, 60, 600); if (!a.allowed) throw tooMany(a.retryAfter);
  const q = id.replace(/[(),"\\*\s]/g, '');   // karakter khusus filter PostgREST (kutip membuka string, koma/kurung memecah klausa)
  const u = q ? await db.one('users', { or: `(username.eq.${q},email.eq.${q})` }) : null;
  if (!u) { await fakeVerify(password); throw new HttpError(401, 'Username atau password salah'); }
  if (!(await verifyPassword(password, u.password_hash))) throw new HttpError(401, 'Username atau password salah');
  if (!u.verified) throw new HttpError(403, 'Akun belum diverifikasi', { unverified: true, email: u.email });
  await reset(key);
  await db.update('users', { id: db.eq(u.id) }, { last_login_at: new Date().toISOString() });
  logActivity(u.id, 'auth', 'Masuk');
  return json({ user: publicUser(u), token: signToken(u) });
}, { public: true });

get('/api/auth/me', ctx => json({ user: publicUser(ctx.user) }));

patch('/api/auth/me', async ctx => {
  const b = await ctx.json();
  const [nu] = await db.update('users', { id: db.eq(ctx.user.id) }, { name: checks.name(b.name) });
  dropUserCache(ctx.user.id);
  return json({ user: publicUser(nu) });
});

post('/api/auth/avatar', async ctx => {
  const b = await ctx.json(600000), img = b.image;
  if (img !== null && (typeof img !== 'string' || !/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(img) || img.length > 400000)) throw badRequest('Foto tidak valid');
  await db.update('users', { id: db.eq(ctx.user.id) }, { avatar: img });
  dropUserCache(ctx.user.id);
  return json({ ok: true });
});

post('/api/auth/change-password', async ctx => {
  const b = await ctx.json();
  const cur = v.str(b.current, 'Password lama', { min: 1, max: 128, trim: false }), password = checks.password(b.password);
  await limit(ctx, 'chpw', 10, 600, ctx.user.id);
  const u = await db.one('users', { id: db.eq(ctx.user.id) });
  if (!(await verifyPassword(cur, u.password_hash))) throw new HttpError(400, 'Password lama salah');
  const [nu] = await db.update('users', { id: db.eq(u.id) }, { password_hash: await hashPassword(password), token_version: u.token_version + 1 });
  dropUserCache(u.id);
  logActivity(u.id, 'auth', 'Password diganti');
  return json({ ok: true, token: signToken(nu) });   // sesi lain otomatis keluar, sesi ini tetap hidup
});

post('/api/auth/logout-all', async ctx => {
  const u = await db.one('users', { select: 'id,token_version', id: db.eq(ctx.user.id) });
  await db.update('users', { id: db.eq(u.id) }, { token_version: u.token_version + 1 });
  dropUserCache(u.id);
  return json({ ok: true });
});
