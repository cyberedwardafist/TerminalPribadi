import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SUPABASE_URL = 'https://fake.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv';
process.env.JWT_SECRET = 'j'.repeat(48); process.env.MAIL_PROVIDER = 'memory'; process.env.CRON_SECRET = 'c'.repeat(20); process.env.ADMIN_TOKEN = 'a'.repeat(20);
const { FakeDb, installFetch } = await import('./fakes.js');
const fdb = new FakeDb(), state = { price: {} };
installFetch(fdb, state);
const { handle } = await import('../lib/app.js');
const { outbox } = await import('../lib/mail.js');

let token = '';
const call = async (method, path, body, headers = {}) => {
  const isRaw = body instanceof Uint8Array || body instanceof FormData;
  const res = await handle(new Request('http://t' + path, { method, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body && !isRaw ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : isRaw ? body : JSON.stringify(body) }));
  const text = await res.text(); let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: res.status, body: j, headers: res.headers };
};
const lastCode = () => /(\d{6})/.exec(outbox.at(-1).text)[1];

test('auth: daftar -> OTP -> verifikasi -> login -> me', async () => {
  let r = await call('POST', '/api/auth/register', { name: 'Budi', username: 'Budi.T', email: 'budi@mail.id', password: 'rahasia123' });
  assert.equal(r.status, 200);
  r = await call('POST', '/api/auth/login', { username: 'budi.t', password: 'rahasia123' });
  assert.equal(r.status, 403); assert.equal(r.body.unverified, true);
  r = await call('POST', '/api/auth/otp/send', { purpose: 'register', email: 'budi@mail.id' });
  assert.equal(r.status, 429, 'cooldown 30 detik');
  r = await call('POST', '/api/auth/otp/verify', { purpose: 'register', email: 'budi@mail.id', code: '000000' });
  assert.equal(r.status, 400); assert.match(r.body.message, /Kode salah/);
  r = await call('POST', '/api/auth/otp/verify', { purpose: 'register', email: 'budi@mail.id', code: lastCode() });
  assert.equal(r.status, 200); assert.equal(r.body.user.username, 'budi.t');
  r = await call('POST', '/api/auth/login', { username: 'budi@mail.id', password: 'salah-salah' });
  assert.equal(r.status, 401);
  r = await call('POST', '/api/auth/login', { username: 'budi.t', password: 'rahasia123' });
  assert.equal(r.status, 200); token = r.body.token;
  r = await call('GET', '/api/auth/me'); assert.equal(r.body.user.email, 'budi@mail.id');
  assert.ok(!JSON.stringify(fdb.t.users).includes('rahasia123'), 'password tidak tersimpan polos');
  r = await call('POST', '/api/auth/register', { name: 'Lain', username: 'budi.t', email: 'x@y.id', password: 'abcdefgh' });
  assert.equal(r.status, 409);
});
test('auth: validasi, token rusak, avatar', async () => {
  let r = await call('POST', '/api/auth/register', { name: 'A', username: 'x', email: 'bad', password: '1' });
  assert.equal(r.status, 400);
  const saved = token; token = saved.slice(0, -3) + 'abc';
  assert.equal((await call('GET', '/api/auth/me')).status, 401); token = saved;
  assert.equal((await call('POST', '/api/auth/avatar', { image: 'data:image/png;base64,AAAA' })).status, 200);
  assert.equal((await call('POST', '/api/auth/avatar', { image: '<script>' })).status, 400);
  assert.equal((await call('GET', '/api/auth/me')).body.user.avatar, 'data:image/png;base64,AAAA');
});
test('auth: lupa password -> tiket -> reset, sesi lama mati', async () => {
  const old = token; token = '';
  assert.equal((await call('POST', '/api/auth/otp/send', { purpose: 'reset', email: 'tidak@ada.id' })).status, 200);
  const before = outbox.length;
  fdb.t.otps = fdb.t.otps.map(o => ({ ...o, sent_at: new Date(Date.now() - 60000).toISOString() }));
  assert.equal((await call('POST', '/api/auth/otp/send', { purpose: 'reset', email: 'budi@mail.id' })).status, 200);
  assert.equal(outbox.length, before + 1);
  let r = await call('POST', '/api/auth/otp/verify', { purpose: 'reset', email: 'budi@mail.id', code: lastCode() });
  assert.ok(r.body.ticket);
  assert.equal((await call('POST', '/api/auth/reset', { email: 'budi@mail.id', ticket: 'palsu', password: 'barubaru1' })).status, 400);
  assert.equal((await call('POST', '/api/auth/reset', { email: 'budi@mail.id', ticket: r.body.ticket, password: 'barubaru1' })).status, 200);
  token = old; assert.equal((await call('GET', '/api/auth/me')).status, 401, 'token lama dicabut');
  token = ''; r = await call('POST', '/api/auth/login', { username: 'budi.t', password: 'barubaru1' }); assert.equal(r.status, 200); token = r.body.token;
});
test('login dibatasi setelah terlalu banyak percobaan', async () => {
  const saved = token; token = '';
  let last; for (let i = 0; i < 10; i++) last = await call('POST', '/api/auth/login', { username: 'budi.t', password: 'x' + i + 'xxxxxx' });
  assert.equal(last.status, 429); assert.ok(last.headers.get('retry-after')); token = saved;
});

