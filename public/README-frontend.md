# Terminal Chart (tahap tampilan)

Desktop ala Mac untuk terminal chart trading. Semua data masih dummy.
Buka `auth/login.html` (atau `index.html`, otomatis diarahkan ke login bila belum ada sesi). Tanpa build dan tanpa dependensi.
Karena halaman memuat banyak file, jalankan lewat server lokal bila browser memblokir `file://` (mis. `python3 -m http.server`).

## Peta folder (satu folder = satu sistem)

```
index.html              Desktop. Daftar <script> di sini = daftar sistem yang aktif
core/                   Inti desktop: window manager, dock, background animasi, boot
shared/                 Dipakai banyak sistem: config + helper API, data dummy, komponen UI
auth/                   Login, daftar, OTP, lupa/reset password (halaman sendiri)
apps/
  home/  watchlist/  maps/  chart/  news/  kalender/  note/    satu folder per item dock
  setting/                                               kerangka + pages/ (satu file per tab)
```

Aturan main:
- Satu app = satu folder `apps/<nama>/` berisi `<nama>.js` dan (bila perlu) `<nama>.css`. CSS dimuat otomatis lewat properti `css` pada `registerApp`.
- Memperbaiki satu app cukup menyentuh folder app itu. Kalau perlu gaya/fungsi yang dipakai banyak app, taruh di `shared/`.
- Antar app jangan saling memanggil fungsi. Bagikan lewat state `S` (mis. `S.sym`), lalu `open('id-app')`. Bila window sudah terbuka, `show(win)` milik app itu dipanggil.
- Watchlist: tab = kelompok daftar (klik dua kali ganti nama, + buat baru), panel samping = jelajah pasar dan pemindai (top naik/turun, volume ramai, dekat high 52M, RSI jenuh), pencarian di atas tabel, klik baris = detail + alert + salin ke daftar, klik dua kali = buka di Chart. Daftar simbol sumbernya `WATCH` di `shared/data.js` (kolom ke-5 = pasar).
- Home: dashboard (sapaan dari nama sesi, status pasar WIB, indeks utama, watchlist aktif, pergerakan terbesar, pintasan, tab chart terakhir, catatan dan ringkasan jurnal). Membaca localStorage app lain secara hanya-baca dan toleran.
- News: berita pasar dummy (IHSG, saham luar, kripto, komoditas, forex). Panel samping = kategori, sentimen, rentang waktu, tersimpan, ticker bergerak. Pencarian ticker atau kata kunci menampilkan semua berita terkait, urut terbaru ke terlama (bisa dibalik). Tab ala Chart: tab "Berita" (daftar) + satu tab per artikel yang dibuka (halaman baca lengkap, poin penting, berita terkait), tersimpan di localStorage.
- Menambah app: salin folder app yang mirip, ganti isinya, tambah satu baris `<script>` di `index.html`. Urutan baris = urutan dock. Menghapus baris = menyembunyikan app dari dock.
- Menambah tab Setting: buat `apps/setting/pages/<tab>.js` yang memanggil `Setting.page({...})`, lalu tambah satu baris `<script>`. Urutan baris = urutan sidebar.
- Catatan backend tiap app ada di properti `notes` pada file app/tab itu, dan tampil lewat tombol "Catatan backend" di window.
- Mode API Live memakai `apiFetch(path)` di `shared/config.js`; tombol "Tes koneksi" memanggil `GET /api/health`.

## Auth
- `auth/login.html` -> `register.html` -> `otp.html` (verifikasi) -> login. Lupa password: `forgot.html` -> `otp.html` -> `reset.html` -> login
- OTP 6 digit, berlaku 10 menit, maks 5 salah, kirim ulang tiap 30 detik
- `auth/auth.js`: mode Dummy (akun di localStorage, hash PBKDF2) atau Live (backend; endpoint tertulis di komentar file). Mode dipilih di Setting > API atau "Koneksi server" di halaman login
- Foto profil: Setting > Akun (ikon pensil, crop bulat, `apps/setting/cropper.js`)
