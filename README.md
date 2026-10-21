# TerminalPribadi

Desktop ala Mac untuk terminal chart trading. Frontend statis (plain JS, tanpa build) di `public/`, seluruh API di **satu** Vercel Function (`api/index.js` → `lib/`), database Supabase Postgres. Tanpa dependensi runtime (`pg` hanya untuk `npm run migrate`).

> **Ini satu-satunya file `.md` di project.** Cari app/fitur di **§2 Peta App**, buka hanya file yang tertulis di sana. Bila lokasi file berubah, perbarui tabel §2 di commit yang sama.

## 1. Cara kerja singkat
- `public/index.html` memuat `shared/` → `core/` → app satu per satu (urutan baris `<script>` = urutan dock) → `core/boot.js`.
- Satu app = satu folder `public/apps/<nama>/` berisi `<nama>.js` (+ `.css`). Kontrak: `registerApp('id',{css?, icon, t, w, h, flush?, html(), init(win)?, show(win)?, notes[]})` (lihat `core/core.js`). `notes` = catatan backend, tampil di tombol "Catatan backend" pada window.
- **Antar app jangan saling memanggil fungsi.** Bagikan lewat state `S` (mis. `S.sym`) lalu `open('id-app')`; bila window sudah terbuka `show(win)` app itu dipanggil.
- **Mode Dummy** (localhost/`file://`): data di localStorage. **Mode Live** (domain sungguhan + login): `shared/live.js` menarik data server → menulis ke localStorage dalam format yang dipakai tiap app → tiap `localStorage.setItem` pada key tersinkron dikirim ke server (tunda 1,5 dtk). Server menang saat hidrasi; konflik antar perangkat = tulisan terakhir menang. Jadi **app tidak perlu tahu server**; cukup baca/tulis key `tc.*`.
- Jangan pakai `prompt/confirm/alert` bawaan browser: pakai `dlg.prompt/confirm/alert` (`shared/dialog.js`).
- Tema/CSS dasar: `core/base.css` (variabel, menubar, dock, window), komponen bersama `shared/ui.css`.

## 2. Peta App (cari di sini dulu)

Path relatif terhadap root project. FE = frontend (`public/`), BE = backend.

