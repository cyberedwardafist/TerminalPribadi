// Menjalankan public/shared/live.js di "browser" tiruan (vm) yang terhubung ke backend asli (database tiruan di memori).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
process.env.SUPABASE_URL = 'https://fake.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv';
process.env.JWT_SECRET = 'j'.repeat(48); process.env.MAIL_PROVIDER = 'memory'; process.env.RATE_LIMIT = 'off';
const { FakeDb, installFetch } = await import('./fakes.js');
const fdb = new FakeDb(); installFetch(fdb, { price: {} });
const { handle } = await import('../lib/app.js');
const { outbox } = await import('../lib/mail.js');
const src = fs.readFileSync(new URL('../public/shared/live.js', import.meta.url), 'utf8');
const faultSrc = fs.readFileSync(new URL('../public/shared/fault.js', import.meta.url), 'utf8');

const j = async (method, path, body, token) => { const r = await handle(new Request('http://t' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined })); return { status: r.status, body: await r.json().catch(() => null) }; };
async function makeUser() {
  await j('POST', '/api/auth/register', { name: 'Tia', username: 'tia', email: 'tia@mail.id', password: 'password99' });
  await j('POST', '/api/auth/otp/verify', { purpose: 'register', email: 'tia@mail.id', code: /(\d{6})/.exec(outbox.at(-1).text)[1] });
  return (await j('POST', '/api/auth/login', { username: 'tia', password: 'password99' })).body.token;
}
function browser(token, store = {}, opt = {}) {
  class Storage { constructor() { this.m = new Map(Object.entries(store)); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }
  const localStorage = new Storage(), timers = [];
  const ctx = vm.createContext({ Storage, localStorage, console, setTimeout, clearTimeout, Event: class { constructor(t) { this.type = t; } }, URL, JSON, Promise, Math, Date, Object, Array, Set, Map, Error, atob, btoa, Blob, Uint8Array, String, matchMedia: () => ({ matches: false }),
    document: { hidden: false, addEventListener() {} }, addEventListener() {}, setInterval: f => timers.push(f), dispatchEvent() {},
    apiOn: () => true, sessToken: () => token, navigator: { onLine: true }, location: { protocol: 'http:', hostname: 'localhost' },
    apiFetch: opt.offline ? () => Promise.reject(new Error('jaringan putus')) : (path, o = {}) => handle(new Request('http://t' + path, { ...o, headers: { authorization: 'Bearer ' + token, ...(o.headers || {}) } })) });
  ctx.window = ctx;
  vm.runInContext(`var WATCH=[['BTCUSDT','Bitcoin',1,0,'cry'],['BBCA','BCA',1,0,'idx'],['EURUSD','EUR',1,0,'fx']];`, ctx);
  // stub global yang di aplikasi asli dibuat config.js / core.js / background.js
  vm.runInContext(`var CFG=Object.assign({theme:'auto',sym:'BTCUSDT',tf:'1h',still:null,api:{base:'',key:''}},JSON.parse(localStorage.getItem('tc.cfg')||'{}'));
   var theme=null;function applyTheme(){theme=CFG.theme}
   var S={bg:localStorage.getItem('bg')||'angin',still:false,sym:'BTCUSDT',tf:'1h'};var Bg={loads:0,load(){this.loads++}};`, ctx);
  vm.runInContext(faultSrc, ctx);
  vm.runInContext(src, ctx);
  return { ctx, localStorage, timers };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const note = (id, upd = 1) => ({ id, cat: 'ilmu', html: `<p>${id}</p>`, tags: [], pin: false, cre: 1, upd });

test('perangkat A: hidrasi pertama mengunggah data lokal, harga nyata masuk ke WATCH', async () => {
  const token = await makeUser();
  const a = browser(token, { 'tc.notes': JSON.stringify({ v: 2, notes: [note('catatan-a1')] }), 'tc.watchlist': JSON.stringify({ lists: [{ id: 1, name: 'Utama', syms: ['BBCA'] }], al: {} }) });
  await a.ctx.Live.ready;
  assert.equal(a.ctx.Live.on, true);
  assert.equal(a.ctx.Live.status, 'live');
  assert.equal((await j('GET', '/api/notes', null, token)).body.length, 1, 'catatan lokal terunggah');
  assert.equal((await j('GET', '/api/state/watchlist', null, token)).body.data.lists[0].name, 'Utama');
  const w = vm.runInContext('WATCH', a.ctx);
  assert.ok(w[0][2] > 1000, 'harga BTC dari /api/quotes'); assert.equal(w[0][3], 1.5);
  assert.ok(a.ctx.Live.extra.BTCUSDT.spark.length > 10);

  // tulis-balik: tambah catatan, ubah, hapus yang lama
  a.localStorage.setItem('tc.notes', JSON.stringify({ v: 2, notes: [note('catatan-a2'), note('catatan-a3')] }));
  // alert: dari state watchlist
  a.localStorage.setItem('tc.watchlist', JSON.stringify({ lists: [{ id: 1, name: 'Utama', syms: ['BBCA', 'BTCUSDT'] }], al: { BTCUSDT: { t: 90000, d: 1 } } }));
  await wait(1900); await wait(400);
  const ids = (await j('GET', '/api/notes', null, token)).body.map(n => n.id).sort();
  assert.deepEqual(ids, ['catatan-a2', 'catatan-a3']);
  const al = (await j('GET', '/api/alerts?active=1', null, token)).body;
  assert.equal(al.length, 1); assert.equal(al[0].symbol, 'BTCUSDT'); assert.equal(al[0].price, 90000);
  assert.equal((await j('GET', '/api/state/watchlist', null, token)).body.data.lists[0].syms.length, 2);

  // hapus alert di klien -> hilang di server
  a.localStorage.setItem('tc.watchlist', JSON.stringify({ lists: [], al: {} })); await wait(2300);
  assert.equal((await j('GET', '/api/alerts?active=1', null, token)).body.length, 0);
});
test('perangkat B: kosong, mengambil semua dari server (server menang)', async () => {
  const token = (await j('POST', '/api/auth/login', { username: 'tia', password: 'password99' })).body.token;
  const b = browser(token, { 'tc.notes': JSON.stringify({ v: 2, notes: [note('seed-lokal')] }) });
  await b.ctx.Live.ready;
  const notes = JSON.parse(b.localStorage.getItem('tc.notes'));
  assert.equal(notes.v, 2); assert.deepEqual(notes.notes.map(n => n.id).sort(), ['catatan-a2', 'catatan-a3']);
  assert.ok(JSON.parse(b.localStorage.getItem('tc.watchlist')).lists, 'state watchlist ikut turun');
  assert.equal((await j('GET', '/api/notes', null, token)).body.length, 2, 'seed lokal tidak menimpa server');
});
test('jurnal: tulis-balik trade dan hapus', async () => {
  const token = (await j('POST', '/api/auth/login', { username: 'tia', password: 'password99' })).body.token;
  const c = browser(token); await c.ctx.Live.ready;
  const t = { id: 'trade-xyz1', date: '2026-10-02', time: '09:00', timeEnd: '', sym: 'BBCA', side: 'buy', res: 'profit', amount: 5000, method: '', fields: [], note: '', eval: '', imgs: [], cre: 1, upd: 1 };
  c.localStorage.setItem('tc.journal', JSON.stringify({ v: 1, trades: [t] })); await wait(2200);
  assert.equal((await j('GET', '/api/journal/trades', null, token)).body.length, 1);
  c.localStorage.setItem('tc.journal', JSON.stringify({ v: 1, trades: [] })); await wait(2200);
  assert.equal((await j('GET', '/api/journal/trades', null, token)).body.length, 0);
});
test('tanpa token sesi server: tidak melakukan apa pun', async () => {
  const d = browser('');
  d.ctx.sessToken = () => ''; await d.ctx.Live.ready;
  assert.equal(d.ctx.Live.on, false);
  d.localStorage.setItem('tc.notes', '{"v":2,"notes":[]}'); await wait(1800);
});

test('gambar jurnal: antrean unggah dengan id klien, perangkat lain bisa mengunduh, hapus ikut terhapus', async () => {
  const token = await makeUser();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
  const blobs = { 'img-test-0001': new Blob([png], { type: 'image/png' }) };
  const a = browser(token); await a.ctx.Live.ready;
  a.ctx.Live.bindImages({ get: async id => blobs[id] });
  a.ctx.Live.img.up('img-test-0001'); a.ctx.Live.img.up('hilang-lokal-9');   // yang kedua tidak ada di IndexedDB -> dibuang dari antrean
  await wait(1500);
  const list = (await j('GET', '/api/journal/images', null, token)).body;
  assert.deepEqual(list.map(x => x.id), ['img-test-0001']);
  assert.equal(a.localStorage.getItem('tc.img.pending'), '[]', 'antrean kosong setelah terkirim');
  const b = browser(token); await b.ctx.Live.ready;
  const got = await b.ctx.Live.img.down('img-test-0001');
  assert.equal(got.size, png.length); assert.equal(got.type, 'image/png');
  assert.equal(await b.ctx.Live.img.down('tidak-ada-123'), null);
  b.ctx.Live.img.rm('img-test-0001'); await wait(400);
  assert.equal((await j('GET', '/api/journal/images', null, token)).body.length, 0);
});

test('pengaturan Umum/Background: lintas perangkat, gambar sendiri, blok api tidak ikut', async () => {
  const token = await makeUser();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4]);
  const dataUrl = 'data:image/png;base64,' + png.toString('base64');
  const prefs = async () => (await j('GET', '/api/settings/preferences', null, token)).body;
  const run = (b, code) => vm.runInContext(code, b.ctx);

  // perangkat A: pengaturan sudah diubah secara lokal (+ rahasia di blok api) -> terunggah pertama kali
  const a = browser(token, { 'tc.cfg': JSON.stringify({ theme: 'dark', sym: 'BBCA', tf: '5m', still: true, api: { key: 'RAHASIA-API' } }), bg: 'custom', 'bg.img': dataUrl });
  await a.ctx.Live.ready; await wait(600);
  let p = await prefs();
  assert.equal(p.theme, 'dark'); assert.equal(p.defaultSymbol, 'BBCA'); assert.equal(p.defaultTf, '5m'); assert.equal(p.background, 'custom'); assert.equal(p.reduceMotion, true);
  assert.ok(!JSON.stringify(p).includes('RAHASIA-API'), 'key API tidak boleh sampai ke server');
  assert.equal(p.bgImage.size, png.length, 'gambar lokal lama terunggah');
  assert.equal(a.localStorage.getItem('bg.img.v'), String(p.bgImage.ts));

  // perangkat B: kosong -> menerima pengaturan dan gambar dari server
  const b = browser(token); await b.ctx.Live.ready;
  b.ctx.Live.applySettings();
  assert.equal(run(b, 'CFG.theme'), 'dark'); assert.equal(run(b, 'theme'), 'dark'); assert.equal(run(b, 'S.bg'), 'custom');
  assert.equal(run(b, 'S.sym'), 'BBCA'); assert.equal(run(b, 'S.tf'), '5m'); assert.equal(run(b, 'S.still'), true);
  assert.equal(JSON.parse(b.localStorage.getItem('tc.cfg')).api.key, '', 'blok api lokal B tidak tertimpa');
  await wait(600);
  assert.equal(b.localStorage.getItem('bg.img'), dataUrl, 'gambar diunduh dan sama persis'); assert.ok(run(b, 'Bg.loads') > 0);

  // B mengubah tema -> hanya kunci yang berubah dikirim; yang lain di server utuh
  run(b, "CFG.theme='light'"); b.localStorage.setItem('tc.cfg', JSON.stringify(run(b, 'CFG'))); await wait(1900);
  p = await prefs(); assert.equal(p.theme, 'light'); assert.equal(p.defaultSymbol, 'BBCA'); assert.equal(p.background, 'custom');
  // pengaturan api saja diubah -> tidak ada permintaan baru yang mengubah server
  const before = JSON.stringify(await prefs());
  run(b, "CFG.api.key='kunci-baru'"); b.localStorage.setItem('tc.cfg', JSON.stringify(run(b, 'CFG'))); await wait(1900);
  assert.equal(JSON.stringify(await prefs()), before);

  const ts = p.bgImage.ts;

  // B menghapus gambar dan kembali ke Angin
  b.localStorage.removeItem('bg.img'); b.localStorage.setItem('bg', 'angin'); await wait(1900);
  p = await prefs(); assert.equal(p.bgImage, null); assert.equal(p.background, 'angin');
  assert.equal((await j('GET', '/api/settings/background-image', null, token)).status, 404);

  // perangkat C (sudah pernah tersinkron, offline saat B menghapus) membuka aplikasi: gambar yang sudah dihapus di perangkat lain ikut dibuang lokal
  const c = browser(token, { 'bg.img': dataUrl, 'bg.img.v': String(ts), bg: 'custom' });
  await c.ctx.Live.ready; await wait(600);
  assert.equal(c.localStorage.getItem('bg.img'), null); assert.equal(c.localStorage.getItem('bg'), 'angin');

  // reset semua pengaturan mengosongkan server (kalau tidak, hidrasi berikutnya mengembalikannya)
  await b.ctx.Live.resetSettings();
  assert.deepEqual(await prefs(), { bgImage: null });
});
test('pengaturan: hidrasi gagal tidak menghapus gambar lokal', async () => {
  const token = await makeUser();
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  const d = browser(token, { 'bg.img': dataUrl, 'bg.img.v': '123', bg: 'custom' }, { offline: true });
  await d.ctx.Live.ready; await wait(300);
  assert.match(d.ctx.Live.status, /sebagian/);
  assert.equal(d.localStorage.getItem('bg.img'), dataUrl, 'tidak ada kesimpulan "dihapus di server" bila server tak terjangkau');
});
