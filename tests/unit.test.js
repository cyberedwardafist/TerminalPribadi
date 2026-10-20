import test from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET = 'k'.repeat(40);
const { signToken, verifyToken, hashPassword, verifyPassword } = await import('../lib/auth.js');
const { cleanHtml } = await import('../lib/sanitize.js');
const ind = await import('../lib/indicators.js');
const { aggregate } = await import('../lib/providers/yahoo.js');
const { resolve } = await import('../lib/catalog.js');
const { marketStatus } = await import('../lib/market.js');

test('JWT: valid, kedaluwarsa, dimanipulasi', () => {
  const t = signToken({ id: 'u1', token_version: 2 }); assert.equal(verifyToken(t).sub, 'u1');
  assert.equal(verifyToken(signToken({ id: 'u1' }, -1)), null);
  const [h, b, s] = t.split('.'); const forged = Buffer.from(JSON.stringify({ sub: 'admin', exp: 9e9, tv: 0 })).toString('base64url');
  assert.equal(verifyToken(`${h}.${forged}.${s}`), null);
  assert.equal(verifyToken(`${Buffer.from('{"alg":"none"}').toString('base64url')}.${b}.`), null);
});
test('password scrypt', async () => { const h = await hashPassword('abc12345'); assert.ok(await verifyPassword('abc12345', h)); assert.ok(!(await verifyPassword('abc12346', h))); });
test('sanitize HTML', () => {
  assert.equal(cleanHtml('<p onclick=1>a<b>b</p>'), '<p>a<b>b</b></p>');
  assert.equal(cleanHtml('x<style>p{}</style><iframe src=1></iframe>y'), 'xy');
  assert.equal(cleanHtml('1 < 2 & <3'), '1 &lt; 2 & &lt;3');
  assert.equal(cleanHtml('<span class="cl">a</span><br><hr>'), '<span class="cl">a</span><br><hr>');
});
test('indikator: SMA/EMA/Bollinger/MACD/ATR', () => {
  assert.deepEqual(ind.sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  const e = ind.ema([1, 2, 3, 4, 5, 6], 3); assert.equal(e[2], 2); assert.equal(e[3], 3); assert.equal(e[5], 5);
  const c = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 5), bb = ind.bollinger(c, 20, 2);
  assert.ok(bb.upper[25] > bb.mid[25] && bb.mid[25] > bb.lower[25]);
  const m = ind.macd(c); assert.ok(Math.abs(m.hist[39] - (m.macd[39] - m.signal[39])) < 1e-9);
  assert.equal(ind.rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 14).at(-1), 100);
  const bars = c.map((x, i) => ({ t: i, o: x, h: x + 1, l: x - 1, c: x, v: 10 })); assert.ok(ind.atr(bars, 14).at(-1) > 0);
  const st = ind.supertrend(bars); assert.ok([1, -1].includes(st.direction.at(-1)));
});
test('Yahoo: agregasi 4 jam', () => {
  const b = Array.from({ length: 8 }, (_, i) => ({ t: i * 3600, o: i, h: i + 1, l: i - 1, c: i + .5, v: 1 })), a = aggregate(b, 14400);
  assert.equal(a.length, 2); assert.equal(a[0].o, 0); assert.equal(a[0].c, 3.5); assert.equal(a[0].h, 4); assert.equal(a[0].v, 4);
});
test('katalog: pemetaan simbol', () => {
  assert.equal(resolve('BBCA').ps, 'BBCA.JK'); assert.equal(resolve('btcusdt').provider, 'binance'); assert.equal(resolve('EURUSD').ps, 'EURUSD=X');
  assert.equal(resolve('XAU').sym, 'XAUUSD'); assert.equal(resolve('F').market, 'us'); assert.equal(resolve('BTC', 'kripto').sym, 'BTCUSDT'); assert.equal(resolve('x y'), null);
});
test('status pasar WIB', () => {
  assert.equal(marketStatus(new Date('2026-10-19T03:00:00Z')).ihsg, 'open');   // Senin 10:00 WIB
  assert.equal(marketStatus(new Date('2026-10-19T09:00:00Z')).ihsg, 'closed'); // 16:00 WIB
  assert.equal(marketStatus(new Date('2026-10-17T03:00:00Z')).ihsg, 'closed'); // Sabtu
});
