// Pemeriksaan DATABASE_URL dan terjemahan galat koneksi ke saran yang bisa langsung dilakukan.
export function cekUrl(url) {
  if (!url) return 'DATABASE_URL belum diisi di .env.\n  Supabase > klik tombol "Connect" (atas) > Connection string > "Session pooler" (port 5432) > salin ke .env sebagai DATABASE_URL.\n  Tanpa itu: "npm run migrate:sql" membuat berkas SQL untuk ditempel manual di SQL Editor.';
  if (/\[(YOUR-)?PASSWORD\]|xxxxxxxx|ganti-dengan/i.test(url)) return 'DATABASE_URL masih berisi contoh. Ganti [PASSWORD] dengan password database (bukan password akun Supabase) dan xxxxxxxx dengan project ref Anda.';
  let u; try { u = new URL(url); } catch { return 'DATABASE_URL tidak valid. Bentuk: postgresql://postgres.REF:PASSWORD@HOST:5432/postgres. Karakter khusus di password harus di-URL-encode (@ jadi %40, # jadi %23, / jadi %2F).'; }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return 'DATABASE_URL harus diawali postgresql://';
  return '';
}

export function berhenti(e, url) {
  let host = ''; try { host = new URL(url).hostname; } catch { /* sudah divalidasi */ }
  const m = String(e?.message || e);
  let saran = '';
  if (e?.code === '28P01' || /password authentication failed/i.test(m)) saran = 'Password database salah. Atur ulang di Supabase > Project Settings > Database > Reset database password, lalu isi ulang DATABASE_URL (karakter khusus di-URL-encode).';
  else if (/tenant or user not found/i.test(m)) saran = 'Pooler tidak mengenali user/project. Salin ulang connection string dari tombol "Connect" di Supabase; user-nya berbentuk postgres.<project-ref> dan region pooler harus sama dengan project.';
  else if (e?.code === 'ENOTFOUND') saran = `Host "${host}" tidak ditemukan. Salin ulang connection string dari Supabase, dan cek koneksi internet.`;
  else if (e?.code === 'ENETUNREACH' || /ENETUNREACH|EHOSTUNREACH/.test(m)) saran = 'Host koneksi langsung (db.<ref>.supabase.co) hanya IPv6, sedangkan jaringan Anda IPv4. Pakai "Session pooler" (aws-...pooler.supabase.com:5432) dari tombol Connect.';
  else if (e?.code === 'ECONNREFUSED' || e?.code === 'ETIMEDOUT' || /timeout/i.test(m)) saran = 'Tidak bisa tersambung. Cek port (pooler: 5432 atau 6543), firewall/VPN, dan apakah project Supabase sedang di-pause (buka dashboard, Restore project).';
  else if (/SSL|certificate/i.test(m)) saran = 'Masalah SSL. Tambahkan DB_SSL=true di .env, atau tambahkan ?sslmode=require pada DATABASE_URL.';
  console.error('GAGAL tersambung ke database: ' + m + (saran ? '\n  -> ' + saran : ''));
  process.exit(1);
}