| Dock id | Folder FE | File & isi | localStorage (`tc.*`) | Endpoint API | BE (rute → lib) | Tabel DB |
|---|---|---|---|---|---|---|
| **home** | `apps/home/` | `home.js`, `home.css`. Dashboard: sapaan, status pasar WIB, indeks, watchlist aktif, pergerakan terbesar, pintasan, tab chart terakhir, catatan & ringkasan jurnal. Membaca key app lain **hanya-baca** | baca: `watchlist`, `chart.tabs`, `notes`, `journal` | `/api/activity`, (`/api/quotes` via live.js) | `routes/user.js` → `activity.js` | `activity_log` |
| **watchlist** | `apps/watchlist/` | `watchlist.js`, `.css`. Tab = kelompok daftar (dobel-klik ganti nama), panel jelajah + pemindai, detail+alert, dobel-klik baris = buka di Chart. Simbol dummy: `WATCH` di `shared/data.js` (kolom ke-5 = pasar) | `watchlist`, `watchlist.al` (alert, satu per simbol) | `/api/quotes`, `/api/watchlists*`, `/api/alerts*`, `/api/screener` | `routes/market.js`, `routes/user.js` → `market.js`, `catalog.js`, `indicators.js` | `watchlists`, `alerts`, `notifications` |
| **maps** | `apps/maps/` | `maps.js`, `.css`. Peta pasar/heatmap. Bobot statis `DATA` di `maps.js` **sama dengan** `lib/heat-data.js` (ubah keduanya) | `maps` | `/api/heatmap` | `routes/market.js` → `market.js`, `heat-data.js`, `providers/coingecko.js` | `kv_cache` |
| **chart** | `apps/chart/` | `ind.js` 21 indikator bawaan (+Donchian, Keltner, PSAR, MFI; rumus sama `lib/indicators.js`, dijaga tes paritas) · `draw.js` 20 alat gambar (titik `{t,p}`) · `render.js` canvas: panel harga + panel indikator, skala linear/log/persen, 7 tipe candle, crosshair, countdown, alert · `custom.js` indikator custom (JS / Pine) · `worker.js` sandbox Web Worker (5 dtk, tanpa jaringan) · `pine/` interpreter Pine v4/v5/v6 (`parser.js` lexer+parser, `lib.js` ta/math/str/array/map/matrix/color, `runtime.js` evaluator per bar + plot/fill/label/line/box/input/request.security, `strategy.js` strategy.* + laporan; dimuat worker lewat `importScripts`) · `chart.js` tab, interaksi, legenda, dialog, layout/template · `chart.css` | `chart.tabs`, `chart.drw` (gambar per simbol), `chart.layouts`, `chart.tpl`, `chart.ci`, `watchlist.al` | `/api/candles`, `/api/rt/quote`, `/api/chart/layouts*`, `/api/chart/drawings*`, `/api/chart/templates*`, `/api/indicators*`, `/api/alerts` | `routes/chart.js`, `routes/market.js` → `market.js`, `indicators.js`, `realtime.js`, `providers/{binance,yahoo,goapi,ohlcdev}.js` | `chart_layouts`, `chart_drawings`, `chart_templates`, `custom_indicators` |
| **news** | `apps/news/` | `news.js`, `.css`. Tab "Berita" + satu tab per artikel, panel kategori/sentimen/rentang/tersimpan, ticker | `news` | `/api/news`, `/api/news/:id`, `/api/news/saved*` | `routes/content.js` → `news.js`, `rss.js` | `news`, `news_saved` |
| **kalender** | `apps/kalender/` | `kalender.js` (data dummy, normalisasi API, state `S.cal`/`S.day`, filter; kelas CSS `kl-`), `kalender.css` (2 kolom, container query 900/720px). Kelompok & jenis: `CATS` di atas `kalender.js` (tambah entri; kelompok baru perlu `.m-<id>` di css) | – | `/api/calendar?month=YYYY-MM` → `{events:[{id,date,time,cat,type,title,sym,imp,detail,prev,fc,act,aff}], news:[{id,date,time,cat,type,imp,h,src,sum}]}` (`date` YYYY-MM-DD, `time` HH:mm WIB/kosong, `imp` 1–3) | `routes/content.js` → `calendar.js` | `calendar_events`, `news` |
| **note** | `apps/note/` | `note.js` kerangka + rail folder + Ekspor/Impor (kontrak tampilan `Note.view({id,html(),mount(ctx),show(ctx),canLeave?()})`) · `store.js` data bersama (catatan, jurnal, gambar bukti di IndexedDB `tc-journal`, format Rupiah/tanggal, penyaring HTML, migrasi, ekspor/impor) · `views/notes.js`+`.css` Semua/Ilmu/Umum/Disematkan · `views/journal.js`+`.css` Jurnal (kalender P/L harian, form, kolom bebas, gambar bukti) · `note.css`. Kolom/metode bawaan jurnal: `DEF_FIELDS` / `DEF_METHODS` di atas `journal.js` | `notes` `{v:2,notes:[]}`, `journal`, `note.f`, `img.pending` | `/api/notes*`, `/api/journal/trades*`, `/api/journal/summary`, `/api/journal/images*`, `/api/import` | `routes/notes.js` → `sanitize.js`, `image.js`, `activity.js` | `notes`, `journal_trades`, `journal_images` (+ Storage) |
| **setting** | `apps/setting/` | `setting.js` kerangka + API `Setting.page()` · `setting.css` · `cropper.js/.css` crop gambar (Akun & Background) · `pages/umum.js` tema/simbol awal/tf awal · `pages/background.js`+`.css` · `pages/api.js` mode Dummy/Live + tes koneksi · `pages/tentang.js` (atribusi CoinGecko, Reset) · `pages/akun.js`+`.css` foto profil/ganti password | `cfg` (blok `api` **tidak dikirim** ke server), `bg`, `bg.img`, `av.*` | `/api/settings/preferences`, `/api/settings/background-image`, `/api/auth/me`, `/api/auth/avatar`, `/api/auth/change-password`, `/api/auth/logout-all`, `/api/health` | `routes/user.js`, `routes/auth.js` → `image.js` | `user_settings`, `users` (+ bucket `backgrounds`) |
| **auth** (bukan dock) | `auth/` | `login.html` → `register.html` → `otp.html` → login · `forgot.html` → `otp.html` → `reset.html` → login · `auth.js` (akun/sesi/OTP/foto, Dummy PBKDF2 atau Live) · `auth.css`. Berdiri sendiri; sukses → `../index.html` | `session`, `users`, `otp`, `reset`, `rtk`, `fail`, `av.*` | `/api/auth/*` | `routes/auth.js` → `auth.js`, `mail.js`, `smtp.js`, `ratelimit.js` | `users`, `otps`, `auth_tickets`, `user_settings`, `rate_limits` |
| **notifikasi** (menubar) | `shared/notif.js`, `notif.css` | Lonceng + panel + toast, hanya mode Live. Polling `/api/notifications` 30 dtk saat tab terlihat. Klik notifikasi alert → buka Chart simbolnya | – | `/api/notifications*` (`/api/stream` SSE tidak dipakai) | `routes/user.js` (+ `routes/market.js` stream) | `notifications` |

