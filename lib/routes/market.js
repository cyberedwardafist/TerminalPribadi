// Data pasar: candles, quotes, simbol, heatmap, pemindai, ringkasan, indikator, UDF (kompatibel TradingView Charting Library), stream SSE.
import { get, post } from '../router.js';
import { v, marketJson, badRequest, notFound, json, HttpError, normSym } from '../http.js';
import { getCandles, getQuotes, getHeatmap, getScreener, getSummary, need, TIMEFRAMES, tfSeconds, lastPrices, marketStatus } from '../market.js';
import { resolve, search as searchCatalog, catalog, symbolType, sessionOf, MARKET_LABEL } from '../catalog.js';
import * as yahoo from '../providers/yahoo.js';
import { compute, builtinList } from '../indicators.js';
import { softLimit } from '../ratelimit.js';
import { authenticate } from '../auth.js';
import * as db from '../db.js';

const M = { market: true };

// GET /api/candles?symbol=BTCUSDT&tf=1h&limit=700&to=<detik epoch> -> [{t,o,h,l,c,v}] terurut naik
get('/api/candles', async ctx => {
  softLimit(ctx, 'candles', 240);
  const symbol = normSym(ctx.query.symbol), tf = v.str(ctx.query.tf || '1h', 'tf', { max: 4 });
  const limit = v.int(ctx.query.limit || 700, 'limit', { min: 1, max: 5000 }), to = ctx.query.to ? v.num(ctx.query.to > 1e12 ? ctx.query.to / 1000 : ctx.query.to, 'to', { min: 1 }) : undefined;
  const data = await getCandles(symbol, tf, { limit, to });
  return marketJson(data, to ? 3600 : tf === '1m' ? 3 : 8);
}, M);

get('/api/timeframes', () => marketJson(TIMEFRAMES, 3600), M);

// GET /api/quotes?symbols=A,B  (maks 50)
get('/api/quotes', async ctx => {
  softLimit(ctx, 'quotes', 120);
  const list = [...new Set(String(ctx.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean).map(normSym))];
  if (!list.length) throw badRequest('symbols wajib diisi, contoh: ?symbols=BTCUSDT,BBCA');
  if (list.length > 50) throw badRequest('Maksimal 50 simbol per permintaan');
  return marketJson(await getQuotes(list), 3);
}, M);

// pencarian simbol: katalog lokal dulu; bila sedikit hasil dan ?remote=1, tambah pencarian Yahoo
get('/api/symbols', async ctx => {
  const limit = Math.min(50, +ctx.query.limit || 20), mk = ctx.query.market;
  let out = searchCatalog(ctx.query.q, { market: mk, limit });
  if (ctx.query.remote === '1' && ctx.query.q && out.length < 5) {
    softLimit(ctx, 'symremote', 30);   // memanggil Yahoo; jangan biarkan satu akun menghabiskan kuota
    try {
      const extra = await yahoo.search(String(ctx.query.q).slice(0, 40), 8);
      for (const x of extra) if (!out.some(o => o.sym === x.symbol)) out.push({ sym: x.symbol, name: x.name, market: x.symbol.endsWith('.JK') ? 'idx' : x.symbol.startsWith('^') ? 'ind' : 'us', exchange: x.exchange, remote: true });
    } catch { /* abaikan */ }
  }
  return marketJson(out.slice(0, limit), 60);
}, M);
get('/api/symbols/:sym', ctx => {
  const e = resolve(ctx.params.sym); if (!e) throw notFound('Simbol tidak dikenal');
  return marketJson({ sym: e.sym, name: e.name, market: e.market, marketLabel: MARKET_LABEL[e.market], exchange: e.exchange, provider: e.provider, supported: !!e.provider, ...sessionOf(e) }, 3600);
}, M);

get('/api/heatmap', async ctx => marketJson(await getHeatmap(String(ctx.query.market || 'ihsg'), String(ctx.query.range || '1d').toLowerCase()), 120), M);
get('/api/screener', async ctx => marketJson(await getScreener(String(ctx.query.type || 'up'), Math.min(50, +ctx.query.limit || 20)), 60), M);
get('/api/summary', async () => marketJson(await getSummary(), 15), M);
get('/api/market/status', () => marketJson(marketStatus(), 30), M);

// ===================== indikator bawaan =====================
get('/api/indicators/builtin', () => marketJson(builtinList(), 3600), M);
// POST /api/indicators/compute {symbol, tf, limit, indicators:[{id,params}]} -> hitung di server dari candle yang sama
post('/api/indicators/compute', async ctx => {
  softLimit(ctx, 'compute', 60);
  const b = await ctx.json(), symbol = normSym(b.symbol), tf = v.str(b.tf || '1h', 'tf', { max: 4 });
  const list = v.arr(b.indicators, 'indicators', { max: 12 });
  const limit = v.int(b.limit || 500, 'limit', { min: 20, max: 2000 });
  const bars = await getCandles(symbol, tf, { limit });
  const results = list.map(i => { const r = compute(String(i.id), bars, i.params || {}); if (!r) throw badRequest(`Indikator tidak dikenal: ${i.id}`); return r; });
  return json({ symbol, tf, t: bars.map(x => x.t), indicators: results }, 200, { 'cache-control': 'private, no-store' });
}, M);

