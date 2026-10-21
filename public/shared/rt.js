// Mesin REALTIME klien. Semua sumber berjalan PARALEL; per simbol ada satu "pemimpin" (sumber yang dipakai menggerakkan candle).
//   Kripto            : Binance WebSocket publik (aggTrade + kline), tanpa kunci
//   Forex/komoditas   : Tiingo WS (fx) -> Finnhub WS (OANDA) -> Yahoo WS (eksperimental)
//   Saham AS/indeks   : Finnhub WS -> Tiingo WS (iex) -> Yahoo WS
//   Saham IDX         : GoAPI + OHLC.dev lewat server (/api/rt/quote, polling 1 dtk; keduanya REST, bukan WS)
// Pemimpin = sumber berprioritas tertinggi yang masih "segar" (ada data dalam STALE ms). Bila mati/macet, sumber berikutnya otomatis mengambil alih
// dan kembali ke yang utama saat pulih. Selama pemimpin tetap sama harga tidak bercampur antar sumber, jadi candle tidak goyang.
// Kunci Finnhub/Tiingo disimpan di localStorage browser ini (CFG.api.rt), TIDAK pernah dikirim ke server aplikasi.
// Kontrak: RT.sub(sym,tf,onTick,onStatus)->off. Tick: {id,src,p,q,ts,k?}; k = kline Binance {t,o,h,l,c,v,x}. RT.bars.apply/merge = logika candle murni (diuji).
(()=>{
const gl=typeof globalThis!=='undefined'?globalThis:window;
const cfg=()=>(typeof CFG!=='undefined'&&CFG.api&&CFG.api.rt)||{};
const now=()=>Date.now();
const COM={XAUUSD:['OANDA:XAU_USD','xauusd','GC=F'],XAGUSD:['OANDA:XAG_USD','xagusd','SI=F'],XPTUSD:['OANDA:XPT_USD','xptusd','PL=F'],WTI:['OANDA:WTICO_USD',null,'CL=F'],BRENT:['OANDA:BCO_USD',null,'BZ=F'],NGAS:['OANDA:NATGAS_USD',null,'NG=F'],COPPER:['OANDA:XCU_USD',null,'HG=F'],
 ALU:[null,null,'ALI=F'],COAL:[null,null,'MTF=F'],SOY:[null,null,'ZS=F'],CORN:[null,null,'ZC=F'],WHEAT:[null,null,'ZW=F'],COFFEE:[null,null,'KC=F'],SUGAR:[null,null,'SB=F'],COCOA:[null,null,'CC=F']};
const IND={SPX:['OANDA:SPX500_USD',null,'^GSPC'],NDX:['OANDA:NAS100_USD',null,'^NDX'],DJI:['OANDA:US30_USD',null,'^DJI'],N225:['OANDA:JP225_USD',null,'^N225'],DAX:['OANDA:DE30_EUR',null,'^GDAXI'],FTSE:['OANDA:UK100_GBP',null,'^FTSE'],HSI:['OANDA:HK33_HKD',null,'^HSI'],
 IHSG:[null,null,'^JKSE'],SSEC:[null,null,'000001.SS'],KS11:[null,null,'^KS11'],STI:[null,null,'^STI']};
const MK=new Map();
function kindOf(s){
 if(COM[s])return'com';if(IND[s])return'ind';
 try{const r=typeof WATCH!=='undefined'&&WATCH.find(x=>x[0]===s);if(r&&r[4])return r[4]}catch(e){}
 if(MK.has(s))return MK.get(s);
 if(/USDT$/.test(s))return'cry';
 if(/^(USD|EUR|GBP|AUD|NZD|CAD|CHF|JPY|SGD|CNH|MYR|IDR)[A-Z]{3}$/.test(s)||/^[A-Z]{3}(USD|JPY|IDR)$/.test(s))return'fx';
 return null}
async function askKind(s){
 if(typeof apiFetch!=='function'||typeof apiOn==='function'&&!apiOn())return null;
 try{const r=await apiFetch('/api/symbols/'+encodeURIComponent(s));if(!r.ok)return null;const j=await r.json();if(j.market){MK.set(s,j.market);return j.market}}catch(e){}return null}

// simbol aplikasi -> simbol milik tiap penyedia (null = penyedia itu tidak melayani simbol ini)
const PS={
 binance:(s,k)=>k==='cry'&&/USDT$/.test(s)?s.toLowerCase():null,
 finnhub:(s,k)=>k==='us'?s:k==='fx'?'OANDA:'+s.slice(0,3)+'_'+s.slice(3):(k==='com'?COM[s]:k==='ind'?IND[s]:null)?.[0]||null,
 tiingo:(s,k)=>k==='us'?{svc:'iex',t:s.toLowerCase().replace('.','-')}:k==='fx'?{svc:'fx',t:s.toLowerCase()}:k==='com'&&COM[s]&&COM[s][1]?{svc:'fx',t:COM[s][1]}:null,
 yahoo:(s,k)=>k==='us'?s.replace('.','-'):k==='fx'?s+'=X':k==='com'?COM[s]&&COM[s][2]:k==='ind'?IND[s]&&IND[s][2]:null,
 goapi:(s,k)=>k==='idx'?s:null,
 ohlcdev:(s,k)=>k==='idx'?s:null};
// IDX sengaja TANPA Yahoo: Yahoo menunda data IDX ±10-15 menit, jangan sampai menggantikan sumber realtime yang sedang mati.
const ORDER={cry:['binance'],fx:['tiingo','finnhub','yahoo'],com:['tiingo','finnhub','yahoo'],ind:['finnhub','yahoo'],us:['finnhub','tiingo','yahoo'],idx:['goapi','ohlcdev']};
const STALE={cry:2500,fx:4000,com:4000,ind:5000,us:5000,idx:6000};
const REST_SRC=new Set(['goapi','ohlcdev']);

// ---------- koneksi WebSocket: sambung ulang berjenjang (maks 10 dtk), pengawas "diam terlalu lama" ----------
const CONNS=[];let wd=0;
class Conn{
 constructor(o){this.o=o;this.ws=null;this.refs=0;this.back=400;this.tm=0;this.last=0;this.up=false;this.hadUp=false;this.fail=0;this.state='idle';CONNS.push(this);
  if(!wd&&typeof setInterval==='function')wd=setInterval(()=>{for(const c of CONNS)if(c.ok&&c.o.idle&&now()-c.last>c.o.idle){try{c.ws.close()}catch(e){}}},5000)}
 get ok(){return!!this.ws&&this.ws.readyState===1}
 use(){this.refs++;if(!this.ws&&!this.tm)this.open()}
 free(){this.refs=Math.max(0,this.refs-1);if(!this.refs)this.shut()}
 shut(){clearTimeout(this.tm);this.tm=0;const w=this.ws;this.ws=null;this.up=false;this.state='idle';if(w){w.onopen=w.onmessage=w.onerror=w.onclose=null;try{w.close()}catch(e){}}}
 restart(){if(!this.refs)return;this.shut();this.back=400;this.open()}
 open(){
  const u=this.o.url(this.fail);if(!u){this.state='nokey';return}
  let ws;try{ws=new gl.WebSocket(u)}catch(e){this.fail++;return this.retry()}
  this.ws=ws;this.state='connecting';let opened=false;
  ws.onopen=()=>{opened=true;this.up=true;this.fail=0;this.back=400;this.last=now();this.state='open';this.o.onopen(this);if(this.hadUp)gap(this.o.srcs);this.hadUp=true};
  ws.onmessage=e=>{this.last=now();try{this.o.onmsg(e.data,this)}catch(x){}};
  ws.onerror=()=>{};
  ws.onclose=()=>{if(this.ws!==ws)return;this.ws=null;this.up=false;this.state='down';if(!opened)this.fail++;this.retry()}}
 retry(){if(!this.refs)return;clearTimeout(this.tm);const d=this.back*(.75+Math.random()*.5);this.back=Math.min(10000,this.back*2);this.tm=setTimeout(()=>{this.tm=0;if(this.refs&&!this.ws)this.open()},d)}
 send(x){if(this.ok){try{this.ws.send(typeof x==='string'?x:JSON.stringify(x))}catch(e){}}}}

// ---------- adapter: Binance ----------
const BHOST=['wss://data-stream.binance.vision/stream','wss://stream.binance.com:9443/stream'];
const BTF={'1D':'1d','1W':'1w','1M':'1M'};
const BIN={streams:new Map(),id:0};
BIN.conn=new Conn({srcs:['binance'],idle:30000,url:f=>BHOST[f%BHOST.length],
 onopen(c){const p=[...BIN.streams.keys()];if(p.length)c.send({method:'SUBSCRIBE',params:p,id:++BIN.id})},
 onmsg(raw){const m=JSON.parse(raw),d=m.data||m;if(!d||!d.e)return;
  const name=m.stream||(d.e==='aggTrade'?d.s.toLowerCase()+'@aggTrade':d.e==='kline'?d.s.toLowerCase()+'@kline_'+d.k.i:'');
  const hs=BIN.streams.get(name);if(!hs)return;let t;
  if(d.e==='aggTrade')t={p:+d.p,q:+d.q,ts:d.T};
  else if(d.e==='kline'){const k=d.k;t={k:{t:k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,v:+k.v,x:!!k.x},ts:d.E}}else return;
  for(const f of hs)f(t)}});
BIN.sub=(sym,tf,emit)=>{
 const names=[sym+'@aggTrade',sym+'@kline_'+(BTF[tf]||tf)],wrap=t=>emit({...t,src:'binance'});
 for(const n of names){let s=BIN.streams.get(n);if(!s){s=new Set();BIN.streams.set(n,s);BIN.conn.send({method:'SUBSCRIBE',params:[n],id:++BIN.id})}s.add(wrap)}
 BIN.conn.use();
 return()=>{for(const n of names){const s=BIN.streams.get(n);if(!s)continue;s.delete(wrap);if(!s.size){BIN.streams.delete(n);BIN.conn.send({method:'UNSUBSCRIBE',params:[n],id:++BIN.id})}}BIN.conn.free()}};

// ---------- adapter: Finnhub (trade) ----------
const FH={subs:new Map()};
FH.conn=new Conn({srcs:['finnhub'],idle:90000,keyed:1,url:()=>cfg().finnhub?'wss://ws.finnhub.io?token='+encodeURIComponent(cfg().finnhub):null,
 onopen(c){for(const s of FH.subs.keys())c.send({type:'subscribe',symbol:s})},
 onmsg(raw){const m=JSON.parse(raw);if(m.type!=='trade'||!m.data)return;for(const d of m.data){const hs=FH.subs.get(d.s);if(hs)for(const f of hs)f({src:'finnhub',p:d.p,q:d.v||0,ts:d.t})}}});
FH.sub=(ps,tf,emit)=>{let s=FH.subs.get(ps);if(!s){s=new Set();FH.subs.set(ps,s);FH.conn.send({type:'subscribe',symbol:ps})}s.add(emit);FH.conn.use();
 return()=>{s.delete(emit);if(!s.size){FH.subs.delete(ps);FH.conn.send({type:'unsubscribe',symbol:ps})}FH.conn.free()}};

// ---------- adapter: Tiingo (iex / fx) ----------
// Pesan: {messageType:'A',data:[...]}. fx: ['Q',ticker,iso,bidSz,bid,mid,askSz,ask]. iex: ['T'|'Q',iso,ns,ticker,bidSz,bid,mid,ask,askSz,last,lastSz,...]; level 6: [iso,ticker,refPrice].
function tiingoMsg(svc,raw){
 const m=typeof raw==='string'?JSON.parse(raw):raw;if(!m||m.messageType!=='A'||!Array.isArray(m.data))return null;const d=m.data;
 if(svc==='fx'){if(d[0]!=='Q')return null;const mid=d[5]??((d[4]!=null&&d[7]!=null)?(d[4]+d[7])/2:null);return mid>0?{t:String(d[1]).toLowerCase(),p:mid,q:0,ts:Date.parse(d[2])||now()}:null}
 if(d.length===3&&typeof d[0]==='string'&&/^\d{4}-/.test(d[0]))return d[2]>0?{t:String(d[1]).toLowerCase(),p:d[2],q:0,ts:Date.parse(d[0])||now()}:null;
 if(d[0]==='T'){return d[9]>0?{t:String(d[3]).toLowerCase(),p:d[9],q:d[10]||0,ts:Date.parse(d[1])||now()}:null}
 if(d[0]==='Q'){const mid=d[6]??((d[5]!=null&&d[7]!=null)?(d[5]+d[7])/2:null);return mid>0?{t:String(d[3]).toLowerCase(),p:mid,q:0,ts:Date.parse(d[1])||now()}:null}
 return null}
const TG={};
function tgSvc(svc){
 if(TG[svc])return TG[svc];const o=TG[svc]={subs:new Map()};
 const send=c=>{if(o.subs.size)c.send({eventName:'subscribe',authorization:cfg().tiingo,eventData:{thresholdLevel:cfg().tiingoLevel!=null?+cfg().tiingoLevel:svc==='fx'?5:6,tickers:[...o.subs.keys()]}})};
 o.conn=new Conn({srcs:['tiingo'],idle:90000,keyed:1,url:()=>cfg().tiingo?'wss://api.tiingo.com/'+svc:null,onopen:send,
  onmsg(raw){const t=tiingoMsg(svc,raw);if(!t)return;const hs=o.subs.get(t.t);if(hs)for(const f of hs)f({src:'tiingo',p:t.p,q:t.q,ts:t.ts})}});
 o.send=()=>send(o.conn);return o}
const tgSub=(ps,tf,emit)=>{const o=tgSvc(ps.svc);let s=o.subs.get(ps.t);if(!s){s=new Set();o.subs.set(ps.t,s)}s.add(emit);o.conn.use();o.send();
 return()=>{s.delete(emit);if(!s.size)o.subs.delete(ps.t);o.conn.free()}};

// ---------- adapter: Yahoo WebSocket (tidak resmi, EKSPERIMENTAL; pesan protobuf base64) ----------
function decodeYahoo(b64){
 const bin=typeof atob==='function'?atob(b64):Buffer.from(b64,'base64').toString('binary'),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
 const dv=new DataView(u.buffer);let i=0;const o={};
 const vi=()=>{let r=0,m=1,b;do{b=u[i++];r+=(b&127)*m;m*=128}while(b&128&&i<u.length);return r};
 const zz=n=>n%2===0?n/2:-(n+1)/2;
 while(i<u.length){const tag=vi(),f=Math.floor(tag/8),w=tag&7;
  if(w===0){const v=vi();if(f===3)o.time=zz(v);else if(f===9)o.vol=zz(v)}
  else if(w===1){i+=8}
  else if(w===2){const n=vi();if(f===1)o.id=new TextDecoder().decode(u.subarray(i,i+n));i+=n}
  else if(w===5){const v=dv.getFloat32(i,true);if(f===2)o.price=+v.toPrecision(7);i+=4}
  else break}
 return o.id&&o.price>0?{id:o.id,price:o.price,ts:o.time?(o.time<1e11?o.time*1000:o.time):now(),vol:o.vol}:null}
const YH={subs:new Map()};
YH.conn=new Conn({srcs:['yahoo'],idle:180000,url:()=>cfg().yahoo===false?null:'wss://streamer.finance.yahoo.com/?version=2',
 onopen(c){if(YH.subs.size)c.send({subscribe:[...YH.subs.keys()]})},
 onmsg(raw){const m=JSON.parse(raw);if(m.type!=='pricing'||!m.message)return;const d=decodeYahoo(m.message);if(!d)return;const hs=YH.subs.get(d.id);if(hs)for(const f of hs)f({src:'yahoo',p:d.price,q:0,ts:d.ts})}});
YH.sub=(ps,tf,emit)=>{let s=YH.subs.get(ps);if(!s){s=new Set();YH.subs.set(ps,s);YH.conn.send({subscribe:[ps]})}s.add(emit);YH.conn.use();
 return()=>{s.delete(emit);if(!s.size){YH.subs.delete(ps);YH.conn.send({unsubscribe:[ps]})}YH.conn.free()}};

// ---------- adapter: REST cepat lewat server (GoAPI + OHLC.dev) ----------
const REST={subs:new Map(),off:0,state:'idle'};
REST.sub=(sym,tf,emit)=>{
 let e=REST.subs.get(sym);
 if(!e){e={n:0,ok:0,busy:false,err:0,wait:0,last:{},emits:new Set()};e.t=setInterval(()=>REST.poll(sym,e),Math.max(500,+cfg().restMs||1000));REST.subs.set(sym,e)}
 e.emits.add(emit);REST.poll(sym,e);
 return()=>{e.emits.delete(emit);if(!e.emits.size){clearInterval(e.t);REST.subs.delete(sym)}}};
REST.poll=async(sym,e)=>{
 const t=now();if(e.busy||t<REST.off||t<e.wait||(typeof document!=='undefined'&&document.hidden)||typeof apiFetch!=='function'||(typeof apiOn==='function'&&!apiOn()))return;
 e.busy=true;const seq=++e.n;
 try{const r=await apiFetch('/api/rt/quote?symbol='+encodeURIComponent(sym),{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();
  if(seq<e.ok)return;e.ok=seq;e.err=0;
  if(!j.enabled||!j.enabled.length){REST.off=now()+60000;REST.state='off';return}
  REST.state='open';
  for(const q of j.sources||[]){const L=e.last[q.src];let ts=q.ts;
   if(!q.tsp&&L&&L.p===q.price)ts=L.ts;           // harga sama & penyedia tak memberi waktu: jangan tampak "baru", cukup tandai masih hidup
   e.last[q.src]={p:q.price,ts};for(const f of e.emits)f({src:q.src,p:q.price,ts})}}
 catch(x){e.err++;e.wait=now()+Math.min(5000,400*2**e.err);REST.state='down'}
 finally{e.busy=false}};

const ADP={
 binance:(E,ps,emit)=>BIN.sub(ps,E.tf,emit),finnhub:(E,ps,emit)=>FH.sub(ps,E.tf,emit),
 tiingo:(E,ps,emit)=>tgSub(ps,E.tf,emit),yahoo:(E,ps,emit)=>YH.sub(ps,E.tf,emit)};
const enabled=s=>s==='binance'||(s==='finnhub'?!!cfg().finnhub:s==='tiingo'?!!cfg().tiingo:s==='yahoo'?cfg().yahoo!==false:REST_SRC.has(s)?cfg().rest!==false&&now()>=REST.off:false);

// ---------- hub: pemilihan pemimpin + penyebaran tick ----------
const HUB=new Map();let SEQ=0;
const status=(E,ev)=>{for(const h of E.subs)if(h.onStatus)try{h.onStatus(ev)}catch(e){}};
const gap=srcs=>{for(const E of HUB.values())if(E.order&&E.order.some(s=>srcs.includes(s)))status(E,{type:'gap'})};
const pick=(E,t)=>{for(const s of E.order){const S=E.srcs[s];if(S&&t-S.at<=STALE[E.kind])return s}return null};
function feed(E,t){
 if(E.dead)return;const n=now(),S=E.srcs[t.src]||(E.srcs[t.src]={at:0,ts:0,p:0,n:0});
 if(!t.k){if(!(t.p>0))return;const same=t.p===S.p&&(t.ts||0)<=S.ts;S.at=n;S.ts=Math.max(S.ts,t.ts||n);S.p=t.p;S.n++;if(same)return}else S.at=n;
 const L=pick(E,n);if(L!==E.leader){E.leader=L;E.since=n;status(E,{type:'leader',leader:L})}
 if(!E.all&&t.src!==E.leader)return;
 const tk={id:++SEQ,src:t.src,p:t.p,q:t.q||0,ts:t.ts||n,k:t.k};
 for(const h of E.subs)try{h.onTick(tk)}catch(e){if(typeof console!=='undefined')console.error('[rt]',e)}}
function attach(E,kind){
 E.kind=kind;const ord=((cfg().order||{})[kind])||ORDER[kind]||[];
 E.order=ord.filter(s=>enabled(s)&&PS[s]&&PS[s](E.sym,kind));
 const emit=t=>feed(E,t);let rest=false;
 for(const s of E.order){
  if(REST_SRC.has(s)){if(!rest){rest=true;E.offs.push(REST.sub(E.sym,E.tf,emit))}continue}
  E.offs.push(ADP[s](E,PS[s](E.sym,kind),emit))}
 status(E,{type:'attach'})}
function detach(E){for(const f of E.offs.splice(0))try{f()}catch(e){}}
function sub(sym,tf,onTick,onStatus,opt={}){
 const key=sym+'|'+tf+(opt.all?'|all':'');let E=HUB.get(key);
 if(!E){E={key,sym,tf,all:!!opt.all,kind:null,order:[],srcs:{},leader:null,since:0,subs:new Set(),offs:[],dead:false};HUB.set(key,E);
  const k=kindOf(sym);if(k)attach(E,k);else askKind(sym).then(m=>{if(!E.dead)attach(E,m||'us')})}
 const h={onTick,onStatus};E.subs.add(h);
 return()=>{E.subs.delete(h);if(!E.subs.size){E.dead=true;detach(E);HUB.delete(key)}}}
function info(sym,tf){
 const E=HUB.get(sym+'|'+tf);if(!E)return{live:false,has:false,leader:null,order:[]};
 const n=now(),L=E.srcs[E.leader],live=!!L&&n-L.at<=STALE[E.kind||'us'];
 const srcs={};for(const s of E.order){const S=E.srcs[s];srcs[s]=S?{age:n-S.at,n:S.n}:null}
 return{live,has:E.order.length>0,leader:live?E.leader:null,age:L?n-L.at:null,lag:L&&L.ts?Math.max(0,n-L.ts):null,kind:E.kind,order:E.order,srcs}}
// dipanggil setelah kunci di Setting berubah: sambung ulang koneksi bertanda kunci dan susun ulang sumber tiap langganan
function refresh(){for(const c of CONNS)if(c.o.keyed)c.restart();for(const E of HUB.values()){detach(E);E.srcs={};E.leader=null;if(E.kind)attach(E,E.kind)}}
const conns=()=>({binance:BIN.conn.state,finnhub:FH.conn.state,tiingo:Object.values(TG).map(o=>o.conn.state).join('/')||'idle',yahoo:YH.conn.state,rest:REST.state});
// uji sumber: berlangganan satu simbol per pasar dan hitung tick tiap sumber (semua sumber, bukan hanya pemimpin)
function probe(ms=6000){return new Promise(res=>{const got={},offs=[['BTCUSDT','1m'],['EURUSD','1m'],['AAPL','1m'],['BBCA','1m']].map(([s,t])=>sub(s,t,x=>{got[x.src]=(got[x.src]||0)+1},null,{all:true}));
 setTimeout(()=>{offs.forEach(f=>f());res(got)},ms)})}

// ---------- logika candle (murni, diuji) ----------
// apply: terapkan satu tick ke deret D (urut naik). Mengembalikan 'upd' | 'new' | 'none'. st = lebar bar (detik).
function apply(D,st,tk){
 const l=D[D.length-1];if(!l)return'none';
 if(tk.k){const k=tk.k,t=Math.floor(k.t/1000);
  if(t===l.t){l.o=k.o;l.h=Math.max(l.h,k.h);l.l=Math.min(l.l,k.l);l.v=Math.max(l.v,k.v);if(k.x)l.c=k.c;return'upd'}
  if(t>l.t){D.push({t,o:k.o,h:k.h,l:k.l,c:k.c,v:k.v});return'new'}return'none'}
 const p=tk.p;if(!(p>0))return'none';
 const ts=Math.floor((tk.ts||now())/1000);let nb=l.t;
 if(ts>=l.t+st){if(st>604800)return'none';nb=l.t+Math.floor((ts-l.t)/st)*st}      // grid mengikuti bar terakhir; bar 1M tidak dibuat dari tick (diisi merge dari server)
 if(nb>l.t){D.push({t:nb,o:p,h:p,l:p,c:p,v:tk.q||0});return'new'}
 if(ts<l.t)return'none';
 if(p>l.h)l.h=p;if(p<l.l)l.l=p;l.c=p;l.v+=tk.q||0;return'upd'}
// merge: gabungkan candle REST (j) ke D. live=true: bar berjalan TIDAK ditimpa harga penutupnya (supaya tidak mundur ke data basi), hanya open/high/low/volume yang diperluas.
// Mengembalikan jumlah bar baru yang disisipkan.
function merge(D,j,live){
 let n=0;
 for(const b of j){let i=D.length-1;while(i>=0&&D[i].t>b.t)i--;
  if(i>=0&&D[i].t===b.t){const x=D[i];
   if(i===D.length-1&&live){x.o=b.o;if(b.h>x.h)x.h=b.h;if(b.l<x.l)x.l=b.l;if(b.v>x.v)x.v=b.v}
   else Object.assign(x,b)}
  else{D.splice(i+1,0,{...b});n++}}
 return n}

gl.RT={sub,info,refresh,conns,probe,bars:{apply,merge},_t:{kindOf,PS,ORDER,decodeYahoo,tiingoMsg,HUB,feed,enabled,CONNS}};
})();
