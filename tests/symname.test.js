// shared/symname.js: nama lengkap + bursa untuk header chart ala TradingView.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

function mk(fetchImpl) {
  const ctx = vm.createContext({ Map, Set, String, Promise, WATCH: [['FOOX', 'Foo Corp', null, null, 'idx']], apiOn: () => !!fetchImpl, apiFetch: fetchImpl });
  return vm.runInContext(fs.readFileSync(new URL('../public/shared/symname.js', import.meta.url), 'utf8') + ';SymName', ctx);
}
const J = x => JSON.parse(JSON.stringify(x));

test('IDX: nama resmi lengkap + bursa IDX (BBCA = PT Bank Central Asia Tbk · IDX)', () => {
  const S = mk();
  assert.deepEqual(J(S.info('BBCA')), { name: 'PT Bank Central Asia Tbk', ex: 'IDX', full: true });
  assert.equal(S.info('BBRI').name, 'PT Bank Rakyat Indonesia (Persero) Tbk'); assert.equal(S.info('TLKM').name, 'PT Telkom Indonesia (Persero) Tbk');
});
test('kripto, forex, komoditas, saham AS, indeks', () => {
  const S = mk();
  assert.deepEqual(J(S.info('BTCUSDT')), { name: 'Bitcoin / TetherUS', ex: 'Binance', full: true });
  assert.equal(S.info('1000PEPEUSDT').name, 'Pepe / TetherUS'); assert.equal(S.info('ZZZUSDT').full, false);
  assert.deepEqual(J(S.info('EURUSD')), { name: 'Euro / U.S. Dollar', ex: 'FX', full: true }); assert.equal(S.info('USDIDR').name, 'U.S. Dollar / Indonesian Rupiah');
  assert.equal(S.info('XAUUSD').name, 'Gold / U.S. Dollar'); assert.deepEqual(J(S.info('AAPL')), { name: 'Apple Inc.', ex: 'NASDAQ', full: true }); assert.equal(S.info('IHSG').ex, 'IDX');
});
test('simbol tak dikenal: pakai nama WATCH / kode; ditandai belum lengkap, lalu dilengkapi dari server', async () => {
  let calls = 0;
  const S = mk(async p => { calls++; return { ok: true, json: async () => ({ name: 'PT Contoh Abadi Tbk', exchange: 'IDX' }) }; });
  assert.deepEqual(J(S.info('FOOX')), { name: 'Foo Corp', ex: 'IDX', full: false }); assert.equal(S.info('QQQQ').name, 'QQQQ');
  let done; const p = new Promise(r => (done = r)); S.load('QQQQ', done); S.load('QQQQ', () => {}); await p;
  assert.equal(calls, 1); assert.deepEqual(J(S.info('QQQQ')), { name: 'PT Contoh Abadi Tbk', ex: 'IDX', full: false });
  S.load('BBCA', () => assert.fail('nama resmi tidak perlu ke server'));
});
test('label timeframe ala TradingView: menit tanpa huruf', () => {
  const S = mk();
  assert.deepEqual(['1m', '15m', '1h', '4h', '1D', '1W', '1M'].map(S.tf), ['1', '15', '1h', '4h', '1D', '1W', '1M']);
});
