// Nama lengkap + bursa simbol untuk header chart ala TradingView: "PT Bank Central Asia Tbk · 1 · IDX".
// SymName.info(sym) -> {name, ex, full}: full=true bila nama resmi dari tabel di bawah; false = nama pendek dari katalog/WATCH atau tebakan dari kode.
// SymName.load(sym, cb): simbol yang tidak ada di tabel dicari ke /api/symbols/:sym (mode Live), hasilnya disimpan lalu cb() dipanggil.
// SymName.tf('15m') -> '15' (menit tanpa huruf seperti TradingView; 1h, 4h, 1D, 1W, 1M tetap).
const SymName=(()=>{
const IDX={BBCA:'PT Bank Central Asia Tbk',BBRI:'PT Bank Rakyat Indonesia (Persero) Tbk',BMRI:'PT Bank Mandiri (Persero) Tbk',BBNI:'PT Bank Negara Indonesia (Persero) Tbk',BRIS:'PT Bank Syariah Indonesia Tbk',ARTO:'PT Bank Jago Tbk',BNGA:'PT Bank CIMB Niaga Tbk',BBTN:'PT Bank Tabungan Negara (Persero) Tbk',
 BYAN:'PT Bayan Resources Tbk',ADRO:'PT Alamtri Resources Indonesia Tbk',PGAS:'PT Perusahaan Gas Negara Tbk',PTBA:'PT Bukit Asam Tbk',AKRA:'PT AKR Corporindo Tbk',ITMG:'PT Indo Tambangraya Megah Tbk',MEDC:'PT Medco Energi Internasional Tbk',BUMI:'PT Bumi Resources Tbk',
 AMMN:'PT Amman Mineral Internasional Tbk',TPIA:'PT Chandra Asri Pacific Tbk',BRPT:'PT Barito Pacific Tbk',MDKA:'PT Merdeka Copper Gold Tbk',NCKL:'PT Trimegah Bangun Persada Tbk',ANTM:'PT Aneka Tambang Tbk',MBMA:'PT Merdeka Battery Materials Tbk',INCO:'PT Vale Indonesia Tbk',
 ICBP:'PT Indofood CBP Sukses Makmur Tbk',AMRT:'PT Sumber Alfaria Trijaya Tbk',UNVR:'PT Unilever Indonesia Tbk',HMSP:'PT H.M. Sampoerna Tbk',CPIN:'PT Charoen Pokphand Indonesia Tbk',INDF:'PT Indofood Sukses Makmur Tbk',MYOR:'PT Mayora Indah Tbk',GGRM:'PT Gudang Garam Tbk',
 MAPI:'PT Mitra Adiperkasa Tbk',SCMA:'PT Surya Citra Media Tbk',ACES:'PT Aspirasi Hidup Indonesia Tbk',ERAA:'PT Erajaya Swasembada Tbk',MNCN:'PT Media Nusantara Citra Tbk',
 TLKM:'PT Telkom Indonesia (Persero) Tbk',ISAT:'PT Indosat Tbk',MTEL:'PT Dayamitra Telekomunikasi Tbk',TBIG:'PT Tower Bersama Infrastructure Tbk',TOWR:'PT Sarana Menara Nusantara Tbk',JSMR:'PT Jasa Marga (Persero) Tbk',EXCL:'PT XLSmart Telecom Sejahtera Tbk',
 DCII:'PT DCI Indonesia Tbk',MLPT:'PT Multipolar Tbk',GOTO:'PT GoTo Gojek Tokopedia Tbk',EMTK:'PT Elang Mahkota Teknologi Tbk',BUKA:'PT Bukalapak.com Tbk',
 KLBF:'PT Kalbe Farma Tbk',MIKA:'PT Mitra Keluarga Karyasehat Tbk',SIDO:'PT Industri Jamu dan Farmasi Sido Muncul Tbk',HEAL:'PT Medikaloka Hermina Tbk',ASII:'PT Astra International Tbk',UNTR:'PT United Tractors Tbk',
 BSDE:'PT Bumi Serpong Damai Tbk',CTRA:'PT Ciputra Development Tbk',PWON:'PT Pakuwon Jati Tbk',SMRA:'PT Summarecon Agung Tbk',SMGR:'PT Semen Indonesia (Persero) Tbk'};
const US={AAPL:['Apple Inc.','NASDAQ'],NVDA:['NVIDIA Corporation','NASDAQ'],MSFT:['Microsoft Corporation','NASDAQ'],TSLA:['Tesla, Inc.','NASDAQ'],GOOGL:['Alphabet Inc. (Class A)','NASDAQ'],AMZN:['Amazon.com, Inc.','NASDAQ'],META:['Meta Platforms, Inc.','NASDAQ'],
 AVGO:['Broadcom Inc.','NASDAQ'],AMD:['Advanced Micro Devices, Inc.','NASDAQ'],INTC:['Intel Corporation','NASDAQ'],NFLX:['Netflix, Inc.','NASDAQ'],ADBE:['Adobe Inc.','NASDAQ'],COST:['Costco Wholesale Corporation','NASDAQ'],ASML:['ASML Holding N.V.','NASDAQ'],
 TSM:['Taiwan Semiconductor Manufacturing Company Limited','NYSE'],ORCL:['Oracle Corporation','NYSE'],CRM:['Salesforce, Inc.','NYSE'],WMT:['Walmart Inc.','NYSE'],HD:['The Home Depot, Inc.','NYSE'],JPM:['JPMorgan Chase & Co.','NYSE'],V:['Visa Inc.','NYSE'],MA:['Mastercard Incorporated','NYSE'],
 KO:['The Coca-Cola Company','NYSE'],XOM:['Exxon Mobil Corporation','NYSE'],CVX:['Chevron Corporation','NYSE'],BAC:['Bank of America Corporation','NYSE'],GS:['The Goldman Sachs Group, Inc.','NYSE'],PFE:['Pfizer Inc.','NYSE'],F:['Ford Motor Company','NYSE'],NKE:['NIKE, Inc.','NYSE']};
const CRY={BTC:'Bitcoin',ETH:'Ethereum',BNB:'BNB',SOL:'Solana',XRP:'XRP',DOGE:'Dogecoin',ADA:'Cardano',TRX:'TRON',AVAX:'Avalanche',TON:'Toncoin',SUI:'Sui',DOT:'Polkadot',NEAR:'NEAR Protocol',BCH:'Bitcoin Cash',LTC:'Litecoin',XLM:'Stellar',LINK:'Chainlink',UNI:'Uniswap',AAVE:'Aave',ARB:'Arbitrum',OP:'Optimism',ATOM:'Cosmos',MKR:'Maker',INJ:'Injective',SHIB:'Shiba Inu',PEPE:'Pepe',WIF:'dogwifhat',BONK:'Bonk'};
const FXN={USD:'U.S. Dollar',EUR:'Euro',GBP:'British Pound',AUD:'Australian Dollar',NZD:'New Zealand Dollar',CAD:'Canadian Dollar',CHF:'Swiss Franc',JPY:'Japanese Yen',SGD:'Singapore Dollar',CNH:'Chinese Yuan Offshore',MYR:'Malaysian Ringgit',IDR:'Indonesian Rupiah'};
const OTH={XAUUSD:['Gold / U.S. Dollar','Spot'],XAGUSD:['Silver / U.S. Dollar','Spot'],XPTUSD:['Platinum / U.S. Dollar','Spot'],WTI:['Crude Oil WTI','NYMEX'],BRENT:['Crude Oil Brent','ICE'],NGAS:['Natural Gas','NYMEX'],COPPER:['Copper','COMEX'],
 IHSG:['IDX Composite','IDX'],SPX:['S&P 500 Index','SP'],NDX:['Nasdaq 100 Index','NASDAQ'],DJI:['Dow Jones Industrial Average Index','DJ'],N225:['Nikkei 225 Index','JPX'],DAX:['DAX Performance Index','XETR'],FTSE:['FTSE 100 Index','FTSE'],HSI:['Hang Seng Index','HKEX']};
const EXN={IDX:'IDX',US:'US',BINANCE:'Binance',FX:'FX',INDEX:'Indeks','COMEX/NYMEX':'Futures'};
const cache=new Map(),pend=new Set();
const wname=s=>{try{const r=typeof WATCH!=='undefined'&&WATCH.find(x=>x[0]===s);return r?{name:r[1],mk:r[4]}:null}catch(e){return null}};
function info(sym){sym=String(sym||'').toUpperCase();let x,m;
 if(IDX[sym])return{name:IDX[sym],ex:'IDX',full:true};
 if(US[sym])return{name:US[sym][0],ex:US[sym][1],full:true};
 if(OTH[sym])return{name:OTH[sym][0],ex:OTH[sym][1],full:true};
 if(/USDT$/.test(sym)){const b=sym.replace(/USDT$/,'');x=CRY[b]||CRY[b.replace(/^(1000000|1000)/,'')];return{name:(x||b)+' / TetherUS',ex:'Binance',full:!!x}}
 if((m=/^([A-Z]{3})([A-Z]{3})$/.exec(sym))&&FXN[m[1]]&&FXN[m[2]])return{name:FXN[m[1]]+' / '+FXN[m[2]],ex:'FX',full:true};
 if(cache.has(sym))return cache.get(sym);
 x=wname(sym);return{name:x?x.name:sym,ex:x?(x.mk==='idx'?'IDX':''):'',full:false}}
// simbol di luar tabel: tanya server (katalog lokal, bisa juga hasil Yahoo); aman dipanggil berulang
function load(sym,cb){sym=String(sym||'').toUpperCase();if(cache.has(sym)||pend.has(sym)||info(sym).full)return;
 if(typeof apiOn!=='function'||!apiOn()||typeof apiFetch!=='function')return;pend.add(sym);
 apiFetch('/api/symbols/'+encodeURIComponent(sym)).then(r=>r.ok?r.json():null).then(j=>{pend.delete(sym);if(!j||!j.name)return;cache.set(sym,{name:j.name,ex:EXN[j.exchange]||j.exchange||'',full:false});cb&&cb()}).catch(()=>pend.delete(sym))}
const tf=t=>/^\d+m$/.test(t)?t.slice(0,-1):t;
return{info,load,tf}})();
