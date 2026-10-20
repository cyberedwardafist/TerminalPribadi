# Terminal Chart — Backend (Vercel + Supabase)

Satu project Vercel: frontend statis di `public/`, seluruh API di **satu** Vercel Function (`api/[...path].js`, router internal di `lib/`). Tanpa dependensi npm. Database Supabase Postgres lewat PostgREST (service role, hanya dari server).

```
public/            frontend (index.html, auth/, apps/, core/, shared/)
api/[...path].js   pintu masuk semua /api/*
lib/               router, auth, db, cache, data pasar, berita, kalender, indikator
lib/routes/        auth, user, market, content, notes, chart, system
supabase/migrations/001_init.sql          skema + RLS (jalankan sekali)
supabase/migrations/002_schedule_optional.sql   jadwal pg_cron (alert tiap menit, berita, dst.)
supabase/migrations/003_user_state.sql    tabel state per app (sudah termasuk di 001 versi ini)
supabase/migrations/004_journal_image_ids.sql   id gambar jurnal jadi teks (hanya bila 001 Anda versi lama)
supabase/migrations/005_background_image.sql    kolom user_settings.bg_image + bucket 'backgrounds' (hanya bila 001 Anda versi lama)
tests/             44 test (database dan sumber pasar ditiru di memori)
AUDIT.md           hasil audit keamanan + kecocokan kode dengan skema, dan rekomendasi yang belum dikerjakan
```

## Deploy (±15 menit)

1. **Supabase**: buat project (region Singapore). SQL Editor → tempel isi `supabase/migrations/001_init.sql` → Run.
   Ambil `Project URL` dan `service_role` key dari Settings → API.
2. **Resend** (email OTP): buat API key. Untuk mengirim ke email siapa pun, verifikasi domain Anda dulu (tanpa itu hanya bisa ke email pemilik akun Resend). Alternatif: Brevo, atau **Gmail SMTP** (tanpa domain): aktifkan Verifikasi 2 Langkah di akun Google → buat *App Password* di myaccount.google.com/apppasswords → isi `GMAIL_USER` dan `GMAIL_APP_PASSWORD` (spasi boleh). Email terkirim dari akun Gmail itu sendiri (Google mengabaikan `MAIL_FROM` lain); batas harian ±500 email.
3. **Vercel**: Import repo ini. Framework: *Other*. Tidak perlu build command. Isi Environment Variables dari `.env.example`
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `CRON_SECRET`, `ADMIN_TOKEN`, `RESEND_API_KEY` atau `GMAIL_USER` + `GMAIL_APP_PASSWORD`, `MAIL_FROM`). Deploy.
4. Buka `https://APP.vercel.app/api/health?deep=1` → harus `{"ok":true,"db":"ok"}`.
5. Buka `https://APP.vercel.app` → Daftar → OTP masuk email → Login. Frontend otomatis mode **Live** ke server yang sama saat dipasang di domain sungguhan (di `localhost` tetap Dummy).
6. Isi data awal: `curl -X POST https://APP.vercel.app/api/admin/refresh -H "x-admin-token: $ADMIN_TOKEN" -H "content-type: application/json" -d '{"what":"all"}'` (berita, kalender, pemanasan cache).
7. (Disarankan) Aktifkan `pg_cron` + `pg_net` di Supabase lalu jalankan `002_schedule_optional.sql` (ganti `YOUR-APP` dan `CRON_SECRET`). Vercel Hobby hanya mengizinkan cron 1x/hari, jadi alert harga (tiap menit) dan berita (tiap 15 menit) dijadwalkan dari Supabase. Di Vercel Pro cukup ubah `crons` di `vercel.json`.

Uji lokal: `npm test`. Jalankan penuh: `vercel dev` (butuh `.env`).

## Kontrak umum
- JSON, pesan error: `{ "message": "..." }` (bahasa Indonesia, ditampilkan langsung oleh klien). Status: 400 validasi, 401 sesi, 403, 404, 409, 413, 429 (+header `Retry-After`), 502 sumber data down.
- Auth: `Authorization: Bearer <token>` dari `/api/auth/login`. Frontend memasangnya otomatis (`shared/config.js`). Token berlaku 14 hari dan dicabut saat password diganti/reset.
- Data pasar secara bawaan **butuh login**. `PUBLIC_MARKET=1` membukanya tanpa login dengan cache CDN.
- Waktu pada respons data pengguna dalam milidetik epoch (`cre`, `upd`, `ts`); candle `t` dalam detik epoch.

