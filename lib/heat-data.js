// Bobot peta pasar (sumber sama dengan DATA di public/apps/maps/maps.js). Format: 'Grup:KODE=bobot,...|Grup:...'
// Bobot = kapitalisasi kasar (IHSG: Rp triliun; kripto/saham luar: USD miliar; lainnya: bobot relatif). Perbarui berkala bila perlu.
export const HEAT = {
 ihsg:'Keuangan:BBCA=1100,BBRI=700,BMRI=600,BBNI=240,BRIS=130,ARTO=70,BNGA=60,BBTN=20|Energi:BYAN=300,ADRO=80,PGAS=40,PTBA=40,AKRA=35,ITMG=30,MEDC=30,BUMI=30|Barang Baku:AMMN=900,TPIA=600,BRPT=150,MDKA=70,NCKL=70,ANTM=60,MBMA=60,INCO=55|Konsumer Primer:ICBP=130,AMRT=100,UNVR=90,HMSP=90,CPIN=80,INDF=70,MYOR=50,GGRM=40|Konsumer Siklikal:MAPI=30,SCMA=15,ACES=20,ERAA=12,MNCN=10|Infrastruktur & Telko:TLKM=330,ISAT=60,MTEL=50,TBIG=45,TOWR=40,JSMR=40,EXCL=35|Teknologi:DCII=300,MLPT=80,GOTO=70,EMTK=50,BUKA=20|Kesehatan:KLBF=80,MIKA=40,SIDO=35,HEAL=20|Industri:ASII=250,UNTR=130|Properti:BSDE=30,CTRA=25,PWON=25,SMRA=15',
 kripto:'Layer 1:BTC=1300,ETH=380,BNB=90,SOL=80,TRX=25,ADA=22,AVAX=15,TON=15,SUI=12,DOT=10,NEAR=7|Pembayaran:XRP=130,BCH=9,LTC=8,XLM=10|Stablecoin:USDT=120,USDC=35,DAI=5|DeFi & Infra:LINK=10,UNI=6,AAVE=4,ARB=3,OP=3,ATOM=3,MKR=2,INJ=2|Meme:DOGE=25,SHIB=10,PEPE=6,WIF=2,BONK=2',
 komoditas:'Logam:XAU=100,XAG=30,COPPER=25,ALU=15,XPT=10|Energi:BRENT=65,WTI=60,NGAS=25,COAL=20|Pertanian:CPO=25,SOY=20,CORN=20,WHEAT=15,COFFEE=12,SUGAR=10,COCOA=10,RUBBER=6',
 luar:'Teknologi Elektronik:AAPL=3500,NVDA=3400,AVGO=800,TSM=800,ASML=400,AMD=250,INTC=100|Teknologi Layanan:MSFT=3100,GOOGL=2000,META=1400,ORCL=450,NFLX=400,CRM=280,ADBE=200|Ritel & Konsumer:AMZN=1900,WMT=700,COST=400,HD=380,PG=380,KO=270,PEP=220,MCD=210,NKE=110|Keuangan:BRK.B=900,JPM=600,V=550,MA=450,BAC=300,WFC=220,GS=150|Kesehatan:LLY=800,UNH=500,JNJ=380,ABBV=300,MRK=260,PFE=150|Otomotif:TSLA=800,TM=250,F=45|Energi:XOM=450,CVX=280',
 lain:'Forex Mayor:EURUSD=100,USDJPY=80,GBPUSD=50,USDIDR=40,AUDUSD=30,USDCHF=25,USDCAD=25,EURJPY=20,NZDUSD=15,USDSGD=15|Indeks Global:SPX=100,NDX=80,DJI=60,DAX=40,SSEC=40,N225=45,FTSE=35,HSI=30,IHSG=25,KS11=20,STI=15'};
export const MARKETS = ['ihsg', 'kripto', 'komoditas', 'luar', 'lain'];
export const STABLE = ['USDT', 'USDC', 'DAI'];
export function groups(market) {
  return (HEAT[market] || '').split('|').filter(Boolean).map(g => {
    const [group, list] = g.split(':');
    return { group, items: list.split(',').map(x => { const [code, w] = x.split('='); return { code, cap: +w }; }) };
  });
}