// ===================== UDF (TradingView Charting Library datafeed) =====================
const RES = { '1': '1m', '3': '5m', '5': '5m', '15': '15m', '30': '30m', '60': '1h', '240': '4h', D: '1D', '1D': '1D', W: '1W', '1W': '1W', M: '1M', '1M': '1M' };
const decimals = p => { if (!(p > 0)) return 2; if (p >= 1000) return 2; if (p >= 10) return 3; if (p >= 1) return 4; if (p >= 0.01) return 6; return 8; };
get('/api/udf/config', () => marketJson({
  supports_search: true, supports_group_request: false, supports_marks: false, supports_timescale_marks: false, supports_time: true,
  exchanges: [{ value: '', name: 'Semua', desc: '' }, { value: 'IDX', name: 'IDX', desc: 'Bursa Efek Indonesia' }, { value: 'BINANCE', name: 'Binance', desc: 'Kripto' }, { value: 'US', name: 'US', desc: 'Saham AS' }, { value: 'FX', name: 'Forex', desc: '' }],
  symbols_types: [{ name: 'Semua', value: '' }, { name: 'Saham', value: 'stock' }, { name: 'Kripto', value: 'crypto' }, { name: 'Forex', value: 'forex' }, { name: 'Indeks', value: 'index' }, { name: 'Komoditas', value: 'commodity' }],
  supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'],
}, 3600), M);
get('/api/udf/time', () => new Response(String(Math.floor(Date.now() / 1000)), { headers: { 'content-type': 'text/plain' } }), M);
get('/api/udf/symbols', async ctx => {
  const e = resolve(String(ctx.query.symbol || '').split(':').pop()); if (!e) return json({ s: 'error', errmsg: 'Simbol tidak dikenal' }, 404);
  let ps = 100; try { const c = await getCandles(e.sym, '1D', { limit: 2 }); ps = Math.pow(10, decimals(c.at(-1)?.c)); } catch { /* default */ }
  const s = sessionOf(e);
  return marketJson({ name: e.sym, ticker: e.sym, description: e.name, type: symbolType(e), session: s.session, timezone: s.timezone, exchange: e.exchange, listed_exchange: e.exchange, minmov: 1, pricescale: ps, has_intraday: true, has_daily: true, has_weekly_and_monthly: true, supported_resolutions: ['1', '5', '15', '30', '60', '240', '1D', '1W', '1M'], volume_precision: 0, data_status: 'streaming' }, 600);
}, M);
get('/api/udf/search', ctx => {
  const t = String(ctx.query.type || ''), ex = String(ctx.query.exchange || '');
  const out = searchCatalog(ctx.query.query, { limit: 80 }).filter(r => (!ex || r.exchange === ex) && (!t || symbolType({ market: r.market }) === t)).slice(0, Math.min(50, +ctx.query.limit || 30));
  return marketJson(out.map(r => ({ symbol: r.sym, full_name: r.sym, description: r.name, exchange: r.exchange, ticker: r.sym, type: symbolType({ market: r.market }) })), 60);
}, M);
get('/api/udf/history', async ctx => {
  const e = need(String(ctx.query.symbol || '').split(':').pop()), tf = RES[String(ctx.query.resolution)];
  if (!tf) return json({ s: 'error', errmsg: 'Resolusi tidak didukung' }, 400);
  const from = +ctx.query.from || 0, to = +ctx.query.to || Math.floor(Date.now() / 1000), cb = Math.min(5000, +ctx.query.countback || 0);
  const want = cb || Math.min(5000, Math.max(50, Math.ceil((to - from) / tfSeconds(tf)) + 5));
  const bars = (await getCandles(e.sym, tf, { limit: want, to: to < Date.now() / 1000 - 60 ? to : undefined })).filter(b => b.t <= to && (cb || b.t >= from));
  if (!bars.length) return marketJson({ s: 'no_data' }, 10);
  return marketJson({ s: 'ok', t: bars.map(b => b.t), o: bars.map(b => b.o), h: bars.map(b => b.h), l: bars.map(b => b.l), c: bars.map(b => b.c), v: bars.map(b => b.v) }, 5);
}, M);

// ===================== SSE: harga + notifikasi live =====================
// GET /api/stream?symbols=A,B&token=JWT  (EventSource tidak bisa kirim header, jadi token lewat query). Sesi ±55 detik lalu klien tersambung ulang otomatis.
get('/api/stream', async ctx => {
  const user = await authenticate(ctx, { allowQueryToken: true });
  const list = [...new Set(String(ctx.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean).map(normSym))].slice(0, 30);
  const enc = new TextEncoder(), end = Date.now() + 55_000, every = Math.max(2000, Math.min(15000, +ctx.query.interval || 3000));
  let seenNoti = new Date().toISOString(), closed = false;
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (ev, data) => { if (!closed) ctrl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`)); };
      ctrl.enqueue(enc.encode('retry: 2000\n: connected\n\n'));
      let tick = 0;
      while (!closed && Date.now() < end) {
        try {
          if (list.length) { const m = await lastPrices(list); send('quotes', [...m].map(([sym, q]) => ({ sym, price: q.price, changePct: +q.changePct.toFixed(2), ts: Date.now() }))); }
          if (tick++ % 3 === 0) {
            const n = await db.select('notifications', { user_id: db.eq(user.id), created_at: db.gt(seenNoti), order: 'created_at.asc', limit: 20 }).catch(() => []);
            for (const x of n) { send('notification', { id: x.id, type: x.type, title: x.title, body: x.body, data: x.data }); seenNoti = x.created_at; }
          }
          if (!closed) ctrl.enqueue(enc.encode(': ping\n\n'));
        } catch { /* lewati tick yang gagal */ }
        await new Promise(r => setTimeout(r, every));
      }
      if (!closed) ctrl.close();
    },
    cancel() { closed = true; },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' } });
}, { public: true });
