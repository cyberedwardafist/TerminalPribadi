// Edit gambar chart: handle terlihat, toleransi tekan (mouse vs sentuh), bentuk kursor.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const ChartDraw = vm.runInNewContext(fs.readFileSync(new URL('../public/apps/chart/draw.js', import.meta.url), 'utf8') + '\n;ChartDraw', { console, Math, Date, JSON });
const E = { w: 800, h: 400, X: t => t, Y: p => 400 - p, T: x => x, P: y => 400 - y, F: v => String(v), st: 60, idx: t => t / 60, col: { up: '#0f0', dn: '#f00', acc: '#4c9aff', ink: '#fff', mute: '#999', bg: '#000' } };
const mkd = (k, ...pts) => ({ id: k, k, pts: pts.map(([t, p]) => ({ t, p })), s: {} });
const ctx = () => { const c = { arcs: [], fills: 0, strokes: 0 }; return Object.assign(c, { save() {}, restore() {}, beginPath() {}, arc(x, y, r) { c.arcs.push({ x, y, r }); }, fill() { c.fills++; }, stroke() { c.strokes++; } }); };

test('hit: toleransi bawaan 8 px, sentuh (o.t=16) lebih longgar', () => {
  const d = mkd('trend', [100, 100], [500, 100]);            // garis horizontal di y=300
  assert.ok(ChartDraw.hit(d, E, 300, 300 - 6), '6 px dari garis: kena');
  assert.equal(ChartDraw.hit(d, E, 300, 300 - 12), null, '12 px: mouse tidak kena');
  assert.ok(ChartDraw.hit(d, E, 300, 300 - 12, { t: 16, hr: 22 }), '12 px: jari kena');
});
test('hit: handle punya prioritas dan jari-jari yang bisa diatur', () => {
  const d = mkd('trend', [100, 100], [500, 200]);            // ujung di (100,300) dan (500,200)
  assert.deepEqual(JSON.parse(JSON.stringify(ChartDraw.hit(d, E, 104, 304))), { h: 0 });
  assert.equal(ChartDraw.hit(d, E, 100, 300 + 13), null, '13 px dari handle & jauh dari garis');
  assert.deepEqual(JSON.parse(JSON.stringify(ChartDraw.hit(d, E, 100, 300 + 13, { hr: 22 }))), { h: 0 });
});
test('drawHandles: gambar terpilih = lingkaran putih tiap titik; sorot = lebih kecil; n membatasi titik', () => {
  const d = mkd('channel', [100, 100], [300, 150], [200, 250]);
  let g = ctx(); ChartDraw.drawHandles(g, d, E, null, true); assert.equal(g.arcs.length, 3); assert.ok(g.arcs.every(a => a.r === 5.5));
  g = ctx(); ChartDraw.drawHandles(g, d, E, 1, true); assert.equal(g.arcs.length, 4, 'handle yang disorot dapat halo'); assert.ok(g.arcs.some(a => a.r === 7));
  g = ctx(); ChartDraw.drawHandles(g, d, E, null, false); assert.ok(g.arcs.every(a => a.r === 3.5));
  g = ctx(); ChartDraw.drawHandles(g, d, E, null, true, 1); assert.equal(g.arcs.length, 1, 'saat menggambar: hanya titik yang sudah ditaruh');
  g = ctx(); ChartDraw.drawHandles(g, { ...d, hide: true }, E, null, true); assert.equal(g.arcs.length, 0);
});
test('handle ada untuk garis horizontal/vertikal (dulu tak terlihat dan sulit ditangkap)', () => {
  assert.equal(ChartDraw.handles(mkd('hline', [100, 100]), E).length, 1);
  assert.equal(ChartDraw.handles(mkd('vline', [100, 100]), E).length, 1);
  const L = ChartDraw.handles(mkd('long', [100, 100], [200, 150], [200, 70]), E); assert.equal(L.length, 3);
});
test('cursorOf: handle=pointer, badan=move, hline=ns-resize, vline=ew-resize, terkunci=pointer', () => {
  const t = mkd('trend', [1, 1], [2, 2]);
  assert.equal(ChartDraw.cursorOf(t, { h: 0 }), 'pointer'); assert.equal(ChartDraw.cursorOf(t, { body: true }), 'move');
  assert.equal(ChartDraw.cursorOf(mkd('hline', [1, 1]), { body: true }), 'ns-resize'); assert.equal(ChartDraw.cursorOf(mkd('vline', [1, 1]), { body: true }), 'ew-resize');
  assert.equal(ChartDraw.cursorOf({ ...t, lock: true }, { body: true }), 'pointer');
});