test('data pasar: candles, quotes, simbol, heatmap, screener, UDF', async () => {
  let r = await call('GET', '/api/candles?symbol=BTCUSDT&tf=1h&limit=50');
  assert.equal(r.status, 200); assert.equal(r.body.length, 50); assert.ok(r.body[0].t < r.body[49].t); assert.ok('o' in r.body[0] && 'v' in r.body[0]);
  r = await call('GET', '/api/candles?symbol=BTCUSDT&tf=1h&limit=1500'); assert.equal(r.body.length, 1500, 'paging Binance >1000');
  assert.equal((await call('GET', '/api/candles?symbol=BBCA&tf=1D&limit=100')).status, 200);
  assert.equal((await call('GET', '/api/candles?symbol=BTCUSDT&tf=7x')).status, 400);
  assert.equal((await call('GET', '/api/candles?symbol=%24%24')).status, 400);
  r = await call('GET', '/api/quotes?symbols=BTCUSDT,BBCA,EURUSD');
  assert.equal(r.body.length, 3);
  for (const q of r.body) for (const k of ['sym', 'name', 'market', 'price', 'changePct', 'volRatio', 'rsi14', 'pos52w', 'spark']) assert.ok(k in q, k);
  assert.equal(r.body[0].changePct, 1.5);
  assert.equal((await call('GET', '/api/symbols?q=bank')).body[0].market.length > 0, true);
  r = await call('GET', '/api/heatmap?market=kripto&range=1d'); assert.ok(r.body.length > 10); assert.ok(r.body.every(x => x.group && x.sym && typeof x.cap === 'number' && typeof x.changePct === 'number'));
  assert.equal((await call('GET', '/api/heatmap?market=salah')).status, 400);
  r = await call('GET', '/api/screener?type=up'); assert.equal(r.status, 200); assert.ok(r.body.every(q => q.changePct > 0));
  r = await call('GET', '/api/summary'); assert.ok(r.body.indices.length && r.body.status.kripto === 'open');
  r = await call('GET', '/api/udf/history?symbol=BTCUSDT&resolution=60&from=0&to=' + Math.floor(Date.now() / 1000) + '&countback=30');
  assert.equal(r.body.s, 'ok'); assert.equal(r.body.t.length, 30);
  r = await call('POST', '/api/indicators/compute', { symbol: 'BTCUSDT', tf: '1h', limit: 100, indicators: [{ id: 'rsi', params: { period: 14 } }, { id: 'macd' }, { id: 'bb', params: { period: 20 } }] });
  assert.equal(r.body.indicators.length, 3); assert.equal(r.body.indicators[0].series.rsi.length, 100);
  assert.equal((await call('POST', '/api/indicators/compute', { symbol: 'BTCUSDT', indicators: [{ id: 'ngawur' }] })).status, 400);
  assert.ok((await call('GET', '/api/indicators/builtin')).body.length >= 10);
});

