// Modul chart sisi klien (public/apps/chart): paritas indikator klien-server, geometri alat gambar, dan sandbox indikator custom (JS + Pine).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { INDICATORS, compute as serverCompute } from '../lib/indicators.js';

const read = f => fs.readFileSync(new URL('../public/apps/chart/' + f, import.meta.url), 'utf8');
const load = (f, name, g = {}) => vm.runInNewContext(read(f) + `\n;${name}`, { console, Math, Date, JSON, ...g });
const ChartInd = load('ind.js', 'ChartInd'), ChartDraw = load('draw.js', 'ChartDraw');

function bars(n = 400, seed = 7) {
  let s = seed, r = () => (s = (s * 16807) % 2147483647) / 2147483647, p = 100;
  return Array.from({ length: n }, (_, i) => { const o = p, c = o * (1 + (r() - .5) * .04); p = c; return { t: 1.7e9 + i * 3600, o, h: Math.max(o, c) * (1 + r() * .01), l: Math.min(o, c) * (1 - r() * .01), c, v: Math.round(500 + r() * 1000) }; });
}
const J = x => JSON.parse(JSON.stringify(x));
const close = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)));

test('indikator klien identik dengan server untuk semua indikator bersama', () => {
  const B = bars(), shared = Object.keys(INDICATORS).filter(k => ChartInd.defs[k]);
  assert.ok(shared.length >= 15, 'minimal 15 indikator bersama');
  for (const k of shared) {
    const srv = serverCompute(k, B, {}), cli = ChartInd.compute(ChartInd.defs[k], B, srv.params);
    for (const [name, arr] of Object.entries(srv.series)) {
      const c = cli.series[name]; assert.ok(c, `${k}.${name} ada di klien`); assert.equal(c.length, arr.length);
      for (let i = 0; i < arr.length; i++) assert.ok(close(c[i] ?? null, arr[i] ?? null), `${k}.${name}[${i}] klien=${c[i]} server=${arr[i]}`);
    }
  }
});
test('indikator hanya klien menghasilkan deret dengan panjang benar', () => {
  const B = bars();
  for (const k of ['donchian', 'keltner', 'psar', 'mfi']) { const r = ChartInd.compute(ChartInd.defs[k], B, {}); for (const [n, a] of Object.entries(r.series)) assert.equal(a.length, B.length, k + '.' + n); }
  assert.equal(Object.keys(ChartInd.defs).length, 21);
});
test('parameter di luar batas dijepit', () => {
  const p = ChartInd.norm(ChartInd.defs.sma, { period: 99999 }); assert.equal(p.period, 500);
  assert.equal(ChartInd.norm(ChartInd.defs.sma, { period: 'abc' }).period, 20);
});

