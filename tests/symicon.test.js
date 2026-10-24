// shared/symicon.js: pemetaan simbol -> ikon asli (file harus benar-benar ada), fallback huruf untuk simbol tak dikenal.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const ROOT = new URL('../public/', import.meta.url);
const ctx = vm.createContext({ Set, Math, String, Object });
const SymIcon = vm.runInContext(fs.readFileSync(new URL('shared/symicon.js', ROOT), 'utf8') + ';SymIcon', ctx);
const exists = u => fs.existsSync(new URL(u, ROOT));

test('kripto: USDT dan awalan 1000 dibuang; koin tak dikenal -> huruf saja', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(SymIcon.spec('BTCUSDT'))), { k: 'one', u: ['assets/icons/coin/btc.svg'] });
  assert.equal(SymIcon.spec('1000DOGEUSDT').u[0], 'assets/icons/coin/doge.svg');
  assert.equal(SymIcon.spec('PEPEUSDT').u[0], 'https://assets.coincap.io/assets/icons/pepe@2x.png');   // belum ada di paket -> CoinCap
  assert.equal(SymIcon.spec('FOO-BARUSDT'), null);
  assert.match(SymIcon.html('FOO-BARUSDT', 16), /<b>F<\/b>/); assert.doesNotMatch(SymIcon.html('FOO-BARUSDT', 16), /<img/);
  assert.match(SymIcon.html('PEPEUSDT', 16), /<b>P<\/b><img/);   // huruf selalu ada di bawah gambar sebagai cadangan
});
test('semua file ikon yang dirujuk ada di assets/icons', () => {
  for (const c of SymIcon.COINS) assert.ok(exists(`assets/icons/coin/${c}.svg`), c);
  const syms = ['XAUUSD', 'XAGUSD', 'XPTUSD', 'WTI', 'BRENT', 'NGAS', 'COPPER', 'AAPL', 'NVDA', 'MSFT', 'TSLA', 'GOOGL', 'AMZN', 'META', 'EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'USDIDR', 'IHSG', 'SPX', 'NDX', 'DJI', 'N225', 'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT', 'ADAUSDT'];
  for (const s of syms) { const sp = SymIcon.spec(s); assert.ok(sp, s); for (const u of sp.u) assert.ok(exists(u), s + ' -> ' + u) }
});
test('forex = dua bendera; saham IDX = favicon situs resmi; XAUUSD bukan pasangan bendera', () => {
  assert.equal(SymIcon.spec('EURUSD').k, 'two'); assert.deepEqual(JSON.parse(JSON.stringify(SymIcon.spec('USDIDR').u)), ['assets/icons/flag/us.svg', 'assets/icons/flag/id.svg']);
  assert.equal(SymIcon.spec('XAUUSD').u[0], 'assets/icons/comm/xau.svg');
  const b = SymIcon.spec('BBCA'); assert.equal(b.k, 'fav'); assert.match(b.u[0], /s2\/favicons\?domain=bca\.co\.id/);
});
