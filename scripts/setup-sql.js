// npm run migrate:sql  (tanpa DATABASE_URL: membuat satu berkas SQL untuk ditempel manual di Supabase SQL Editor)
// Jalur otomatis ada di scripts/migrate.js (npm run migrate)
////  - Ada DATABASE_URL di .env DAN program `psql` terpasang: skema dijalankan langsung ke database.
//  - Selain itu (kasus umum di Windows): membuat supabase/setup-all.sql berisi seluruh skema dalam SATU file untuk ditempel di Supabase > SQL Editor > Run.
// 001_init.sql sudah mencakup tabel, fungsi, bucket storage, dan hak akses service_role. 006 diikutkan hanya agar aman diulang di database lama.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'supabase', 'migrations');
const files = ['001_init.sql', '006_service_role_grants.sql'];
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* tanpa .env */ }

const url = process.env.DATABASE_URL;
const hasPsql = spawnSync('psql', ['--version']).status === 0;
if (url && hasPsql) {
  for (const f of files) {
    console.log(`> ${f}`);
    const r = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', path.join(dir, f)], { stdio: 'inherit' });
    if (r.status !== 0) { console.error(`Gagal di ${f}. Perbaiki lalu ulangi (aman diulang).`); process.exit(1); }
  }
  console.log('Selesai. Cek: https://ALAMAT-ANDA/api/health?deep=1 -> "db":"ok"');
} else {
  const out = path.join(root, 'supabase', 'setup-all.sql');
  fs.writeFileSync(out, files.map(f => `-- ===== ${f} =====\n` + fs.readFileSync(path.join(dir, f), 'utf8')).join('\n\n'));
  console.log(`Berkas dibuat: ${path.relative(root, out)}
${url ? 'DATABASE_URL ada, tetapi program "psql" tidak terpasang.' : 'DATABASE_URL tidak diisi (tidak perlu).'} Jalankan manual (1 menit):
  1. Buka Supabase > project Anda > SQL Editor > New query
  2. Buka berkas di atas, salin SELURUH isinya, tempel, klik Run (harus "Success")
  3. Muat ulang https://ALAMAT-ANDA/api/health?deep=1 -> "db":"ok"`);
}