test('watchlist: bawaan, buat, isi, ganti nama, hapus', async () => {
  let r = await call('GET', '/api/watchlists'); assert.equal(r.body.length, 1); assert.equal(r.body[0].symbols[0], 'BTCUSDT');
  r = await call('POST', '/api/watchlists', { name: 'Swing', symbols: ['bbca', 'tlkm'] }); assert.equal(r.status, 201); const id = r.body.id;
  assert.deepEqual(r.body.symbols, ['BBCA', 'TLKM']);
  assert.equal((await call('PUT', `/api/watchlists/${id}/symbols`, { symbols: ['AAPL', 'AAPL', 'NVDA'] })).body.symbols.length, 2);
  assert.equal((await call('PATCH', `/api/watchlists/${id}`, { name: 'Baru' })).body.name, 'Baru');
  assert.equal((await call('PUT', `/api/watchlists/${id}/symbols`, { symbols: ['bad sym'] })).status, 400);
  assert.equal((await call('DELETE', `/api/watchlists/${id}`)).status, 200);
  assert.equal((await call('DELETE', `/api/watchlists/${id}`)).status, 404);
});
test('alert: buat, picu lewat cron, notifikasi, hapus per simbol', async () => {
  let r = await call('POST', '/api/alerts', { symbol: 'BTCUSDT', price: 70000 }); assert.equal(r.status, 201); assert.equal(r.body.direction, 'above');
  assert.equal((await call('POST', '/api/alerts', { symbol: 'BTCUSDT', price: 60000 })).body.direction, 'below');
  assert.equal((await call('GET', '/api/cron/alerts')).status, 403);
  let c = await call('GET', '/api/cron/alerts', undefined, { authorization: 'Bearer ' + 'c'.repeat(20) });
  assert.equal(c.body.fired, 0);
  state.price.BTCUSDT = 71000;
  const { clearCache } = await import('../lib/cache.js'); clearCache();
  c = await call('GET', '/api/cron/alerts', undefined, { authorization: 'Bearer ' + 'c'.repeat(20) });
  assert.equal(c.body.fired, 1);
  r = await call('GET', '/api/notifications?unread=1'); assert.equal(r.body.length, 1); assert.match(r.body[0].title, /BTCUSDT/);
  assert.equal((await call('POST', '/api/notifications/read', { all: true })).body.updated, 1);
  assert.equal((await call('DELETE', '/api/alerts/BTCUSDT')).body.removed, 2, 'semua alert simbol itu, termasuk yang sudah terpicu');
  assert.ok((await call('GET', '/api/activity?limit=5')).body.length > 0);
});
test('catatan: disaring, CRUD, tag', async () => {
  let r = await call('POST', '/api/notes', { id: 'note-0001', cat: 'umum', html: '<div class="cl done evil">ok<script>alert(1)</script><img src=x onerror=1></div><a href="javascript:1">x</a>', tags: ['#Satu', 'satu', 'dua'] });
  assert.equal(r.status, 201); assert.equal(r.body.html, '<div class="cl done">ok</div>x'); assert.deepEqual(r.body.tags, ['satu', 'dua']);
  r = await call('PUT', '/api/notes/note-0001', { cat: 'ilmu', html: '<p>baru</p>', pin: true }); assert.equal(r.body.cat, 'ilmu'); assert.ok(r.body.upd >= r.body.cre);
  assert.equal((await call('GET', '/api/notes?cat=ilmu&tag=satu')).body.length, 0);
  assert.equal((await call('GET', '/api/notes?cat=ilmu')).body.length, 1);
  assert.equal((await call('DELETE', '/api/notes/note-0001')).status, 200);
});
test('jurnal: CRUD, validasi, ringkasan, gambar, impor', async () => {
  const t = { id: 'trade-0001', date: '2026-10-05', time: '09:30', timeEnd: '10:15', sym: 'bbca', side: 'buy', res: 'profit', amount: 250000, method: 'Breakout', fields: [{ k: 'Lot', v: '2' }], note: 'n', eval: 'e', imgs: [] };
  let r = await call('POST', '/api/journal/trades', t); assert.equal(r.status, 201); assert.equal(r.body.sym, 'BBCA'); assert.equal(r.body.amount, 250000);
  await call('POST', '/api/journal/trades', { ...t, id: 'trade-0002', res: 'loss', amount: 100000 });
  await call('POST', '/api/journal/trades', { ...t, id: 'trade-0003', date: '2026-11-01' });
  assert.equal((await call('POST', '/api/journal/trades', { ...t, date: '05-10-2026' })).status, 400);
  assert.equal((await call('POST', '/api/journal/trades', { ...t, res: 'menang' })).status, 400);
  r = await call('GET', '/api/journal/summary?month=2026-10'); assert.equal(r.body.days['2026-10-05'].net, 150000); assert.equal(r.body.totals.winRate, 50);
  assert.equal((await call('GET', '/api/journal/trades?from=2026-10-01&to=2026-10-31')).body.length, 2);
  r = await call('PUT', '/api/journal/trades/trade-0001', { ...t, amount: 1 }); assert.equal(r.body.amount, 1);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
  r = await call('POST', '/api/journal/images', png, { 'content-type': 'image/png' }); assert.equal(r.status, 201);
  const imgRes = await handle(new Request(`http://t/api/journal/images/${r.body.id}`, { headers: { authorization: 'Bearer ' + token } }));
  assert.equal(imgRes.headers.get('content-type'), 'image/png'); assert.equal((await imgRes.arrayBuffer()).byteLength, png.length);
  const fd = new FormData(); fd.set('file', new Blob([png], { type: 'image/png' }), 'a.png');
  assert.equal((await call('POST', '/api/journal/images', fd, {})).status, 201, 'multipart');
  assert.equal((await call('POST', '/api/journal/images', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), { 'content-type': 'image/png' })).status, 400, 'bukan gambar');
  // gambar dengan id dari klien (non-UUID), idempoten, bisa didaftar dan dihapus
  r = await call('POST', '/api/journal/images?id=lz3k9ab1x', png, { 'content-type': 'image/png' }); assert.equal(r.status, 201); assert.equal(r.body.id, 'lz3k9ab1x');
  r = await call('POST', '/api/journal/images?id=lz3k9ab1x', png, { 'content-type': 'image/png' }); assert.equal(r.status, 200); assert.equal(r.body.existed, true);
  assert.equal((await call('POST', '/api/journal/images?id=a', png, { 'content-type': 'image/png' })).status, 400, 'id pendek');
  r = await call('GET', '/api/journal/images'); assert.ok(r.body.some(x => x.id === 'lz3k9ab1x'));
  assert.equal((await handle(new Request('http://t/api/journal/images/lz3k9ab1x', { headers: { authorization: 'Bearer ' + token } }))).status, 200);
  assert.equal((await call('DELETE', '/api/journal/images/lz3k9ab1x')).status, 200);
  assert.equal((await handle(new Request('http://t/api/journal/images/lz3k9ab1x', { headers: { authorization: 'Bearer ' + token } }))).status, 404);
  r = await call('POST', '/api/import', { notes: [{ id: 'imp-note-1', html: '<b>x</b>' }], trades: [{ ...t, id: 'imp-trade-1' }, { id: 'bad-trade', date: 'x' }] });
  assert.equal(r.body.notes, 1); assert.equal(r.body.trades, 1); assert.equal(r.body.skipped.length, 1);
  assert.equal((await call('DELETE', '/api/journal/trades/trade-0001')).status, 200);
});
test('chart: layout, drawing, template, indikator custom, fork', async () => {
  assert.equal((await call('GET', '/api/chart/layout')).body.layout, null);
  const lay = { tabs: [{ sym: 'BTCUSDT', tf: '1h', inds: ['rsi'] }], active: 0 };
  assert.deepEqual((await call('PUT', '/api/chart/layout', { layout: lay })).body.layout, lay);
  assert.deepEqual((await call('GET', '/api/chart/layout')).body.layout, lay);
  let r = await call('POST', '/api/chart/layouts', { name: 'Scalping', layout: lay }); assert.equal(r.status, 201);
  assert.equal((await call('POST', '/api/chart/layouts', { name: 'Scalping' })).status, 409);
  assert.equal((await call('GET', '/api/chart/layouts')).body.length, 1);
  await call('PUT', '/api/chart/drawings/btcusdt', { drawings: [{ type: 'trendline', p: [[1, 2], [3, 4]] }] });
  assert.equal((await call('GET', '/api/chart/drawings/BTCUSDT')).body.drawings.length, 1);
  assert.equal((await call('POST', '/api/chart/templates', { kind: 'indicators', name: 'Trend', data: { list: ['ema', 'macd'] } })).status, 201);
  r = await call('POST', '/api/indicators', { name: 'My SMA Cross', source: 'return sma(close,10)', overlay: true, inputs: [{ key: 'n', def: 10 }], isPublic: true });
  assert.equal(r.status, 201); const id = r.body.id;
  r = await call('PUT', `/api/indicators/${id}`, { source: 'return sma(close,20)' }); assert.equal(r.body.version, 2);
  assert.equal((await call('GET', '/api/indicators')).body.length, 1);
  assert.equal((await call('POST', `/api/indicators/${id}/fork`)).status, 201);
  assert.equal((await call('GET', `/api/indicators/${id}`)).body.source, 'return sma(close,20)');
  assert.equal((await call('POST', '/api/indicators', { name: '', source: 'x' })).status, 400);
});
test('isolasi antar user: data user lain tidak terbaca', async () => {
  const a = token; token = '';
  await call('POST', '/api/auth/register', { name: 'Sari', username: 'sari', email: 'sari@mail.id', password: 'password99' });
  await call('POST', '/api/auth/otp/verify', { purpose: 'register', email: 'sari@mail.id', code: lastCode() });
  token = (await call('POST', '/api/auth/login', { username: 'sari', password: 'password99' })).body.token;
  assert.equal((await call('GET', '/api/journal/trades')).body.length, 0);
  assert.equal((await call('GET', '/api/notes')).body.length, 0);
  assert.equal((await call('DELETE', '/api/journal/trades/trade-0002')).status, 404);
  assert.equal((await call('GET', '/api/indicators')).body.length, 0);
  assert.equal((await call('GET', '/api/indicators?scope=public')).body.length, 1, 'hanya indikator yang ditandai publik terlihat');
  token = a;
});
test('berita + kalender + admin', async () => {
  fdb.t.news = [{ id: '11111111-1111-4111-8111-111111111111', url: 'https://x/1', title: 'IHSG menguat, BBCA cetak laba rekor', summary: 'Ringkas.', content: ['Paragraf satu yang cukup panjang untuk uji.'], source: 'Uji', category: 'idx', symbols: ['BBCA', 'IHSG'], sentiment: 'pos', published_at: '2026-10-19T03:00:00.000Z' }, { id: '22222222-2222-4222-8222-222222222222', url: 'https://x/2', title: 'Emas turun', summary: 'Gold slump.', content: [], source: 'Uji', category: 'com', symbols: ['XAUUSD'], sentiment: 'neg', published_at: '2026-10-18T03:00:00.000Z' }];
  fdb.t.kv_cache = [{ key: 'news:last', value: { at: Date.now() }, expires_at: new Date(Date.now() + 1e6).toISOString() }, { key: 'cal:last', value: { at: Date.now() }, expires_at: new Date(Date.now() + 1e6).toISOString() }];
  let r = await call('GET', '/api/news?category=idx'); assert.equal(r.body.length, 1); assert.ok(['id', 'ts', 'category', 'symbols', 'title', 'summary', 'source', 'sentiment', 'url'].every(k => k in r.body[0]));
  assert.equal((await call('GET', '/api/news?q=bbca laba')).body.length, 1);
  assert.equal((await call('GET', '/api/news?q=bbca emas')).body.length, 0, 'semua kata harus cocok');
  assert.equal((await call('GET', '/api/news?symbol=XAUUSD&sentiment=neg')).body.length, 1);
  assert.equal((await call('GET', '/api/news?sort=old')).body[0].id, '22222222-2222-4222-8222-222222222222');
  r = await call('GET', '/api/news/11111111-1111-4111-8111-111111111111'); assert.ok(r.body.content.length && r.body.keyPoints.length && Array.isArray(r.body.related));
  assert.equal((await call('POST', '/api/news/saved', { id: '11111111-1111-4111-8111-111111111111' })).status, 201);
  assert.equal((await call('GET', '/api/news/saved')).body.length, 1);
  assert.equal((await call('DELETE', '/api/news/saved/11111111-1111-4111-8111-111111111111')).status, 200);
  assert.equal((await call('GET', '/api/calendar?month=2026-13')).status, 400);
  assert.equal((await call('POST', '/api/admin/calendar', { events: [{ date: '2026-10-20', cat: 'idx', type: 'rups', title: 'RUPS BBCA', imp: 3 }] })).status, 403);
  r = await call('POST', '/api/admin/calendar', { events: [{ date: '2026-10-20', time: '10:00', cat: 'idx', type: 'rups', title: 'RUPS BBCA', sym: 'BBCA', imp: 3 }] }, { 'x-admin-token': 'a'.repeat(20) });
  assert.equal(r.body.upserted, 1);
  r = await call('GET', '/api/calendar?month=2026-10'); assert.equal(r.body.events.length, 1); assert.equal(r.body.events[0].type, 'rups'); assert.equal(r.body.news.length, 2); assert.ok(r.body.news.every(n => n.h && n.cat));
  const { refreshCalendar } = await import('../lib/calendar.js'); const c = await refreshCalendar(); assert.equal(c.economic, 1);
});
test('state per app: simpan, baca, tolak key asing', async () => {
  assert.equal((await call('GET', '/api/state/watchlist')).body.data, null);
  assert.equal((await call('PUT', '/api/state/watchlist', { data: { lists: [{ id: 1, name: 'A', syms: ['BBCA'] }], al: {} } })).status, 200);
  assert.equal((await call('GET', '/api/state/watchlist')).body.data.lists[0].name, 'A');
  assert.ok((await call('GET', '/api/state')).body.watchlist.updatedAt);
  assert.equal((await call('PUT', '/api/state/rahasia', { data: {} })).status, 400);
  assert.equal((await call('PUT', '/api/state/news', { data: 'x' })).status, 400);
});
test('pengaturan + CORS + 404/405', async () => {
  assert.deepEqual((await call('PUT', '/api/settings/preferences', { theme: 'dark', defaultTf: '4h', ngawur: 1 })).body, { theme: 'dark', defaultTf: '4h' });
  assert.equal((await call('PUT', '/api/settings/preferences', { theme: 'pelangi' })).status, 400);
  assert.equal((await call('GET', '/api/settings/preferences')).body.theme, 'dark');
  assert.equal((await call('PUT', '/api/settings/layout', { win: { chart: { x: 1 } } })).status, 200);
  const o = await call('OPTIONS', '/api/candles'); assert.equal(o.status, 204); assert.equal(o.headers.get('access-control-allow-origin'), '*');
  assert.equal((await call('PATCH', '/api/health')).status, 405);
  assert.equal((await call('GET', '/api/tidak-ada')).status, 404);
  assert.equal((await call('GET', '/api/health?deep=1')).body.db, 'ok');
});