## Daftar endpoint
```
POST /api/auth/register
POST /api/auth/otp/send
POST /api/auth/otp/verify
POST /api/auth/reset
POST /api/auth/login
GET /api/auth/me
PATCH /api/auth/me
POST /api/auth/avatar
POST /api/auth/change-password
POST /api/auth/logout-all
GET /api/candles
GET /api/timeframes
GET /api/quotes
GET /api/symbols
GET /api/symbols/:sym
GET /api/heatmap
GET /api/screener
GET /api/summary
GET /api/market/status
GET /api/indicators/builtin
POST /api/indicators/compute
GET /api/udf/config
GET /api/udf/time
GET /api/udf/symbols
GET /api/udf/search
GET /api/udf/history
GET /api/stream
GET /api/settings/preferences
PUT /api/settings/preferences
DELETE /api/settings/preferences
GET /api/settings/background-image
PUT /api/settings/background-image
DELETE /api/settings/background-image
GET /api/settings/layout
PUT /api/settings/layout
GET /api/watchlists
POST /api/watchlists
PATCH /api/watchlists/:id
DELETE /api/watchlists/:id
PUT /api/watchlists/:id/symbols
GET /api/alerts
POST /api/alerts
DELETE /api/alerts/:key
GET /api/notifications
POST /api/notifications/read
DELETE /api/notifications/:id
GET /api/activity
GET /api/state
GET /api/state/:key
PUT /api/state/:key
DELETE /api/state/:key
GET /api/news
GET /api/news/saved
POST /api/news/saved
DELETE /api/news/saved/:id
GET /api/news/:id
GET /api/calendar
GET /api/notes
POST /api/notes
PUT /api/notes/:id
DELETE /api/notes/:id
GET /api/journal/trades
POST /api/journal/trades
PUT /api/journal/trades/:id
DELETE /api/journal/trades/:id
GET /api/journal/summary
GET /api/journal/images
POST /api/journal/images
GET /api/journal/images/:id
DELETE /api/journal/images/:id
POST /api/import
GET /api/chart/layout
PUT /api/chart/layout
GET /api/chart/layouts
POST /api/chart/layouts
GET /api/chart/layouts/:id
PUT /api/chart/layouts/:id
DELETE /api/chart/layouts/:id
GET /api/chart/drawings/:symbol
PUT /api/chart/drawings/:symbol
GET /api/chart/drawings
DELETE /api/chart/drawings/:symbol
GET /api/chart/templates
POST /api/chart/templates
GET /api/chart/templates/:id
DELETE /api/chart/templates/:id
GET /api/indicators
POST /api/indicators
GET /api/indicators/:id
PUT /api/indicators/:id
DELETE /api/indicators/:id
POST /api/indicators/:id/fork
GET /api/health
GET /api/cron/alerts
GET /api/cron/news
GET /api/cron/calendar
GET /api/cron/warm
GET /api/cron/cleanup
GET /api/cron/daily
POST /api/admin/refresh
POST /api/admin/calendar
```
Catatan rute: `/api/indicators/builtin` dan `/api/indicators/compute` didaftarkan sebelum `/api/indicators/:id`; `/api/news/saved` sebelum `/api/news/:id`.

## Sumber data pasar (penting dibaca)
| Pasar | Sumber | Catatan |
|---|---|---|
| Kripto | Binance publik (`data-api.binance.vision`) | tanpa key, real-time, semua timeframe 1m–1M |
| Saham IDX (`.JK`), saham AS, indeks, forex, komoditas | Yahoo Finance (endpoint tidak resmi) | tertunda ±15 menit untuk banyak bursa; 1m hanya 7 hari, 5m–30m 60 hari, 1h/4h 730 hari; 4h dibentuk dari 1h |
| Emas/perak/minyak/dll | futures Yahoo (`GC=F`, `CL=F`, ...) | harga futures, bukan spot; sedikit berbeda dari XAUUSD spot |
| Berita | RSS (`lib/news.js` → `SOURCES`) | ringkasan dari RSS, bukan teks artikel penuh; sentimen berbasis kamus kata |
| Kalender | Forex Factory feed mingguan + ex-dividen Yahoo + input manual | RUPS/laporan keuangan/aksi korporasi tidak punya sumber gratis resmi: isi lewat `POST /api/admin/calendar` |

