// npm run migrate: menjalankan berkas SQL di supabase/migrations berurutan, HANYA yang belum tercatat di tabel schema_migrations
// (satu transaksi per berkas; bila gagal, berkas itu dibatalkan penuh). Aman diulang kapan saja.
//   npm run migrate              semua yang belum diterapkan
//   npm run migrate -- 006       paksa jalankan berkas berawalan 006 (mis. setelah memperbaikinya)
//   npm run migrate -- --status  daftar berkas dan statusnya, tanpa mengubah apa pun
// Berkas bernama *_optional* (jadwal pg_cron, butuh diedit dulu) tidak pernah dijalankan otomatis.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './load-env.js';
import { cekUrl, berhenti } from './db-help.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const url = process.env.DATABASE_URL;
const salah = cekUrl(url); if (salah) { console.error('GAGAL: ' + salah); process.exit(1); }

let pg;
try { pg = (await import('pg')).default; }
catch { console.error('GAGAL: paket "pg" belum terpasang. Jalankan dulu:  npm install'); process.exit(1); }

const ssl = /supabase\.(co|com)|sslmode=require/.test(url) || process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
const c = new pg.Client({ connectionString: url, ssl, connectionTimeoutMillis: 15000 });
try { await c.connect(); } catch (e) { berhenti(e, url); }

const args = process.argv.slice(2), status = args.includes('--status'), only = args.filter(a => !a.startsWith('--'));
const files = fs.readdirSync(dir).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
const optional = f => /optional/i.test(f);

try {
  await c.query('create table if not exists schema_migrations (versi text primary key, diterapkan timestamptz not null default now())');
  const done = new Set((await c.query('select versi from schema_migrations')).rows.map(r => r.versi));

  if (status) {
    for (const f of files) console.log((optional(f) ? 'manual  ' : done.has(f.replace(/\.sql$/, '')) ? 'sudah    ' : 'BELUM    ') + f);
    process.exit(0);
  }

  let n = 0;
  for (const f of files) {
    const v = f.replace(/\.sql$/, '');
    if (only.length ? !only.some(o => f.startsWith(o)) : done.has(v)) continue;
    if (optional(f) && !only.length) { console.log(`- ${f} dilewati (opsional, jalankan manual setelah diedit; lihat README.md, bagian Deploy)`); continue; }
    process.stdout.write('> ' + f + ' ... ');
    try {
      await c.query('begin');
      await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await c.query('insert into schema_migrations (versi) values ($1) on conflict (versi) do update set diterapkan = now()', [v]);
      await c.query('commit'); console.log('ok'); n++;
    } catch (e) {
      await c.query('rollback').catch(() => {});
      console.log('GAGAL\n' + e.message + (e.position ? `\n(posisi karakter ${e.position} di ${f})` : '') + '\nBerkas ini dibatalkan penuh; perbaiki lalu jalankan lagi.');
      process.exit(1);
    }
  }

  // verifikasi: tabel inti dan fungsi pembatas laju harus ada
  const need = ['users', 'otps', 'rate_limits', 'kv_cache', 'notes', 'alerts'];
  const have = new Set((await c.query("select tablename from pg_tables where schemaname = 'public'")).rows.map(r => r.tablename));
  const kurang = need.filter(t => !have.has(t));
  const fn = (await c.query("select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rate_hit'")).rowCount;
  if (kurang.length || !fn) { console.error(`PERINGATAN: belum lengkap (${[...kurang, ...(fn ? [] : ['fungsi rate_hit'])].join(', ')}). Jalankan: npm run migrate -- 001`); process.exit(1); }
  console.log(n ? `Selesai: ${n} berkas diterapkan.` : 'Tidak ada migrasi baru. Database sudah lengkap.');
  console.log('Cek backend: buka https://ALAMAT-ANDA/api/health?deep=1 -> "db":"ok"');
} finally { await c.end().catch(() => {}); }