Aset lintas-app:

| Lokasi | Isi |
|---|---|
| `public/index.html` | Daftar `<script>`: tambah/hapus baris = tambah/hapus app dari dock; urutan = urutan dock/sidebar Setting |
| `public/core/` | `core.js` state `S`, `APPS`/`registerApp`, window manager, snap, `loadCss` · `background.js` animasi canvas (Angin, Hutan, Laut, gambar sendiri; `Bg.load()`) · `boot.js` dock, jam, buka Home · `base.css` |
| `public/shared/` | `config.js` `CFG` (`tc.cfg`), tema, `apiFetch`/`apiPing` · `rt.js` mesin realtime (WebSocket paralel + pemimpin/failover + logika candle `RT.bars`, lihat §Realtime) · `data.js` dummy `WATCH` + format angka `f`,`pc`,`cls` · `ui.css` · `dialog.js` · `live.js` (mode Live, sinkron state/catatan/jurnal/alert, antrean gambar `Live.img`, `Live.applySettings()`) · `notif.js/.css` |

**Cara menambah:** *app* → salin folder app mirip, ganti isi, tambah 1 baris `<script>` di `index.html`. *Tab Setting* → `apps/setting/pages/<tab>.js` memanggil `Setting.page({...})` + 1 baris `<script>`. *Endpoint* → tambah di `lib/routes/<grup>.js` (daftar: `lib/router.js`, `add/get/post/put/patch/del`), lalu catat di §3.

## 3. Backend

```
api/index.js        pintu masuk semua /api/* (rewrite di vercel.json)
lib/app.js          impor semua rute + handle(); urutan impor penting (market.js sebelum chart.js)
lib/router.js       router kecil (add/get/post/put/patch/del, opsi public|admin|cron)
lib/http.js         HttpError, json, CORS, readJson, validator, clientIp
lib/db.js           klien PostgREST + Storage tanpa dependensi (service role)
lib/auth.js         JWT HS256 + scrypt        lib/mail.js + smtp.js  pengiriman OTP
lib/ratelimit.js    pembatas laju (tabel rate_limits, fungsi SQL rate_hit)
lib/cache.js        cache L1 memori + L2 kv_cache, stale-if-error
lib/market.js       candle/quote/heatmap/screener/summary   lib/catalog.js  katalog simbol → provider
lib/providers/      goapi.js + ohlcdev.js (harga IDX realtime, REST) · quote-parse.js · binance.js (kripto) · yahoo.js (IDX/AS/forex/indeks/komoditas) · coingecko.js (kap. kripto)
lib/indicators.js   indikator sisi server   lib/heat-data.js  bobot peta pasar
lib/news.js + rss.js  ingest RSS            lib/calendar.js  kalender (Forex Factory + ex-dividen Yahoo + manual)
lib/sanitize.js     penyaring HTML catatan  lib/image.js     cek magic byte gambar   lib/activity.js  riwayat aksi
lib/routes/         auth · user · market · content · notes · chart · system   (peta ke app: §2)
supabase/migrations/001_init.sql             skema + RLS + fungsi (jalankan sekali)
                    002_schedule_optional.sql  pg_cron (alert/menit, berita) — TIDAK otomatis, edit YOUR-APP & CRON_SECRET dulu
                    003_user_state · 004_journal_image_ids · 005_background_image · 006_service_role_grants
                    (003–006 hanya perlu bila 001 Anda versi lama; semua idempoten; 006 wajib di project Supabase baru)
supabase/setup-all.sql   hasil `npm run migrate:sql` (tempel di SQL Editor)
scripts/            dev.js · migrate.js · setup-sql.js · mail-test.js · db-help.js · load-env.js
tests/              91 tes (DB & sumber pasar ditiru di memori): api · unit · live · chart-client · pine · config · smtp (+ fakes.js, fixtures/)
vercel.json         region sin1, 1 function (60 dtk/1 GB), cron harian, header keamanan, CSP
.env.example        daftar lengkap variabel lingkungan
```

