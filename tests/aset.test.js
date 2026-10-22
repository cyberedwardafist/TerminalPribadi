// App Aset (public/apps/aset): hitungan buku transaksi (beli menambah aset, jual mengurangi sebesar modal, untung/rugi terealisasi) dan pembacaan angka format Indonesia.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const win = {};
vm.runInNewContext(fs.readFileSync(new URL('../public/apps/aset/aset.js', import.meta.url), 'utf8'), { window: win, registerApp() {}, Intl, Date, Math, JSON, Number, String, Array, Map, Object, localStorage: {} });
const { ledger, num } = win.AsetCalc;

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
