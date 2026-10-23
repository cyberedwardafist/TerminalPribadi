// App Headmaps (public/apps/headmaps/headmaps.js): model likuidasi, grid heat, order book (sinkron snapshot+selisih), candle live, bubble, warna.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const SRC = fs.readFileSync(new URL('../public/apps/headmaps/headmaps.js', import.meta.url), 'utf8');
function mk(saved) {
  const window = {}, apps = {};
  const ctx = vm.createContext({ window, console, Math, JSON, Date, Intl, Number, String, Object, Array, Set, Map, Promise, Error, Float32Array, Float64Array, Uint8ClampedArray, parseInt,
    WebSocket: class {}, fetch: async () => { throw new Error('offline'); }, AbortController, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    localStorage: { getItem: () => (saved ? JSON.stringify(saved) : null), setItem() {} }, registerApp: (id, a) => { apps[id] = a; }, S: {}, $: () => null, $$: () => [], document: {} });
  vm.runInContext(SRC, ctx);
  return { HM: window.HM._t, apps };
}
const J = x => JSON.parse(JSON.stringify(x));
const bar = (t, o, h, l, c, v = 1000) => ({ t, o, h, l, c, v });

test('terdaftar sebagai app headmaps; pengaturan tersimpan yang rusak dikembalikan ke bawaan', () => {
  const { apps, HM } = mk({ sym: 'x', tf: '9z', mode: 'zz', bars: 7, rg: 'q', pal: 'q' });
  assert.ok(apps.headmaps && apps.headmaps.t === 'Headmaps' && apps.headmaps.icon && apps.headmaps.notes.length);
  assert.deepEqual(J(HM.H), { sym: 'BTCUSDT', tf: '15m', mode: 'liq', bars: 120, rg: 'n', pal: 'a', bub: true, liq: true, mt5: 'ws://127.0.0.1:8765' });
});

test('niceStep & pctl', () => {
  const { HM } = mk();
  assert.equal(HM.niceStep(3.5), 5); assert.equal(HM.niceStep(0.13), 0.2); assert.equal(HM.niceStep(70), 100); assert.equal(HM.niceStep(1), 1); assert.equal(HM.niceStep(0), 1);
  assert.equal(HM.pctl([1, 2, 3, 4, 5], .5), 3); assert.equal(HM.pctl([], .9), 0); assert.equal(HM.pctl([5, 1, 9], 1), 9);
});

test('parseKlines (volume = quote asset) & klineBar (ganti candle berjalan, tambah baru, abaikan yang lama, potong riwayat)', () => {
  const { HM } = mk();
  const b = HM.parseKlines([[1000, '10', '12', '9', '11', '5', 1999, '55.5', 3], [2000, '11', '13', '10', '12', '4', 2999, '48', 2], ['x']]);
  assert.deepEqual(J(b), [{ t: 1000, o: 10, h: 12, l: 9, c: 11, v: 55.5 }, { t: 2000, o: 11, h: 13, l: 10, c: 12, v: 48 }]); assert.deepEqual(J(HM.parseKlines({ code: -1 })), []);
  const bars = b.slice();
  assert.equal(HM.klineBar(bars, { t: 2000, o: 11, h: 14, l: 10, c: 13, q: 60 }), true); assert.equal(bars.length, 2); assert.equal(bars[1].h, 14);
  assert.equal(HM.klineBar(bars, { t: 3000, o: 13, h: 13, l: 12, c: 12.5, q: 1 }), true); assert.equal(bars.length, 3);
  assert.equal(HM.klineBar(bars, { t: 500, o: 1, h: 1, l: 1, c: 1, q: 1 }), false);
  const big = Array.from({ length: 1499 }, (_, i) => bar(i, 1, 1, 1, 1)); HM.klineBar(big, { t: 5000, o: 1, h: 1, l: 1, c: 1, q: 1 }); HM.klineBar(big, { t: 6000, o: 1, h: 1, l: 1, c: 1, q: 1 }); assert.equal(big.length, 1200);
});

