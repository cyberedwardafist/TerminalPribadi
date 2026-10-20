// Indikator teknikal di klien + spesifikasi tampilan (garis/histogram/awan/level). Fungsi hitung SAMA dengan lib/indicators.js (disalin
// otomatis; tests/chart.test.js memastikan hasilnya identik). Ditambah indikator khusus klien: Volume, Donchian, Keltner, Parabolic SAR, MFI.
// Semua keluaran sejajar dengan bar; periode pemanasan = null. Bar: {t,o,h,l,c,v}.
const ChartInd=(()=>{
const N = null;
const arr = (n, f = N) => new Array(n).fill(f);

function sma(x, n) { const o = arr(x.length); let s = 0; for (let i = 0; i < x.length; i++) { s += x[i]; if (i >= n) s -= x[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
function ema(x, n, seedIdx = 0) {
  const o = arr(x.length), k = 2 / (n + 1); let p = N;
  for (let i = seedIdx; i < x.length; i++) {
    if (x[i] == null) continue;
    if (p === N) { if (i - seedIdx + 1 === n) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += x[j]; p = s / n; o[i] = p; } continue; }
    p = x[i] * k + p * (1 - k); o[i] = p;
  }
  return o;
}
function wma(x, n) { const o = arr(x.length), d = n * (n + 1) / 2; for (let i = n - 1; i < x.length; i++) { let s = 0; for (let j = 0; j < n; j++) s += x[i - j] * (n - j); o[i] = s / d; } return o; }
const wilder = (x, n, start = 0) => { // RMA: seed = rata-rata n nilai pertama sejak start
  const o = arr(x.length); let p = N;
  for (let i = start; i < x.length; i++) {
    if (p === N) { if (i - start + 1 === n) { let s = 0; for (let j = start; j <= i; j++) s += x[j]; p = s / n; o[i] = p; } continue; }
    p = (p * (n - 1) + x[i]) / n; o[i] = p;
  } return o;
};
function rsi(c, n = 14) {
  const g = arr(c.length, 0), l = arr(c.length, 0);
  for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g[i] = d > 0 ? d : 0; l[i] = d < 0 ? -d : 0; }
  const ag = wilder(g, n, 1), al = wilder(l, n, 1);
  return c.map((_, i) => ag[i] == null ? N : al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]));
}
function macd(c, f = 12, s = 26, sg = 9) {
  const ef = ema(c, f), es = ema(c, s), m = c.map((_, i) => ef[i] == null || es[i] == null ? N : ef[i] - es[i]);
  const first = m.findIndex(v => v != null), sig = first < 0 ? arr(c.length) : ema(m, sg, first);
  return { macd: m, signal: sig, hist: m.map((v, i) => v == null || sig[i] == null ? N : v - sig[i]) };
}
function bollinger(c, n = 20, k = 2) {
  const mid = sma(c, n), up = arr(c.length), lo = arr(c.length);
  for (let i = n - 1; i < c.length; i++) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += (c[j] - mid[i]) ** 2; const sd = Math.sqrt(s / n); up[i] = mid[i] + k * sd; lo[i] = mid[i] - k * sd; }
  return { mid, upper: up, lower: lo };
}
const tr = b => b.map((x, i) => i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c)));
const atr = (b, n = 14) => wilder(tr(b), n, 0);
function stoch(b, k = 14, d = 3, smooth = 3) {
  const raw = arr(b.length);
  for (let i = k - 1; i < b.length; i++) { let hh = -Infinity, ll = Infinity; for (let j = i - k + 1; j <= i; j++) { hh = Math.max(hh, b[j].h); ll = Math.min(ll, b[j].l); } raw[i] = hh === ll ? 50 : 100 * (b[i].c - ll) / (hh - ll); }
  const sk = smooth > 1 ? smaNull(raw, smooth) : raw;
  return { k: sk, d: smaNull(sk, d) };
}
function smaNull(x, n) { const o = arr(x.length); for (let i = 0; i < x.length; i++) { if (i < n - 1) continue; let ok = true, s = 0; for (let j = i - n + 1; j <= i; j++) { if (x[j] == null) { ok = false; break; } s += x[j]; } if (ok) o[i] = s / n; } return o; }
function cci(b, n = 20) {
  const tp = b.map(x => (x.h + x.l + x.c) / 3), m = sma(tp, n), o = arr(b.length);
  for (let i = n - 1; i < b.length; i++) { let md = 0; for (let j = i - n + 1; j <= i; j++) md += Math.abs(tp[j] - m[i]); md /= n; o[i] = md === 0 ? 0 : (tp[i] - m[i]) / (0.015 * md); }
  return o;
}
function obv(b) { const o = arr(b.length); let s = 0; for (let i = 0; i < b.length; i++) { if (i > 0) s += b[i].c > b[i - 1].c ? b[i].v : b[i].c < b[i - 1].c ? -b[i].v : 0; o[i] = s; } return o; }
function vwap(b) { // reset tiap hari UTC; pada timeframe harian ke atas sama dengan typical price
  const o = arr(b.length); let day = -1, pv = 0, vv = 0;
  for (let i = 0; i < b.length; i++) { const d = Math.floor(b[i].t / 86400); if (d !== day) { day = d; pv = 0; vv = 0; } const tp = (b[i].h + b[i].l + b[i].c) / 3; pv += tp * b[i].v; vv += b[i].v; o[i] = vv ? pv / vv : tp; }
  return o;
}
const roc = (c, n = 12) => c.map((v, i) => i < n || c[i - n] === 0 ? N : 100 * (v - c[i - n]) / c[i - n]);
function willr(b, n = 14) { const o = arr(b.length); for (let i = n - 1; i < b.length; i++) { let hh = -Infinity, ll = Infinity; for (let j = i - n + 1; j <= i; j++) { hh = Math.max(hh, b[j].h); ll = Math.min(ll, b[j].l); } o[i] = hh === ll ? -50 : -100 * (hh - b[i].c) / (hh - ll); } return o; }
function adx(b, n = 14) {
  const L = b.length, pdm = arr(L, 0), mdm = arr(L, 0);
  for (let i = 1; i < L; i++) { const up = b[i].h - b[i - 1].h, dn = b[i - 1].l - b[i].l; pdm[i] = up > dn && up > 0 ? up : 0; mdm[i] = dn > up && dn > 0 ? dn : 0; }
  const a = wilder(tr(b), n, 1), p = wilder(pdm, n, 1), m = wilder(mdm, n, 1);
  const pdi = arr(L), mdi = arr(L), dx = arr(L);
  for (let i = 0; i < L; i++) if (a[i]) { pdi[i] = 100 * p[i] / a[i]; mdi[i] = 100 * m[i] / a[i]; const s = pdi[i] + mdi[i]; dx[i] = s ? 100 * Math.abs(pdi[i] - mdi[i]) / s : 0; }
  const first = dx.findIndex(v => v != null);
  return { adx: first < 0 ? arr(L) : wilder(dx, n, first), plusDI: pdi, minusDI: mdi };
}
function supertrend(b, n = 10, mult = 3) {
  const a = atr(b, n), L = b.length, line = arr(L), dir = arr(L); let fu = 0, fl = 0, d = 1;
  for (let i = 0; i < L; i++) {
    if (a[i] == null) continue;
    const hl2 = (b[i].h + b[i].l) / 2, bu = hl2 + mult * a[i], bl = hl2 - mult * a[i];
    if (line[i - 1] == null) { fu = bu; fl = bl; d = b[i].c >= hl2 ? 1 : -1; }
    else {
      fu = bu < fu || b[i - 1].c > fu ? bu : fu; fl = bl > fl || b[i - 1].c < fl ? bl : fl;
      if (d === 1 && b[i].c < fl) d = -1; else if (d === -1 && b[i].c > fu) d = 1;
    }
    line[i] = d === 1 ? fl : fu; dir[i] = d;
  }
  return { line, direction: dir };
}
function ichimoku(b, t = 9, k = 26, s = 52) {
  const mid = (i, n) => { if (i < n - 1) return N; let hh = -Infinity, ll = Infinity; for (let j = i - n + 1; j <= i; j++) { hh = Math.max(hh, b[j].h); ll = Math.min(ll, b[j].l); } return (hh + ll) / 2; };
  const tenkan = b.map((_, i) => mid(i, t)), kijun = b.map((_, i) => mid(i, k));
  // spanA/spanB dikembalikan TANPA pergeseran; klien menggeser maju `displacement` bar, chikou mundur `displacement` bar
  return { tenkan, kijun, spanA: b.map((_, i) => tenkan[i] == null || kijun[i] == null ? N : (tenkan[i] + kijun[i]) / 2), spanB: b.map((_, i) => mid(i, s)), chikou: b.map(x => x.c), displacement: k };
}