**Tabel (001_init.sql):** `users, otps, auth_tickets, rate_limits, kv_cache, user_settings, watchlists, alerts, notifications, activity_log, notes, journal_trades, journal_images, news, news_saved, calendar_events, chart_layouts, chart_drawings, chart_templates, custom_indicators, user_state` + fungsi `touch_updated_at`, `rate_hit`. Bucket Storage privat: gambar jurnal, `backgrounds`. `user_state` = penyimpanan generik per key (`/api/state/:key`) untuk watchlist, berita tersimpan, peta, tab chart.

**Kontrak umum:** JSON; error `{ "message": "..." }` (Indonesia, ditampilkan langsung klien); status 400/401/403/404/409/413/429(+`Retry-After`)/502. Auth `Authorization: Bearer <token>` dari `/api/auth/login` (14 hari, dicabut saat ganti/reset password). Data pasar **butuh login** kecuali `PUBLIC_MARKET=1`. Waktu data pengguna = ms epoch (`cre`,`upd`,`ts`); candle `t` = detik epoch.

### Daftar endpoint (per file rute)
```
auth.js    POST register, otp/send, otp/verify, reset, login, avatar, change-password, logout-all · GET/PATCH me          (/api/auth/*)
market.js  GET candles timeframes quotes symbols symbols/:sym heatmap screener summary market/status indicators/builtin
           POST indicators/compute · GET udf/{config,time,symbols,search,history} · GET stream
user.js    GET/PUT/DELETE settings/preferences · GET/PUT/DELETE settings/background-image · GET/PUT settings/layout
           watchlists (GET, POST, PATCH/:id, DELETE/:id, PUT/:id/symbols) · alerts (GET, POST, DELETE/:key)
           notifications (GET, POST read, DELETE/:id) · GET activity · state (GET, GET/PUT/DELETE /:key)
content.js GET news, news/saved, news/:id · POST news/saved · DELETE news/saved/:id · GET calendar
notes.js   notes (GET POST PUT/:id DELETE/:id) · journal/trades (idem) · GET journal/summary
           journal/images (GET POST, GET/DELETE /:id) · POST import
chart.js   chart/layout (GET PUT) · chart/layouts (GET POST, GET/PUT/DELETE /:id) · chart/drawings (GET, GET/PUT/DELETE /:symbol)
           chart/templates (GET POST, GET/DELETE /:id) · indicators (GET POST, GET/PUT/DELETE /:id, POST /:id/fork)
system.js  GET health(?deep=1) · cron/{alerts,news,calendar,warm,cleanup,daily} · POST admin/{refresh,calendar,mail-test}
```
Urutan rute: `indicators/builtin|compute` sebelum `indicators/:id`; `news/saved` sebelum `news/:id`.

