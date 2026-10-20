// Ingest berita dari RSS ke tabel news, memberi tag simbol dan sentimen. Sumber bisa diubah di SOURCES.
import * as db from './db.js';
import { parseFeed, stripHtml, sentiment, sentences } from './rss.js';
import { catalog } from './catalog.js';
import { cached, pool } from './cache.js';

// category: idx | us | cry | com | fx. Feed yang tidak lagi aktif dilewati otomatis (error per sumber tidak menggagalkan yang lain).
export const SOURCES = [
  { name: 'CNBC Indonesia', url: 'https://www.cnbcindonesia.com/market/rss', category: 'idx' },
  { name: 'Kontan', url: 'https://investasi.kontan.co.id/rss', category: 'idx' },
  { name: 'Bisnis.com', url: 'https://market.bisnis.com/rss', category: 'idx' },
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', category: 'us' },
  { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', category: 'us' },
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', category: 'cry' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', category: 'cry' },
  { name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news', category: 'fx' },
  { name: 'Investing.com Komoditas', url: 'https://www.investing.com/rss/news_11.rss', category: 'com' },
  { name: 'Kitco', url: 'https://www.kitco.com/rss/', category: 'com' },
];
const FEED_CATS = ['idx', 'us', 'cry', 'com', 'fx'];   // harus sama dengan check news.category di skema
if (process.env.NEWS_FEEDS_EXTRA) { // "kategori|Nama|url;kategori|Nama|url"
  for (const x of process.env.NEWS_FEEDS_EXTRA.split(';')) {
    const [category, name, url] = x.split('|').map(t => t?.trim());
    // kategori di luar daftar akan melanggar check(category in (...)) dan menggagalkan seluruh batch insert berita; url harus http(s)
    if (FEED_CATS.includes(category) && name && /^https?:\/\//i.test(url || '')) SOURCES.push({ category, name, url });
    else if (x.trim()) console.warn('[news] NEWS_FEEDS_EXTRA diabaikan (kategori harus salah satu dari ' + FEED_CATS.join(', ') + ', url harus http/https):', x.slice(0, 60));
  }
}

// kata/nama -> simbol. Kode 3-5 huruf besar dicocokkan persis; nama dicocokkan tanpa peduli huruf besar-kecil.
const NAME_TAGS = [
  [/\b(bitcoin|btc)\b/i, 'BTCUSDT'], [/\b(ethereum|ether)\b/i, 'ETHUSDT'], [/\bsolana\b/i, 'SOLUSDT'], [/\bxrp\b/i, 'XRPUSDT'], [/\bdogecoin\b/i, 'DOGEUSDT'], [/\bbnb\b/i, 'BNBUSDT'],
  [/\b(emas|gold)\b/i, 'XAUUSD'], [/\b(perak|silver)\b/i, 'XAGUSD'], [/\b(minyak mentah|crude|wti)\b/i, 'WTI'], [/\bbrent\b/i, 'BRENT'], [/\b(rupiah)\b/i, 'USDIDR'], [/\b(ihsg|indeks harga saham gabungan)\b/i, 'IHSG'],
  [/\b(s&p 500|s&p500)\b/i, 'SPX'], [/\bnasdaq\b/i, 'NDX'], [/\bdow jones\b/i, 'DJI'], [/\bnikkei\b/i, 'N225'], [/\b(euro|eur\/usd)\b/i, 'EURUSD'], [/\byen\b/i, 'USDJPY'], [/\bpound\b/i, 'GBPUSD'],
];
const TICKERS = new Map([...catalog.values()].filter(e => (e.market === 'idx' || e.market === 'us') && e.sym.length >= 3).map(e => [e.sym, e.sym]));
const NAMES = [...catalog.values()].filter(e => e.market === 'idx' || e.market === 'us').map(e => [e.name.toLowerCase(), e.sym]).filter(([n]) => n.length >= 6);

export function tagSymbols(text) {
  const out = new Set();
  for (const [re, s] of NAME_TAGS) if (re.test(text)) out.add(s);
  for (const w of text.match(/\b[A-Z]{3,5}\b/g) || []) if (TICKERS.has(w)) out.add(w);
  const low = text.toLowerCase(); for (const [n, s] of NAMES) if (low.includes(n)) out.add(s);
  return [...out].slice(0, 6);
}
const norm = u => { try { const x = new URL(u); x.hash = ''; for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/.test(k)) x.searchParams.delete(k); return x.toString(); } catch { return u; } };
const paragraphs = html => stripHtml(html).split(/\n+/).map(s => s.trim()).filter(s => s.length > 30).slice(0, 12);

async function fetchFeed(src) {
  const r = await fetch(src.url, { headers: { 'user-agent': 'Mozilla/5.0 TerminalChartBot/1.0', accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseFeed(await r.text()).slice(0, 25).map(it => {
    const text = `${it.title}. ${it.text}`;
    const paras = paragraphs(it.html);
    return {
      url: norm(it.url), title: it.title.slice(0, 300), summary: (sentences(it.text).slice(0, 2).join(' ') || it.text).slice(0, 400),
      content: paras.length ? paras : [it.text.slice(0, 600)].filter(Boolean), source: src.name, category: src.category,
      symbols: tagSymbols(text), sentiment: sentiment(text), published_at: new Date(Math.min(it.ts || Date.now(), Date.now())).toISOString(),
    };
  });
}

// ---------- sumber API opsional (aktif hanya bila kuncinya diisi di environment) ----------
const toRow = (x, category, source) => {
  const text = `${x.title}. ${x.summary || ''}`;
  return {
    url: norm(x.url), title: x.title.slice(0, 300), summary: (sentences(x.summary || '').slice(0, 2).join(' ') || x.summary || '').slice(0, 400),
    content: x.summary ? [x.summary.slice(0, 600)] : [], source: String(source || x.source || '').slice(0, 60) || 'API', category,
    symbols: x.symbols?.length ? [...new Set([...x.symbols, ...tagSymbols(text)])].slice(0, 6) : tagSymbols(text),
    sentiment: x.sentiment || sentiment(text), published_at: new Date(Math.min(x.ts || Date.now(), Date.now())).toISOString(),
  };
};
const okRow = r => r.title && /^https?:\/\//.test(r.url);

/** Finnhub /news (paket gratis 60 panggilan/menit). Kunci dikirim lewat header agar tidak masuk log URL. */
export async function fetchFinnhub(key, feed, category) {
  const r = await fetch(`https://finnhub.io/api/v1/news?category=${feed}`, { headers: { 'x-finnhub-token': key, accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const list = await r.json(); if (!Array.isArray(list)) throw new Error('respons tidak dikenal');
  return list.slice(0, 30).map(n => toRow({ title: stripHtml(n.headline), summary: stripHtml(n.summary), url: n.url, source: n.source, ts: (n.datetime || 0) * 1000 }, category)).filter(okRow);
}
const avTime = t => { const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(t || ''); return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null; };
/** Alpha Vantage NEWS_SENTIMENT (paket gratis hanya 25 panggilan/hari, jadi dibatasi 1x per 6 jam). Sentimen memakai label dari API, bukan kamus. */
export async function fetchAlphaVantage(key) {
  const last = await db.one('kv_cache', { key: db.eq('news:av') }).catch(() => null);
  if (last && Date.now() - last.value.at < 6 * 3600_000) return [];
  await db.insert('kv_cache', { key: 'news:av', value: { at: Date.now() }, expires_at: new Date(Date.now() + 86400_000).toISOString() }, { upsert: true, onConflict: 'key' }).catch(() => {});
  const r = await fetch(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=financial_markets&sort=LATEST&limit=50&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j.feed)) throw new Error('batas panggilan tercapai atau respons tidak dikenal');   // pesan batas harian ada di j.Information
  return j.feed.map(n => toRow({
    title: stripHtml(n.title), summary: stripHtml(n.summary), url: n.url, source: n.source, ts: avTime(n.time_published),
    symbols: (n.ticker_sentiment || []).map(t => t.ticker).filter(t => TICKERS.has(t)),
    sentiment: /bullish/i.test(n.overall_sentiment_label || '') ? 'pos' : /bearish/i.test(n.overall_sentiment_label || '') ? 'neg' : 'neu',
  }, 'us')).filter(okRow);
}
const apiSources = (e = process.env) => {
  const out = [];
  if (e.FINNHUB_API_KEY) for (const [feed, category] of [['general', 'us'], ['forex', 'fx'], ['crypto', 'cry']]) out.push({ name: `Finnhub ${feed}`, run: () => fetchFinnhub(e.FINNHUB_API_KEY, feed, category) });
  if (e.ALPHAVANTAGE_API_KEY) out.push({ name: 'Alpha Vantage', run: () => fetchAlphaVantage(e.ALPHAVANTAGE_API_KEY) });
  return out;
};

export async function refreshNews() {
  const report = [];
  const batches = await pool(SOURCES, 5, async src => {
    try { const items = await fetchFeed(src); report.push({ source: src.name, ok: true, items: items.length }); return items; }
    catch (e) { report.push({ source: src.name, ok: false, error: e.message }); return []; }
  });
  const apiBatches = await pool(apiSources(), 3, async src => {
    try { const items = await src.run(); report.push({ source: src.name, ok: true, items: items.length }); return items; }
    catch (e) { report.push({ source: src.name, ok: false, error: e.message }); return []; }
  });
  const rows = [...new Map([...batches, ...apiBatches].flat().filter(Boolean).map(r => [r.url, r])).values()];
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const r = await db.insert('news', rows.slice(i, i + 100), { ignoreDuplicates: true, onConflict: 'url' }).catch(e => { report.push({ error: e.message }); return []; });
    inserted += r.length;
  }
  await db.remove('news', { published_at: db.lt(new Date(Date.now() - 30 * 86400_000).toISOString()) }).catch(() => {});
  await db.insert('kv_cache', { key: 'news:last', value: { at: Date.now() }, expires_at: new Date(Date.now() + 86400_000).toISOString() }, { upsert: true, onConflict: 'key' }).catch(() => {});
  return { fetched: rows.length, inserted, sources: report };
}
/** segarkan secara malas bila data terakhir lebih tua dari maxAgeMs (supaya tetap jalan walau cron belum disetel) */
export async function ensureFresh(maxAgeMs = 20 * 60_000) {
  return cached('news:ensure', 60_000, async () => {
    const row = await db.one('kv_cache', { key: db.eq('news:last') }).catch(() => null);
    if (row && Date.now() - row.value.at < maxAgeMs) return 'fresh';
    await Promise.race([refreshNews(), new Promise(r => setTimeout(r, 6000))]);   // jangan menahan respons terlalu lama
    return 'refreshed';
  }).catch(() => 'skip');
}
export const newsOut = n => ({ id: n.id, ts: new Date(n.published_at).getTime(), category: n.category, symbols: n.symbols || [], title: n.title, summary: n.summary, source: n.source, sentiment: n.sentiment, url: n.url });
export const keyPoints = n => { const s = sentences((n.content || []).join(' ')); return (s.length ? s : [n.summary]).filter(Boolean).slice(0, 4); };
