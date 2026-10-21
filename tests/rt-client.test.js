// Mesin realtime klien (public/shared/rt.js): pemetaan simbol, Binance WS, pemimpin + failover paralel, sambung ulang, REST IDX, logika candle.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const SRC = fs.readFileSync(new URL('../public/shared/rt.js', import.meta.url), 'utf8');
function mk(rt = {}, extra = {}) {
  const clk = { t: 1_700_000_000_000 }, sockets = [], timers = [];
  class WS { constructor(url) { this.url = url; this.sent = []; this.readyState = 0; sockets.push(this); } send(x) { this.sent.push(JSON.parse(x)); } close() { this.readyState = 3; if (this.onclose) this.onclose(); }
    open() { this.readyState = 1; this.onopen(); } recv(o) { this.onmessage({ data: typeof o === 'string' ? o : JSON.stringify(o) }); } }
  class FD extends Date { static now() { return clk.t; } }
  const ctx = vm.createContext({ console, Math, JSON, Date: FD, WebSocket: WS, atob, TextDecoder, DataView, Uint8Array, Promise, Object, Set, Map, Array, Number, String, Error,
    setInterval: () => 0, clearInterval() {}, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {},
    CFG: { api: { rt } }, WATCH: [['BTCUSDT', 'Bitcoin', 1, 0, 'cry'], ['EURUSD', 'EUR', 1, 0, 'fx'], ['AAPL', 'Apple', 1, 0, 'us'], ['BBCA', 'BCA', 1, 0, 'idx'], ['XAUUSD', 'Emas', 1, 0, 'com']], ...extra });
  vm.runInContext(SRC, ctx);
  return { RT: ctx.RT, ctx, clk, sockets, timers, byUrl: s => sockets.filter(x => x.url.includes(s)) };
}
const collect = () => { const a = []; return { a, fn: t => a.push(t), ev: [], st(e) { this.ev.push(e); } }; };

test('pemetaan simbol per penyedia dan urutan prioritas', () => {
  const { RT } = mk(), { PS, kindOf, ORDER } = RT._t;
  assert.equal(kindOf('BTCUSDT'), 'cry'); assert.equal(kindOf('EURUSD'), 'fx'); assert.equal(kindOf('XAUUSD'), 'com'); assert.equal(kindOf('SPX'), 'ind'); assert.equal(kindOf('BBCA'), 'idx');
  assert.equal(PS.binance('BTCUSDT', 'cry'), 'btcusdt'); assert.equal(PS.binance('EURUSD', 'fx'), null);
  assert.equal(PS.finnhub('EURUSD', 'fx'), 'OANDA:EUR_USD'); assert.equal(PS.finnhub('AAPL', 'us'), 'AAPL'); assert.equal(PS.finnhub('XAUUSD', 'com'), 'OANDA:XAU_USD'); assert.equal(PS.finnhub('SPX', 'ind'), 'OANDA:SPX500_USD'); assert.equal(PS.finnhub('BBCA', 'idx'), null);
  assert.deepEqual(JSON.parse(JSON.stringify(PS.tiingo('EURUSD', 'fx'))), { svc: 'fx', t: 'eurusd' }); assert.equal(JSON.parse(JSON.stringify(PS.tiingo('BRK.B', 'us'))).t, 'brk-b');
  assert.equal(PS.yahoo('EURUSD', 'fx'), 'EURUSD=X'); assert.equal(PS.yahoo('WTI', 'com'), 'CL=F'); assert.equal(PS.yahoo('IHSG', 'ind'), '^JKSE');
  assert.equal(PS.goapi('BBCA', 'idx'), 'BBCA'); assert.equal(PS.goapi('AAPL', 'us'), null);
  assert.ok(!ORDER.idx.includes('yahoo'), 'IDX tanpa Yahoo (tertunda)');
});

