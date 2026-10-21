// Daftar simbol bersama (kode, nama, pasar) + format angka. Harga dan ubah% sengaja null: nilainya hanya diisi dari server (shared/live.js), tidak ada angka contoh.
// Baris: [simbol, nama, harga (null sampai server menjawab), ubah% (null sampai server menjawab), pasar]. 6 baris pertama tetap (dipakai sebagai default). Pasar: idx IHSG, cry kripto, com komoditas, fx forex, us saham luar, ind indeks.
// Data khusus satu app (SECT di Maps, EV di Kalender) ada di file app itu sendiri.
const WATCH=[['BTCUSDT','Bitcoin',null,null,'cry'],['ETHUSDT','Ethereum',null,null,'cry'],['XAUUSD','Emas',null,null,'com'],['EURUSD','Euro / Dolar AS',null,null,'fx'],['BBCA','Bank Central Asia',null,null,'idx'],['TLKM','Telkom Indonesia',null,null,'idx'],
['SOLUSDT','Solana',null,null,'cry'],['BNBUSDT','BNB',null,null,'cry'],['XRPUSDT','XRP',null,null,'cry'],['DOGEUSDT','Dogecoin',null,null,'cry'],['ADAUSDT','Cardano',null,null,'cry'],
['WTI','Minyak WTI',null,null,'com'],['BRENT','Minyak Brent',null,null,'com'],['NGAS','Gas Alam',null,null,'com'],['COPPER','Tembaga',null,null,'com'],
['GBPUSD','Pound / Dolar AS',null,null,'fx'],['AUDUSD','Dolar Australia / AS',null,null,'fx'],['USDJPY','Dolar AS / Yen',null,null,'fx'],['USDIDR','Dolar AS / Rupiah',null,null,'fx'],
['BBRI','Bank Rakyat Indonesia',null,null,'idx'],['BMRI','Bank Mandiri',null,null,'idx'],['ASII','Astra International',null,null,'idx'],['GOTO','GoTo Gojek Tokopedia',null,null,'idx'],['ADRO','Adaro Energy',null,null,'idx'],['AMMN','Amman Mineral',null,null,'idx'],['ANTM','Aneka Tambang',null,null,'idx'],['UNVR','Unilever Indonesia',null,null,'idx'],
['AAPL','Apple',null,null,'us'],['NVDA','NVIDIA',null,null,'us'],['MSFT','Microsoft',null,null,'us'],['TSLA','Tesla',null,null,'us'],['GOOGL','Alphabet',null,null,'us'],['AMZN','Amazon',null,null,'us'],['META','Meta Platforms',null,null,'us'],
['IHSG','Indeks Harga Saham Gabungan',null,null,'ind'],['SPX','S&P 500',null,null,'ind'],['NDX','Nasdaq 100',null,null,'ind'],['DJI','Dow Jones',null,null,'ind'],['N225','Nikkei 225',null,null,'ind']];
const NODATA='\u2013',isNum=v=>typeof v==='number'&&isFinite(v);
const f=v=>isNum(v)?v.toLocaleString('id-ID',{maximumFractionDigits:v<10?4:2}):NODATA,pc=v=>isNum(v)?(v>0?'+':v<0?'\u2212':'')+Math.abs(v).toFixed(2)+'%':NODATA,cls=v=>isNum(v)?(v>=0?'up':'dn'):'';
