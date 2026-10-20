// Konfigurasi: pemilihan provider email (SMTP utama), normalisasi SUPABASE_URL, header untuk key baru sb_secret_, petunjuk galat Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
const { mailConfig } = await import('../lib/mail.js');
const db = await import('../lib/db.js');

test('email: SMTP_HOST diutamakan atas Resend/Gmail/Brevo', () => {
  const c = mailConfig({ SMTP_HOST: 'mail.x.id', SMTP_PORT: '587', SMTP_USER: 'noreply@x.id', SMTP_PASS: 'p w', RESEND_API_KEY: 'k', GMAIL_USER: 'a@gmail.com', GMAIL_APP_PASSWORD: 'abcd' });
  assert.equal(c.provider, 'smtp'); assert.equal(c.smtp.host, 'mail.x.id'); assert.equal(c.smtp.port, '587'); assert.equal(c.smtp.pass, 'p w');
  assert.equal(c.from, 'Terminal Chart <noreply@x.id>');
});
test('email: tanpa SMTP_HOST jatuh ke Gmail, Resend, Brevo', () => {
  assert.equal(mailConfig({ GMAIL_USER: 'a@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh' }).provider, 'gmail');
  assert.equal(mailConfig({ RESEND_API_KEY: 'k' }).provider, 'resend');
  assert.equal(mailConfig({ BREVO_API_KEY: 'k' }).provider, 'brevo');
  assert.equal(mailConfig({}).provider, '');
  assert.equal(mailConfig({ SMTP_HOST: 'h', MAIL_PROVIDER: 'RESEND', RESEND_API_KEY: 'k' }).provider, 'resend');
});
test('email: MAIL_FROM placeholder .env.example diabaikan; SMTP_FROM menang; spasi App Password Gmail dibuang', () => {
  assert.equal(mailConfig({ SMTP_HOST: 'h', SMTP_USER: 'me@x.id', MAIL_FROM: 'Terminal Chart <noreply@domainanda.com>' }).from, 'Terminal Chart <me@x.id>');
  assert.equal(mailConfig({ SMTP_HOST: 'h', SMTP_USER: 'me@x.id', SMTP_FROM: 'App <app@x.id>' }).from, 'App <app@x.id>');
  assert.equal(mailConfig({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@gmail.com', SMTP_PASS: 'abcd efgh ijkl mnop' }).smtp.pass, 'abcdefghijklmnop');
  assert.equal(mailConfig({ SMTP_HOST: 'h', SMTP_PORT: '587', SMTP_SECURE: 'false' }).smtp.secure, false);
});

const seen = [];
db.setFetch(async (url, o) => { seen.push({ url, h: o.headers }); return new Response('[]', { status: 200 }); });
test('supabase: URL dinormalkan (tanpa https, /rest/v1, kutip, spasi, hanya ref)', async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv';
  for (const [raw, want] of [['https://abc.supabase.co/', 'https://abc.supabase.co'], [' "https://abc.supabase.co/rest/v1/" ', 'https://abc.supabase.co'], ['abc.supabase.co', 'https://abc.supabase.co'], ['abcdefghijklmnopqrst', 'https://abcdefghijklmnopqrst.supabase.co']]) {
    process.env.SUPABASE_URL = raw; seen.length = 0; await db.select('users', { limit: 1 });
    assert.ok(seen[0].url.startsWith(want + '/rest/v1/users'), `${raw} -> ${seen[0].url}`);
  }
});
test('supabase: key sb_secret_ hanya lewat apikey (tanpa Bearer); key JWT memakai Bearer', async () => {
  process.env.SUPABASE_URL = 'https://abc.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_abcdefghijklmnop'; seen.length = 0; await db.select('users', {});
  assert.equal(seen[0].h.apikey, 'sb_secret_abcdefghijklmnop'); assert.equal(seen[0].h.authorization, undefined);
  const jwt = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from('{"role":"service_role"}').toString('base64url'), 'sig_x-1'].join('.');
  process.env.SUPABASE_SERVICE_ROLE_KEY = jwt; seen.length = 0; await db.select('users', {});
  assert.equal(seen[0].h.authorization, 'Bearer ' + jwt); assert.equal(db.keyKind(), 'service_role');
  const anon = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from('{"role":"anon"}').toString('base64url'), 'sig'].join('.');
  process.env.SUPABASE_SERVICE_ROLE_KEY = anon; assert.equal(db.keyKind(), 'anon');
});
test('supabase: petunjuk galat konfigurasi', () => {
  const E = (status, code, message) => new db.DbError(status, { code, message });
  assert.match(db.dbHint(E(401, undefined, 'Invalid API key')), /Key ditolak/);
  assert.match(db.dbHint(E(403, '42501', 'permission denied for table users')), /006_service_role_grants/);
  assert.match(db.dbHint(E(404, 'PGRST205', "Could not find the table 'public.users'")), /001_init/);
  assert.match(db.dbHint(E(404, '42P01', 'relation "users" does not exist')), /001_init/);
  assert.match(db.dbHint(E(0, 'NETWORK', 'x')), /SUPABASE_URL/);
  assert.equal(db.dbHint(E(409, '23505', 'duplicate key')), null);
  assert.equal(db.dbHint(new Error('x')), null);
});

test('email: SMTP_URL satu baris (smtps = TLS 465, smtp = STARTTLS 587, URL-encode, From dari USER)', () => {
  let c = mailConfig({ SMTP_URL: 'smtps://akun%40gmail.com:abcd%20efgh%20ijkl%20mnop@smtp.gmail.com:465', RESEND_API_KEY: 'k' });
  assert.equal(c.provider, 'smtp'); assert.deepEqual([c.smtp.host, +c.smtp.port, c.smtp.user, c.smtp.pass], ['smtp.gmail.com', 465, 'akun@gmail.com', 'abcdefghijklmnop']);
  assert.equal(c.from, 'Terminal Chart <akun@gmail.com>');
  c = mailConfig({ SMTP_URL: 'smtp://u:p%40ss@mail.x.id:587' });
  assert.equal(+c.smtp.port, 587); assert.equal(c.smtp.pass, 'p@ss'); assert.equal(c.smtp.secure, false);
  assert.equal(mailConfig({ SMTP_URL: 'smtps://u:p@h:2465' }).smtp.secure, true);
  assert.equal(+mailConfig({ SMTP_URL: 'smtps://u:p@mail.x.id' }).smtp.port, 465);
  assert.equal(+mailConfig({ SMTP_URL: 'smtp://u:p@mail.x.id' }).smtp.port, 587);
  assert.match(mailConfig({ SMTP_URL: 'bukan-url' }).urlError, /SMTP_URL tidak valid/);
  assert.equal(mailConfig({ SMTP_URL: 'smtp://u:p@h', SMTP_HOST: 'lain' }).smtp.host, 'h');   // SMTP_URL menang atas SMTP_HOST
});