### Sumber data pasar
| Pasar | Sumber | Catatan |
|---|---|---|
| Kripto | Binance publik (`data-api.binance.vision`) | tanpa key, real-time, 1m–1M |
| IDX `.JK`, saham AS, indeks, forex, komoditas | Yahoo Finance (tidak resmi) | tunda ±15 mnt; 1m 7 hari, 5m–30m 60 hari, 1h/4h 730 hari; 4h dari 1h; komoditas = futures (`GC=F`…), bukan spot |
| Kap. kripto (peta) | CoinGecko `/coins/markets` | cache 10 mnt; gagal → bobot statis; atribusi wajib (ada di Setting > Tentang) |
| Berita | RSS (`lib/news.js` → `SOURCES`) + opsional Finnhub/Alpha Vantage | ringkasan, bukan teks penuh; sentimen berbasis kamus |
| Kalender | Forex Factory mingguan + ex-dividen Yahoo + manual `POST /api/admin/calendar` | RUPS/laporan/aksi korporasi tak punya sumber gratis resmi |

Ganti/tambah penyedia = 1 modul di `lib/providers/` + ubah `provider` di `lib/catalog.js`. **Sengaja tidak dipakai:** endpoint internal `idx.co.id`, pustaka Lightweight Charts (engine chart sendiri).

### Variabel lingkungan (detail & contoh: `.env.example`)
Wajib: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret/service_role, bukan anon), `JWT_SECRET` (≥32 char), SMTP (`SMTP_HOST/PORT/USER/PASS` atau `SMTP_URL`; Gmail = App Password). Opsional: `CRON_SECRET`, `ADMIN_TOKEN`, `ALLOWED_ORIGINS`, `PUBLIC_MARKET`, `IDX_HOLIDAYS`, `NEWS_FEEDS_EXTRA`, `FINNHUB_API_KEY`, `ALPHAVANTAGE_API_KEY`, `COINGECKO_API_KEY`, `TOKEN_DAYS`, `PORT`. Hanya lokal: `DATABASE_URL`+`DB_SSL` (migrate), `MAIL_PROVIDER=log` (OTP dicetak di terminal), `RATE_LIMIT=off`.

## 4. Menjalankan & deploy
- **Lokal:** `npm run dev` (butuh `.env`; halaman + `/api` satu port, `http://localhost:3000`; otomatis Live). Tanpa Supabase: `npm run dev:fake` (kode OTP dicetak). `npm test` (76 tes). `npm run mail:test [-- email]` cek SMTP. `npm run migrate [-- --status | -- 006]` buat tabel (butuh `DATABASE_URL`, Session pooler port 5432); tanpa itu `npm run migrate:sql` lalu tempel `supabase/setup-all.sql` di SQL Editor.
- **Deploy Vercel (±15 mnt):** (1) Supabase project region Singapore + migrate. (2) Isi SMTP. (3) Import repo ke Vercel, Framework *Other*, tanpa build, **Root Directory = folder yang berisi `api/`, `lib/`, `public/`**, isi Environment Variables, deploy; setiap ubah env → **Redeploy**. (4) Cek `/api/health?deep=1` → `{"ok":true,"db":"ok"}` (jika `db:error`, baca `db_hint`; `config` menunjukkan variabel terisi). (5) Daftar → OTP → login. (6) Isi data awal: `POST /api/admin/refresh` body `{"what":"all"}` dengan header `x-admin-token`. (7) Disarankan: aktifkan `pg_cron`+`pg_net` lalu jalankan `002_schedule_optional.sql` (Vercel Hobby cron hanya 1×/hari; alert tiap menit & berita tiap 15 mnt lewat Supabase).
- **404 di `/api/*` tanpa JSON `{message}`** = alamat dibuka bukan backend (server statis atau Root Directory salah). Cek `/api/health`.

