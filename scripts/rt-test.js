// npm run rt:test -- BBCA  -> panggil tiap penyedia realtime IDX yang kuncinya terisi, tampilkan respons MENTAH + hasil urai + latensi.
import './load-env.js';
import { PROVIDERS } from '../lib/realtime.js';
import { pickQuote } from '../lib/providers/quote-parse.js';

const sym = (process.argv[2] || 'BBCA').toUpperCase();
let n = 0;
for (const [name, p] of Object.entries(PROVIDERS)) {
  if (!p.enabled()) { console.log(`- ${name}: dilewati (kunci/URL belum diisi di .env)`); continue; }
  n++;
  const t0 = performance.now();
  try {
    const j = await p.raw(sym), ms = Math.round(performance.now() - t0);
    console.log(`\n== ${name} (${ms} ms) ==\n${JSON.stringify(j, null, 1).slice(0, 1500)}`);
    const q = pickQuote(j, sym);
    console.log(q ? `-> terbaca: harga ${q.price}, waktu ${new Date(q.ts).toISOString()} (${q.tsp ? 'dari penyedia' : 'waktu terima server'})` : '-> TIDAK terbaca: tambahkan nama field respons di lib/providers/quote-parse.js');
  } catch (e) { console.log(`\n== ${name} == GAGAL: ${e.message}`); }
}
if (!n) { console.log('\nBelum ada penyedia aktif. Isi GOAPI_API_KEY dan/atau OHLCDEV_API_KEY + OHLCDEV_URL di .env.'); process.exit(1); }
