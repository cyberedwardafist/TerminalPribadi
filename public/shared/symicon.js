// Ikon simbol ASLI (bukan huruf berwarna). Dipakai tab Chart & Headmaps, panel samping Headmaps, dan baris Watchlist.
//   Kripto            : logo koin (assets/icons/coin/<base>.svg, dibundel; USDT/1000x dihapus dari nama); koin yang belum ada di paket diambil dari CoinCap
//   Saham AS          : lencana brand (assets/icons/brand/)
//   Saham IDX         : logo perusahaan dari favicon situs resminya (butuh internet; gagal -> huruf berwarna)
//   Emas/perak/minyak : simbol (assets/icons/comm/)   Forex: dua bendera negara (assets/icons/flag/)   Indeks: bendera negara
// Simbol tak dikenal / gambar gagal dimuat -> lingkaran berwarna dengan huruf pertama (selalu ada di bawah gambar).
// Pakai: SymIcon.html('BTCUSDT',16) -> string HTML; gaya .si di shared/ui.css.
const SymIcon=(()=>{
const COINS=new Set('0xbtc 1inch 2give aave abt act actn ada add adx ae aeon aeur agi agrs aion algo amb amp ampl ankr ant ape apex appc ardr arg ark arn arnx ary ast atlas atm atom audr aury auto avax aywa bab bal band bat bay bcbc bcc bcd bch bcio bcn bco bcpt bdl beam bela bix blcn blk block blz bnb bnt bnty booty bos bpt bq brd bsd bsv btc btcd btch btcp btcz btdx btg btm bts btt btx burst bze call cc cdn cdt cenz chain chat chips chsb chz cix clam cloak cmm cmt cnd cnx cny cob colx comp coqui cred crpt crv crw cs ctr ctxc cvc d dai dash dat data dbc dcn dcr deez dent dew dgb dgd dlt dnt dock doge dot drgn drop dta dth dtr ebst eca edg edo edoge ela elec elf elix ella emb emc emc2 eng enj entrp eon eop eos eqli equa etc eth ethos etn etp eur evx exmo exp fair fct fida fil fjc fldc flo flux fsn ftc fuel fun game gas gbp gbx gbyte generic gin glxt gmr gmt gno gnt gold grc grin grs grt gsc gto gup gusd gvt gxs gzr hight hns hodl hot hpb hsr ht html huc husd hush icn icp icx ignis ilk ink ins ion iop iost iotx iq itc jnt jpy kcs kin klown kmd knc krb ksm lbc lend leo link lkk loom lpt lrc lsk ltc lun maid mana matic max mcap mco mda mds med meetone mft miota mith mkr mln mnx mnz moac mod mona msr mth mtl music mzc nano nas nav ncash ndz nebl neo neos neu nexo ngc nio nkn nlc2 nlg nmc nmr npxs ntbc nuls nxs nxt oax ok omg omni one ong ont oot ost ox oxt oxy part pasc pasl pax paxg pay payx pink pirl pivx plr poa poe polis poly pot powr ppc ppp ppt pre prl pungo pura qash qiwi qlc qnt qrl qsp qtum r rads rap ray rcn rdd rdn ren rep repv2 req rhoc ric rise rlc rpx rub rvn ryo safe safemoon sai salt san sand sbd sberbank sc ser shift sib sin skl sky slr sls smart sngls snm snt snx soc sol spacehbit spank sphtx srn stak start steem storj storm stox stq strat stx sub sumo sushi sys taas tau tbx tel ten tern tgch theta tix tkn tks tnb tnc tnt tomo tpay trig trtl trx tusd tzc ubq uma uni unity usd usdc usdt utk veri vet via vib vibe vivo vrc vrsc vtc vtho wabi wan waves wax wbtc wgr wicc wings wpr wtc x xas xbc xbp xby xcp xdn xem xin xlm xmcc xmg xmo xmr xmy xp xpa xpm xpr xrp xsg xtz xuc xvc xvg xzc yfi yoyow zcl zec zel zen zest zil zilla zrx'.split(' '));
const FLAG={USD:'us',EUR:'eu',GBP:'gb',AUD:'au',NZD:'nz',CAD:'ca',CHF:'ch',JPY:'jp',SGD:'sg',CNH:'cn',MYR:'my',IDR:'id',HKD:'hk',KRW:'kr'};
const IDXF={IHSG:'id',SPX:'us',NDX:'us',DJI:'us',N225:'jp',DAX:'de',FTSE:'gb',HSI:'hk',KS11:'kr',STI:'sg'};
const BRAND={AAPL:'aapl',NVDA:'nvda',MSFT:'msft',TSLA:'tsla',GOOGL:'googl',GOOG:'googl',AMZN:'amzn',META:'meta'};
const COMM={XAUUSD:'xau',XAGUSD:'xag',XPTUSD:'xpt',WTI:'oil',BRENT:'oil',NGAS:'gas',COPPER:'cu'};
// kode saham IDX -> domain resmi (logo diambil dari favicon situsnya)
const DOM={BBCA:'bca.co.id',BBRI:'bri.co.id',BMRI:'bankmandiri.co.id',BBNI:'bni.co.id',TLKM:'telkom.co.id',ASII:'astra.co.id',GOTO:'gotocompany.com',ADRO:'adaro.com',AMMN:'ammanmineral.co.id',ANTM:'antam.com',UNVR:'unilever.co.id',
 ICBP:'indofood.com',INDF:'indofood.com',KLBF:'kalbe.co.id',PGAS:'pgn.co.id',PTBA:'ptba.co.id',SMGR:'sig.id',MDKA:'merdekacoppergold.com',ITMG:'itmg.co.id',INCO:'vale.com',BRPT:'barito-pacific.com',EXCL:'xl.co.id',ISAT:'ioh.co.id',BUKA:'bukalapak.com',ARTO:'jago.com',BRIS:'bankbsi.co.id',MAPI:'map.co.id',ACES:'acehardware.co.id',HMSP:'sampoerna.com',GGRM:'gudanggaramtbk.com',JSMR:'jasamarga.com',TOWR:'sarana-menara.com',MEDC:'medcoenergi.com'};
const B='assets/icons/',hue=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))%360;return h};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');
const cut=s=>s.replace(/USDT$/,'').toLowerCase();
function coinOf(sym){if(!/USDT$/.test(sym))return null;const b=cut(sym);if(COINS.has(b))return b;const m=b.replace(/^(1000000|1000|1m)/,'');return m!==b&&COINS.has(m)?m:null}
// -> {k:'one'|'two'|'fav', u:[url,...]} atau null (huruf saja)
function spec(sym){sym=String(sym||'').toUpperCase();let x;
 if(COMM[sym])return{k:'one',u:[B+'comm/'+COMM[sym]+'.svg']};
 if(BRAND[sym])return{k:'one',u:[B+'brand/'+BRAND[sym]+'.svg']};
 if(IDXF[sym])return{k:'one',u:[B+'flag/'+IDXF[sym]+'.svg']};
 if(DOM[sym])return{k:'fav',u:['https://www.google.com/s2/favicons?domain='+DOM[sym]+'&sz=64']};
 if(x=coinOf(sym))return{k:'one',u:[B+'coin/'+x+'.svg']};
 if(/USDT$/.test(sym)&&/^[a-z0-9]{2,12}$/.test(x=cut(sym).replace(/^(1000000|1000|1m)/,'')))return{k:'one',u:['https://assets.coincap.io/assets/icons/'+x+'@2x.png']};   // koin baru yang belum ada di paket: ambil dari CoinCap (butuh internet)
 if((x=/^([A-Z]{3})([A-Z]{3})$/.exec(sym))&&FLAG[x[1]]&&FLAG[x[2]])return{k:'two',u:[B+'flag/'+FLAG[x[1]]+'.svg',B+'flag/'+FLAG[x[2]]+'.svg']};
 return null}
function html(sym,px=16){const s=String(sym||'?'),sp=spec(s),ch=esc((s.replace(/^(1000000|1000)/,'')[0]||'?').toUpperCase());
 const im=!sp?'':sp.k==='two'?`<img class="si-i si-a" src="${sp.u[0]}" alt="" draggable="false"><img class="si-i si-b" src="${sp.u[1]}" alt="" draggable="false">`:`<img class="si-i" src="${sp.u[0]}" alt="" draggable="false" decoding="async">`;
 return`<i class="si${sp?' '+sp.k:''}" style="--s:${px}px;--h:${hue(s)}" aria-hidden="true"><b>${ch}</b>${im}</i>`}
// gambar gagal -> buang (huruf di bawahnya muncul); berhasil -> sembunyikan huruf
if(typeof document!=='undefined'){document.addEventListener('error',e=>{const t=e.target;if(t&&t.classList&&t.classList.contains('si-i'))t.remove()},true);
 document.addEventListener('load',e=>{const t=e.target;if(t&&t.classList&&t.classList.contains('si-i')&&t.parentNode)t.parentNode.classList.add('ok')},true)}
return{html,spec,coinOf,COINS}})();
