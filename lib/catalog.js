// Katalog simbol + pemetaan ke penyedia data. market: idx IHSG, cry kripto, com komoditas, fx forex, us saham luar, ind indeks.
// provider: 'binance' (kripto, pasangan USDT) | 'yahoo' (saham, forex, indeks, komoditas) | null (belum ada sumber).
import { groups, MARKETS, STABLE } from './heat-data.js';
import { SYMBOL_RE } from './http.js';

const IDX = {
  BBCA: 'Bank Central Asia', BBRI: 'Bank Rakyat Indonesia', BMRI: 'Bank Mandiri', BBNI: 'Bank Negara Indonesia', BRIS: 'Bank Syariah Indonesia', ARTO: 'Bank Jago', BNGA: 'Bank CIMB Niaga', BBTN: 'Bank Tabungan Negara',
  BYAN: 'Bayan Resources', ADRO: 'Adaro Energy', PGAS: 'Perusahaan Gas Negara', PTBA: 'Bukit Asam', AKRA: 'AKR Corporindo', ITMG: 'Indo Tambangraya Megah', MEDC: 'Medco Energi', BUMI: 'Bumi Resources',
  AMMN: 'Amman Mineral', TPIA: 'Chandra Asri Pacific', BRPT: 'Barito Pacific', MDKA: 'Merdeka Copper Gold', NCKL: 'Trimegah Bangun Persada', ANTM: 'Aneka Tambang', MBMA: 'Merdeka Battery Materials', INCO: 'Vale Indonesia',
  ICBP: 'Indofood CBP', AMRT: 'Sumber Alfaria Trijaya', UNVR: 'Unilever Indonesia', HMSP: 'HM Sampoerna', CPIN: 'Charoen Pokphand Indonesia', INDF: 'Indofood Sukses Makmur', MYOR: 'Mayora Indah', GGRM: 'Gudang Garam',
  MAPI: 'Mitra Adiperkasa', SCMA: 'Surya Citra Media', ACES: 'Aspirasi Hidup Indonesia', ERAA: 'Erajaya Swasembada', MNCN: 'Media Nusantara Citra',
  TLKM: 'Telkom Indonesia', ISAT: 'Indosat Ooredoo Hutchison', MTEL: 'Dayamitra Telekomunikasi', TBIG: 'Tower Bersama Infrastructure', TOWR: 'Sarana Menara Nusantara', JSMR: 'Jasa Marga', EXCL: 'XL Axiata',
  DCII: 'DCI Indonesia', MLPT: 'Multipolar', GOTO: 'GoTo Gojek Tokopedia', EMTK: 'Elang Mahkota Teknologi', BUKA: 'Bukalapak',
  KLBF: 'Kalbe Farma', MIKA: 'Mitra Keluarga Karyasehat', SIDO: 'Industri Jamu Sido Muncul', HEAL: 'Medikaloka Hermina', ASII: 'Astra International', UNTR: 'United Tractors',
  BSDE: 'Bumi Serpong Damai', CTRA: 'Ciputra Development', PWON: 'Pakuwon Jati', SMRA: 'Summarecon Agung',
};
const US = {
  AAPL: 'Apple', NVDA: 'NVIDIA', AVGO: 'Broadcom', TSM: 'TSMC', ASML: 'ASML', AMD: 'AMD', INTC: 'Intel', MSFT: 'Microsoft', GOOGL: 'Alphabet', META: 'Meta Platforms', ORCL: 'Oracle', NFLX: 'Netflix', CRM: 'Salesforce', ADBE: 'Adobe',
  AMZN: 'Amazon', WMT: 'Walmart', COST: 'Costco', HD: 'Home Depot', PG: 'Procter & Gamble', KO: 'Coca-Cola', PEP: 'PepsiCo', MCD: "McDonald's", NKE: 'Nike', 'BRK.B': 'Berkshire Hathaway B', JPM: 'JPMorgan Chase', V: 'Visa', MA: 'Mastercard',
  BAC: 'Bank of America', WFC: 'Wells Fargo', GS: 'Goldman Sachs', LLY: 'Eli Lilly', UNH: 'UnitedHealth', JNJ: 'Johnson & Johnson', ABBV: 'AbbVie', MRK: 'Merck', PFE: 'Pfizer', TSLA: 'Tesla', TM: 'Toyota', F: 'Ford', XOM: 'Exxon Mobil', CVX: 'Chevron',
};
const CRY = {
  BTC: 'Bitcoin', ETH: 'Ethereum', BNB: 'BNB', SOL: 'Solana', XRP: 'XRP', DOGE: 'Dogecoin', ADA: 'Cardano', TRX: 'TRON', AVAX: 'Avalanche', TON: 'Toncoin', SUI: 'Sui', DOT: 'Polkadot', NEAR: 'NEAR Protocol', BCH: 'Bitcoin Cash', LTC: 'Litecoin',
  XLM: 'Stellar', LINK: 'Chainlink', UNI: 'Uniswap', AAVE: 'Aave', ARB: 'Arbitrum', OP: 'Optimism', ATOM: 'Cosmos', MKR: 'Maker', INJ: 'Injective', SHIB: 'Shiba Inu', PEPE: 'Pepe', WIF: 'dogwifhat', BONK: 'Bonk', USDC: 'USD Coin', DAI: 'Dai', USDT: 'Tether',
};
const FX = {
  EURUSD: 'Euro / Dolar AS', GBPUSD: 'Pound / Dolar AS', AUDUSD: 'Dolar Australia / AS', USDJPY: 'Dolar AS / Yen', USDIDR: 'Dolar AS / Rupiah', USDCHF: 'Dolar AS / Franc Swiss', USDCAD: 'Dolar AS / Dolar Kanada',
  EURJPY: 'Euro / Yen', NZDUSD: 'Dolar Selandia Baru / AS', USDSGD: 'Dolar AS / Dolar Singapura', EURGBP: 'Euro / Pound', GBPJPY: 'Pound / Yen', AUDJPY: 'Dolar Australia / Yen', EURAUD: 'Euro / Dolar Australia', USDCNH: 'Dolar AS / Yuan', USDMYR: 'Dolar AS / Ringgit',
};
const COM = {
  XAUUSD: ['Emas', 'GC=F'], XAGUSD: ['Perak', 'SI=F'], WTI: ['Minyak WTI', 'CL=F'], BRENT: ['Minyak Brent', 'BZ=F'], NGAS: ['Gas Alam', 'NG=F'], COPPER: ['Tembaga', 'HG=F'], XPTUSD: ['Platinum', 'PL=F'],
  ALU: ['Aluminium', 'ALI=F'], COAL: ['Batu Bara Newcastle', 'MTF=F'], SOY: ['Kedelai', 'ZS=F'], CORN: ['Jagung', 'ZC=F'], WHEAT: ['Gandum', 'ZW=F'], COFFEE: ['Kopi', 'KC=F'], SUGAR: ['Gula', 'SB=F'], COCOA: ['Kakao', 'CC=F'],
  CPO: ['Minyak Sawit (CPO)', null], RUBBER: ['Karet', null],
};
const IND = {
  IHSG: ['Indeks Harga Saham Gabungan', '^JKSE'], SPX: ['S&P 500', '^GSPC'], NDX: ['Nasdaq 100', '^NDX'], DJI: ['Dow Jones', '^DJI'], N225: ['Nikkei 225', '^N225'], DAX: ['DAX 40', '^GDAXI'], SSEC: ['Shanghai Composite', '000001.SS'],
  FTSE: ['FTSE 100', '^FTSE'], HSI: ['Hang Seng', '^HSI'], KS11: ['KOSPI', '^KS11'], STI: ['Straits Times', '^STI'],
};
// kode pendek yang dipakai peta pasar / pengguna -> simbol utama
const ALIAS = { XAU: 'XAUUSD', XAG: 'XAGUSD', XPT: 'XPTUSD', GOLD: 'XAUUSD', SILVER: 'XAGUSD', OIL: 'WTI', SP500: 'SPX', NASDAQ: 'NDX', DOW: 'DJI', NIKKEI: 'N225', JKSE: 'IHSG', LQ45: 'IHSG' };

