# shared/
Dipakai desktop DAN halaman auth (kecuali data.js dan ui.css yang khusus desktop).
- `config.js`: config tersimpan (`CFG`, localStorage `tc.cfg`), tema, `apiFetch`/`apiPing`
- `data.js`: data dummy bersama (`WATCH`) dan format angka (`f`, `pc`, `cls`)
- `ui.css`: komponen UI bersama (tombol, segmented, empty state, tipografi dasar)
- `dialog.js`: dialog buatan sendiri `dlg.prompt/confirm/alert` (Promise). Jangan pakai `prompt/confirm/alert` bawaan browser di project ini
- `live.js`: mode Live (harga, sinkron state/catatan/jurnal/alert, antrean unggah gambar jurnal `Live.img`)
- `notif.js` + `notif.css`: lonceng notifikasi di menubar, panel, dan toast (hanya mode Live)
