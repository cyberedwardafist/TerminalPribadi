// App Aset (public/apps/aset): hitungan buku transaksi (beli menambah aset, jual mengurangi sebesar modal, untung/rugi terealisasi) dan pembacaan angka format Indonesia.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const win = {};
vm.runInNewContext(fs.readFileSync(new URL('../public/apps/aset/aset.js', import.meta.url), 'utf8'), { window: win, registerApp() {}, Intl, Date, Math, JSON, Number, String, Array, Map, Object, localStorage: {} });
const { ledger, series, num, norm, qt, eqTxt, priceLbl } = win.AsetCalc;

let n = 0;
// q = jumlah dalam satuan tampil (saham = lot); disimpan sebagai satuan dasar (lembar), seperti norm() di app
const tx = (k, ty, sym, q, p, d = '2026-10-01') => ({ id: 't' + ++n, k, ty, sym, q: ty === 'saham' ? q * 100 : q, u: ty === 'saham' ? 'lot' : 'koin', p, cu: 'IDR', pu: 0, fx: 0, d, n: '', cre: n, upd: n });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('contoh: BBCA 1 lot @6.000 = Rp 600.000; aset lain ditambahkan ke total', () => {
  const L = ledger([tx('b', 'saham', 'BBCA', 1, 6000)]);
  near(L.total, 600000); assert.equal(L.hold.length, 1); assert.equal(L.hold[0].u, 100);
  const L2 = ledger([tx('b', 'saham', 'BBCA', 1, 6000), tx('b', 'saham', 'TLKM', 2, 3500), tx('b', 'kripto', 'BTC', 0.01, 1_000_000_000)]);
  near(L2.total, 600000 + 700000 + 10_000_000); assert.equal(L2.hold.length, 3);
});

test('beli lagi aset yang sama: harga rata-rata tertimbang', () => {
  const L = ledger([tx('b', 'saham', 'BBCA', 1, 6000), tx('b', 'saham', 'bbca', 1, 7000)]);
  assert.equal(L.hold.length, 1); near(L.hold[0].avg, 6500); near(L.total, 1_300_000);
});

test('jual untung: aset berkurang sebesar modal, selisih jadi untung terealisasi', () => {
  const t = [tx('b', 'saham', 'BBCA', 2, 6000, '2026-10-01'), tx('s', 'saham', 'BBCA', 1, 6500, '2026-10-05')];
  const L = ledger(t);
  near(L.total, 600000); near(L.real, 50000); near(L.per[t[1].id].cost, 600000); near(L.per[t[1].id].pl, 50000);
});

test('jual rugi: total aset tetap turun sebesar modal, rugi tercatat negatif', () => {
  const t = [tx('b', 'saham', 'BBCA', 2, 6000), tx('s', 'saham', 'BBCA', 1, 5500, '2026-10-05')];
  const L = ledger(t);
  near(L.total, 600000); near(L.real, -50000);
});

test('jual habis: posisi hilang, untung/rugi dari beberapa penjualan dijumlah', () => {
  const t = [tx('b', 'saham', 'BBCA', 2, 6000), tx('s', 'saham', 'BBCA', 1, 7000, '2026-10-03'), tx('s', 'saham', 'BBCA', 1, 5000, '2026-10-04')];
  const L = ledger(t);
  assert.equal(L.hold.length, 0); near(L.total, 0); near(L.real, 0); assert.equal(L.ns, 2);
});

test('jual sebagian dari harga rata-rata, pecahan koin tidak menyisakan sisa', () => {
  const t = [tx('b', 'kripto', 'BTC', 0.3, 1000), tx('b', 'kripto', 'BTC', 0.1, 2000), tx('s', 'kripto', 'BTC', 0.1, 1500, '2026-10-02'), tx('s', 'kripto', 'BTC', 0.3, 1500, '2026-10-03')];
  const L = ledger(t);
  assert.equal(L.hold.length, 0); assert.equal(L.bad.length, 0);
});

test('jual melebihi kepemilikan atau sebelum tanggal beli ditandai bad dan tidak dihitung', () => {
  const over = [tx('b', 'saham', 'BBCA', 1, 6000), tx('s', 'saham', 'BBCA', 2, 6500, '2026-10-05')];
  const L = ledger(over);
  assert.equal(L.bad.length, 1); assert.equal(L.bad[0], over[1].id); near(L.total, 600000); near(L.real, 0);
  const early = [tx('b', 'saham', 'BBCA', 1, 6000, '2026-10-10'), tx('s', 'saham', 'BBCA', 1, 6500, '2026-10-05')];
  assert.equal(ledger(early).bad.length, 1);
  assert.equal(ledger([tx('s', 'saham', 'GOTO', 1, 80)]).bad.length, 1);
});

