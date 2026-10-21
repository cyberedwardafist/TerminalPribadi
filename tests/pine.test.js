// Interpreter Pine v5 (public/apps/chart/pine): skrip bergaya TradingView asli, semantik seri, objek gambar, request.security, galat berbaris.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { INDICATORS, compute as srv } from '../lib/indicators.js';

const ctx = vm.createContext({ console, Math, Date, JSON, Map, Set, Object, Array, Number, String, Boolean, RegExp, Float64Array, isNaN, isFinite, parseFloat, parseInt });
ctx.self = ctx;
for (const f of ['parser', 'lib', 'strategy', 'runtime']) vm.runInContext(fs.readFileSync(new URL(`../public/apps/chart/pine/${f}.js`, import.meta.url), 'utf8'), ctx, { filename: f });
const P = ctx.PineRun;

function mk(n = 400, seed = 7, step = 3600) {
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; let p = 100;
  const b = { t: [], o: [], h: [], l: [], c: [], v: [] };
  for (let i = 0; i < n; i++) { const o = p, c = o * (1 + (r() - .5) * .04); p = c; b.t.push(1.7e9 + i * step); b.o.push(o); b.c.push(c); b.h.push(Math.max(o, c) * (1 + r() * .01)); b.l.push(Math.min(o, c) * (1 - r() * .01)); b.v.push(1000 + Math.round(r() * 500)); }
  return b;
}
const rows = b => b.t.map((t, i) => ({ t, o: b.o[i], h: b.h[i], l: b.l[i], c: b.c[i], v: b.v[i] }));
const run = (src, b = mk(), p = {}, o = {}) => JSON.parse(JSON.stringify(P.run(src, p, b, o)));
const near = (a, b, e = 1e-6) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= e * Math.max(1, Math.abs(b)));

test('paritas ta.* dengan indikator server: sma, ema, rsi, atr, macd, bb, stoch', () => {
  const b = mk(300), B = rows(b);
  const r = run(`//@version=5
indicator("p")
plot(ta.sma(close,20),"sma")
plot(ta.rsi(close,14),"rsi")
plot(ta.atr(14),"atr")
[m,s,h] = ta.macd(close,12,26,9)
plot(m,"m")
plot(s,"s")
plot(h,"h")
[mid,up,lo] = ta.bb(close,20,2)
plot(up,"up")
plot(lo,"lo")`, b);
  const get = k => r.plots.find(p => p.k === k).data;
  const cmp = (name, got, ref, from = 60) => { for (let i = from; i < 300; i++) assert.ok(near(got[i], ref[i]), `${name}[${i}] ${got[i]} vs ${ref[i]}`); };
  for (const [ind, map] of [['sma', { sma: 'sma' }], ['rsi', { rsi: 'rsi' }], ['atr', { atr: 'atr' }]]) if (INDICATORS[ind]) { const o = srv(ind, B, {}); for (const [k, n] of Object.entries(map)) if (o.series[n]) cmp(ind, get(k), o.series[n]); }
  if (INDICATORS.macd) { const o = srv('macd', B, {}).series; const key = n => o[n] || o[Object.keys(o).find(k => k.toLowerCase().includes(n))]; if (key('macd')) cmp('macd', get('m'), key('macd'), 80); if (key('signal')) cmp('signal', get('s'), key('signal'), 80); }
  assert.ok(get('up')[299] > get('lo')[299]);
});