// ===================== Umum/Background, perbaikan hasil audit =====================
const PNG = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4]);
test('pengaturan: nilai background dan reduceMotion divalidasi, DELETE mereset', async () => {
  assert.equal((await call('PUT', '/api/settings/preferences', { background: '<img src=x onerror=alert(1)>' })).status, 400);
  assert.equal((await call('PUT', '/api/settings/preferences', { background: 'laut', reduceMotion: null })).body.background, 'laut');
  assert.equal((await call('PUT', '/api/settings/preferences', { reduceMotion: 'ya' })).status, 400);
  assert.equal((await call('PUT', '/api/settings/preferences', { reduceMotion: true })).body.reduceMotion, true);
  const g = (await call('GET', '/api/settings/preferences')).body;
  assert.equal(g.background, 'laut'); assert.equal(g.theme, 'dark'); assert.equal(g.bgImage, null);
  assert.equal((await call('PUT', '/api/settings/preferences', 'x'.repeat(5000))).status, 413, 'body pengaturan dibatasi kecil');
  assert.equal((await call('DELETE', '/api/settings/preferences')).status, 200);
  assert.deepEqual((await call('GET', '/api/settings/preferences')).body, { bgImage: null });
});
test('gambar background sendiri: unggah, unduh, tolak format/ukuran, hapus', async () => {
  let r = await call('PUT', '/api/settings/background-image', PNG(), { 'content-type': 'image/png' });
  assert.equal(r.status, 200); assert.equal(r.body.mime, 'image/png'); assert.equal(r.body.size, 16);
  const res = await handle(new Request('http://t/api/settings/background-image', { headers: { authorization: 'Bearer ' + token } }));
  assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'image/png'); assert.equal((await res.arrayBuffer()).byteLength, 16);
  assert.equal((await call('GET', '/api/settings/preferences')).body.bgImage.size, 16);
  assert.equal((await call('PUT', '/api/settings/background-image', new TextEncoder().encode('<svg onload=alert(1)></svg>'), { 'content-type': 'image/png' })).status, 400, 'Content-Type palsu tidak dipercaya');
  assert.equal((await call('PUT', '/api/settings/background-image', new Uint8Array(3 * 1024 * 1024 + 10).fill(1), { 'content-type': 'image/png' })).status, 413);
  assert.equal((await call('GET', '/api/settings/preferences')).body.bgImage.size, 16, 'unggahan gagal tidak mengubah yang lama');
  assert.equal((await call('DELETE', '/api/settings/background-image')).status, 200);
  assert.equal((await call('GET', '/api/settings/background-image')).status, 404);
  assert.equal((await call('GET', '/api/settings/preferences')).body.bgImage, null);
  assert.ok(![...fdb.files.keys()].some(k => k.startsWith('backgrounds/')), 'file di storage ikut terhapus');
  const saved = token; token = ''; assert.equal((await call('GET', '/api/settings/background-image')).status, 401); token = saved;
});
test('jurnal: arah/hasil boleh kosong (sesuai skema), tanggal harus tanggal yang ada', async () => {
  const t = { date: '2026-10-02', time: '', timeEnd: '', sym: '', side: '', res: '', amount: 0, method: '', fields: [], note: '', eval: '', imgs: [] };
  assert.equal((await call('PUT', '/api/journal/trades/kosong-0001', t)).status, 200);
  assert.equal((await call('PUT', '/api/journal/trades/kosong-0002', { ...t, side: undefined, res: undefined })).status, 200);
  assert.equal((await call('PUT', '/api/journal/trades/salah-0001', { ...t, side: 'long' })).status, 400);
  assert.equal((await call('PUT', '/api/journal/trades/salah-0002', { ...t, date: '2026-02-31' })).status, 400);
  assert.equal((await call('PUT', '/api/journal/trades/salah-0003', { ...t, date: '2026-13-01' })).status, 400);
  assert.equal((await call('PUT', '/api/journal/trades/kabisat-01', { ...t, date: '2028-02-29' })).status, 200);
});
test('catatan: hasil saringan yang membengkak ditolak 400, bukan 500 dari check DB', async () => {
  assert.equal((await call('PUT', '/api/notes/besar-0001', { html: '<'.repeat(400000) })).status, 400);
  assert.equal((await call('PUT', '/api/notes/besar-0002', { html: '<p>aman</p>' })).status, 200);
});
test('OTP: tebakan paralel tetap dibatasi 5 kali', async () => {
  const saved = token; token = '';
  try {
    await call('POST', '/api/auth/register', { name: 'Paralel', username: 'paralel', email: 'par@mail.id', password: 'rahasia123' });
    const real = lastCode(), row = () => fdb.t.otps.find(o => o.email === 'par@mail.id');
    const wrong = n => Array.from({ length: n }, (_, i) => String(100000 + i)).filter(c => c !== real);
    const rs = await Promise.all(wrong(14).map(code => call('POST', '/api/auth/otp/verify', { purpose: 'register', email: 'par@mail.id', code })));
    assert.ok(rs.every(r => r.status === 400 || r.status === 429));
    const evaluated = rs.filter(r => /Kode salah/.test(r.body.message || '')).length;   // tebakan yang benar-benar dibandingkan dengan kode
    assert.ok(evaluated <= 5, evaluated + ' tebakan paralel dievaluasi (maks 5)');
    assert.equal(row().tries, evaluated, 'setiap tebakan yang dievaluasi mengambil tepat satu jatah');
    // tebakan salah berikutnya (berurutan) menghabiskan jatah; sesudah itu kode yang benar pun ditolak
    for (const code of wrong(8)) await call('POST', '/api/auth/otp/verify', { purpose: 'register', email: 'par@mail.id', code });
    assert.equal(row().tries, 5);
    const ok = await call('POST', '/api/auth/otp/verify', { purpose: 'register', email: 'par@mail.id', code: real });
    assert.equal(ok.status, 400); assert.match(ok.body.message, /Terlalu banyak/);
  } finally { token = saved; }
});
test('cron: rahasia hanya lewat header Authorization, bukan query', async () => {
  const saved = token; token = '';
  assert.equal((await call('GET', '/api/cron/cleanup?secret=' + 'c'.repeat(20))).status, 403);
  assert.equal((await call('GET', '/api/cron/cleanup', undefined, { authorization: 'Bearer ' + 'c'.repeat(20) })).status, 200);
  token = saved;
});
test('login: karakter khusus filter tidak membuat 500', async () => {
  const saved = token; token = '';
  for (const id of ['a"b', 'x),verified.eq.true', 'a\\b', '*', '"']) assert.equal((await call('POST', '/api/auth/login', { username: id, password: 'xxxxxxxx' })).status, 401, id);
  token = saved;
});
test('chart: layout bernama tidak bisa diganti jadi "default"', async () => {
  const a = await call('POST', '/api/chart/layouts', { name: 'Harian', layout: { x: 1 } });
  assert.equal(a.status, 201);
  assert.equal((await call('PUT', '/api/chart/layouts/' + a.body.id, { name: 'default' })).status, 400);
  assert.equal((await call('PUT', '/api/indicators/00000000-0000-4000-8000-000000000000', { name: 'x' })).status, 404);
});
test('daftar: email yang sama tidak bisa memicu email OTP berulang (anti banjir kotak masuk)', async () => {
  const saved = token; token = '';
  try {
    const n0 = outbox.length;
    assert.equal((await call('POST', '/api/auth/register', { name: 'Korban', username: 'korban1', email: 'korban@mail.id', password: 'rahasia123' })).status, 200);
    const r = await call('POST', '/api/auth/register', { name: 'Korban', username: 'korban2', email: 'korban@mail.id', password: 'rahasia123' });
    assert.equal(r.status, 429); assert.equal(outbox.length, n0 + 1, 'hanya satu email terkirim');
  } finally { token = saved; }
});