export const catalog = new Map();
const put = e => catalog.set(e.sym, { exchange: '', aliases: [], ...e });
for (const [c, n] of Object.entries(IDX)) put({ sym: c, name: n, market: 'idx', provider: 'yahoo', ps: `${c}.JK`, exchange: 'IDX' });
for (const [c, n] of Object.entries(US)) put({ sym: c, name: n, market: 'us', provider: 'yahoo', ps: c.replace('.', '-'), exchange: 'US' });
for (const [c, n] of Object.entries(CRY)) if (!STABLE.includes(c)) put({ sym: `${c}USDT`, name: n, market: 'cry', provider: 'binance', ps: `${c}USDT`, exchange: 'BINANCE', aliases: [c] });
for (const [c, n] of Object.entries(FX)) put({ sym: c, name: n, market: 'fx', provider: 'yahoo', ps: `${c}=X`, exchange: 'FX' });
for (const [c, [n, ps]] of Object.entries(COM)) put({ sym: c, name: n, market: 'com', provider: ps ? 'yahoo' : null, ps, exchange: 'COMEX/NYMEX' });
for (const [c, [n, ps]] of Object.entries(IND)) put({ sym: c, name: n, market: 'ind', provider: 'yahoo', ps, exchange: 'INDEX' });
for (const s of STABLE) put({ sym: s, name: CRY[s], market: 'cry', provider: 'static', ps: s, exchange: 'BINANCE', static: 1 });

// kode kripto pendek (BTC) -> pasangan (BTCUSDT) hanya dipakai di konteks heatmap kripto & sebagai alias eksplisit BTC/ETH/SOL...
const CRY_SHORT = new Map(Object.keys(CRY).map(c => [c, STABLE.includes(c) ? c : `${c}USDT`]));
const COMMON_CRY_ALIAS = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'LTC'];

