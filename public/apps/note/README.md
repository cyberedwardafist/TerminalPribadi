# apps/note/
Catatan trading. Tiap folder di rail punya tampilan sendiri.
- `note.js`: kerangka + rail folder, pindah tampilan, Ekspor/Impor. Kontrak tampilan: `Note.view({id, html(), mount(ctx), show(ctx), canLeave?()})`
- `store.js`: data bersama: catatan (`tc.notes`), jurnal (`tc.journal`), gambar bukti (IndexedDB `tc-journal`), format Rupiah/tanggal, penyaring HTML, migrasi data lama, ekspor/impor
- `views/journal.js` + `.css`: **Jurnal trading**. Kalender bulanan (net profit/loss per hari), panel samping per tanggal (banyak trade per hari), form isi/edit, kolom bebas, bukti gambar
- `views/notes.js` + `.css`: **Semua / Ilmu / Umum / Disematkan**. Daftar + editor teks (judul, tebal, miring, poin, centang), tag, cari
- `note.css`: kerangka, rail, komponen bersama

Bentuk data trade: `{id, date, time, timeEnd, sym, side, res: profit|loss|impas, amount (Rp, positif), method, fields:[{k,v}], note, eval, imgs[], cre, upd}`
Menambah kolom bawaan/metode bawaan: ubah `DEF_FIELDS` / `DEF_METHODS` di atas `views/journal.js`.