test('evaluateAlerts: alert di atas 1000 baris tetap diperiksa', async () => {
  const { evaluateAlerts } = await import('../lib/routes/user.js');
  const uid = '00000000-0000-4000-8000-000000000001';
  const rows = Array.from({ length: 1200 }, (_, i) => ({ id: crypto.randomUUID(), user_id: uid, symbol: 'ZZZTEST' + (i % 3), direction: 'above', price: 1e12, active: true, created_at: new Date(Date.now() - (1200 - i) * 1000).toISOString() }));
  fdb.tbl('alerts').push(...rows);
  const r = await evaluateAlerts().catch(e => ({ error: e.message }));
  assert.ok(r.checked >= 1200 || r.error, 'seluruh halaman dibaca: ' + JSON.stringify(r));
  fdb.t.alerts = fdb.tbl('alerts').filter(a => !a.symbol.startsWith('ZZZTEST'));
});

test('health?deep=1: status DB dan konfigurasi (tanpa nilai rahasia)', async () => {
  const r = await call('GET', '/api/health?deep=1');
  assert.equal(r.status, 200); assert.equal(r.body.db, 'ok');
  assert.equal(r.body.config.jwt_secret, true); assert.equal(r.body.config.mail_provider, 'memory');
  assert.ok(!JSON.stringify(r.body).includes('c'.repeat(20)) && !JSON.stringify(r.body).includes('j'.repeat(48)));
});
test('galat konfigurasi Supabase -> 503 jelas (bukan 500 generik) dan petunjuk di health', async () => {
  const db = await import('../lib/db.js');
  db.setFetch(async () => new Response(JSON.stringify({ message: 'Invalid API key' }), { status: 401 }));
  try {
    const r = await call('POST', '/api/auth/register', { name: 'Ani', username: 'ani.x', email: 'ani@mail.id', password: 'rahasia123' });
    assert.equal(r.status, 503); assert.match(r.body.message, /Database belum siap/);
    const h = await call('GET', '/api/health?deep=1');
    assert.equal(h.status, 503); assert.match(h.body.db_hint, /Key ditolak/);
  } finally { db.setFetch((...a) => fetch(...a)); }
});
test('admin mail-test: butuh token admin dan mengirim lewat provider aktif', async () => {
  let r = await call('POST', '/api/admin/mail-test', { to: 'x@mail.id' });
  assert.ok([401, 403].includes(r.status));
  const n = outbox.length;
  r = await call('POST', '/api/admin/mail-test', { to: 'x@mail.id' }, { 'x-admin-token': 'a'.repeat(20) });
  assert.equal(r.status, 200); assert.equal(r.body.provider, 'memory'); assert.equal(outbox.length, n + 1);
});