test('jenis berbeda dengan nama sama dihitung terpisah', () => {
  const L = ledger([tx('b', 'kripto', 'BTC', 1, 100), tx('b', 'lain', 'BTC', 1, 100)]);
  assert.equal(L.hold.length, 2);
});

test('angka format Indonesia', () => {
  assert.equal(num('6.000'), 6000); assert.equal(num('1.250.000'), 1250000); assert.equal(num('6000'), 6000);
  assert.equal(num('0,5'), 0.5); assert.equal(num('0.005'), 0.005); assert.equal(num('1.234,56'), 1234.56); assert.equal(num('1,5'), 1.5);
  assert.ok(Number.isNaN(num(''))); assert.ok(Number.isNaN(num('abc')));
});

test('beli lagi: 1 lot @5.000 lalu 1 lot @6.000 -> rata-rata 5.500', () => {
  const L = ledger([tx('b', 'saham', 'BBCA', 1, 5000, '2026-10-01'), tx('b', 'saham', 'BBCA', 1, 6000, '2026-10-05')]);
  near(L.hold[0].avg, 5500); near(L.total, 1_100_000);
  const L2 = ledger([tx('b', 'saham', 'BBCA', 1, 5000, '2026-10-01'), tx('b', 'saham', 'BBCA', 3, 6000, '2026-10-05')]);
  near(L2.hold[0].avg, 5750);
});

const last = a => a[a.length - 1];

test('grafik: BBCA beli 6.000 lalu harga 3.000 -> nilai turun 50%, modal tetap', () => {
  const t = [tx('b', 'saham', 'BBCA', 1, 6000, '2026-10-01')];
  const S = series(t, {}, {}, { 'saham|bbca': 3000 }, '2026-10-05');
  assert.equal(S.length, 5);
  near(S[0].val, 600000); near(last(S).val, 300000); near(last(S).cost, 600000);
  near(last(S).val / S[0].val, 0.5);
});

test('grafik: aset lain saling mengimbangi (BBCA -100.000, aset lain +50.000 -> total turun 50.000)', () => {
  const t = [tx('b', 'saham', 'BBCA', 2, 6000, '2026-10-01'), tx('b', 'emas', 'Emas Antam', 10, 1_000_000, '2026-10-01')];
  const before = series(t, {}, {}, {}, '2026-10-01')[0].val;
  const S = series(t, { 'emas|emas antam': [['2026-10-03', 1_005_000]] }, {}, { 'saham|bbca': 5000 }, '2026-10-03');
  near(before, 1_200_000 + 10_000_000);
  near(last(S).val - before, -200_000 + 50_000);
  const S2 = series([tx('b', 'saham', 'BBCA', 1, 6000, '2026-10-01'), tx('b', 'emas', 'Emas Antam', 1, 1_000_000, '2026-10-01')], { 'emas|emas antam': [['2026-10-03', 1_050_000]] }, {}, { 'saham|bbca': 5000 }, '2026-10-03');
  near(last(S2).val - S2[0].val, -100000 + 50000);
});

test('grafik: harga pasar harian mengisi hari-hari, penjualan menurunkan jumlah yang dihitung', () => {
  const t = [tx('b', 'saham', 'BBCA', 2, 6000, '2026-10-01'), tx('s', 'saham', 'BBCA', 1, 6500, '2026-10-03')];
  const S = series(t, {}, { 'saham|bbca': [['2026-10-01', 6000], ['2026-10-02', 5000], ['2026-10-03', 6500]] }, {}, '2026-10-04');
  assert.deepEqual(Array.from(S.map(p => Math.round(p.val))), [1_200_000, 1_000_000, 650_000, 650_000]);
  assert.deepEqual(Array.from(S.map(p => Math.round(p.cost))), [1_200_000, 1_200_000, 600_000, 600_000]);
});

test('grafik: harga manual dipakai sampai ada harga yang lebih baru, hari sebelum transaksi tidak ada', () => {
  const t = [tx('b', 'emas', 'Emas', 5, 1_000_000, '2026-10-02')];
  const S = series(t, { 'emas|emas': [['2026-10-04', 1_100_000]] }, {}, {}, '2026-10-06');
  assert.equal(S[0].d, '2026-10-02');
  assert.deepEqual(Array.from(S.map(p => Math.round(p.val))), [5e6, 5e6, 5.5e6, 5.5e6, 5.5e6]);
  assert.equal(series([], {}, {}, {}, '2026-10-06').length, 0);
});

test('grafik: rentang panjang disampling maksimal ~400 titik dan titik terakhir = hari ini', () => {
  const S = series([tx('b', 'saham', 'BBCA', 1, 6000, '2020-01-01')], {}, {}, {}, '2026-10-22');
  assert.ok(S.length <= 402); assert.equal(last(S).d, '2026-10-22');
});

