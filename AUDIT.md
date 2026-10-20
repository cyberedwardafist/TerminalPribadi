# Audit keamanan dan kecocokan kode ↔ skema

Cakupan: seluruh `lib/`, `api/`, `supabase/migrations/`, `vercel.json`, serta frontend di `public/` untuk titik XSS dan kebocoran data. Tanggal: 2026-10-20.

## Cara memeriksa
- Membaca semua rute dan pustaka, lalu menelusuri setiap query ke `db.*` dengan skrip yang mencocokkan nama tabel dan kolom dengan `001_init.sql` (131 panggilan).
- Menjalankan semua migrasi di **PostgreSQL 16 sungguhan** (peran `anon/authenticated/service_role` dan `storage.buckets` ditiru): `001` dua kali, `003`, `004`, `005` dua kali, dan jalur upgrade dari `001` versi lama lalu `005`. Semua berhasil dan idempoten.
- Menguji baris yang dibuat kode terhadap constraint asli, serta hak akses `anon/authenticated` dan fungsi `rate_hit`.
- `npm test`: 44 test lulus (33 lama + 11 baru). Test baru untuk perbaikan di bawah dijalankan juga terhadap kode lama; yang membuktikan bug gagal di sana.

## A. Diperbaiki di versi ini

| # | Tingkat | Temuan | Perbaikan |
|---|---|---|---|
| 1 | Tinggi (fungsional) | Jurnal tanpa "Arah" (`side:''`, default di form) atau tanpa hasil ditolak `400 "side wajib diisi"` oleh `v.oneOf`, padahal skema memperbolehkan `''`. Di mode Live trade itu tidak pernah tersinkron (hanya `console.warn`) dan terlewat di `/api/import`. | `notes.js`: `enumOrEmpty`. |
| 2 | Sedang | Batas 5 tebakan OTP bisa dilewati lewat permintaan paralel (baca `tries` → bandingkan → tulis `tries+1`; semua permintaan membaca `tries=0`). Di kode lama, 14 tebakan paralel semuanya dievaluasi. | `auth.js`: tiap tebakan mengambil jatah lewat update bersyarat (`tries = nilai terbaca`) sebelum dibandingkan. |
| 3 | Sedang | `POST /api/auth/register` tidak punya batas per email: pendaftaran berulang dengan email korban membanjiri kotak masuknya dan menghabiskan jatah Gmail (±500/hari) untuk semua pengguna. Hanya dibatasi 10/jam per IP. | Batas 5/10 menit dan cooldown 30 dtk per email, sama dengan `/otp/send`. |
| 4 | Rendah–sedang | Rahasia cron diterima lewat `?secret=`; query string tercatat di log akses. | `requireCron` hanya membaca header `Authorization`. (`002_schedule_optional.sql` dan Vercel Cron memang memakai header.) |
| 5 | Rendah | `background` di preferensi menerima string apa pun (≤40 karakter). | Daftar putih `angin\|hutan\|laut\|custom`. `reduceMotion` kini `true/false/null` (sebelumnya `null` berubah jadi `false` dan menimpa pengaturan sistem). Body preferensi dibatasi 4 KB. |
| 6 | Rendah | Login: karakter `"` dan `\` di username merusak filter PostgREST → `500`. Koma dan kurung sudah dibuang (tidak ada injeksi). | Karakter khusus dibuang; id kosong → 401. |
| 7 | Rendah | `/api/symbols?remote=1` memanggil Yahoo tanpa pembatas. | `softLimit` 30/menit. |
| 8 | Rendah | Layout chart bernama bisa diganti namanya menjadi `default` (nama cadangan). `PUT /api/indicators/:id` yang kalah balapan menghasilkan `500`. | `400` dan `404`. |

## B. Kecocokan kode ↔ skema

**Nama tabel dan kolom: tidak ada yang salah.** Semua kunci objek di `insert/update/select`, pembangun baris (`noteIn`, `tradeIn`, `indIn`, event kalender, baris berita), dan pemeta keluaran (`*Out`) cocok dengan `001_init.sql`. Kolom `NOT NULL` tanpa default selalu diisi. Kunci `upsert`, `onConflict`, `ignoreDuplicates` yang disebut skrip hanyalah opsi fungsi, bukan kolom.

**Nilai yang dilanggar constraint (sudah diperbaiki):**
- `journal_trades.side/res` = `''` ditolak kode padahal diizinkan skema (temuan #1).
- `journal_trades.date`: `Date.parse('2026-02-31')` valid di V8 tetapi ditolak Postgres → `500`. Sekarang tanggal harus ada di kalender.
- `notes.html ≤ 500000`: penyaring HTML bisa membesarkan teks (`<` → `&lt;`, penutup tag) sesudah pemeriksaan panjang → `500` dari check DB. Sekarang `400`.
- `news.category`: `NEWS_FEEDS_EXTRA` dengan kategori di luar `idx|us|cry|com|fx` menggagalkan seluruh batch insert berita (100 baris) tanpa pesan. Sekarang entri itu diabaikan dengan peringatan di log.

**Ditambahkan:** kolom `user_settings.bg_image` dan bucket privat `backgrounds` (`001` dan `005_background_image.sql`). Instalasi lama **wajib** menjalankan `005`.

**Catatan:** `tests/fakes.js` tidak menegakkan constraint, jadi test API tidak akan menangkap kelas masalah di atas. Verifikasi skema di sini dilakukan langsung ke Postgres. Disarankan menambah satu test integrasi dengan Postgres asli di CI.

## C. Belum dikerjakan (perlu keputusan Anda)

| # | Tingkat | Temuan | Rekomendasi dan trade-off |
|---|---|---|---|
| 1 | Sedang | Tidak ada `Content-Security-Policy`. Token sesi ada di `localStorage` (14 hari), jadi satu XSS = pengambilalihan akun. Frontend tidak memuat sumber luar, jadi CSP ketat memungkinkan. | Mulai dengan `Content-Security-Policy-Report-Only`: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'`. `'unsafe-inline'` perlu karena ada skrip inline di `index.html`; `connect-src` perlu dilonggarkan bila memakai API di domain lain. Tidak saya pasang otomatis karena belum bisa diuji di browser. |
| 2 | Sedang | CORS bawaan `*` (termasuk header `x-admin-token`). Tidak ada cookie sehingga risikonya kecil, tetapi tidak perlu terbuka bila frontend satu domain. | Isi `ALLOWED_ORIGINS` di produksi. Tidak saya ubah defaultnya agar alur dev lokal → API terdeploy tidak patah. |
| 3 | Rendah–sedang | `GET /api/stream?token=` menaruh JWT 14 hari di URL (log, riwayat). Frontend memakai polling, jadi jalur ini tidak terpakai. | Hapus `allowQueryToken`, atau ganti dengan tiket sekali pakai berumur pendek. |
| 4 | Rendah–sedang | Brute force password lintas IP: batas hanya per IP+akun dan per IP. | Batas per akun (mis. 30/15 menit) menutup celah tetapi memungkinkan orang lain mengunci akun korban sementara. Keputusan produk. |
| 5 | Rendah | Pembatas laju gagal-buka ke memori per-instance bila DB error; di serverless hampir tidak efektif. | Untuk login/OTP, pertimbangkan gagal-tutup (tolak) saat DB bermasalah. |
| 6 | Rendah | Pencabutan token (ganti password, `logout-all`) memakai cache pengguna 20 dtk per instance; instance lain bisa menerima token lama sampai 20 dtk. | Kecilkan TTL atau terima sebagai batas. |
| 7 | Rendah | `/api/auth/register` membocorkan username/email yang sudah terdaftar (`409`). Klaim di dokumen hanya berlaku untuk `/otp/send`. | Trade-off UX; cukup dicatat. |
| 8 | Rendah | `evaluateAlerts` mengambil maksimal 2000 alert aktif tanpa urutan; bila lebih (maks 100 per akun), sebagian tidak pernah diperiksa. | Urutkan menurut `created_at` dan halaman, atau proses per simbol. |
| 9 | Info | Indikator custom publik bisa di-fork dan dijalankan pengguna lain. Server tidak mengeksekusinya, tetapi **belum ada eksekutor di repo ini** (tidak ada `new Worker`). | Saat dibuat: Web Worker tanpa akses DOM dan storage, batas waktu, dan CSP `connect-src` agar kode tidak bisa mengirim data keluar. |
| 10 | Info | `x-forwarded-for` dipercaya untuk pembatas laju. Aman di Vercel (header ditimpa platform); tidak aman di belakang proxy lain. | Catat bila pindah hosting. |
| 11 | Info | `/api/admin/*` tanpa pembatas percobaan. | `ADMIN_TOKEN` acak ≥ 32 karakter sudah cukup. |
| 12 | Info | `tests/fixtures/test-key.pem` adalah kunci uji (sertifikat `localhost`), dipakai `smtp.test.js`. Aman, tetapi pemindai rahasia akan menandainya. | Buat kunci saat test berjalan atau kecualikan di pemindai. |
| 13 | Info | Password minimal 8 karakter, tanpa pemeriksaan kebocoran. | Opsional: daftar password umum. |