test('tickBar (MT5): candle diselaraskan ke batas waktu (termasuk offset broker), high/low/close/volume diperbarui', () => {
  const { HM } = mk();
  const tf = 60000, bars = [bar(0, 10, 11, 9, 10)];
  assert.equal(HM.alignBar(125000, tf), 120000); assert.equal(HM.alignBar(125000, 3600e3, 1800e3), 125000 - (125000 + 1800e3) % 3600e3);
  assert.equal(HM.tickBar(bars, 12, 30000, tf), true); assert.deepEqual(J(bars[0]), { t: 0, o: 10, h: 12, l: 9, c: 12, v: 1001 });
  HM.tickBar(bars, 8, 90000, tf); assert.equal(bars.length, 2); assert.deepEqual(J(bars[1]), { t: 60000, o: 12, h: 12, l: 8, c: 8, v: 1 });
  assert.equal(HM.tickBar(bars, 9, 10000, tf), false, 'tick lama tidak mundur'); assert.equal(HM.tickBar(bars, 0, 99999, tf), false);
});

test('liqLevels: 8 level per candle di harga leverage yang benar; berakhir saat disentuh; tak pernah disentuh = sampai akhir', () => {
  const { HM } = mk();
  const bars = [bar(0, 100, 100, 100, 100, 1000), bar(1, 100, 101, 99.5, 100.5, 0), bar(2, 100, 100, 95.8, 96, 0)];   // low 95.8 menyentuh long 25x (96,02+) tapi tidak 10x (90,5)
  const lv = HM.liqLevels(bars); assert.equal(lv.length, 8);
  const l10 = lv.find(x => x.s === 'L' && Math.abs(x.p - 100 * (1 - .1 + .005)) < 1e-9), l25 = lv.find(x => x.s === 'L' && Math.abs(x.p - 100 * (1 - .04 + .005)) < 1e-9);
  assert.ok(l10 && l25); assert.equal(l25.e, 2, 'long 25x kena di candle 2'); assert.equal(l10.e, 3, '10x aman -> sampai akhir');
  const s100 = lv.find(x => x.s === 'S' && Math.abs(x.p - 100 * (1 + .01 - .005)) < 1e-9); assert.equal(s100.e, 1, 'short 100x kena high 101');
  const tot = lv.reduce((a, x) => a + x.w, 0); assert.ok(Math.abs(tot - 1000) < 1e-6, 'bobot total = volume candle');
  assert.deepEqual(J(HM.liqLevels([bar(0, 1, 1, 1, 1, 0)])), [], 'tanpa volume tanpa level');
});

test('liqGrid: level aktif hanya antara candle pembuatan dan sentuhan; di luar rentang harga dibuang; ekstensi ke kanan untuk yang belum tersentuh', () => {
  const { HM } = mk();
  const lv = [{ i: 0, s: 'S', p: 105, w: 7, e: 3 }, { i: 1, s: 'L', p: 95, w: 2, e: 5 }, { i: 0, s: 'S', p: 500, w: 9, e: 5 }];
  const { g, cols, rows } = HM.liqGrid(lv, 0, 5, 2, 90, 110, 20);     // 20 baris x 1 harga, 7 kolom (5 candle + 2 ekstensi)
  assert.equal(cols, 7); assert.equal(rows, 20);
  const rowOf = p => 20 - 1 - Math.floor((p - 90) * 20 / 20), at = (p, c) => g[rowOf(p) * cols + c];
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(c => at(105, c)), [0, 7, 7, 0, 0, 0, 0], 'aktif kolom 1..2 (e=3 eksklusif)');
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(c => at(95, c)), [0, 0, 2, 2, 2, 2, 2], 'e>=n: lanjut sampai ekstensi');
  assert.equal(g.reduce((a, x) => a + x, 0), 7 * 2 + 2 * 5, 'level 500 dibuang');
  const part = HM.liqGrid(lv, 2, 5, 0, 90, 110, 20); assert.equal(part.cols, 3); assert.equal(part.g[(20 - 1 - 15) * 3 + 0], 7, 'jendela mulai di candle 2');
});