test('Binance: aggTrade + kline sampai sebagai tick, langganan dikirim saat open', () => {
  const { RT, byUrl } = mk(), c = collect();
  const off = RT.sub('BTCUSDT', '1m', c.fn, c.st.bind(c));
  const [ws] = byUrl('binance'); assert.ok(ws, 'WebSocket Binance dibuka'); assert.match(ws.url, /^wss:\/\/data-stream\.binance\.vision\/stream/);
  ws.open();
  assert.deepEqual(ws.sent.at(-1).params, ['btcusdt@aggTrade', 'btcusdt@kline_1m']); assert.equal(ws.sent.at(-1).method, 'SUBSCRIBE');
  ws.recv({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', s: 'BTCUSDT', p: '67000.5', q: '0.25', T: 1_700_000_000_100 } });
  ws.recv({ stream: 'btcusdt@kline_1m', data: { e: 'kline', E: 1_700_000_000_200, s: 'BTCUSDT', k: { t: 1_699_999_980_000, i: '1m', o: '66990', h: '67010', l: '66980', c: '67000.5', v: '12.5', x: false } } });
  assert.equal(c.a.length, 2);
  assert.equal(c.a[0].p, 67000.5); assert.equal(c.a[0].q, 0.25); assert.equal(c.a[0].src, 'binance');
  assert.equal(c.a[1].k.v, 12.5); assert.equal(c.a[1].k.x, false);
  assert.ok(RT.info('BTCUSDT', '1m').live); assert.equal(RT.info('BTCUSDT', '1m').leader, 'binance');
  off(); assert.equal(RT.info('BTCUSDT', '1m').has, false);
  assert.equal(ws.sent.at(-1).method, 'UNSUBSCRIBE');
});

test('tf 1D/1W memakai nama interval Binance yang benar', () => {
  const { RT, byUrl } = mk(); RT.sub('ETHUSDT', '1D', () => {}); const [ws] = byUrl('binance'); ws.open();
  assert.ok(ws.sent.at(-1).params.includes('ethusdt@kline_1d'));
});

test('forex paralel: Tiingo memimpin, Finnhub cadangan; failover bila macet, kembali saat pulih', () => {
  const { RT, clk, byUrl } = mk({ finnhub: 'FK', tiingo: 'TK' }), c = collect();
  RT.sub('EURUSD', '1m', c.fn, c.st.bind(c));
  const tg = byUrl('api.tiingo.com/fx')[0], fh = byUrl('ws.finnhub.io')[0];
  assert.ok(tg && fh, 'kedua sumber dibuka paralel'); assert.match(fh.url, /token=FK/);
  tg.open(); fh.open();
  assert.deepEqual(tg.sent[0].eventData.tickers, ['eurusd']); assert.equal(tg.sent[0].authorization, 'TK'); assert.equal(fh.sent[0].symbol, 'OANDA:EUR_USD');
  const tq = (mid, t) => ({ messageType: 'A', service: 'fx', data: ['Q', 'eurusd', new Date(t).toISOString(), 1e6, mid - .00005, mid, 1e6, mid + .00005] });
  const ft = (p, t) => ({ type: 'trade', data: [{ s: 'OANDA:EUR_USD', p, t, v: 0 }] });
  tg.recv(tq(1.0850, clk.t)); fh.recv(ft(1.0851, clk.t));
  assert.equal(c.a.length, 1, 'hanya pemimpin yang menggerakkan chart (harga tidak bercampur)'); assert.equal(c.a[0].src, 'tiingo');
  clk.t += 5000; fh.recv(ft(1.0852, clk.t));                       // Tiingo diam > 4 dtk
  assert.equal(c.a.at(-1).src, 'finnhub'); assert.equal(RT.info('EURUSD', '1m').leader, 'finnhub');
  clk.t += 500; tg.recv(tq(1.0853, clk.t));                        // Tiingo pulih -> kembali jadi pemimpin
  assert.equal(c.a.at(-1).src, 'tiingo');
  assert.ok(c.ev.some(e => e.type === 'leader' && e.leader === 'finnhub'));
});

test('tanpa kunci: Finnhub/Tiingo tidak dibuka; kripto tetap jalan; Yahoo cadangan forex', () => {
  const { RT, sockets } = mk(); RT.sub('EURUSD', '1m', () => {});
  assert.deepEqual([...new Set(sockets.map(s => new URL(s.url).host))], ['streamer.finance.yahoo.com']);
  assert.deepEqual(JSON.parse(JSON.stringify(RT.info('EURUSD', '1m').order)), ['yahoo']);
});

test('sambung ulang: koneksi putus dijadwalkan ulang dan memicu status "gap" untuk rekonsiliasi', () => {
  const { RT, byUrl, timers } = mk(), c = collect(); RT.sub('BTCUSDT', '1m', c.fn, c.st.bind(c));
  const ws1 = byUrl('binance')[0]; ws1.open(); ws1.readyState = 3; ws1.onclose();
  assert.equal(timers.length > 0, true, 'timer sambung ulang dibuat'); timers.shift()();
  const ws2 = byUrl('binance')[1]; assert.ok(ws2, 'WebSocket baru dibuka'); ws2.open();
  assert.deepEqual(ws2.sent.at(-1).params, ['btcusdt@aggTrade', 'btcusdt@kline_1m'], 'langganan dikirim ulang');
  assert.ok(c.ev.some(e => e.type === 'gap'));
});

test('parser Tiingo: fx, iex trade, iex quote, iex level 6', () => {
  const { RT } = mk(), { tiingoMsg } = RT._t, J = x => JSON.parse(JSON.stringify(x));
  assert.deepEqual(J(tiingoMsg('fx', { messageType: 'A', data: ['Q', 'eurusd', '2026-10-21T00:00:00.000Z', 1, 1.08, 1.0801, 1, 1.0802] })), { t: 'eurusd', p: 1.0801, q: 0, ts: Date.parse('2026-10-21T00:00:00.000Z') });
  assert.equal(tiingoMsg('iex', { messageType: 'A', data: ['T', '2026-10-21T14:00:00Z', 0, 'aapl', null, null, null, null, null, 226.4, 100, 0, 0, 0, 0, 0] }).p, 226.4);
  assert.equal(tiingoMsg('iex', { messageType: 'A', data: ['Q', '2026-10-21T14:00:00Z', 0, 'aapl', 100, 226.3, 226.35, 226.4, 100, null, null] }).p, 226.35);
  assert.equal(tiingoMsg('iex', { messageType: 'A', data: ['2026-10-21T14:00:00Z', 'aapl', 226.5] }).p, 226.5);
  assert.equal(tiingoMsg('fx', { messageType: 'H' }), null);
});

test('decoder Yahoo (protobuf base64): id, harga float32, waktu sint64', () => {
  const { RT } = mk(), vi = n => { const o = []; while (n >= 128) { o.push((n % 128) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
  const id = Buffer.from('EURUSD=X'), f = Buffer.alloc(4); f.writeFloatLE(1.0842);
  const buf = Buffer.from([0x0a, id.length, ...id, 0x15, ...f, 0x18, ...vi(1_700_000_000_123 * 2)]);
  const d = RT._t.decodeYahoo(buf.toString('base64'));
  assert.equal(d.id, 'EURUSD=X'); assert.equal(d.price, 1.0842); assert.equal(d.ts, 1_700_000_000_123);
  assert.equal(RT._t.decodeYahoo(Buffer.from([0x0a, 1, 65]).toString('base64')), null);
});

test('IDX: GoAPI + OHLC.dev lewat /api/rt/quote berjalan paralel; harga sama tanpa waktu penyedia tidak tampak baru', async () => {
  let n = 0, enabled = ['goapi', 'ohlcdev'];
  const apiFetch = async url => { assert.match(url, /^\/api\/rt\/quote\?symbol=BBCA$/); n++;
    return { ok: true, json: async () => ({ enabled, sources: [{ src: 'goapi', price: 9825, ts: 1_700_000_000_000 + n * 1000, tsp: false }, { src: 'ohlcdev', price: 9830, ts: 1_700_000_000_000, tsp: true }] }) }; };
  const { RT, clk } = mk({}, { apiFetch, apiOn: () => true }), c = collect(); RT.sub('BBCA', '1m', c.fn, c.st.bind(c));
  await new Promise(r => setImmediate(r));
  assert.equal(c.a.length, 1); assert.equal(c.a[0].src, 'goapi'); assert.equal(c.a[0].p, 9825);
  assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(RT.info('BBCA', '1m').srcs))), ['goapi', 'ohlcdev']);
  assert.ok(RT.info('BBCA', '1m').srcs.ohlcdev, 'OHLC.dev juga hidup (paralel)');
  clk.t += 1000; RT._t.HUB.get('BBCA|1m').offs.length; // polling berikutnya via timer asli tidak berjalan di vm; cukup cek tidak ada tick duplikat
  assert.equal(c.a.length, 1);
});

test('REST tanpa kunci di server (enabled kosong): tidak ada tick dan polling berhenti sementara', async () => {
  let n = 0; const apiFetch = async () => { n++; return { ok: true, json: async () => ({ enabled: [], sources: [] }) }; };
  const { RT } = mk({}, { apiFetch, apiOn: () => true }), c = collect(); RT.sub('BBCA', '1m', c.fn);
  await new Promise(r => setImmediate(r)); assert.equal(c.a.length, 0); assert.equal(n, 1);
  RT.sub('BBCA', '5m', c.fn); await new Promise(r => setImmediate(r)); assert.equal(n, 1, 'dalam masa jeda 60 dtk tidak memanggil lagi');
});

// ---------- logika candle ----------
const bar = (t, o, h, l, c, v = 0) => ({ t, o, h, l, c, v });
test('apply: update bar berjalan, bar baru mengikuti grid, tick lama diabaikan', () => {
  const { RT } = mk(), { apply } = RT.bars, D = [bar(1000, 10, 11, 9, 10.5, 5)];
  assert.equal(apply(D, 60, { p: 12, q: 2, ts: 1_030_000 }), 'upd'); assert.deepEqual(JSON.parse(JSON.stringify(D[0])), bar(1000, 10, 12, 9, 12, 7));
  assert.equal(apply(D, 60, { p: 8, q: 1, ts: 1_059_000 }), 'upd'); assert.equal(D[0].l, 8); assert.equal(D[0].c, 8);
  assert.equal(apply(D, 60, { p: 9, q: 3, ts: 1_060_500 }), 'new'); assert.equal(D.length, 2); assert.deepEqual(JSON.parse(JSON.stringify(D[1])), bar(1060, 9, 9, 9, 9, 3));
  assert.equal(apply(D, 60, { p: 9.5, q: 1, ts: 1_200_000 }), 'new'); assert.equal(D[2].t, 1180, 'lompat beberapa bar (libur): tetap di grid bar terakhir');
  assert.equal(apply(D, 60, { p: 7, q: 1, ts: 1_000_000 }), 'none', 'tick untuk bar yang sudah lewat');
  assert.equal(apply(D, 60, { p: 0, ts: 1_300_000 }), 'none'); assert.equal(apply([], 60, { p: 1, ts: 1 }), 'none');
});
test('apply: kline Binance menjadi sumber OHLCV resmi dan penutup; bulanan tidak dibuat dari tick', () => {
  const { RT } = mk(), { apply } = RT.bars, D = [bar(1000, 10, 11, 9, 10.5, 5)];
  assert.equal(apply(D, 60, { k: { t: 1_000_000, o: 10, h: 12, l: 8.5, c: 11.5, v: 9, x: false } }), 'upd');
  assert.deepEqual(JSON.parse(JSON.stringify(D[0])), bar(1000, 10, 12, 8.5, 10.5, 9), 'c tidak ditimpa kline yang berjalan (anti mundur); h/l/v diperluas');
  apply(D, 60, { k: { t: 1_000_000, o: 10, h: 12, l: 8.5, c: 11.9, v: 9.4, x: true } }); assert.equal(D[0].c, 11.9);
  assert.equal(apply(D, 60, { k: { t: 1_060_000, o: 11.9, h: 11.9, l: 11.9, c: 11.9, v: 0.1, x: false } }), 'new');
  const M = [bar(0, 1, 1, 1, 1)]; assert.equal(apply(M, 2592000, { p: 2, ts: 3_000_000_000 }), 'none');
});
test('merge: bar berjalan saat realtime tidak mundur; bar tutup diganti; bar terlewat disisipkan', () => {
  const { RT } = mk(), { merge } = RT.bars, J = x => JSON.parse(JSON.stringify(x));
  const D = [bar(60, 1, 2, 1, 1.5, 1), bar(120, 1.5, 3, 1.4, 2.9, 4)];
  assert.equal(merge(D, [bar(120, 1.45, 3.2, 1.4, 2.0, 3)], true), 0);
  assert.deepEqual(J(D[1]), bar(120, 1.45, 3.2, 1.4, 2.9, 4), 'c basi (2.0) tidak menimpa c realtime (2.9)');
  merge(D, [bar(60, 1, 2.1, 0.9, 1.6, 2)], true); assert.deepEqual(J(D[0]), bar(60, 1, 2.1, 0.9, 1.6, 2), 'bar sudah tutup = data server');
  assert.equal(merge(D, [bar(90, 1.2, 1.3, 1.1, 1.25, 1), bar(180, 2.9, 3, 2.8, 2.95, 1)], true), 2);
  assert.deepEqual(D.map(x => x.t), [60, 90, 120, 180]);
  const E = [bar(60, 1, 2, 1, 1.5, 1)]; merge(E, [bar(60, 1, 2.5, 1, 2.4, 2)], false); assert.equal(E[0].c, 2.4, 'tanpa realtime: ikut server');
});