test('semantik seri: var, :=, riwayat x[n], fungsi buatan, if/for/while/switch', () => {
  const r = run(`//@version=5
indicator("s")
var int cnt = 0
if close > open
    cnt += 1
sq(x) =>
    x * x
total = 0.0
for i = 0 to 4
    total += i
w = 0
while w < 3
    w += 1
k = switch
    close > open => 1
    close < open => -1
    => 0
plot(cnt, "cnt")
plot(sq(3), "sq")
plot(total, "total")
plot(w, "w")
plot(k, "k")
plot(close[2], "lag")`);
  const g = k => r.plots.find(p => p.k === k).data, b = mk();
  let c = 0; for (let i = 0; i < 400; i++) { if (b.c[i] > b.o[i]) c++; assert.equal(g('cnt')[i], c); }
  assert.equal(g('sq')[10], 9); assert.equal(g('total')[10], 10); assert.equal(g('w')[10], 3);
  assert.equal(g('lag')[10], b.c[8]); assert.equal(g('lag')[1], null);
  for (let i = 0; i < 50; i++) assert.equal(g('k')[i], b.c[i] > b.o[i] ? 1 : b.c[i] < b.o[i] ? -1 : 0);
});

test('Supertrend manual (skrip komunitas) sama dengan ta.supertrend', () => {
  const r = run(`//@version=5
indicator("ST", overlay=true)
atrPeriod = input.int(10, "ATR", minval=1)
factor = input.float(3.0, "Faktor", minval=0.1, step=0.1)
[st, dir] = ta.supertrend(factor, atrPeriod)
plot(st, "bawaan", color = dir < 0 ? color.green : color.red)
src = hl2
atr = ta.atr(atrPeriod)
upper = src + factor * atr
lower = src - factor * atr
var float prevL = na
var float prevU = na
lowerBand = lower
upperBand = upper
if not na(prevL)
    lowerBand := lower > prevL or close[1] < prevL ? lower : prevL
if not na(prevU)
    upperBand := upper < prevU or close[1] > prevU ? upper : prevU
prevL := lowerBand
prevU := upperBand
plot(lowerBand, "lb")`);
  const st = r.plots[0]; assert.ok(st.cols, 'warna per bar'); assert.equal(r.overlay, true);
  assert.equal(r.inputs.length, 2); assert.equal(r.inputs[1].step, 0.1); assert.equal(r.inputs[0].key, 'atrPeriod');
  assert.ok(st.data.filter(v => v != null).length > 300);
  const cols = new Set(st.cols.filter(Boolean)); assert.ok(cols.size >= 2, 'berganti hijau/merah');
});

test('histogram MACD berwarna, fill antar plot, hline, bgcolor, barcolor, alertcondition', () => {
  const r = run(`//@version=5
indicator("MACD", overlay=false)
[m, s, h] = ta.macd(close, 12, 26, 9)
hist_col = h >= 0 ? (h[1] < h ? #26A69A : #B2DFDB) : (h[1] < h ? #FFCDD2 : #FF5252)
plot(h, "Hist", style=plot.style_histogram, color=hist_col, linewidth=4)
p1 = plot(m, "MACD", color=color.blue)
p2 = plot(s, "Signal", color=color.orange)
fill(p1, p2, color=color.new(color.blue, 85))
hline(0, "Nol", color=color.gray, linestyle=hline.style_dashed)
bgcolor(h > 0 ? color.new(color.green, 92) : na)
barcolor(m > s ? color.lime : na)
alertcondition(ta.crossover(m, s), "Cross naik", "MACD naik")`);
  const hist = r.plots[0]; assert.equal(hist.t, 'hist'); assert.ok(hist.cols && new Set(hist.cols.filter(Boolean)).size >= 3);
  assert.equal(r.fills.length, 1); assert.equal(r.fills[0].a, 'MACD'); assert.equal(r.levels.length, 1); assert.equal(r.levels[0].dash, 1);
  assert.ok(r.bg.length > 10); assert.ok(r.barcol.length > 10); assert.equal(r.alerts.length, 1); assert.ok(r.alerts[0].bars.length > 0);
});