// ---------- tambahan khusus klien ----------
function donchian(b, n = 20) {
  const up = arr(b.length), lo = arr(b.length), mid = arr(b.length);
  for (let i = n - 1; i < b.length; i++) { let hh = -Infinity, ll = Infinity; for (let j = i - n + 1; j <= i; j++) { hh = Math.max(hh, b[j].h); ll = Math.min(ll, b[j].l); } up[i] = hh; lo[i] = ll; mid[i] = (hh + ll) / 2; }
  return { upper: up, mid, lower: lo };
}
function keltner(b, n = 20, mult = 2, an = 10) {
  const mid = ema(b.map(x => x.c), n), a = atr(b, an);
  return { upper: mid.map((v, i) => v == null || a[i] == null ? N : v + mult * a[i]), mid, lower: mid.map((v, i) => v == null || a[i] == null ? N : v - mult * a[i]) };
}
function psar(b, step = 0.02, max = 0.2) {
  const L = b.length, o = arr(L); if (L < 2) return { sar: o };
  let up = b[1].c >= b[0].c, af = step, ep = up ? b[0].h : b[0].l, s = up ? b[0].l : b[0].h;
  for (let i = 1; i < L; i++) {
    s = s + af * (ep - s);
    if (up) { s = Math.min(s, b[i - 1].l, i > 1 ? b[i - 2].l : b[i - 1].l); if (b[i].l < s) { up = false; s = ep; ep = b[i].l; af = step; } else if (b[i].h > ep) { ep = b[i].h; af = Math.min(max, af + step); } }
    else { s = Math.max(s, b[i - 1].h, i > 1 ? b[i - 2].h : b[i - 1].h); if (b[i].h > s) { up = true; s = ep; ep = b[i].h; af = step; } else if (b[i].l < ep) { ep = b[i].l; af = Math.min(max, af + step); } }
    o[i] = s;
  }
  return { sar: o };
}
function mfi(b, n = 14) {
  const o = arr(b.length), tp = b.map(x => (x.h + x.l + x.c) / 3);
  for (let i = n; i < b.length; i++) { let pos = 0, neg = 0; for (let j = i - n + 1; j <= i; j++) { const f = tp[j] * b[j].v; if (tp[j] > tp[j - 1]) pos += f; else if (tp[j] < tp[j - 1]) neg += f; } o[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg); }
  return o;
}

