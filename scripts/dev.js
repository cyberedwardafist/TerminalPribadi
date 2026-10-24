// Server lokal tanpa dependensi: frontend statis (public/) + seluruh /api/* dalam SATU port, sama seperti di Vercel.
//   npm run dev          -> butuh .env (Supabase asli)
//   npm run dev:fake     -> database dan email tiruan di memori (OTP dicetak di terminal), untuk mencoba tampilan tanpa Supabase
// Buka http://localhost:3000 . Karena halaman dan API satu origin, tidak ada masalah CORS dan "Base URL" di Setting > API boleh kosong.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fake = process.argv.includes('--fake');
const PORT = Number(process.env.PORT) || 3000;

import './load-env.js';

if (fake) {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fake',
    JWT_SECRET: process.env.JWT_SECRET || 'dev-'.repeat(12), CRON_SECRET: 'c'.repeat(20), ADMIN_TOKEN: 'a'.repeat(20),
    MAIL_PROVIDER: 'log',
  });
  const { FakeDb, installFetch } = await import(pathToFileURL(path.join(root, 'tests/fakes.js')).href);
  installFetch(new FakeDb(), { price: {} });
  console.log('[dev] MODE TIRUAN: data hilang saat server dimatikan, kode OTP dicetak di terminal ini.');
}

const need = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'].filter(k => !process.env[k]);
if (need.length) {
  console.error(`[dev] Variabel belum diisi: ${need.join(', ')}.\n      Salin .env.example menjadi .env lalu isi, atau jalankan "npm run dev:fake" untuk mencoba tanpa Supabase.`);
  process.exit(1);
}

const { handle } = await import(pathToFileURL(path.join(root, 'lib/app.js')).href);
{
  const { mailConfig } = await import(pathToFileURL(path.join(root, 'lib/mail.js')).href), mc = mailConfig();
  if (!fake && (!mc.provider || mc.provider === 'log')) console.warn(`[dev] PERINGATAN: email belum diatur (${mc.provider || 'kosong'}). Kode OTP TIDAK dikirim ke email${mc.provider === 'log' ? ', hanya dicetak di terminal ini' : ''}. Isi SMTP_* di .env lalu cek dengan "npm run mail:test".`);
  else if (!fake) console.log(`[dev] Email OTP lewat ${mc.provider}, pengirim ${mc.from}. Cek koneksi: npm run mail:test`);
}
const pub = path.join(root, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };

async function api(req, res) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  headers.set('x-forwarded-for', req.socket.remoteAddress || '127.0.0.1');
  const r = await handle(new Request(`http://${req.headers.host || 'localhost'}${req.url}`, {
    method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(req.method === 'HEAD' ? undefined : Buffer.from(await r.arrayBuffer()));
}

function stat(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(pub, p);
  if (!file.startsWith(pub)) { res.writeHead(403); return res.end('Forbidden'); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Tidak ditemukan'); }
  const type = MIME[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const go = new URL(req.url, 'http://x').pathname.startsWith('/api/') ? api(req, res) : (stat(req, res), null);
  go?.catch(e => { console.error('[dev]', e); if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: 'Terjadi kesalahan di server' })); });
}).listen(PORT, () => console.log(`[dev] http://localhost:${PORT}  (halaman + /api dalam satu port)`));
