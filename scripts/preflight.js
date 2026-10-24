// npm run preflight            -> periksa kesiapan LIVE memakai .env (atau variabel lingkungan) sebelum dijalankan / di-deploy
// npm run preflight -- --url https://nama-proyek.vercel.app   -> sekaligus uji deploy yang sudah berjalan (/api/health?deep=1)
// Keluar dengan kode 1 bila ada yang GAGAL (WAJIB diperbaiki). PERINGATAN tidak menggagalkan, tapi sebaiknya dibereskan.
import './load-env.js';
import * as db from '../lib/db.js';
import { mailConfig, verifySmtp } from '../lib/mail.js';

const E = process.env;
const res = { ok: 0, warn: 0, fail: 0 };
const say = (lvl, msg, hint) => { res[lvl]++; console.log(`${{ ok: ' OK     ', warn: ' PERINGATAN', fail: ' GAGAL  ' }[lvl]}  ${msg}${hint ? `\n            => ${hint}` : ''}`); };
const ok = (m) => say('ok', m), warn = (m, h) => say('warn', m, h), fail = (m, h) => say('fail', m, h);
const get = async (url, opt = {}) => { const t = Date.now(); const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Mozilla/5.0 preflight', ...(opt.headers || {}) } }); return { r, ms: Date.now() - t }; };

console.log('\n== 1. Variabel lingkungan ==');
if (!E.SUPABASE_URL || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(E.SUPABASE_URL)) fail('SUPABASE_URL kosong / bentuknya salah', 'Project URL persis dari Supabase > Project Settings > API (https://<ref>.supabase.co)');
else ok('SUPABASE_URL terisi');
const kk = db.keyKind();
if (kk === 'secret' || kk === 'service_role') ok(`SUPABASE_SERVICE_ROLE_KEY terisi (jenis: ${kk})`);
else fail(`SUPABASE_SERVICE_ROLE_KEY tidak valid (jenis terbaca: ${kk})`, 'Pakai secret key (sb_secret_...) atau service_role, BUKAN anon/publishable');
if ((E.JWT_SECRET || '').length >= 32) ok('JWT_SECRET minimal 32 karakter');
else fail('JWT_SECRET kosong atau kurang dari 32 karakter', `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`);
if (/^dev-(dev-)+/.test(E.JWT_SECRET || '')) warn('JWT_SECRET memakai nilai contoh dev', 'Buat yang acak untuk produksi');
(E.CRON_SECRET || '').length >= 16 ? ok('CRON_SECRET terisi') : warn('CRON_SECRET kosong / <16 karakter', 'Tanpa ini cron harian (alert, berita, kalender) ditolak: alert harga tidak pernah dievaluasi di server');
E.RATE_LIMIT === 'off' ? fail('RATE_LIMIT=off', 'Hanya untuk uji lokal. Hapus dari produksi') : ok('Pembatas laju aktif');
if (E.ALLOWED_ORIGINS) ok(`ALLOWED_ORIGINS: ${E.ALLOWED_ORIGINS}`); else warn('ALLOWED_ORIGINS kosong (semua origin diizinkan)', 'Aman bila frontend dan API satu domain; isi bila frontend di domain lain');

console.log('\n== 2. Email (OTP pendaftaran dan reset password) ==');
const mc = mailConfig();
if (!mc.provider) fail('Email belum diatur: kode OTP tidak akan terkirim, tidak ada yang bisa mendaftar', 'Isi SMTP_HOST/PORT/USER/PASS (lihat .env.example)');
else if (mc.provider === 'log' || mc.provider === 'memory') fail(`MAIL_PROVIDER=${mc.provider} tidak mengirim email sungguhan`, 'Hapus baris MAIL_PROVIDER dari .env');
else {
  ok(`Provider email: ${mc.provider}, pengirim ${mc.from}`);
  if (mc.provider === 'smtp' || mc.provider === 'gmail') { const v = await verifySmtp().catch(e => ({ ok: false, error: e.message })); v.ok ? ok('Login SMTP berhasil') : fail(`SMTP gagal: ${v.error}`, v.hint || 'Jalankan npm run mail:test untuk detail'); }
}

console.log('\n== 3. Database (Supabase) ==');
if (!db.dbReady()) fail('Database belum dikonfigurasi (lihat bagian 1)');
else {
  const c = await db.dbCheck();
  if (c.ok) ok('Koneksi database, tabel users, dan fungsi rate_hit berfungsi');
  else fail(`Database bermasalah: ${c.hint}`, 'Jalankan npm run migrate, atau tempel supabase/setup-all.sql di SQL Editor Supabase');
  if (c.ok) {
    const T = ['activity_log', 'alerts', 'auth_tickets', 'calendar_events', 'chart_drawings', 'chart_layouts', 'chart_templates', 'custom_indicators', 'journal_images', 'journal_trades', 'kv_cache', 'news', 'news_saved', 'notes', 'notifications', 'otps', 'rate_limits', 'user_settings', 'user_state', 'users', 'watchlists'], miss = [];
    for (const t of T) { try { await db.select(t, { limit: 1 }); } catch (e) { miss.push(t); } }
    miss.length ? fail(`Tabel belum ada / tidak bisa dibaca: ${miss.join(', ')}`, 'Jalankan ulang supabase/setup-all.sql (aman diulang)') : ok(`Semua ${T.length} tabel tersedia`);
  }
}

console.log('\n== 4. Sumber data pasar (dari mesin ini; Vercel region sin1 bisa berbeda) ==');
const probe = async (name, url, check, must) => {
  try { const { r, ms } = await get(url); const body = await r.text(); if (r.ok && (!check || check(body))) ok(`${name} (${ms} ms)`); else (must ? fail : warn)(`${name} membalas HTTP ${r.status}${r.ok ? ' dengan isi tak terduga' : ''}`, must ? 'Data kripto tidak akan tampil' : 'Sumber ini memengaruhi saham/forex/indeks/komoditas atau peta kripto'); }
  catch (e) { (must ? fail : warn)(`${name} tidak terjangkau: ${e.message}`, 'Cek internet / firewall server'); }
};
await probe('Binance (kripto)', 'https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT', b => /price/.test(b), true);
await probe('Yahoo Finance (saham IDX/AS, forex, indeks, komoditas)', 'https://query1.finance.yahoo.com/v8/finance/chart/BBCA.JK?range=5d&interval=1d', b => /regularMarketPrice/.test(b), true);
await probe('Yahoo Finance pencarian simbol (DSSA)', 'https://query1.finance.yahoo.com/v1/finance/search?q=DSSA&quotesCount=5&newsCount=0', b => /DSSA/.test(b), false);
await probe('CoinGecko (kapitalisasi kripto di Peta)', 'https://api.coingecko.com/api/v3/ping', null, false);
await probe('Kalender ekonomi (faireconomy)', 'https://nfs.faireconomy.media/ff_calendar_thisweek.json', b => b.trim().startsWith('['), false);
E.GOAPI_API_KEY || E.OHLCDEV_API_KEY ? ok('Harga realtime IDX: kunci GoAPI/OHLC.dev terisi') : warn('Harga realtime saham IDX belum diatur (GOAPI_API_KEY / OHLCDEV_API_KEY)', 'Tanpa itu harga IDX di chart mengikuti Yahoo (tertunda)');

const i = process.argv.indexOf('--url');
if (i > 0 && process.argv[i + 1]) {
  const base = process.argv[i + 1].replace(/\/+$/, '');
  console.log(`\n== 5. Deploy: ${base} ==`);
  try {
    const { r, ms } = await get(base + '/api/health?deep=1'), j = await r.json().catch(() => ({}));
    r.ok && j.ok ? ok(`/api/health?deep=1 sehat (${ms} ms), database ${j.db}`) : fail(`/api/health?deep=1 HTTP ${r.status}: ${j.db_hint || JSON.stringify(j).slice(0, 160)}`, 'Cek Environment Variables di Vercel lalu Redeploy');
    const cf = j.config || {};
    if (cf.jwt_secret === false) fail('Deploy: JWT_SECRET belum diisi / <32 karakter');
    if (cf.cron_secret === false) warn('Deploy: CRON_SECRET belum diisi');
    const { r: p } = await get(base + '/auth/login.html'); p.ok ? ok('Halaman login terlayani') : fail(`/auth/login.html HTTP ${p.status}`);
  } catch (e) { fail(`Deploy tidak terjangkau: ${e.message}`); }
}

console.log(`\nRingkasan: ${res.ok} OK, ${res.warn} peringatan, ${res.fail} gagal.`);
console.log(res.fail ? 'BELUM SIAP LIVE: perbaiki yang GAGAL lalu jalankan ulang.' : res.warn ? 'Siap live, dengan catatan peringatan di atas.' : 'SIAP LIVE.');
process.exit(res.fail ? 1 : 0);
