// Data dummy bersama + format angka. Dipakai oleh banyak app (Watchlist, Chart, Setting, Note).
// Baris: [simbol, nama, harga, ubah%, pasar]. 6 baris pertama tetap (dipakai sebagai default). Pasar: idx IHSG, cry kripto, com komoditas, fx forex, us saham luar, ind indeks.
// Data khusus satu app (SECT di Maps, EV di Kalender) ada di file app itu sendiri.
const WATCH=[['BTCUSDT','Bitcoin',67420.5,2.14,'cry'],['ETHUSDT','Ethereum',3180.2,-1.05,'cry'],['XAUUSD','Emas',2386.4,0.32,'com'],['EURUSD','Euro / Dolar AS',1.0842,-0.18,'fx'],['BBCA','Bank Central Asia',9825,0.77,'idx'],['TLKM','Telkom Indonesia',3410,-0.58,'idx'],
['SOLUSDT','Solana',152.4,3.82,'cry'],['BNBUSDT','BNB',585.7,0.64,'cry'],['XRPUSDT','XRP',0.5231,-2.31,'cry'],['DOGEUSDT','Dogecoin',0.1584,5.47,'cry'],['ADAUSDT','Cardano',0.4412,-0.92,'cry'],
['WTI','Minyak WTI',78.4,-1.37,'com'],['BRENT','Minyak Brent',82.6,-1.12,'com'],['NGAS','Gas Alam',2.18,2.76,'com'],['COPPER','Tembaga',4.52,1.04,'com'],
['GBPUSD','Pound / Dolar AS',1.2715,0.21,'fx'],['AUDUSD','Dolar Australia / AS',0.6633,-0.44,'fx'],['USDJPY','Dolar AS / Yen',155.82,0.58,'fx'],['USDIDR','Dolar AS / Rupiah',15700,0.12,'fx'],
['BBRI','Bank Rakyat Indonesia',4620,1.31,'idx'],['BMRI','Bank Mandiri',6350,0.48,'idx'],['ASII','Astra International',5075,-1.46,'idx'],['GOTO','GoTo Gojek Tokopedia',66,-3.07,'idx'],['ADRO','Adaro Energy',2480,2.89,'idx'],['AMMN','Amman Mineral',9300,4.12,'idx'],['ANTM','Aneka Tambang',1625,1.88,'idx'],['UNVR','Unilever Indonesia',2630,-0.76,'idx'],
['AAPL','Apple',226.4,0.67,'us'],['NVDA','NVIDIA',131.2,3.35,'us'],['MSFT','Microsoft',423.8,-0.29,'us'],['TSLA','Tesla',248.5,-2.84,'us'],['GOOGL','Alphabet',171.3,0.92,'us'],['AMZN','Amazon',187.6,1.45,'us'],['META','Meta Platforms',512.9,-0.63,'us'],
['IHSG','Indeks Harga Saham Gabungan',7300,0.41,'ind'],['SPX','S&P 500',5800,0.36,'ind'],['NDX','Nasdaq 100',20100,0.84,'ind'],['DJI','Dow Jones',42500,-0.12,'ind'],['N225','Nikkei 225',38500,-0.91,'ind']];
const f=v=>v.toLocaleString('id-ID',{maximumFractionDigits:v<10?4:2}),pc=v=>(v>0?'+':v<0?'\u2212':'')+Math.abs(v).toFixed(2)+'%',cls=v=>v>=0?'up':'dn';