test('saham luar: per lembar (bukan lot), boleh pecahan; kelompok jenis dihitung terpisah dari saham IHSG', () => {
  const L = ledger([tx('b', 'sahamx', 'AAPL', 2.5, 3_000_000), tx('b', 'saham', 'AAPL', 1, 1000)]);
  assert.equal(L.hold.length, 2);
  near(L.hold.find(h => h.ty === 'sahamx').cost, 7_500_000); near(L.hold.find(h => h.ty === 'saham').cost, 100_000);
  const S = series([tx('b', 'sahamx', 'AAPL', 2, 3_000_000, '2026-10-01')], {}, {}, { 'sahamx|aapl': 4_000_000 }, '2026-10-03');
  near(S[0].val, 6_000_000); near(last(S).val, 8_000_000);
});

test('grafik: untung terealisasi terakumulasi per hari, total hasil = nilai - modal + terealisasi', () => {
  const t = [tx('b', 'saham', 'BBCA', 2, 6000, '2026-10-01'), tx('s', 'saham', 'BBCA', 1, 6500, '2026-10-03'), tx('s', 'saham', 'BBCA', 1, 5000, '2026-10-05')];
  const S = series(t, {}, {}, {}, '2026-10-06');
  assert.deepEqual(Array.from(S.map(p => Math.round(p.real))), [0, 0, 50_000, 50_000, -50_000, -50_000]);
  const hasil = p => p.val - p.cost + p.real;
  near(hasil(S[0]), 0);            // baru beli: belum ada hasil
  near(hasil(last(S)), -50_000);   // semua terjual: hasil = total terealisasi (+50.000 - 100.000 + ... = -50.000)
  assert.equal(Math.round(last(S).val), 0);
});

test('grafik: total hasil = belum terealisasi + terealisasi (BBCA turun 100.000, aset lain naik 50.000, ada penjualan)', () => {
  const t = [tx('b', 'saham', 'BBCA', 2, 6000, '2026-10-01'), tx('b', 'emas', 'Emas', 10, 1_000_000, '2026-10-01'), tx('s', 'saham', 'BBCA', 1, 6500, '2026-10-02')];
  const S = series(t, { 'emas|emas': [['2026-10-03', 1_005_000]] }, {}, { 'saham|bbca': 5500 }, '2026-10-03');
  const p = last(S), hasil = p.val - p.cost + p.real;
  // sisa BBCA 1 lot: nilai 550.000 vs modal 600.000 = -50.000; emas +50.000; terealisasi +50.000
  near(p.real, 50_000); near(hasil, -50_000 + 50_000 + 50_000);
});

// ---------- satuan lot / lembar / koin, mata uang, migrasi ----------
test('migrasi v2: saham q dalam lot -> lembar; aset lain tetap; tanpa mata uang -> IDR', () => {
  const a = norm({ id: 'a', k: 'b', ty: 'saham', sym: 'BBCA', q: 2, p: 6000, d: '2026-10-01' });
  assert.equal(a.q, 200); assert.equal(a.u, 'lot'); assert.equal(a.cu, 'IDR');
  const b = norm({ id: 'b', k: 'b', ty: 'kripto', sym: 'BTC', q: 0.05, p: 1_000_000_000, d: '2026-10-01' });
  assert.equal(b.q, 0.05); assert.equal(b.u, 'koin');
  const c = norm({ id: 'c', k: 'b', ty: 'sahamx', sym: 'AAPL', q: 2.5, p: 3_000_000, d: '2026-10-01' });
  assert.equal(c.q, 2.5); assert.equal(c.u, 'lembar');
  // sudah v3 (ada u): tidak dikali dua kali
  assert.equal(norm(a).q, 200); assert.equal(norm(norm(a)).q, 200);
  assert.equal(norm({ ...a, u: 'lembar', q: 250 }).q, 250);
});

test('input dalam lembar atau lot menghasilkan modal yang sama; odd lot boleh', () => {
  const lot = ledger([tx('b', 'saham', 'BBCA', 2, 6000)]), lembar = ledger([{ ...tx('b', 'saham', 'BBCA', 1, 6000), q: 200, u: 'lembar' }]);
  near(lot.total, 1_200_000); near(lembar.total, 1_200_000);
  const odd = ledger([{ ...tx('b', 'saham', 'BBCA', 1, 6000), q: 150, u: 'lembar' }]);
  near(odd.total, 900_000); assert.equal(odd.hold[0].u, 150);
  // campur lot + lembar pada aset yang sama
  const mix = ledger([tx('b', 'saham', 'BBCA', 1, 6000), { ...tx('b', 'saham', 'BBCA', 1, 7000), q: 50, u: 'lembar' }]);
  assert.equal(mix.hold[0].u, 150); near(mix.total, 600_000 + 350_000);
});