test('obGrid: rata-rata per kolom waktu, bucket -> baris harga, di luar rentang diabaikan', () => {
  const { HM } = mk();
  const OBC = new Map([[10, { n: 2, s: new Map([[100, 400], [101, 200], [999, 5]]) }], [11, { n: 1, s: new Map([[100, 50]]) }]]);   // bstep 1 -> harga = bucket
  const r = HM.obGrid(OBC, 1000, 1, 10000, 12999, 90, 110, 20);
  assert.equal(r.cols, 3); assert.equal(r.t0, 10000); assert.equal(r.colMs, 1000);
  const rowOf = p => 19 - Math.floor(p - 90);
  assert.equal(r.g[rowOf(100) * 3 + 0], 200); assert.equal(r.g[rowOf(101) * 3 + 0], 100); assert.equal(r.g[rowOf(100) * 3 + 1], 50); assert.equal(r.g.reduce((a, x) => a + x, 0), 350);
});

test('Book spot: buffer sebelum snapshot, buang event lama, urutan U harus nyambung, gap terdeteksi, qty 0 menghapus level', () => {
  const { HM } = mk(), b = new HM.Book(false);
  assert.equal(b.feed({ U: 1, u: 5, b: [['10', '1']], a: [] }), 'buf'); assert.equal(b.feed({ U: 6, u: 9, b: [['10', '0'], ['9', '2']], a: [['11', '3']] }), 'buf');
  assert.equal(b.snapshot({ lastUpdateId: 5, bids: [['10', '4'], ['8', '1']], asks: [['12', '1']] }), 'ok');
  assert.deepEqual(J([...b.b].sort((x, y) => x[0] - y[0])), [[8, 1], [9, 2]], 'event u<=5 dibuang, event 6..9 diterapkan'); assert.deepEqual(J([...b.a].sort((x, y) => x[0] - y[0])), [[11, 3], [12, 1]]); assert.equal(b.ok, true);
  assert.equal(b.feed({ U: 10, u: 12, b: [['9', '0']], a: [] }), 'ok'); assert.equal(b.b.has(9), false);
  assert.equal(b.feed({ U: 20, u: 22, b: [], a: [] }), 'gap'); assert.equal(b.feed({ U: 1, u: 3 }), 'old');
  const g = new HM.Book(false); g.feed({ U: 50, u: 60, b: [], a: [] }); assert.equal(g.snapshot({ lastUpdateId: 5, bids: [], asks: [] }), 'gap', 'snapshot terlalu lama');
});

test('Book futures: rantai pu harus cocok dengan u sebelumnya', () => {
  const { HM } = mk(), b = new HM.Book(true);
  b.snapshot({ lastUpdateId: 100, bids: [], asks: [] });
  assert.equal(b.feed({ U: 99, u: 105, pu: 98, b: [['1', '1']], a: [] }), 'ok'); assert.equal(b.feed({ U: 106, u: 108, pu: 105, b: [], a: [] }), 'ok'); assert.equal(b.feed({ U: 110, u: 112, pu: 109, b: [], a: [] }), 'gap');
});

test('bubbleThr: butuh >=200 trade; ambang = persentil 99,5 dan minimal 15x median', () => {
  const { HM } = mk();
  assert.equal(HM.bubbleThr(Array(100).fill(1)), Infinity);
  const w = Array.from({ length: 1000 }, (_, i) => 100 + (i % 10)); w[0] = 1e6; w[1] = 2e6;
  const t = HM.bubbleThr(w); assert.ok(t >= 15 * 105 && t <= 2e6, String(t));
});

test('palet & pewarnaan: nol = latar, nilai max = warna terang akhir palet, skala sqrt', () => {
  const { HM } = mk(), id = { data: new Uint8ClampedArray(3 * 4) };
  HM.paintGrid(new Float32Array([0, 25, 100]), 3, 100, HM.LUT.a, id);
  assert.deepEqual([...id.data.slice(0, 4)], [7, 11, 32, 255]); assert.deepEqual([...id.data.slice(8, 12)], [0xf0, 0xdc, 0x5a, 255]);
  const mid = [...id.data.slice(4, 7)], t5 = HM.LUT.a.slice(Math.round(Math.sqrt(.25) * 255) * 3, Math.round(Math.sqrt(.25) * 255) * 3 + 3);
  assert.deepEqual(mid, [...t5]); assert.equal(HM.LUT.b.length, 768);
  const bl = HM.blurV(new Float32Array([0, 0, 6, 0, 0, 0]), 1, 6); assert.ok(bl[2] > 0 && bl[1] > 0 && bl[3] > 0 && bl[0] === 0);
});
