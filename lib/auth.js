// JWT HS256 + hash password scrypt, tanpa dependensi.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import * as db from './db.js';
import { HttpError, unauthorized, forbidden, ms } from './http.js';

const scrypt = promisify(crypto.scrypt);
const b64u = b => Buffer.from(b).toString('base64url');
const secret = () => {
  const s = process.env.JWT_SECRET || '';
  if (s.length < 32) throw new HttpError(500, 'JWT_SECRET belum diatur (minimal 32 karakter)');
  return s;
};

// ---------- JWT ----------
export function signToken(user, days = Number(process.env.TOKEN_DAYS) || 14) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ sub: user.id, tv: user.token_version ?? 0, iat: now, exp: now + days * 86400 }));
  const sig = crypto.createHmac('sha256', secret()).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
export function verifyToken(t) {
  const p = String(t || '').split('.');
  if (p.length !== 3) return null;
  const sig = crypto.createHmac('sha256', secret()).update(`${p[0]}.${p[1]}`).digest();
  let given; try { given = Buffer.from(p[2], 'base64url'); } catch { return null; }
  if (given.length !== sig.length || !crypto.timingSafeEqual(given, sig)) return null;
  try {
    const h = JSON.parse(Buffer.from(p[0], 'base64url')); if (h.alg !== 'HS256') return null;
    const b = JSON.parse(Buffer.from(p[1], 'base64url'));
    return b.exp > Math.floor(Date.now() / 1000) ? b : null;
  } catch { return null; }
}

// ---------- password ----------
const N = 16384, R = 8, P = 1;
export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(pw, salt, 32, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${h.toString('base64')}`;
}
export async function verifyPassword(pw, stored) {
  const [alg, n, r, p, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt') return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), want.length, { N: +n, r: +r, p: +p });
  return crypto.timingSafeEqual(got, want);
}
let dummyHash; // dipakai agar waktu respons sama untuk user yang tidak ada
export async function fakeVerify(pw) { dummyHash ||= await hashPassword('dummy-password'); await verifyPassword(pw, dummyHash); }

// ---------- OTP dan tiket ----------
export const makeOtp = () => String(crypto.randomInt(100000, 1000000));
export const otpHash = (code, email, purpose) => crypto.createHmac('sha256', secret()).update(`${purpose}:${email}:${code}`).digest('hex');
export const sha = s => crypto.createHash('sha256').update(s).digest('hex');
export const randomHex = n => crypto.randomBytes(n).toString('hex');
export const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---------- user ----------
export const publicUser = u => ({ id: u.id, name: u.name, username: u.username, email: u.email, created: ms(u.created_at), avatar: u.avatar || null });
const USER_COLS = 'id,name,username,email,created_at,avatar,token_version,verified,role';
const ucache = new Map();

export async function authenticate(ctx, { allowQueryToken = false } = {}) {
  const h = ctx.req.headers.get('authorization') || '';
  let tok = /^Bearer\s+(.+)$/i.exec(h)?.[1];
  if (!tok && allowQueryToken) tok = ctx.query.token;
  const claims = verifyToken(tok);
  if (!claims) throw unauthorized();
  let u = ucache.get(claims.sub);
  if (!u || u.exp < Date.now()) {
    const row = await db.one('users', { select: USER_COLS, id: db.eq(claims.sub) });
    u = { row, exp: Date.now() + 20000 };
    ucache.set(claims.sub, u);
    if (ucache.size > 500) ucache.clear();
  }
  const row = u.row;
  if (!row || !row.verified || row.token_version !== claims.tv) throw unauthorized();
  return row;
}
export const dropUserCache = id => ucache.delete(id);

export function requireAdmin(ctx) {
  const want = process.env.ADMIN_TOKEN || '';
  const got = ctx.req.headers.get('x-admin-token') || /^Bearer\s+(.+)$/i.exec(ctx.req.headers.get('authorization') || '')?.[1] || '';
  if (!want || want.length < 16 || !safeEq(got, want)) throw forbidden('Khusus admin');
}
export function requireCron(ctx) {
  const want = process.env.CRON_SECRET || '';
  // hanya lewat header Authorization (query string tercatat di log akses dan riwayat peramban)
  const got = /^Bearer\s+(.+)$/i.exec(ctx.req.headers.get('authorization') || '')?.[1] || '';
  if (!want || want.length < 16 || !safeEq(got, want)) throw forbidden('Khusus cron');
}
