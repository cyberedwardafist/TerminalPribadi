// shared/fault.js: klasifikasi penyebab kegagalan (internet / server / sumber data) dan panel SVG-nya.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../public/shared/fault.js', import.meta.url), 'utf8');

function env({ online = true, net = true, srv = true } = {}) {
  const ctx = vm.createContext({
    console, Promise, Error, Date, Math, JSON, setTimeout, clearTimeout, AbortController, String, Number,
    document: { addEventListener() {} }, navigator: { onLine: online }, location: { protocol: 'https:', hostname: 'app.vercel.app' },
    CFG: { api: { key: '', timeout: 8000 } }, apiOn: () => true, sessToken: () => 'tok', apiUrl: p => 'https://app.vercel.app' + p,
    fetch: u => (String(u).includes('/api/health') ? (srv ? Promise.resolve({ status: 200 }) : Promise.reject(new TypeError('x'))) : (net ? Promise.resolve({}) : Promise.reject(new TypeError('x')))),
  });
  ctx.window = ctx; vm.runInContext(src, ctx); return ctx;
}
const http = (E, status, message = '') => new E.ApiError('http', { status, message, path: '/api/quotes?symbols=A,B' });

test('fault: jaringan putus + internet mati = offline, rantai putus di Internet', async () => {
  const E = env({ online: false, net: false, srv: false }), i = await E.Fault.explain(new E.ApiError('net', { path: '/api/x' }), { what: 'quotes' });
  assert.equal(i.kind, 'offline'); assert.deepEqual([...i.st], ['ok', 'fail', 'idle', 'idle']);
});
test('fault: internet normal tapi server diam = down, putus di Server', async () => {
  const E = env({ srv: false }), i = await E.Fault.explain(new E.ApiError('timeout', { ms: 8000, path: '/api/x' }), { what: 'quotes', fresh: true });
  assert.equal(i.kind, 'down'); assert.deepEqual([...i.st], ['ok', 'ok', 'fail', 'idle']);
});
test('fault: server hidup tapi permintaan lambat = slow (bukan server mati)', async () => {
  const E = env(), i = await E.Fault.explain(new E.ApiError('timeout', { ms: 8000, path: '/api/x' }), { what: 'news', fresh: true });
  assert.equal(i.kind, 'slow');
});
test('fault: status HTTP dipetakan ke penyebab yang tepat', async () => {
  const E = env(), k = async (st, m, w = 'quotes') => (await E.Fault.explain(http(E, st, m), { what: w }));
  assert.equal((await k(502, 'Sumber data pasar sedang tidak bisa dihubungi')).kind, 'upstream');
  assert.deepEqual([...(await k(502)).st], ['ok', 'ok', 'ok', 'fail']);
  assert.equal((await k(503, 'Database belum siap. Periksa pengaturan Supabase')).kind, 'db');
  assert.equal((await k(401)).kind, 'auth');
  assert.equal((await k(404)).kind, 'nobackend');
  assert.equal((await k(429)).kind, 'rate');
  assert.equal((await k(500)).kind, 'server');
  assert.match((await k(502, '', 'news')).title, /berita/i);
});
test('fault: tanpa alamat server / tanpa token / respons kosong / bukan JSON', async () => {
  const E = env(), x = (k, o) => E.Fault.explain(new E.ApiError(k, o), { what: 'heatmap' });
  assert.equal((await x('mode')).kind, 'mode'); assert.equal((await x('noauth')).kind, 'noauth');
  assert.equal((await x('empty')).kind, 'empty'); assert.equal((await x('parse')).kind, 'nobackend');
});
test('fault: panel SVG memuat judul penyebab dan status tiap mata rantai; query panjang dipangkas', async () => {
  const E = env(), i = await E.Fault.explain(http(E, 502, 'x'), { what: 'quotes' }), h = E.Fault.html(i);
  assert.match(h, /<svg class="ft-chain"/); assert.match(h, /Sumber data: gagal/); assert.match(h, /Sumber data pasar tidak menjawab/); assert.match(i.tech, /symbols=…/);
  assert.match(E.Fault.strip(i, Date.now()), /Menampilkan data dari/);
});