test('daftar: email gagal terkirim -> akun dan kode dibuang, tidak ada jeda 30 detik, bisa langsung coba lagi', async () => {
  const saved = token, old = { ...process.env }; token = '';
  Object.assign(process.env, { MAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_USER: 'a@x.id', SMTP_PASS: 'p' });
  try {
    const body = { name: 'Gagal', username: 'gagalkirim', email: 'gagal@mail.id', password: 'rahasia123' };
    let r = await call('POST', '/api/auth/register', body);
    assert.equal(r.status, 502); assert.match(r.body.message, /Email tidak bisa dikirim/);
    assert.ok(!fdb.t.otps.some(o => o.email === 'gagal@mail.id'), 'kode OTP tidak boleh tersisa');
    assert.ok(!fdb.t.users.some(u => u.email === 'gagal@mail.id'), 'akun belum terverifikasi dibuang');
    process.env.MAIL_PROVIDER = 'memory';   // SMTP sudah diperbaiki -> langsung berhasil tanpa menunggu 30 detik
    r = await call('POST', '/api/auth/register', body);
    assert.equal(r.status, 200); assert.match(outbox.at(-1).text, /\d{6}/);
  } finally { for (const k of ['MAIL_PROVIDER', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']) old[k] === undefined ? delete process.env[k] : (process.env[k] = old[k]); token = saved; }
});
test('admin mail-test {verify:true}: galat SMTP + petunjuk, tanpa kirim email', async () => {
  const old = { ...process.env };
  Object.assign(process.env, { MAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_USER: 'a@x.id', SMTP_PASS: 'p' });
  try {
    const r = await call('POST', '/api/admin/mail-test', { verify: true }, { 'x-admin-token': 'a'.repeat(20) });
    assert.equal(r.status, 502); assert.equal(r.body.ok, false); assert.match(r.body.hint, /SMTP_HOST|SMTP_PORT/);
    assert.ok(!JSON.stringify(r.body).includes('"p"'));
  } finally { for (const k of ['MAIL_PROVIDER', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']) old[k] === undefined ? delete process.env[k] : (process.env[k] = old[k]); }
});
