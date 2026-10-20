# apps/kalender/
Kalender pasar. Kiri: kalender bulanan + daftar agenda berdampak tinggi. Kanan: agenda dan berita untuk tanggal terpilih, dipisah per kelompok.
- `kalender.js`: data dummy, normalisasi respons API, state (`S.cal`, `S.day`), kalender, filter, panel. Kelas CSS berawalan `kl-`
- `kalender.css`: tata letak dua kolom. Memakai container query: di bawah 900px nilai Aktual/Perkiraan/Sebelumnya turun ke bawah judul, di bawah 720px kalender di atas dan panel di bawah

Kelompok (`cat`) dan jenis (`type`), didefinisikan di `CATS` paling atas `kalender.js`:
- `idx` IHSG: `rups`, `div`, `lap`, `aksi`
- `kom` Komoditas: `emas`, `perak`, `minyak`
- `fx` Forex dan makro: kode mata uang (`USD`, `EUR`, `GBP`, `JPY`, `IDR`)

Menambah kelompok atau jenis: tambah satu entri di `CATS`. Penanda kalender memakai bentuk (bulat, kotak, segitiga) di CSS `.m-<id>`; kelompok baru perlu satu baris `.m-<id>` di `kalender.css`.

Filter: kelompok, jenis (boleh lebih dari satu), dampak (semua, sedang ke atas, tinggi), kata kunci (judul, kode, keterangan). Penanda di kalender dan hitungan per kelompok ikut filter.

Bentuk data (`GET /api/calendar?month=YYYY-MM`):
`{events:[{id,date,time,cat,type,title,sym,imp,detail,prev,fc,act,aff}], news:[{id,date,time,cat,type,imp,h,src,sum}]}`
`date` YYYY-MM-DD, `time` HH:mm WIB atau kosong (seharian), `imp` 1 sampai 3, `aff` kode aset yang terpengaruh (mis. XAU).
Mode Live memakai `apiFetch`; gagal memunculkan state error dengan tombol Coba lagi.