## D. Yang diperiksa dan baik
- Password scrypt; verifikasi waktu-konstan; `fakeVerify` meratakan waktu respons untuk pengguna yang tidak ada.
- JWT: algoritma diperiksa, tanda tangan dibandingkan `timingSafeEqual`, `token_version` mencabut sesi; `JWT_SECRET` wajib ≥ 32 karakter.
- OTP: HMAC, kedaluwarsa 10 menit, cooldown, tidak membocorkan email terdaftar di `/otp/send`.
- Isolasi data: setiap query rute pengguna menyertakan `user_id` (termasuk lewat helper `own`/`lid`); indikator publik hanya terbaca bila `is_public`.
- RLS aktif tanpa policy, hak `anon/authenticated` dicabut, `rate_hit` hanya untuk `service_role`. Terbukti di Postgres sungguhan.
- Penyaring HTML catatan membangun ulang tag dari daftar putih dan membuang semua atribut kecuali `class` yang diizinkan.
- Gambar: dicek magic byte (bukan `Content-Type`), batas 3 MB, bucket privat, `nosniff`.
- Input filter PostgREST (pencarian catatan/berita, tag, simbol) dibersihkan; id divalidasi (`UUID_RE`, `ID_RE`); URL provider memakai `encodeURIComponent` dan simbol divalidasi regex.
- Respons `500` tidak membocorkan detail; frontend meloloskan data API lewat `esc()` sebelum `innerHTML`; tautan berita hanya `http(s)`.
- Tanpa dependensi npm (tidak ada risiko rantai pasok).

## E. Batas audit
- Tidak dijalankan terhadap Supabase/PostgREST sungguhan. Perilaku PostgREST (mis. bulk insert dengan kunci tidak seragam, pesan galat) dinilai dari kode, bukan dieksekusi.
- Frontend diuji lewat `vm` dengan stub (`live.js`), bukan di browser nyata; tampilan, animasi background, dan kedipan tema saat hidrasi belum dilihat langsung.
- Audit ini tidak menggantikan uji penetrasi.