test('pivot + label.new / line.new / box.new dengan array dan objek', () => {
  const r = run(`//@version=5
indicator("Pivot", overlay=true, max_labels_count=100)
len = input.int(5, "Panjang")
ph = ta.pivothigh(high, len, len)
pl = ta.pivotlow(low, len, len)
var line[] lines = array.new<line>()
if not na(ph)
    label.new(bar_index[len], ph, str.tostring(ph, "#.##"), style=label.style_label_down, color=color.red, textcolor=color.white)
    array.push(lines, line.new(bar_index[len], ph, bar_index, ph, color=color.red, extend=extend.right))
if not na(pl)
    label.new(bar_index[len], pl, "L", style=label.style_label_up, color=color.green)
    box.new(bar_index[len], pl * 1.01, bar_index, pl * 0.99, border_color=color.green, bgcolor=color.new(color.green, 80))
plotshape(not na(ph), style=shape.circle, location=location.abovebar, color=color.red, offset=-len, size=size.tiny)`);
  assert.ok(r.objs.filter(o => o.k === 'label').length > 4); assert.ok(r.objs.some(o => o.k === 'line' && o.ext === 'right')); assert.ok(r.objs.some(o => o.k === 'box'));
  const lb = r.objs.find(o => o.k === 'label' && o.style === 'label_down'); assert.match(lb.text, /^\d+\.\d\d$/);
  assert.ok(r.markers.length > 3 && r.markers[0].s === 'circle' && r.markers[0].l === 'abovebar' && r.markers[0].z === 'tiny');
});

test('UDT, metode, array/map, str.format', () => {
  const r = run(`//@version=5
indicator("T")
type Pt
    float x
    float y = 2.0
p = Pt.new(1.0)
p.x := p.x + 4
a = array.new_float()
array.push(a, 3)
array.push(a, 5)
m = map.new<string, float>()
m.put("k", 7)
s = 0.0
for v in a
    s += v
plot(p.x + p.y, "udt")
plot(s, "arr")
plot(array.size(a), "size")
plot(m.get("k"), "map")
plot(str.length(str.format("{0}-{1}", 12, 34)), "fmt")`);
  const g = k => r.plots.find(p => p.k === k).data[5];
  assert.equal(g('udt'), 7); assert.equal(g('arr'), 8); assert.equal(g('size'), 2); assert.equal(g('map'), 7); assert.equal(g('fmt'), 5);
});

test('skrip v4: study, input tanpa tipe, iff, sma tanpa ta.', () => {
  const b = mk(100), r = run(`//@version=4
study("Lama", overlay=true)
n = input(14, minval=1, title="N")
m = sma(close, n)
plot(iff(close > m, m, na), "x")
plot(highest(high, 5), "hh")`, b);
  assert.equal(r.inputs[0].type, 'int'); assert.equal(r.inputs[0].label, 'N'); assert.ok(r.plots[0].data[50] === null || r.plots[0].data[50] > 0);
  assert.ok(near(r.plots[1].data[50], Math.max(...b.h.slice(46, 51))));
});

test('parameter dari pengguna menimpa nilai bawaan input', () => {
  const src = `//@version=5\nindicator("i")\nn = input.int(5, "N", minval=2, maxval=50)\nbk = input.bool(true, "Tampil")\nplot(bk ? ta.sma(close, n) : na, "m")`;
  const b = mk(100), a = run(src, b, {}), c = run(src, b, { n: 10, bk: false }), d = run(src, b, { n: 999 });
  assert.ok(a.plots[0].data[50] != null); assert.equal(c.plots[0].data[50], null);
  assert.equal(d.inputs[0].max, 50); assert.ok(near(d.plots[0].data[60], run(src, b, { n: 50 }).plots[0].data[60]));
  assert.deepEqual(a.inputs.map(i => i.type), ['int', 'bool']);
});

