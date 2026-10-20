// Kalender: ekonomi (feed mingguan Forex Factory, tidak resmi), ex-dividend saham IDX (Yahoo), + data manual lewat /api/admin/calendar.
import * as db from './db.js';
import { catalog } from './catalog.js';
import * as yahoo from './providers/yahoo.js';
import { pool } from './cache.js';
import { createHash } from 'node:crypto';

const wibParts = d => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
const hid = s => createHash('sha1').update(s).digest('hex').slice(0, 14);
const IMP = { high: 3, medium: 2, low: 1 };
const CUR = ['USD', 'EUR', 'GBP', 'JPY', 'IDR', 'AUD', 'NZD', 'CAD', 'CHF', 'CNY'];

function classifyEconomic(title, country) {
  if (/crude oil|oil inventor|opec|eia /i.test(title)) return { cat: 'kom', type: 'minyak', aff: ['WTI', 'BRENT'] };
  if (/\bgold\b/i.test(title)) return { cat: 'kom', type: 'emas', aff: ['XAUUSD'] };
  if (/\bsilver\b/i.test(title)) return { cat: 'kom', type: 'perak', aff: ['XAGUSD'] };
  const cur = CUR.includes(country) ? country : 'USD';
  const aff = { USD: ['XAUUSD', 'EURUSD', 'USDJPY'], EUR: ['EURUSD'], GBP: ['GBPUSD'], JPY: ['USDJPY'], IDR: ['USDIDR', 'IHSG'], AUD: ['AUDUSD'] }[cur] || [];
  return { cat: 'fx', type: cur, aff };
}
export async function fetchEconomic() {
  const out = [];
  for (const wk of ['thisweek', 'nextweek']) {
    try {
      const r = await fetch(`https://nfs.faireconomy.media/ff_calendar_${wk}.json`, { headers: { 'user-agent': 'Mozilla/5.0 TerminalChartBot/1.0' }, signal: AbortSignal.timeout(9000) });
      if (!r.ok) continue;
      for (const e of await r.json()) {
        const d = new Date(e.date); if (isNaN(d)) continue;
        const { date, time } = wibParts(d), c = classifyEconomic(e.title || '', e.country);
        out.push({ id: `ff-${hid(`${e.title}|${e.country}|${e.date}`)}`, date, time, ...c, title: e.title, sym: '', imp: IMP[String(e.impact).toLowerCase()] || 1, detail: `${e.country} · ${e.title}`, prev: e.previous || '', fc: e.forecast || '', act: e.actual || '', source: 'forexfactory' });
      }
    } catch { /* minggu itu dilewati */ }
  }
  return out;
}
export async function fetchDividends() {
  const idx = [...catalog.values()].filter(e => e.market === 'idx').slice(0, 40);
  const from = Date.now() / 1000 - 90 * 86400;
  const rows = await pool(idx, 6, async e => {
    const b = await yahoo.dailyBundle(e.ps, '1y');
    return b.dividends.filter(d => d.date >= from).map(d => {
      const { date } = wibParts(new Date(d.date * 1000));
      return { id: `div-${e.sym}-${date}`, date, time: '', cat: 'idx', type: 'div', title: `Ex-dividen ${e.sym}`, sym: e.sym, imp: 2, detail: `${e.name}: dividen Rp ${d.amount.toLocaleString('id-ID')} per saham (tanggal ex)`, prev: '', fc: '', act: '', aff: [e.sym], source: 'yahoo' };
    });
  });
  return rows.flat().filter(Boolean);
}
export async function upsertEvents(rows) {
  rows = [...new Map(rows.map(r => [r.id, r])).values()];   // Postgres menolak upsert yang memuat kunci sama dua kali dalam satu perintah
  let n = 0;
  for (let i = 0; i < rows.length; i += 100) n += (await db.insert('calendar_events', rows.slice(i, i + 100), { upsert: true, onConflict: 'id' })).length;
  return n;
}
export async function refreshCalendar() {
  const [eco, div] = await Promise.all([fetchEconomic().catch(() => []), fetchDividends().catch(() => [])]);
  return { economic: await upsertEvents(eco), dividends: await upsertEvents(div) };
}
export const eventOut = e => ({ id: e.id, date: e.date, time: e.time, cat: e.cat, type: e.type, title: e.title, sym: e.sym, imp: e.imp, detail: e.detail, prev: e.prev, fc: e.fc, act: e.act, aff: (e.aff || [])[0] || '' });

// berita -> bentuk kalender {id,date,time,cat,type,imp,h,src,sum}
const HIGH = /suku bunga|bi rate|fomc|the fed|inflasi|inflation|nfp|non-farm|pdb|gdp|rups|dividen|resesi|tarif|tariff|cpi\b/i;
export function newsToCal(n) {
  const cat = { idx: 'idx', com: 'kom', fx: 'fx' }[n.category]; if (!cat) return null;
  const t = `${n.title} ${n.summary}`; let type;
  if (cat === 'idx') type = /rups/i.test(t) ? 'rups' : /dividen/i.test(t) ? 'div' : /laporan keuangan|laba bersih|kuartal/i.test(t) ? 'lap' : 'aksi';
  else if (cat === 'kom') type = /perak|silver/i.test(t) ? 'perak' : /minyak|oil|crude|brent|wti/i.test(t) ? 'minyak' : 'emas';
  else type = CUR.find(c => new RegExp(`\\b${c}\\b`, 'i').test(t)) || (/rupiah/i.test(t) ? 'IDR' : /euro/i.test(t) ? 'EUR' : /yen/i.test(t) ? 'JPY' : /pound|sterling/i.test(t) ? 'GBP' : 'USD');
  const { date, time } = wibParts(new Date(n.published_at));
  return { id: n.id, date, time, cat, type, imp: HIGH.test(t) ? 3 : 2, h: n.title, src: n.source, sum: n.summary };
}
export const wib = wibParts;
