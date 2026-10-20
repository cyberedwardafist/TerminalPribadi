# apps/
Satu folder per item dock. Isi minimal: `<nama>/<nama>.js` (+ `<nama>.css` bila perlu).
Kontrak: `registerApp('id',{css?, icon, t, w, h, flush?, html(), init(win)?, show(win)?, notes[]})`. Lihat `core/core.js`.
Jangan saling memanggil fungsi antar app; bagikan lewat state `S` dan `open('id')`.