// ---------- registry + spesifikasi tampilan ----------
const COL = ['#e8a33d', '#5aa9ff', '#b58cff', '#ff7ad9', '#3ecf8e', '#ff6b6b', '#4dd0e1', '#c0ca33'];
const P = (key, def, min = 1, max = 500, label) => ({ key, label: label || key, def, min, max });
const close = b => b.map(x => x.c);
// plots: {k, c(warna bawaan), t: 'line'|'hist'|'dots'|'step', w, shift:(p)=>bar, name}; fills: antar dua plot; levels: garis bantu; range: skala tetap [min,max]
const defs = {
  vol:   { name: 'Volume', short: 'Vol', overlay: true, kind: 'volume', inputs: [P('ma', 20, 0, 500, 'MA volume (0 = mati)')], plots: [{ k: 'ma', c: '#e8a33d' }], run: (b, p) => ({ ma: p.ma ? sma(b.map(x => x.v), p.ma) : arr(b.length) }) },
  sma:   { name: 'Simple Moving Average', short: 'SMA', overlay: true, inputs: [P('period', 20)], plots: [{ k: 'sma', c: COL[0] }], run: (b, p) => ({ sma: sma(close(b), p.period) }) },
  ema:   { name: 'Exponential Moving Average', short: 'EMA', overlay: true, inputs: [P('period', 50)], plots: [{ k: 'ema', c: COL[1] }], run: (b, p) => ({ ema: ema(close(b), p.period) }) },
  wma:   { name: 'Weighted Moving Average', short: 'WMA', overlay: true, inputs: [P('period', 20)], plots: [{ k: 'wma', c: COL[3] }], run: (b, p) => ({ wma: wma(close(b), p.period) }) },
  bb:    { name: 'Bollinger Bands', short: 'BB', overlay: true, inputs: [P('period', 20), P('mult', 2, 0.1, 10)], plots: [{ k: 'upper', c: COL[2], w: 1 }, { k: 'mid', c: COL[0], w: 1 }, { k: 'lower', c: COL[2], w: 1 }], fills: [{ a: 'upper', b: 'lower', c: 'rgba(181,140,255,.08)' }], run: (b, p) => bollinger(close(b), p.period, p.mult) },
  vwap:  { name: 'VWAP', short: 'VWAP', overlay: true, inputs: [], plots: [{ k: 'vwap', c: COL[3] }], run: b => ({ vwap: vwap(b) }) },
  supertrend: { name: 'Supertrend', short: 'ST', overlay: true, inputs: [P('period', 10), P('mult', 3, 0.1, 20)], plots: [{ k: 'line', c: '#3ecf8e', c2: '#ff6b6b', dirKey: 'direction' }], run: (b, p) => supertrend(b, p.period, p.mult) },
  ichimoku: { name: 'Ichimoku Cloud', short: 'Ichimoku', overlay: true, inputs: [P('tenkan', 9), P('kijun', 26), P('senkouB', 52)],
    plots: [{ k: 'tenkan', c: '#5aa9ff', w: 1 }, { k: 'kijun', c: '#ff6b6b', w: 1 }, { k: 'spanA', c: 'rgba(62,207,142,.7)', w: 1, shift: p => p.kijun }, { k: 'spanB', c: 'rgba(255,107,107,.7)', w: 1, shift: p => p.kijun }, { k: 'chikou', c: '#c0ca33', w: 1, shift: p => -p.kijun }],
    fills: [{ a: 'spanA', b: 'spanB', up: 'rgba(62,207,142,.12)', dn: 'rgba(255,107,107,.12)' }], run: (b, p) => ichimoku(b, p.tenkan, p.kijun, p.senkouB) },
  donchian: { name: 'Donchian Channels', short: 'DC', overlay: true, inputs: [P('period', 20)], plots: [{ k: 'upper', c: COL[1], w: 1 }, { k: 'mid', c: COL[0], w: 1 }, { k: 'lower', c: COL[1], w: 1 }], fills: [{ a: 'upper', b: 'lower', c: 'rgba(90,169,255,.07)' }], run: (b, p) => donchian(b, p.period) },
  keltner: { name: 'Keltner Channels', short: 'KC', overlay: true, inputs: [P('period', 20), P('mult', 2, 0.1, 10), P('atr', 10)], plots: [{ k: 'upper', c: COL[4], w: 1 }, { k: 'mid', c: COL[0], w: 1 }, { k: 'lower', c: COL[4], w: 1 }], fills: [{ a: 'upper', b: 'lower', c: 'rgba(62,207,142,.07)' }], run: (b, p) => keltner(b, p.period, p.mult, p.atr) },
  psar:  { name: 'Parabolic SAR', short: 'SAR', overlay: true, inputs: [P('step', 0.02, 0.001, 1), P('max', 0.2, 0.01, 1)], plots: [{ k: 'sar', c: '#e8a33d', t: 'dots' }], run: (b, p) => psar(b, p.step, p.max) },
  rsi:   { name: 'Relative Strength Index', short: 'RSI', overlay: false, inputs: [P('period', 14)], range: [0, 100], levels: [30, 50, 70], band: [30, 70], plots: [{ k: 'rsi', c: '#b58cff' }], run: (b, p) => ({ rsi: rsi(close(b), p.period) }) },
  macd:  { name: 'MACD', short: 'MACD', overlay: false, inputs: [P('fast', 12), P('slow', 26), P('signal', 9)], levels: [0], plots: [{ k: 'hist', t: 'hist', c: '#3ecf8e', c2: '#ff6b6b' }, { k: 'macd', c: '#5aa9ff' }, { k: 'signal', c: '#e8a33d' }], run: (b, p) => macd(close(b), p.fast, p.slow, p.signal) },
  stoch: { name: 'Stochastic', short: 'Stoch', overlay: false, inputs: [P('k', 14), P('d', 3), P('smooth', 3)], range: [0, 100], levels: [20, 50, 80], band: [20, 80], plots: [{ k: 'k', c: '#5aa9ff' }, { k: 'd', c: '#e8a33d' }], run: (b, p) => stoch(b, p.k, p.d, p.smooth) },
  atr:   { name: 'Average True Range', short: 'ATR', overlay: false, inputs: [P('period', 14)], plots: [{ k: 'atr', c: '#ff7ad9' }], run: (b, p) => ({ atr: atr(b, p.period) }) },
  adx:   { name: 'Average Directional Index', short: 'ADX', overlay: false, inputs: [P('period', 14)], levels: [25], plots: [{ k: 'adx', c: '#e8a33d' }, { k: 'plusDI', c: '#3ecf8e', w: 1 }, { k: 'minusDI', c: '#ff6b6b', w: 1 }], run: (b, p) => adx(b, p.period) },
  cci:   { name: 'Commodity Channel Index', short: 'CCI', overlay: false, inputs: [P('period', 20)], levels: [-100, 0, 100], band: [-100, 100], plots: [{ k: 'cci', c: '#4dd0e1' }], run: (b, p) => ({ cci: cci(b, p.period) }) },
  obv:   { name: 'On Balance Volume', short: 'OBV', overlay: false, inputs: [], plots: [{ k: 'obv', c: '#5aa9ff' }], run: b => ({ obv: obv(b) }) },
  roc:   { name: 'Rate of Change', short: 'ROC', overlay: false, inputs: [P('period', 12)], levels: [0], plots: [{ k: 'roc', c: '#c0ca33' }], run: (b, p) => ({ roc: roc(close(b), p.period) }) },
  willr: { name: 'Williams %R', short: '%R', overlay: false, inputs: [P('period', 14)], range: [-100, 0], levels: [-80, -50, -20], band: [-80, -20], plots: [{ k: 'willr', c: '#b58cff' }], run: (b, p) => ({ willr: willr(b, p.period) }) },
  mfi:   { name: 'Money Flow Index', short: 'MFI', overlay: false, inputs: [P('period', 14)], range: [0, 100], levels: [20, 50, 80], band: [20, 80], plots: [{ k: 'mfi', c: '#3ecf8e' }], run: (b, p) => ({ mfi: mfi(b, p.period) }) },
};
const GROUPS = [['Tren (overlay)', ['sma', 'ema', 'wma', 'bb', 'vwap', 'supertrend', 'ichimoku', 'donchian', 'keltner', 'psar']], ['Momentum', ['rsi', 'macd', 'stoch', 'cci', 'roc', 'willr', 'mfi']], ['Volatilitas dan volume', ['atr', 'adx', 'obv', 'vol']]];

// parameter -> nilai valid (sama aturan dengan compute() di server)
function norm(def, params = {}) {
  const p = {};
  for (const i of def.inputs) { const n = Number(params[i.key] ?? i.def); p[i.key] = Math.min(i.max, Math.max(i.min, Number.isFinite(n) ? Math.round(n * 1000) / 1000 : i.def)); }
  return p;
}
function compute(def, bars, params) { const p = norm(def, params); return { p, series: def.run(bars, p) }; }
const label = (def, p) => def.short + (def.inputs.length ? ' ' + def.inputs.map(i => p[i.key]).join(', ') : '');

return { defs, GROUPS, COL, norm, compute, label, fn: { sma, ema, wma, rsi, macd, bollinger, atr, stoch, cci, obv, vwap, roc, willr, adx, supertrend, ichimoku, donchian, keltner, psar, mfi } };
})();
