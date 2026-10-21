// Sisi server realtime IDX: pengurai respons tahan-bentuk, GoAPI + OHLC.dev paralel, rute /api/rt/quote.
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL = 'https://fake.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv';
process.env.JWT_SECRET = 'j'.repeat(48); process.env.MAIL_PROVIDER = 'memory'; process.env.PUBLIC_MARKET = '1'; process.env.RATE_LIMIT = 'off';
const { pickQuote } = await import('../lib/providers/quote-parse.js');

const NOW = Date.parse('2026-10-21T03:00:00Z');
test('pickQuote: berbagai bentuk respons dan waktu', () => {
  let q = pickQuote({ status: 'success', data: { results: [{ symbol: 'BBRI', close: 4600 }, { symbol: 'BBCA', close: '9,825', change_pct: 1 }] } }, 'BBCA', NOW);
  assert.equal(q.price, 9825); assert.equal(q.tsp, false); assert.equal(q.ts, NOW, 'tanpa waktu penyedia -> waktu terima');
  q = pickQuote({ data: { ticker: 'BBCA.JK', price: 9830, updated_at: '2026-10-21T02:59:58Z' } }, 'BBCA', NOW);
  assert.equal(q.price, 9830); assert.equal(q.tsp, true); assert.equal(q.ts, NOW - 2000);
  q = pickQuote([{ s: 'BBCA', c: 9840, timestamp: 1_792_551_598 }], 'BBCA', NOW); assert.equal(q.price, 9840); assert.equal(q.tsp, true);
  q = pickQuote({ results: [{ code: 'BBCA', last: 9850, date: '2026-10-21' }] }, 'BBCA', NOW); assert.equal(q.tsp, false, 'tanggal saja tidak dipercaya sebagai waktu');
  q = pickQuote({ result: { regularMarketPrice: 9860, time: '2020-01-01T00:00:00Z' } }, 'BBCA', NOW); assert.equal(q.tsp, false, 'waktu terlalu lama tidak dipercaya');
  assert.equal(pickQuote({ data: { results: [{ symbol: 'BBRI', close: 1 }, { symbol: 'TLKM', close: 2 }] } }, 'BBCA', NOW), null, 'simbol lain tidak boleh dikira BBCA');
  assert.equal(pickQuote({ data: { results: [{ symbol: 'BBCA', close: 0 }] } }, 'BBCA', NOW), null);
  assert.equal(pickQuote(null, 'BBCA', NOW), null); assert.equal(pickQuote({ error: 'x' }, 'BBCA', NOW), null);
});

const realFetch = globalThis.fetch;
const calls = [];
function stub(map) { globalThis.fetch = async (u, o = {}) => { const url = String(u); calls.push({ url, headers: o.headers }); for (const [k, f] of Object.entries(map)) if (url.includes(k)) return f(url, o); return realFetch(u, o); }; }
const ok = j => ({ ok: true, status: 200, json: async () => j });

test('rtQuotes: dua penyedia paralel, yang gagal dilewati, kunci dikirim lewat header', async () => {
  process.env.GOAPI_API_KEY = 'gk'; process.env.OHLCDEV_API_KEY = 'ok'; process.env.OHLCDEV_URL = 'https://ohlc.p.rapidapi.com/quote?symbol={jk}';
  stub({ 'api.goapi.io': () => ok({ data: { results: [{ symbol: 'BBCA', close: 9825 }] } }), 'ohlc.p.rapidapi.com': () => ({ ok: false, status: 503 }) });
  const { rtQuotes } = await import('../lib/realtime.js');
  const r = await rtQuotes('BBCA');
  assert.deepEqual(r.enabled, ['goapi', 'ohlcdev']); assert.equal(r.sources.length, 1); assert.equal(r.sources[0].src, 'goapi'); assert.equal(r.sources[0].price, 9825);
  assert.equal(calls.find(c => c.url.includes('goapi')).headers['X-API-KEY'], 'gk');
  const oc = calls.find(c => c.url.includes('rapidapi')); assert.match(oc.url, /symbol=BBCA\.JK$/); assert.equal(oc.headers['x-rapidapi-key'], 'ok'); assert.equal(oc.headers['x-rapidapi-host'], 'ohlc.p.rapidapi.com');
  const g = () => calls.filter(c => c.url.includes('goapi')).length, n = g(); await rtQuotes('BBCA'); assert.equal(g(), n, 'dedupe/cache 900 ms: respons sukses dipakai ulang, tidak memanggil lagi (yang gagal tidak di-cache)');
});

test('rute /api/rt/quote: idx berisi sumber, non-idx kosong, simbol asing 404, tanpa cache', async () => {
  stub({ 'api.goapi.io': () => ok({ data: { results: [{ symbol: 'TLKM', close: 3410 }] } }), 'ohlc.p.rapidapi.com': () => ok({ price: 3412 }) });
  const { handle } = await import('../lib/app.js');
  let res = await handle(new Request('http://t/api/rt/quote?symbol=TLKM')); let j = await res.json();
  assert.equal(res.status, 200); assert.match(res.headers.get('cache-control'), /no-store/); assert.deepEqual(j.sources.map(s => s.src).sort(), ['goapi', 'ohlcdev']);
  res = await handle(new Request('http://t/api/rt/quote?symbol=AAPL')); j = await res.json(); assert.deepEqual(j.sources, []);
  res = await handle(new Request('http://t/api/rt/quote?symbol=ZZZZ')); j = await res.json(); assert.equal(res.status, 200); assert.deepEqual(j.sources, [], 'bukan IDX -> tidak memanggil penyedia IDX');
  res = await handle(new Request('http://t/api/rt/quote?symbol=%3Cscript%3E')); assert.ok(res.status >= 400 && res.status < 500, 'simbol tidak valid ditolak');
});

test('tanpa kunci: enabled kosong', async () => {
  delete process.env.GOAPI_API_KEY; delete process.env.OHLCDEV_API_KEY; delete process.env.OHLCDEV_URL;
  const { rtQuotes } = await import('../lib/realtime.js'); const r = await rtQuotes('BBRI'); assert.deepEqual(r, { enabled: [], sources: [] });
});
test('/api/candles limit kecil: cache pendek untuk polling bar terakhir', async () => {
  const { handle } = await import('../lib/app.js');
  stub({ 'data-api.binance.vision': () => ok([[1_700_000_000_000, '1', '2', '0.5', '1.5', '10']]) });
  const res = await handle(new Request('http://t/api/candles?symbol=BTCUSDT&tf=1m&limit=3')); assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /s-maxage=1(,|$)/, 'CDN/browser tidak boleh menahan bar terakhir lebih dari 1 dtk');
});
globalThis.fetch = realFetch;