## 5. Keputusan teknis & batasan (jangan dilanggar)
- **Vercel tanpa WebSocket:** notifikasi pakai polling 30 dtk (SSE `/api/stream` ada tapi tidak dipakai karena menghabiskan jatah GB-jam). Kripto di chart boleh langsung WebSocket Binance; candle terakhir kini polling 15 dtk.
- **Indikator custom hanya disimpan di server**, tidak pernah dieksekusi di server. Eksekusi hanya di `worker.js` (CSP sendiri di `vercel.json`: `connect-src 'none'`, `'unsafe-eval'` hanya untuk berkas itu; fetch/XHR/WebSocket dimatikan; tidak jalan dari `file://`). Pine dijalankan penuh oleh interpreter `pine/` (var/varip, if/for/while/switch, fungsi buatan, tuple, type/method/enum, array/map/matrix, 60+ `ta.*`, input bertipe, plot/fill/bgcolor/label/line/box, `request.security` lewat data yang diambil halaman, `strategy.*` + laporan); batas loop 2 juta iterasi/30 juta operasi selain 5 dtk. Belum: `library`/`import`, `table`/`polyline`/`linefill`, data fundamental, `request.security_lower_tf`, trailing stop/OCA; satu alert per simbol; alert dipicu cron server.
- **Gambar:** PNG/JPEG/WebP dicek magic byte, maks 3 MB, bucket privat. Gambar jurnal: id dari klien, tidak berubah (unggah id yang ada → `200 {existed:true}`), maks 2000/akun; menghapus jurnal tidak menghapus gambarnya, gambar dihapus saat dibuang dari form. Background sendiri: satu per akun.
- **Preferensi** (`/api/settings/preferences`): `{theme, defaultSymbol, defaultTf, background(angin|hutan|laut|custom), reduceMotion(true|false|null)}`; body ≤4 KB. Reset di Tentang tidak menghapus gambar sendiri.
- **Riwayat aksi** yang dicatat: login/verifikasi/ganti password, catatan & jurnal disimpan, watchlist baru, alert dibuat/terpicu.
- Heatmap: bobot kapitalisasi IHSG/saham luar/komoditas/forex statis di `lib/heat-data.js` (+ `maps.js`); kripto live; perubahan harga live.

## 6. Keamanan (ringkas; audit 2026-10-20)
- Tabel Supabase tertutup untuk `anon/authenticated` (RLS aktif, hak dicabut); hanya service role dari server. **Jangan taruh service role key di frontend.** Setiap query rute pengguna menyertakan `user_id`.
- Password scrypt; OTP 6 digit HMAC 10 mnt, maks 5 salah (jatah diambil atomik), cooldown kirim ulang 30 dtk; login 8 percobaan/menit per IP+akun; rahasia cron hanya via header `Authorization`; JWT diperiksa algoritma + `timingSafeEqual`, `token_version` mencabut sesi.
- HTML catatan disaring ulang di server (whitelist tag, hanya `class` `cl`/`done`); frontend memakai `esc()` sebelum `innerHTML`; tautan berita hanya `http(s)`.
- `Content-Security-Policy-Report-Only` aktif di `vercel.json` (belum memblokir). Buka semua app sekali, pastikan Console bersih, lalu ganti nama header menjadi `Content-Security-Policy`.
- Skema ↔ kode sudah dicocokkan (131 query) dan migrasi diuji di Postgres 16 sungguhan. `tests/fakes.js` tidak menegakkan constraint DB → disarankan 1 tes integrasi Postgres asli di CI.

**Belum dikerjakan (keputusan Anda):**
1. Aktifkan CSP enforce (lihat atas).
2. Isi `ALLOWED_ORIGINS` di produksi (default CORS `*`).
3. `GET /api/stream?token=` menaruh JWT di URL → hapus `allowQueryToken` (frontend tidak memakainya).
4. Brute force lintas IP: batas per akun (trade-off: akun korban bisa dikunci).
5. Pembatas laju gagal-buka ke memori saat DB error → pertimbangkan gagal-tutup untuk login/OTP.
6. Cache pengguna 20 dtk per instance: token yang dicabut bisa diterima instance lain ≤20 dtk.
7. `/api/auth/register` membocorkan email/username terdaftar (`409`).
8. `evaluateAlerts` maks 2000 alert aktif tanpa urutan → halaman/urutkan bila banyak.
9. `x-forwarded-for` dipercaya (aman di Vercel, tidak di proxy lain). `/api/admin/*` tanpa pembatas: pakai `ADMIN_TOKEN` ≥32 char. `tests/fixtures/test-key.pem` hanya kunci uji (bisa ditandai pemindai rahasia). Password min 8 tanpa cek kebocoran.