Yahoo dan feed RSS bisa berubah atau memblokir sewaktu-waktu tanpa pemberitahuan. Penyedia ada di `lib/providers/`; untuk produksi serius ganti/tambah penyedia berlisensi (mis. Twelve Data, Polygon, EODHD, atau data resmi IDX) cukup dengan menambah satu modul dan mengubah `provider` di `lib/catalog.js`.
Heatmap memakai bobot kapitalisasi statis di `lib/heat-data.js` (sama dengan frontend), perubahan harga yang live.

## Keterbatasan Vercel yang sudah disiasati
- **WebSocket tidak didukung** di Vercel Functions. Pengganti: `GET /api/stream?symbols=..&token=..` (Server-Sent Events, ±55 dtik lalu `EventSource` tersambung ulang otomatis) untuk harga dan notifikasi. Untuk kripto, klien juga bisa langsung ke WebSocket Binance.
- Cron sering dipindah ke Supabase pg_cron (lihat langkah 7). Tanpa itu: berita disegarkan malas saat ada yang membuka tab Berita; alert baru dicek 1x/hari.
- Batas 12 function Hobby tidak terkena karena hanya 1 function.

## Keamanan
- Tabel Supabase ditutup untuk `anon`/`authenticated` (RLS aktif, hak dicabut); hanya service role di server yang bisa akses. **Jangan** taruh service role key di frontend.
- Password: scrypt. OTP: 6 digit, HMAC, 10 menit, maks 5 salah, cooldown kirim ulang 30 dtik, tidak membocorkan email terdaftar. Login dibatasi (8 percobaan/menit per IP+akun), semua batas tersimpan di DB (atomik).
- OTP: tiap tebakan mengambil jatah `tries` lewat update bersyarat sebelum dibandingkan, jadi permintaan paralel tidak bisa melewati batas 5. Pendaftaran memakai batas kirim OTP per email yang sama dengan `/otp/send`.
- Rahasia cron hanya diterima lewat header `Authorization` (bukan `?secret=`).
- Lihat `AUDIT.md` untuk temuan lengkap dan rekomendasi yang belum dikerjakan (CSP, `ALLOWED_ORIGINS`, token SSE di URL, dll).
- HTML catatan disaring ulang di server. Kode indikator custom **hanya disimpan**; harus dijalankan di sandbox klien (Web Worker), tidak pernah dieksekusi server.
- Gambar jurnal: bucket privat, dicek magic byte (PNG/JPEG/WebP), maks 3 MB.

## Menyiapkan app Chart ala TradingView (tahap berikutnya)
Sudah tersedia di backend: candle historis dengan paging mundur (`to=`, sampai 5000 bar), 16 indikator bawaan + `compute`, daftar indikator (`/api/indicators/builtin`), layout bernama, drawing per simbol, template, indikator custom (simpan, versi, publik, fork), pencarian simbol, dan datafeed **UDF** (`/api/udf/*`) bila ingin memakai TradingView Charting Library (lisensi terpisah dari TradingView).

## Integrasi frontend (mode Live)
`public/shared/live.js` + loader di `public/index.html` menyambungkan app yang sudah ada tanpa mengubah tampilannya. Aktif otomatis saat dipasang di domain sungguhan dan sudah login; di `localhost`/`file://` tetap Dummy (bisa dipaksa di Setting → API).

| App | Yang tersambung |
|---|---|
| Login/Daftar/OTP/Reset/Avatar | langsung ke `/api/auth/*` (foto profil ikut turun ke perangkat baru) |
| Home, Watchlist | harga, ubah%, sparkline, RSI, volume, posisi 52 minggu nyata dari `/api/quotes` (refresh 10 dtk). Daftar watchlist tersimpan di server |
| Alert (Watchlist) | disinkronkan ke `/api/alerts`; terpicu di server (cron) → masuk `/api/notifications` |
| Chart | candle `/api/candles`; tab chart tersimpan di server |
| Maps | `/api/heatmap` |
| News | daftar dan isi dari `/api/news` (+ detail `/api/news/:id`); tab dan berita tersimpan tersimpan di server |
| Kalender | `/api/calendar` |
| Note, Jurnal | tulis-balik otomatis ke `/api/notes` dan `/api/journal/trades` (hapus ikut terhapus); data lokal pertama kali diunggah sekali |
| Gambar bukti jurnal | diunggah ke `/api/journal/images?id=<id klien>` lewat antrean (`tc.img.pending`, diulang otomatis bila offline/gagal); IndexedDB jadi cache, perangkat lain mengunduh saat gambar dibuka. Gambar lama yang hanya ada di perangkat ikut terunggah saat app dimuat |
| Setting > Umum, Background | tema, simbol awal, timeframe awal, pilihan background, kurangi gerakan, dan gambar background sendiri ikut ke perangkat lain (lihat bagian di bawah) |
| Notifikasi | lonceng di menubar (badge belum dibaca), panel daftar, toast untuk notifikasi baru; polling `/api/notifications` tiap 30 dtk saat tab terlihat. Klik notifikasi alert membuka Chart simbolnya. Tandai dibaca / hapus tersimpan di server |
| Aktivitas | kotak "Aktivitas terbaru" di Home dari `/api/activity?limit=10` (cache 15 dtk) |