const E = { w: 800, h: 400, X: t => t / 10, Y: p => 400 - p, T: x => x * 10, P: y => 400 - y, F: v => String(v), st: 3600, idx: t => t / 3600, col: { up: '#0f0', dn: '#f00', acc: '#00f', ink: '#fff', mute: '#999', bg: '#000' } };
test('clip Liang-Barsky: segmen, ray, garis penuh', () => {
  const a = { x: 100, y: 100 }, b = { x: 200, y: 100 };
  assert.deepEqual(J(ChartDraw.clip(a, b, 'seg', 800, 400)), [a, b]);
  const ray = ChartDraw.clip(a, b, 'ray', 800, 400); assert.equal(ray[0].x, 100); assert.equal(ray[1].x, 800);
  const ext = ChartDraw.clip(a, b, 'ext', 800, 400); assert.equal(ext[0].x, 0); assert.equal(ext[1].x, 800);
  assert.equal(ChartDraw.clip({ x: 900, y: 10 }, { x: 950, y: 10 }, 'seg', 800, 400), null);
  assert.equal(ChartDraw.clip(a, a, 'seg', 800, 400), null);
});
test('hit-test: ujung = handle, badan garis = body, jauh = null', () => {
  const d = ChartDraw.create('trend', { t: 1000, p: 300 }); d.pts[1] = { t: 5000, p: 200 };
  assert.deepEqual(J(ChartDraw.hit(d, E, 100, 100)), { h: 0 });
  assert.deepEqual(J(ChartDraw.hit(d, E, 500, 200)), { h: 1 });
  assert.deepEqual(J(ChartDraw.hit(d, E, 300, 150)), { body: true });
  assert.equal(ChartDraw.hit(d, E, 300, 250), null);
  d.hide = true; assert.equal(ChartDraw.hit(d, E, 300, 150), null);
});
test('posisi long: target di atas entry, stop diturunkan, handle tidak boleh menyeberang', () => {
  const d = ChartDraw.create('long', { t: 1000, p: 100 }); d.pts[1] = { t: 3000, p: 120 }; ChartDraw.complete(d);
  assert.equal(d.pts.length, 3); assert.equal(d.pts[2].p, 90);
  ChartDraw.moveHandle(d, 1, { t: 3000, p: 80 }); assert.equal(d.pts[1].p, 120, 'target tidak boleh di bawah entry');
  ChartDraw.moveHandle(d, 2, { t: 3000, p: 130 }); assert.equal(d.pts[2].p, 90, 'stop tidak boleh di atas entry');
  ChartDraw.moveHandle(d, 0, { t: 2000, p: 105 }); assert.equal(d.pts[0].t, 2000); assert.equal(d.pts[1].p, 125);
});
test('render semua alat tanpa error pada kanvas tiruan', () => {
  const calls = []; const g = new Proxy({}, { get: (_, k) => k === 'measureText' ? () => ({ width: 40 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { calls.push(k); }, set: () => true });
  for (const t of ChartDraw.TOOLS) {
    if (t.k === 'cur') continue; const d = ChartDraw.create(t.k, { t: 1000, p: 300 });
    d.pts = d.pts.map((q, i) => ({ t: 1000 + i * 2000, p: 300 - i * 30 })); if (t.k === 'brush') d.pts = Array.from({ length: 8 }, (_, i) => ({ t: 1000 + i * 500, p: 300 - i * 5 }));
    if (t.k === 'long' || t.k === 'short') ChartDraw.complete(d); if (t.k === 'text') d.txt = 'halo';
    assert.doesNotThrow(() => { ChartDraw.render(g, d, E, true); ChartDraw.handles(d, E); ChartDraw.axisLabels(d, E, true); }, t.k);
  }
});
test('clone memberi id baru dan tidak berbagi titik', () => {
  const d = ChartDraw.create('trend', { t: 1, p: 2 }), c = ChartDraw.clone(d); assert.notEqual(c.id, d.id); c.pts[0].p = 9; assert.equal(d.pts[0].p, 2);
});

// ---- sandbox custom: jalankan custom.js dengan Worker tiruan yang mengeksekusi kode worker di vm terpisah ----
function customEnv() {
  const blobText = read('worker.js');
  const Worker = class { constructor() { const self = { postMessage: m => setImmediate(() => this.onmessage && this.onmessage({ data: m })) }; const ctx = vm.createContext({ self, console, Math, setImmediate, Array, Object, JSON, Number, Error, isNaN, isFinite }); vm.runInContext(blobText, ctx); this.self = self; }
    postMessage(m) { try { this.self.onmessage({ data: m }); } catch (e) { this.onerror && this.onerror(e); } } terminate() {} };
  const g = { Worker, localStorage: { getItem: () => null, setItem() {} }, setTimeout, clearTimeout, apiOn: () => false };
  return load('custom.js', 'ChartCustom', g);
}
test('custom JS: plot, hline, marker, parameter lewat //@input', async () => {
  const C = customEnv(), B = bars(120), src = `//@input period 5 2 50\nconst m = ta.sma(close, p.period);\nplot('ma', m, {color:'red'});\nhline(1);\nmarker(10,'up',{color:'green'});`;
  assert.deepEqual(J(C.meta('js', src).inputs), [{ key: 'period', label: 'period', def: 5, min: 2, max: 50 }]);
  const r = (await C.exec('js', src, { period: 5 }, B)).ok, ref = ChartInd.fn.sma(B.map(x => x.c), 5);
  assert.equal(r.plots[0].k, 'ma'); assert.equal(r.markers.length, 1);
  r.plots[0].data.forEach((v, i) => assert.ok(close(v, ref[i] ?? null)));
});
test('custom Pine: ema/rsi/cross sama dengan fungsi bawaan', async () => {
  const C = customEnv(), B = bars(300), c = B.map(x => x.c);
  const src = `//@version=5\nindicator("t", overlay=true)\nlen = input.int(14, "Len", minval=2)\na = ta.ema(close, len)\nb = ta.rsi(close, len)\nplot(a, title="ema")\nplot(b, title="rsi")\nplot(a[1] + nz(close[3]) * 0, title="lag")\nplotshape(ta.crossover(close, a), style=shape.triangleup)`;
  const out = await C.exec('pine', src, { len: 14 }, B), r = out.ok;
  assert.equal(r.overlay, true); assert.equal(out.inputs[0].key, 'len');
  const e = ChartInd.fn.ema(c, 14), s = ChartInd.fn.rsi(c, 14);
  for (let i = 40; i < 300; i++) { assert.ok(Math.abs(r.plots[0].data[i] - e[i]) < 1e-6, 'ema ' + i); assert.ok(Math.abs(r.plots[1].data[i] - s[i]) < 1e-6, 'rsi ' + i); assert.ok(close(r.plots[2].data[i], e[i - 1])); }
  assert.ok(r.markers.length > 0);
});
test('Pine: galat dilaporkan dengan nomor baris, bukan crash', async () => {
  const C = customEnv(), B = bars(50);
  await assert.rejects(C.exec('pine', 'indicator("x")\nplot(foo)', {}, B), /baris 2.*foo/);
  await assert.rejects(C.exec('pine', 'indicator("x")\nif close > open\n    x = 1', {}, B), /baris 2/);
  await assert.rejects(C.exec('pine', 'indicator("x")\na = close', {}, B), /tidak ada plot/);
  await assert.rejects(C.exec('js', 'throw new Error("boom")', {}, B), /boom/);
});
test('sandbox: fetch/XMLHttpRequest tidak tersedia di worker', async () => {
  const C = customEnv(), B = bars(20);
  await assert.rejects(C.exec('js', 'fetch("http://evil")', {}, B), /fetch is not a function|not defined/);
  await assert.rejects(C.exec('js', 'new XMLHttpRequest()', {}, B), /not a constructor|not defined/);
});
test('vercel.json: worker.js punya CSP sendiri tanpa jaringan; halaman utama mengizinkan worker same-origin', () => {
  const v = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')), rule = v.headers.find(h => h.source === '/apps/chart/worker.js');
  const csp = rule.headers.find(h => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /connect-src 'none'/); assert.match(csp, /default-src 'none'/);
  const page = v.headers[0].headers.find(h => /Content-Security-Policy/.test(h.key)).value;
  assert.match(page, /worker-src 'self'/); assert.doesNotMatch(page, /unsafe-eval/);
});
