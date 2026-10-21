// Supabase PostgREST + Storage tiruan di memori, plus Binance/Yahoo tiruan. Hanya mendukung fitur yang dipakai backend.
import crypto from 'node:crypto';
const PK = { users: ['id'], otps: ['email', 'purpose'], auth_tickets: ['email'], rate_limits: ['key'], kv_cache: ['key'], user_settings: ['user_id'], notes: ['user_id', 'id'], journal_trades: ['user_id', 'id'], journal_images: ['user_id', 'id'], news_saved: ['user_id', 'news_id'], chart_layouts: ['user_id', 'name'], chart_drawings: ['user_id', 'symbol'], chart_templates: ['user_id', 'kind', 'name'], calendar_events: ['id'] };
const UNIQUE = { users: [['username'], ['email']], news: [['url']] };
const DEF = { users: { verified: false, token_version: 0, role: 'user', avatar: null }, alerts: { active: true }, notifications: { read: false, data: {} }, notes: { pin: false, tags: [] }, watchlists: { symbols: [] }, custom_indicators: { version: 1, is_public: false, overlay: true, tags: [], inputs: [], description: '', source: '' }, journal_trades: { imgs: [], fields: [] } };
export class FakeDb {
  constructor() { this.t = {}; this.files = new Map(); this.seq = 1; }
  tbl(n) { return (this.t[n] ||= []); }
  parseVal(x) { return x === 'null' ? null : x === 'true' ? true : x === 'false' ? false : x; }
  test(row, col, expr) {
    const i = expr.indexOf('.'), op = expr.slice(0, i), raw = expr.slice(i + 1);
    let a = row[col]; const s = x => (x instanceof Date ? x.toISOString() : String(x));
    const num = a !== null && typeof a !== 'object' && raw !== '' && !isNaN(raw) && typeof a === 'number';
    const cmp = () => (num ? [Number(a), Number(raw)] : [s(a), raw]);
    switch (op) {
      case 'eq': return a === null || a === undefined ? false : (typeof a === 'boolean' ? String(a) === raw : s(a) === raw);
      case 'neq': return s(a) !== raw;
      case 'gt': { const [x, y] = cmp(); return x > y; } case 'gte': { const [x, y] = cmp(); return x >= y; }
      case 'lt': { const [x, y] = cmp(); return x < y; } case 'lte': { const [x, y] = cmp(); return x <= y; }
      case 'is': return raw === 'null' ? a == null : a != null;
      case 'in': return raw.slice(1, -1).split(',').map(x => x.replace(/^"|"$/g, '')).includes(s(a));
      case 'ilike': { const re = new RegExp('^' + raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'); return re.test(s(a)); }
      case 'cs': { const need = raw.slice(1, -1).split(','); return Array.isArray(a) && need.every(n => a.includes(n)); }
      case 'ov': { const need = raw.slice(1, -1).split(','); return Array.isArray(a) && need.some(n => a.includes(n)); }
    } throw new Error('op tidak didukung di fake: ' + op);
  }
  clauses(str) { const inner = str.slice(1, -1), out = []; let d = 0, cur = ''; for (const ch of inner) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; }
  clauseTest(row, c) {
    if (c.startsWith('or(')) return this.clauses(c.slice(2)).some(x => this.clauseTest(row, x));
    const i = c.indexOf('.'); return this.test(row, c.slice(0, i), c.slice(i + 1));
  }
  filter(rows, p) {
    for (const [k, val] of p) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
      if (k === 'or') rows = rows.filter(r => this.clauses(val).some(c => this.clauseTest(r, c)));
      else if (k === 'and') rows = rows.filter(r => this.clauses(val).every(c => this.clauseTest(r, c)));
      else rows = rows.filter(r => this.test(r, k, val));
    } return rows;
  }
  fill(table, r) {
    const now = new Date().toISOString(), o = { ...(DEF[table] || {}), ...r };
    if (!o.id && !(PK[table] || ['id']).every(k => k !== 'id') && ['users', 'watchlists', 'alerts', 'notifications', 'news', 'custom_indicators', 'chart_templates', 'chart_layouts'].includes(table)) o.id = crypto.randomUUID();
    if (table === 'activity_log') o.id = this.seq++;
    if (!o.created_at && !['otps', 'rate_limits', 'kv_cache', 'auth_tickets'].includes(table)) o.created_at = now;
    if (!o.updated_at && !['otps', 'rate_limits', 'kv_cache', 'auth_tickets', 'notifications', 'alerts', 'news', 'activity_log'].includes(table)) o.updated_at = now;
    if (table === 'otps' && !o.sent_at) o.sent_at = now;
    return o;
  }
  async rest(method, url, headers, body) {
    const u = new URL(url), table = u.pathname.replace('/rest/v1/', ''), p = [...u.searchParams], prefer = headers.prefer || '';
    const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', ...h } });
    if (table.startsWith('rpc/')) {
      const a = JSON.parse(body), row = this.tbl('rate_limits').find(r => r.key === a.p_key), now = Date.now();
      let r = row; if (!r || new Date(r.reset_at) <= now) { this.t.rate_limits = this.tbl('rate_limits').filter(x => x.key !== a.p_key); r = { key: a.p_key, count: 1, reset_at: new Date(now + a.p_window * 1000).toISOString() }; this.t.rate_limits.push(r); } else r.count++;
      return json([{ allowed: r.count <= a.p_limit, retry_after: Math.ceil((new Date(r.reset_at) - now) / 1000) }]);
    }
    const rows = this.tbl(table);
    if (method === 'GET') {
      let out = this.filter(rows, p); const total = out.length;
      const ord = u.searchParams.get('order'); if (ord) { const keys = ord.split(',').map(x => x.split('.')); out = [...out].sort((a, b) => { for (const [k, d] of keys) { const x = a[k], y = b[k]; if (x == y) continue; const r = x > y ? 1 : -1; return d === 'desc' ? -r : r; } return 0; }); }
      const off = +u.searchParams.get('offset') || 0, lim = u.searchParams.get('limit'); out = out.slice(off, lim ? off + +lim : undefined);
      return json(JSON.parse(JSON.stringify(out)), 200, prefer.includes('count') ? { 'content-range': `0-0/${total}` } : {});
    }
    if (method === 'POST') {
      const list = [].concat(JSON.parse(body)), out = [], oc = u.searchParams.get('on_conflict');
      for (const r of list) {
        const row = this.fill(table, r), keys = oc ? oc.split(',') : (PK[table] || ['id']);
        const ex = rows.find(x => keys.every(k => x[k] === row[k]) && (oc || PK[table] || row.id));
        if (ex && (oc || PK[table])) { if (prefer.includes('ignore-duplicates')) continue; if (prefer.includes('merge-duplicates')) { Object.assign(ex, r, { updated_at: new Date().toISOString() }); out.push(ex); continue; } return json({ code: '23505', message: 'duplicate key' }, 409); }
        for (const cols of UNIQUE[table] || []) if (rows.some(x => cols.every(c => String(x[c]).toLowerCase() === String(row[c]).toLowerCase()))) { if (prefer.includes('ignore-duplicates')) { row.__skip = 1; break; } return json({ code: '23505', message: 'duplicate key' }, 409); }
        if (row.__skip) continue;
        rows.push(row); out.push(row);
      } return json(JSON.parse(JSON.stringify(out)), 201);
    }
    if (method === 'PATCH') { const m = this.filter(rows, p), patch = JSON.parse(body); m.forEach(r => Object.assign(r, patch, ['users', 'notes', 'watchlists', 'custom_indicators', 'chart_layouts'].includes(table) ? { updated_at: new Date().toISOString() } : {})); return json(JSON.parse(JSON.stringify(m))); }
    if (method === 'DELETE') { const m = new Set(this.filter(rows, p)); this.t[table] = rows.filter(r => !m.has(r)); return json([...m]); }
  }
  async storage(method, url, headers, body) {
    const path = new URL(url).pathname.replace('/storage/v1/object/', '');
    if (method === 'POST') { this.files.set(path, { buf: Buffer.from(body), type: headers['content-type'] }); return new Response('{}', { status: 200 }); }
    if (method === 'GET') { const f = this.files.get(path); return f ? new Response(f.buf, { headers: { 'content-type': f.type } }) : new Response('{}', { status: 404 }); }
    if (method === 'DELETE') { for (const p of JSON.parse(body).prefixes) this.files.delete(path + '/' + p); return new Response('[]'); }   // path = nama bucket
  }
}
// ---------- sumber pasar tiruan ----------
const seeded = s => { let a = [...s].reduce((x, c) => x * 31 + c.charCodeAt(0) | 0, 7); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
export const PRICE = { BTCUSDT: 67000, XAUUSD: 2400, 'GC=F': 2400 };
const series = (sym, n, step, base) => { const r = seeded(sym), end = Math.floor(Date.now() / 1000 / step) * step; let p = base; return Array.from({ length: n }, (_, i) => { const o = p, c = o * (1 + (r() - .5) * .02); p = c; return { t: end - (n - 1 - i) * step, o, h: Math.max(o, c) * 1.004, l: Math.min(o, c) * .996, c, v: 1000 + r() * 500 }; }); };
export function installFetch(db, state = {}) {
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url, method = (init.method || 'GET').toUpperCase(), headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (url.startsWith('https://fake.supabase.co/rest/')) return db.rest(method, url, headers, init.body);
    if (url.startsWith('https://fake.supabase.co/storage/')) return db.storage(method, url, headers, init.body);
    const j = d => new Response(JSON.stringify(d), { headers: { 'content-type': 'application/json' } });
    if (url.includes('binance')) {
      const u = new URL(url);
      if (u.pathname.endsWith('/klines')) { const sym = u.searchParams.get('symbol'), iv = u.searchParams.get('interval'), step = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 }[iv] || 3600, n = +u.searchParams.get('limit'); state.binanceCalls = (state.binanceCalls || 0) + 1; return j(series(sym, n, step, state.price?.[sym] ?? PRICE[sym] ?? 100).map(b => [b.t * 1000, String(b.o), String(b.h), String(b.l), String(b.c), String(b.v)])); }
      if (u.pathname.endsWith('/ticker/24hr')) return j(JSON.parse(u.searchParams.get('symbols')).map(s => ({ symbol: s, lastPrice: String(state.price?.[s] ?? PRICE[s] ?? 100), priceChangePercent: '1.5', quoteVolume: '1000000' })));
    }
    if (url.includes('finance.yahoo.com/v8/finance/chart')) {
      const ps = decodeURIComponent(new URL(url).pathname.split('/').pop()), b = series(ps, 260, 86400, PRICE[ps] ?? 50);
      return j({ chart: { result: [{ meta: { regularMarketPrice: b.at(-1).c, longName: ps, currency: 'USD', exchangeName: 'X', regularMarketTime: b.at(-1).t }, timestamp: b.map(x => x.t), indicators: { quote: [{ open: b.map(x => x.o), high: b.map(x => x.h), low: b.map(x => x.l), close: b.map(x => x.c), volume: b.map(x => x.v) }] } }] } });
    }
    if (url.startsWith('https://fc.yahoo.com')) return new Response('', { status: 404, headers: { 'set-cookie': 'A3=abc; Path=/; Domain=.yahoo.com' } });
    if (url.includes('/v1/test/getcrumb')) return new Response('crumb123', { status: 200 });
    if (url.includes('/v7/finance/quote')) { if (state.ycapFail) return new Response('{}', { status: 429 }); const u = new URL(url); state.ycapCrumb = u.searchParams.get('crumb'); const caps = { 'BBCA.JK': [1.2e15, 'IDR'], 'BBRI.JK': [8e11, 'USD'], AAPL: [3.9e12, 'USD'] }; return j({ quoteResponse: { result: u.searchParams.get('symbols').split(',').filter(x => caps[x]).map(x => ({ symbol: x, marketCap: caps[x][0], currency: caps[x][1] })) } }); }
    if (url.includes('api.coingecko.com')) { if (state.cgFail) return new Response('{}', { status: 429 }); return j([{ symbol: 'btc', market_cap: 1.5e12, current_price: 67000, price_change_percentage_24h: 1, market_cap_rank: 1 }, { symbol: 'eth', market_cap: 4.2e11, current_price: 3500, price_change_percentage_24h: 2, market_cap_rank: 2 }, { symbol: 'btc', market_cap: 1e9, current_price: 1, price_change_percentage_24h: 0, market_cap_rank: 900 }]); }
    if (url.startsWith('https://finnhub.io/api/v1/news')) { state.finnhubHeader = headers['x-finnhub-token']; return j([{ headline: 'Bitcoin rises as ETF inflows jump', summary: 'Strong inflows lift bitcoin.', url: 'https://fh.example/1?utm_source=x', source: 'Reuters', datetime: Math.floor(Date.now() / 1000) - 60 }, { headline: '', url: 'https://fh.example/2' }]); }
    if (url.startsWith('https://www.alphavantage.co/query')) { state.avCalls = (state.avCalls || 0) + 1; return j({ feed: [{ title: 'Apple beats estimates', summary: 'AAPL earnings strong.', url: 'https://av.example/1', source: 'Benzinga', time_published: '20261019T120000', overall_sentiment_label: 'Somewhat-Bullish', ticker_sentiment: [{ ticker: 'AAPL' }, { ticker: 'CRYPTO:BTC' }] }] }); }
    if (url.includes('faireconomy')) return j([{ title: 'Core CPI m/m', country: 'USD', date: '2026-10-20T12:30:00-04:00', impact: 'High', forecast: '0.3%', previous: '0.2%' }]);
    return new Response('not mocked: ' + url, { status: 500 });
  };
  return () => { globalThis.fetch = real; };
}