## Realtime (chart)
`public/shared/rt.js` menggerakkan candle terakhir dari tick, bukan dari polling `/api/candles`. Semua sumber untuk satu simbol berjalan **paralel**; satu **pemimpin** (prioritas tertinggi yang masih segar, batas `STALE` per pasar) yang dipakai, sisanya cadangan. Pemimpin macet → sumber berikutnya mengambil alih otomatis, pulih → kembali ke yang utama. Lencana di legenda chart menampilkan sumber aktif.

| Pasar | Urutan sumber | Jenis | Kunci |
|---|---|---|---|
| Kripto | Binance | WebSocket langsung dari browser (`aggTrade` + `kline`) | tanpa kunci |
| Forex, emas/komoditas | Tiingo (fx) → Finnhub (OANDA) → Yahoo | WebSocket langsung dari browser | token di Setting > API (disimpan di browser, tidak dikirim ke server) |
| Saham AS, indeks | Finnhub → Tiingo (iex) → Yahoo | WebSocket | idem |
| Saham IDX | GoAPI + OHLC.dev | REST dipoll ±1 dtk lewat `GET /api/rt/quote` | `GOAPI_API_KEY`, `OHLCDEV_API_KEY`+`OHLCDEV_URL` di env server |

- Urutan bisa diganti per pasar: `CFG.api.rt.order = {fx:['finnhub','tiingo']}`. Yahoo WS tidak resmi (protobuf) dan sengaja tidak dipakai untuk IDX (data tertunda).
- `/api/candles` tetap dipakai untuk isi bar yang terlewat, koreksi OHLC bar yang baru tutup, dan cadangan tiap 4 dtk bila tak ada sumber realtime hidup. Bar berjalan tidak ditimpa harga basi saat realtime hidup (`RT.bars.merge`).
- Cek GoAPI/OHLC.dev: `npm run rt:test -- BBCA` (respons mentah + hasil urai). Bila nama field berbeda, tambahkan di `lib/providers/quote-parse.js`. Cek semua sumber dari browser: Setting > API > "Tes realtime".
- Tes: `tests/rt-client.test.js` (WebSocket palsu, jam terkendali), `tests/rt-server.test.js`.

## Alat gambar: cara menggambar dan mengedit (chart)
- **Pilih alat:** klik tombol grup di rail = langsung pakai alat terakhir grup itu. Alat lain: klik **panah kecil** di pojok tombol atau **klik kanan** tombol. Pintasan huruf (tanpa Ctrl/Alt): `T` tren, `H` horizontal, `V` vertikal, `R` kotak, `F` fib, `A` panah, `X` teks, `C` kanal, `M` ukur, `L` long, `S` short, `B` kuas, `E` elips; huruf yang sama lagi = kembali ke kursor.
- **Tetap menggambar** (tombol pin di rail, bawaan nyala, tersimpan di `tc.chart.stay`): setelah satu gambar selesai alat tetap aktif untuk gambar berikutnya. `Esc` atau klik kanan = selesai. Selama alat aktif, titik gambar yang baru dibuat tetap bisa ditarik untuk merapikan.
- **Mengedit:** gambar terpilih menampilkan **titik putih** (handle) dan menyala. Seret titik = ubah bentuk, seret garis = pindah (ambang 3 px, klik biasa tidak menggeser), **panah** = geser halus (Shift = 10x), `Del` hapus, `Ctrl+D` duplikat, `Ctrl+Z` urungkan. Kursor berubah saat melintas di atas gambar (move / pointer / ns-resize), dan gambar di bawah kursor ikut menyala. Klik dua kali garis horizontal = ketik harga tepat; klik dua kali teks = ubah teks.
- **Klik kanan pada gambar:** ubah harga/teks, duplikat, kunci, sembunyikan, bawa ke depan/belakang, hapus. Bilah gaya di atas kanvas menampilkan nama alat, 8 warna + pemilih warna bebas, tebal, gaya garis.
- **Magnet:** tahan `Alt` untuk menonaktifkan sementara saat menggambar maupun menarik titik. Layar sentuh memakai area tekan lebih besar (`tol()` di `chart.js`).
- Teks petunjuk di kiri bawah kanvas menjelaskan langkah berikutnya. Logika murni (hit-test, `drawHandles`, `cursorOf`) ada di `draw.js`, diuji di `tests/draw-edit.test.js`.

