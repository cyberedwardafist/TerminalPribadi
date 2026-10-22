// App Aset (public/apps/aset): hitungan buku transaksi (beli menambah aset, jual mengurangi sebesar modal, untung/rugi terealisasi), nilai pasar per hari (grafik), sumber harga, dan pembacaan angka format Indonesia.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const win = {};
vm.runInNewContext(fs.readFileSync(new URL('../public/apps/aset/aset.js', import.meta.url), 'utf8'), { window: win, registerApp() {}, Intl, Date, Math, JSON, Number, String, Array, Map, Object, localStorage: {} });
const { ledger, num, series, lastLE, feedOf, niceTicks } = win.AsetCalc;

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

// ---------- nilai pasar & grafik ----------
const days = (a, b) => { const o = []; for (let t = Date.parse(a + 'T00:00:00Z'); t <= Date.parse(b + 'T00:00:00Z'); t += 864e5) o.push(new Date(t).toISOString().slice(0, 10)); return o; };
// px dari tabel {kunci: {tanggal: harga}}; tanggal tanpa isi memakai harga terakhir sebelumnya (akhir pekan/libur), sebelum data pertama = null
const pxOf = tbl => (k, d) => { const r = lastLE(Object.entries(tbl[k] || {}).sort().map(([dd, p]) => ({ d: dd, p })), d); return r ? r.p : null; };

test('BBCA beli 6.000 lalu turun ke 3.000: nilai turun 50% terhadap modal', () => {
  const L = ledger([tx('b', 'saham', 'BBCA', 1, 6000, '2026-10-01')]);
  const { pts } = series(L.hist, '2026-10-01', '2026-10-05', pxOf({ 'saham|bbca': { '2026-10-01': 6000, '2026-10-03': 4500, '2026-10-05': 3000 } }));
  assert.equal(pts.length, 5);
  near(pts[0].v, 600000); near(pts[0].c, 600000);
  near(pts[2].v, 450000);                       // 4.500 x 100 lembar
  near(pts[3].v, 450000);                       // hari tanpa harga memakai harga terakhir
  near(pts[4].v, 300000); near(pts[4].c, 600000);
  near((pts[4].v / pts[4].c - 1) * 100, -50);   // grafik persen: turun 50%
});

test('beberapa aset digabung: rugi satu aset ditutup untung aset lain', () => {
  // BBCA modal 1.000.000 turun 100.000; BTC modal 1.000.000 naik 50.000 -> total hanya turun 50.000
  const L = ledger([tx('b', 'saham', 'BBCA', 1, 10000, '2026-10-01'), tx('b', 'kripto', 'BTC', 1, 1_000_000, '2026-10-01')]);
  const { pts } = series(L.hist, '2026-10-01', '2026-10-02', pxOf({ 'saham|bbca': { '2026-10-01': 10000, '2026-10-02': 9000 }, 'kripto|btc': { '2026-10-01': 1_000_000, '2026-10-02': 1_050_000 } }));
  near(pts[0].v, 2_000_000);
  near(pts[1].v, 1_950_000); near(pts[1].v - pts[1].c, -50000);
});

test('beli lagi di harga berbeda: harga rata-rata berubah, modal grafik ikut bertambah di tanggal beli', () => {
  const t = [tx('b', 'saham', 'BBCA', 1, 5000, '2026-10-01'), tx('b', 'saham', 'BBCA', 1, 6000, '2026-10-03')];
  const L = ledger(t);
  near(L.hold[0].avg, 5500); near(L.hold[0].u, 200);
  const { pts } = series(L.hist, '2026-10-01', '2026-10-04', () => 5800);
  near(pts[0].c, 500000); near(pts[1].c, 500000); near(pts[2].c, 1_100_000); near(pts[3].v, 200 * 5800);
});

test('jual: nilai dan modal yang dipegang berkurang di tanggal jual, aset terjual hilang dari grafik', () => {
  const t = [tx('b', 'saham', 'BBCA', 2, 6000, '2026-10-01'), tx('s', 'saham', 'BBCA', 2, 6500, '2026-10-03')];
  const { pts } = series(ledger(t).hist, '2026-10-01', '2026-10-04', () => 6200);
  near(pts[1].v, 200 * 6200); near(pts[2].v, 0); near(pts[2].c, 0); near(pts[3].v, 0);
});

test('aset tanpa harga dihitung sebesar modal dan ditandai (fb)', () => {
  const L = ledger([tx('b', 'emas', 'Emas Antam', 10, 1_000_000, '2026-10-01'), tx('b', 'saham', 'BBCA', 1, 6000, '2026-10-01')]);
  const { pts, fb } = series(L.hist, '2026-10-01', '2026-10-02', (k) => (k === 'saham|bbca' ? 7000 : null));
  near(pts[1].v, 10_000_000 + 700000); assert.deepEqual([...fb], ['emas|emas antam']);
});

test('lastLE: harga terakhir pada atau sebelum tanggal', () => {
  const a = [{ d: '2026-10-01', p: 1 }, { d: '2026-10-05', p: 2 }];
  assert.equal(lastLE(a, '2026-09-30'), null); assert.equal(lastLE(a, '2026-10-01').p, 1);
  assert.equal(lastLE(a, '2026-10-04').p, 1); assert.equal(lastLE(a, '2026-12-01').p, 2); assert.equal(lastLE([], '2026-10-01'), null);
});

test('sumber harga live: saham IDX .JK, kripto USDT, lainnya manual', () => {
  assert.deepEqual({ ...feedOf({ ty: 'saham', sym: 'BBCA' }) }, { sym: 'BBCA.JK', usd: false });
  assert.equal(feedOf({ ty: 'saham', sym: 'bbca.jk' }).sym, 'BBCA.JK');
  assert.equal(feedOf({ ty: 'saham', sym: 'Bank Central Asia' }), null);
  assert.deepEqual({ ...feedOf({ ty: 'kripto', sym: 'BTC' }) }, { sym: 'BTCUSDT', usd: true });
  assert.equal(feedOf({ ty: 'kripto', sym: 'ethusdt' }).sym, 'ETHUSDT');
  assert.equal(feedOf({ ty: 'emas', sym: 'Antam' }), null); assert.equal(feedOf({ ty: 'lain', sym: 'Motor' }), null);
});

test('sumbu grafik: tick rapi', () => {
  const t = [...niceTicks(0, 1_000_000, 4)];   // salin: array dari vm beda realm
  assert.deepEqual(t, [0, 200000, 400000, 600000, 800000, 1000000]);
  assert.ok(niceTicks(-55, 3, 4).includes(0));
});