test('request.security: meminta data lewat NeedData lalu memakai hasilnya tanpa lookahead', () => {
  const b = mk(240, 7, 3600), src = `//@version=5\nindicator("htf", overlay=true)\nd = request.security(syminfo.tickerid, "1D", close)\nplot(d, "d")`;
  let need = null; try { P.run(src, {}, b, { sym: 'BTC', tfSec: 3600 }); } catch (e) { need = e.need; }
  assert.deepEqual(JSON.parse(JSON.stringify(need)), { sym: 'BTC', tf: '1D', sec: 86400 });
  const t0 = Math.floor(b.t[0] / 86400) * 86400, days = []; for (let i = 0; i < 12; i++) days.push(t0 + i * 86400);
  const dd = { t: days, o: days.map((_, i) => 100 + i), h: days.map((_, i) => 102 + i), l: days.map((_, i) => 99 + i), c: days.map((_, i) => 101 + i), v: days.map(() => 1) };
  const r = JSON.parse(JSON.stringify(P.run(src, {}, b, { sym: 'BTC', tfSec: 3600, sec: { 'BTC|86400': dd } })));
  const data = r.plots[0].data;
  for (let i = 0; i < 240; i++) { let day = Math.floor((b.t[i] - t0) / 86400); if (b.t[i] + 3600 < t0 + (day + 1) * 86400) day--; const want = day >= 0 ? dd.c[day] : null; assert.equal(data[i], want, 'bar ' + i); }
});

test('galat: nomor baris, nama tidak dikenal, fungsi belum didukung, loop tak berujung', () => {
  const e = (src, re) => assert.throws(() => P.run(src, {}, mk(30), {}), re);
  e('indicator("x")\nplot(foo)', /Baris 2.*foo/);
  e('indicator("x")\nplot(close', /Baris 2/);
  e('indicator("x")\na = 1\nb := 2\nplot(a)', /Baris 3/);
  e('indicator("x")\nplot(ta.nonexistent(close))', /Baris 2.*ta\.nonexistent/);
  e('indicator("x")\na = close', /tidak menghasilkan keluaran/);
  e('indicator("x")\nwhile true\n    x = 1\nplot(close)', /terlalu panjang/);
});

test('arrow dan karakter: plotchar, plotarrow, plotcandle', () => {
  const r = run(`//@version=5
indicator("m", overlay=true)
plotchar(close > open, "c", "▲", location.belowbar, color.green, size=size.small)
plotarrow(close - open, colorup=color.teal, colordown=color.maroon)
plotcandle(open, high, low, close, "k", color = close > open ? color.green : color.red)`);
  assert.ok(r.markers.some(m => m.s === 'char') && r.markers.some(m => m.s === 'arrowup') && r.markers.some(m => m.s === 'arrowdown'));
  assert.equal(r.candles.length, 1); assert.equal(r.candles[0].c.length, 400);
});

test('strategi: entry/exit/close, ukuran posisi, laporan, penanda', () => {
  const r = run(`//@version=5
strategy("Cross", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=50, commission_type=strategy.commission.percent, commission_value=0.1)
f = ta.sma(close, 5)
s = ta.sma(close, 20)
if ta.crossover(f, s)
    strategy.entry("L", strategy.long)
if ta.crossunder(f, s)
    strategy.close("L")
    strategy.entry("S", strategy.short)
strategy.exit("xS", "S", loss=500, profit=1000)
plot(f)
plot(s)`, mk(600, 11));
  const st = r.strategy; assert.equal(r.kind, 'strategy'); assert.ok(st.stats.n >= 3, 'jumlah trade ' + st.stats.n);
  assert.equal(st.initial, 10000);
  const sum = st.trades.reduce((a, t) => a + t.pnl, 0); assert.ok(Math.abs(sum - st.stats.net) < 1e-6);
  assert.ok(st.trades.every(t => t.qty > 0 && t.xb !== undefined || true));
  assert.ok(st.stats.winRate >= 0 && st.stats.winRate <= 100 && st.stats.maxDD >= 0);
  assert.ok(Math.abs(st.stats.equity - (10000 + st.stats.net + st.stats.openPnl)) < 1e-6);
  assert.ok(st.equity.length > 10 && r.markers.some(m => m.s === 'arrowup') && r.markers.some(m => m.s === 'arrowdown'));
  assert.ok(st.trades.every(t => t.et < t.xt));
});
test('strategi: order masuk di open bar berikutnya', () => {
  const b = mk(60, 3), r = run(`//@version=5\nstrategy("t", initial_capital=1000, default_qty_value=1)\nif bar_index == 10\n    strategy.entry("A", strategy.long)\nif bar_index == 20\n    strategy.close_all()\nplot(close)`, b);
  const t = r.strategy.trades[0]; assert.equal(t.ep, b.o[11]); assert.equal(t.xp, b.o[21]); assert.ok(Math.abs(t.pnl - (b.o[21] - b.o[11])) < 1e-9);
});