Cara kerja: sebelum app dimuat, `Live.ready` menarik data server dan menulisnya ke localStorage dalam format yang sudah dipakai tiap app. Sesudah itu setiap `localStorage.setItem` pada key yang disinkronkan dikirim ke server (ditunda 1,5 dtk, dan dikirim saat tab disembunyikan). Server menang saat hidrasi; konflik antar perangkat = tulisan terakhir yang menang.

**Pengaturan Umum dan Background.** `GET/PUT /api/settings/preferences` menyimpan `{theme, defaultSymbol, defaultTf, background, reduceMotion}` (`background` hanya `angin|hutan|laut|custom`; `reduceMotion` `true|false|null`, `null` = ikuti sistem). `GET` juga memuat `bgImage` (`{ts,size,mime}` atau `null`), diisi server saja. `DELETE` mengosongkan pengaturan (dipakai tombol Reset di Tentang; gambar sendiri tidak ikut terhapus). Gambar background sendiri: `PUT /api/settings/background-image` dengan body mentah PNG/JPEG/WebP maks 3 MB (dicek magic byte, satu per akun, bucket privat `backgrounds`), `GET` mengunduh, `DELETE` menghapus. Di klien: `tc.cfg` dan `bg` disalin ke server hanya untuk kunci yang berubah, dan blok `api` di `tc.cfg` (alamat, key) **tidak pernah dikirim**. Server menang saat hidrasi, lalu `Live.applySettings()` (dipanggil `index.html` sebelum app dimuat) menerapkannya ke tema, `S` dan animasi background. Gambar diunduh sesudah aplikasi tampil (bisa ±2 MB) dan hanya bila versinya (`ts`) berbeda dari `bg.img.v` lokal. Bila hidrasi gagal, gambar lokal tidak pernah dihapus. Penghapusan di satu perangkat ikut menghapus di perangkat lain saat mereka dibuka lagi.

**Gambar jurnal.** Id gambar = id dari klien (isi `trade.imgs[]`), jadi satu jurnal merujuk gambar yang sama di semua perangkat. Gambar tidak pernah diubah: mengunggah id yang sudah ada dijawab `200 {existed:true}` tanpa unggah ulang. Format PNG/JPEG/WebP, maks 3 MB, maks 2000 gambar per akun. Menghapus jurnal tidak otomatis menghapus gambarnya di server; gambar dihapus saat dibuang dari form jurnal.

**Notifikasi memakai polling, bukan SSE.** `/api/stream` menahan satu function selama ±55 dtk tanpa henti; satu tab terbuka sehari penuh menghabiskan jatah GB-jam Vercel Hobby dalam hitungan hari. Polling 30 dtk hanya memakai ±100 ms per permintaan dan berhenti saat tab tersembunyi. Notifikasi alert bergantung pada cron (lihat langkah 7 di Deploy), jadi jeda sampai muncul = jeda cron + maks 30 dtk.

**Riwayat aksi** yang dicatat server: login/verifikasi/ganti password, catatan disimpan, jurnal disimpan, daftar watchlist baru, alert dibuat dan terpicu. Aksi lain (layout chart, berita tersimpan, dst.) belum dicatat.

Bila Anda sudah menjalankan `001_init.sql` versi lama, jalankan juga `003_user_state.sql` (tabel `user_state`), `004_journal_image_ids.sql` (id gambar jadi teks agar bisa memakai id klien), dan `005_background_image.sql` (kolom `bg_image` + bucket `backgrounds`; **wajib** agar gambar background sendiri bisa tersimpan). Semuanya aman dijalankan ulang.
