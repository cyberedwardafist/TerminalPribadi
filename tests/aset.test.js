// App Aset (public/apps/aset): hitungan buku transaksi (beli menambah aset, jual mengurangi sebesar modal, untung/rugi terealisasi) dan pembacaan angka format Indonesia.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const win = {};
vm.runInNewContext(fs.readFileSync(new URL('../public/apps/aset/aset.js', import.meta.url), 'utf8'), { window: win, registerApp() {}, Intl, Date, Math, JSON, Number, String, Array, Map, Object, localStorage: {} });
const { ledger, series, num } = win.AsetCalc;

let n = 0;
const tx = (k, ty, sym, q, p, d = '2026-10-01') => ({ id: 't' + ++n, k, ty, sym, q, p, d, n: '', cre: n, upd: n });
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