/** Terjemahkan masukan pengguna menjadi {sym,name,market,provider,ps,known}. Mengembalikan null bila format tidak valid. */
export function resolve(input, hint) {
  let s = String(input ?? '').trim().toUpperCase();
  if (!SYMBOL_RE.test(s)) return null;
  if (hint === 'kripto' && CRY_SHORT.has(s)) s = CRY_SHORT.get(s);
  else if (ALIAS[s]) s = ALIAS[s];
  else if (COMMON_CRY_ALIAS.includes(s)) s = `${s}USDT`;
  const hit = catalog.get(s);
  if (hit) return { ...hit, known: true };
  // heuristik untuk simbol di luar katalog
  if (/^[A-Z0-9]{2,12}USDT$/.test(s)) return { sym: s, name: s, market: 'cry', provider: 'binance', ps: s, exchange: 'BINANCE', known: false };
  if (/\.JK$/.test(s)) return { sym: s, name: s.replace('.JK', ''), market: 'idx', provider: 'yahoo', ps: s, exchange: 'IDX', known: false };
  if (/^\^/.test(s) || /=F$/.test(s) || /=X$/.test(s) || /^[A-Z0-9]+-USD$/.test(s)) return { sym: s, name: s, market: s.startsWith('^') ? 'ind' : s.endsWith('=F') ? 'com' : s.endsWith('=X') ? 'fx' : 'cry', provider: 'yahoo', ps: s, exchange: '', known: false };
  if (/^[A-Z]{6}$/.test(s) && /^(USD|EUR|GBP|JPY|AUD|NZD|CAD|CHF|IDR|SGD|CNH|MYR)/.test(s)) return { sym: s, name: s, market: 'fx', provider: 'yahoo', ps: `${s}=X`, exchange: 'FX', known: false };
  if (/^[A-Z][A-Z.\-]{0,5}$/.test(s)) return { sym: s, name: s, market: 'us', provider: 'yahoo', ps: s.replace('.', '-'), exchange: 'US', known: false };
  return null;
}

export function search(q, { market, limit = 20 } = {}) {
  const t = String(q || '').trim().toLowerCase();
  const out = [];
  for (const e of catalog.values()) {
    if (market && e.market !== market) continue;
    if (!t) { out.push([9, e]); continue; }
    const s = e.sym.toLowerCase(), n = e.name.toLowerCase();
    const sc = s === t ? 0 : s.startsWith(t) ? 1 : e.aliases.some(a => a.toLowerCase() === t) ? 1 : n.startsWith(t) ? 2 : s.includes(t) ? 3 : n.includes(t) ? 4 : -1;
    if (sc >= 0) out.push([sc, e]);
  }
  return out.sort((a, b) => a[0] - b[0] || a[1].sym.localeCompare(b[1].sym)).slice(0, limit).map(([, e]) => ({ sym: e.sym, name: e.name, market: e.market, exchange: e.exchange }));
}

// ---------- universe ----------
export const DEFAULT_WATCH = ['BTCUSDT', 'ETHUSDT', 'XAUUSD', 'EURUSD', 'BBCA', 'TLKM'];
export const MARKET_LABEL = { idx: 'IHSG', cry: 'Kripto', com: 'Komoditas', fx: 'Forex', us: 'Saham luar', ind: 'Indeks' };
export const INDICES = ['IHSG', 'SPX', 'NDX', 'DJI', 'N225'];
// Universe pemindai: simbol dari WATCH klien + saham berbobot besar. Dibatasi agar satu siklus penyegaran tetap ringan.
export function screenerUniverse() {
  const set = new Set(['BTCUSDT', 'ETHUSDT', 'XAUUSD', 'EURUSD', 'BBCA', 'TLKM', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'WTI', 'BRENT', 'NGAS', 'COPPER', 'GBPUSD', 'AUDUSD', 'USDJPY', 'USDIDR',
    'BBRI', 'BMRI', 'ASII', 'GOTO', 'ADRO', 'AMMN', 'ANTM', 'UNVR', 'AAPL', 'NVDA', 'MSFT', 'TSLA', 'GOOGL', 'AMZN', 'META', 'IHSG', 'SPX', 'NDX', 'DJI', 'N225']);
  const top = (mk, n) => groups(mk).flatMap(g => g.items).sort((a, b) => b.cap - a.cap).slice(0, n).map(i => i.code);
  top('ihsg', 25).forEach(c => set.add(c));
  top('luar', 15).forEach(c => set.add(c));
  return [...set].filter(s => catalog.get(s)?.provider && catalog.get(s).provider !== 'static');
}
export { MARKETS };

export function symbolType(e) { return { idx: 'stock', us: 'stock', cry: 'crypto', fx: 'forex', com: 'commodity', ind: 'index' }[e.market] || 'stock'; }
export function sessionOf(e) {
  if (e.market === 'cry') return { session: '24x7', timezone: 'Etc/UTC' };
  if (e.market === 'fx' || e.market === 'com') return { session: '24x5', timezone: 'Etc/UTC' };
  if (e.market === 'idx' || e.sym === 'IHSG') return { session: '0900-1550:23456', timezone: 'Asia/Jakarta' };
  return { session: '0930-1600:23456', timezone: 'America/New_York' };
}