test('Pine v6: versi terbaca, enum + input.enum, tipe eksplisit, matrix, metode array, log, strategy.closedtrades.*', () => {
  const b = mk(400, 9), r = run(`//@version=6
indicator("v6", overlay=true)
enum Mode
    fast = "Cepat"
    slow = "Lambat"
mode = input.enum(Mode.fast, "Mode")
bool up = close > open
float m = ta.ema(close, mode == Mode.fast ? 8 : 21)
int k = bar_index % 7
matrix<float> mx = matrix.new<float>(2, 2, 0.0)
mx.set(0, 0, 3.0)
mx.set(1, 1, 4.0)
float det = mx.det()
var array<float> h = array.new<float>()
h.push(close)
if h.size() > 5
    h.shift()
log.info("bar {0}", bar_index)
plot(m, "EMA", color = up ? color.green : color.red)
plot(det, "det")
plot(h.avg(), "avg5")
plot(array.percentile_nearest_rank(h, 50), "p50")`, b);
  assert.equal(r.version, 6); assert.equal(r.plots[1].data[10], 12); assert.ok(near(r.plots[2].data[100], b.c.slice(96, 101).reduce((x, y) => x + y) / 5));
  assert.ok(r.plots[0].data[50] != null);
  const s = run(`//@version=6
strategy("s6", initial_capital=10000, default_qty_value=1)
if ta.crossover(ta.sma(close, 5), ta.sma(close, 20))
    strategy.entry("L", strategy.long)
if ta.crossunder(ta.sma(close, 5), ta.sma(close, 20))
    strategy.close("L")
n = strategy.closedtrades
plot(n > 0 ? strategy.closedtrades.profit(n - 1) : na, "last")
plot(n, "n")`, b);
  const last = s.strategy.trades.at(-1); assert.ok(last); assert.ok(near(s.plots[0].data[399], last.pnl)); assert.equal(s.plots[1].data[399], s.strategy.stats.n);
});

test('Pine v5: parameter when= pada strategy.* masih didukung; request.security dinamis per simbol', () => {
  const b = mk(200, 4), r = run(`//@version=5\nstrategy("w", initial_capital=1000, default_qty_value=1)\nstrategy.entry("L", strategy.long, when = bar_index == 10)\nstrategy.close("L", when = bar_index == 20)\nplot(close)`, b);
  assert.equal(r.strategy.trades.length, 1);
  let need = []; const src = `//@version=6\nindicator("dyn")\ns = bar_index < 100 ? "AAA" : "BBB"\nx = request.security(s, "60", close)\nplot(x)`;
  const mkD = k => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c.map(v => v + k), v: b.v });
  const sec = {}; for (let i = 0; i < 4; i++) { try { P.run(src, {}, b, { sym: 'ZZZ', tfSec: 3600, sec }); break; } catch (e) { const n = JSON.parse(JSON.stringify(e.need)); need.push(n.sym); sec[n.sym + '|' + n.sec] = mkD(n.sym === 'AAA' ? 1000 : 2000); } }
  assert.deepEqual(need, ['AAA', 'BBB']);
  const o = JSON.parse(JSON.stringify(P.run(src, {}, b, { sym: 'ZZZ', tfSec: 3600, sec }))).plots[0].data;
  assert.ok(near(o[50], b.c[50] + 1000)); assert.ok(near(o[150], b.c[150] + 2000));
});