test('USD: harga US$ x kurs disimpan sebagai Rupiah, nilai asli US$ ikut tersimpan', () => {
  const t = norm({ id: 'u', k: 'b', ty: 'kripto', sym: 'BTC', q: 0.05, u: 'koin', p: 65000 * 16000, cu: 'USD', pu: 65000, fx: 16000, d: '2026-10-01' });
  assert.equal(t.cu, 'USD'); assert.equal(t.pu, 65000); assert.equal(t.fx, 16000);
  const L = ledger([t]);
  near(L.total, 0.05 * 65000 * 16000); near(L.hold[0].uavg, 65000);
  // jenis yang tidak mendukung USD jatuh ke IDR
  assert.equal(norm({ id: 'x', k: 'b', ty: 'saham', sym: 'BBCA', q: 100, u: 'lembar', p: 6000, cu: 'USD', pu: 1, fx: 1, d: '2026-10-01' }).cu, 'IDR');
  // USD tanpa kurs tidak valid -> IDR
  assert.equal(norm({ ...t, fx: 0 }).cu, 'IDR');
});

test('rata-rata US$ tertimbang, hilang bila ada pembelian Rupiah; jual sebagian menjaga rata-rata', () => {
  const u = (q, pu, d) => norm({ id: 'u' + d + q, k: 'b', ty: 'kripto', sym: 'BTC', q, u: 'koin', p: pu * 16000, cu: 'USD', pu, fx: 16000, d });
  const L = ledger([u(1, 60000, '2026-10-01'), u(1, 70000, '2026-10-02')]);
  near(L.hold[0].uavg, 65000);
  const L2 = ledger([u(1, 60000, '2026-10-01'), u(1, 70000, '2026-10-02'), norm({ id: 's', k: 's', ty: 'kripto', sym: 'BTC', q: 1, u: 'koin', p: 80000 * 16000, cu: 'USD', pu: 80000, fx: 16000, d: '2026-10-03' })]);
  near(L2.hold[0].uavg, 65000); near(L2.real, (80000 - 65000) * 16000);
  const L3 = ledger([u(1, 60000, '2026-10-01'), norm({ id: 'r', k: 'b', ty: 'kripto', sym: 'BTC', q: 1, u: 'koin', p: 1_000_000_000, d: '2026-10-02' })]);
  assert.equal(L3.hold[0].uavg, null);
});

test('troy oz: 1 oz = 31,1035 gram; harga per oz', () => {
  const t = norm({ id: 'g', k: 'b', ty: 'emas', sym: 'XAU', q: 2 * 31.1034768, u: 'oz', p: 2400 * 16000 / 31.1034768, cu: 'USD', pu: 2400 / 31.1034768, fx: 16000, d: '2026-10-01' });
  near(ledger([t]).total, 2 * 2400 * 16000);
  assert.equal(priceLbl('emas', 'oz'), 'Harga per troy oz'); assert.equal(priceLbl('emas', 'gram'), 'Harga per gram');
  assert.equal(priceLbl('saham', 'lot'), 'Harga per lembar'); assert.equal(priceLbl('kripto', 'koin'), 'Harga per koin');
});

test('teks jumlah dan padanan satuan', () => {
  assert.equal(qt('saham', 200).replace(/\s/g, ' '), '2 lot'); assert.equal(qt('saham', 150).replace(/\s/g, ' '), '150 lembar');
  assert.equal(qt('saham', 200, true).replace(/\s/g, ' '), '2 lot · 200 lembar');
  assert.equal(qt('kripto', 0.05).replace(/\s/g, ' '), '0,05 koin');
  assert.equal(eqTxt('saham', 'lot', 2), '= 200 lembar'); assert.equal(eqTxt('saham', 'lembar', 300), '= 3 lot');
  assert.match(eqTxt('saham', 'lembar', 150), /odd lot/); assert.equal(eqTxt('kripto', 'koin', 1), '');
  assert.equal(eqTxt('emas', 'oz', 1), '= 31,1034768 gram');
});

test('grafik: aset USD dihitung dari harga transaksi Rupiah; nilai ikut harga sekarang', () => {
  const t = norm({ id: 'u', k: 'b', ty: 'kripto', sym: 'BTC', q: 1, u: 'koin', p: 1_000_000_000, cu: 'USD', pu: 62500, fx: 16000, d: '2026-10-01' });
  const S = series([t], {}, {}, { 'kripto|btc': 1_200_000_000 }, '2026-10-03');
  near(S[0].val, 1_000_000_000); near(last(S).val, 1_200_000_000); near(last(S).cost, 1_000_000_000);
});
