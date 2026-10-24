// App "headmaps" (dock). Heatmap likuiditas/likuidasi LIVE ala CoinMarketCap/Coinglass: harga di sumbu Y, waktu di sumbu X, candle di atas heat, bubble trade besar.
// Berdiri sendiri: tanpa server aplikasi (jalan juga di mode Dummy). Hanya memakai S.sym + open('chart') dari app lain.
//   Kripto (banyak koin, ketik simbol apa pun):
//     klines  REST  fapi.binance.com (futures) -> cadangan data-api.binance.vision (spot)
//     live    WS    <sym>@kline_<tf> + @aggTrade (bubble) + @depth@100ms (mode Order Book) + @forceOrder (likuidasi riil, futures saja)
//   XAUUSD & forex: lewat mt5-bridge/ (WebSocket lokal): tick live + riwayat candle ({t:'rates'}); broker tidak memberi order book, jadi mode Order Book = aktivitas harga (waktu di harga)
// Mode:
//   Likuidasi (MODEL): tiap candle membuka posisi seberat volumenya, dibagi tingkat leverage 10/25/50/100x (long & short); harga likuidasinya jadi garis panas
//                      sampai harga menyentuhnya. Ini ESTIMASI (seperti Coinglass), bukan data bursa.
//   Order Book       : order book Binance direkam tiap 0,5 dtk (hanya sejak app dibuka); terang = likuiditas pasang besar.
// Tab ala Chart: tiap tab menyimpan {id,sym,tf,mode,bars,rg,pal,bub,liq}; panel samping ala Watchlist (Favorit / Kripto / MT5) untuk ganti simbol.
// localStorage 'tc.headmaps' {sym,tf,mode,bars,rg,pal,bub,liq (= tab aktif), tabs,act,uid,side,sdv,fav,mt5}; alamat bridge khusus perangkat ini, tidak disinkronkan ke server.
(()=>{
const KEY='tc.headmaps';
const TFS=[['1m',60e3],['5m',300e3],['15m',900e3],['1h',3600e3],['4h',14400e3]],TFM=Object.fromEntries(TFS);
const MODES=[['liq','Likuidasi (model)'],['ob','Order Book']],BARS=[80,120,200],RGS=[['t','Ketat',.25],['n','Normal',.8],['w','Lebar',1.8]],PALS=[['a','Biru'],['b','Spektrum']];
const QUICK=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','XAUUSD'];
const TIERS=[[10,.3],[25,.3],[50,.25],[100,.15]],MMR=.005;           // tingkat leverage & porsi volume; margin pemeliharaan 0,5%
const API={fut:'https://fapi.binance.com/fapi/v1',spot:'https://data-api.binance.vision/api/v3'};
const WSH={fut:['wss://fstream.binance.com/stream'],spot:['wss://data-stream.binance.vision/stream','wss://stream.binance.com:9443/stream']};
const TABF=['sym','tf','mode','bars','rg','pal','bub','liq'],MAXTAB=12;
const DEF={sym:'BTCUSDT',tf:'15m',mode:'liq',bars:120,rg:'n',pal:'a',bub:true,liq:true,mt5:'ws://127.0.0.1:8765',tabs:[],act:0,uid:0,side:true,sdv:'fav',fav:QUICK.slice()};
const SVS=[['fav','Favorit'],['cry','Kripto'],['mt5','MT5']];
const fix=o=>{if(!TFM[o.tf])o.tf=DEF.tf;if(!MODES.some(m=>m[0]===o.mode))o.mode=DEF.mode;if(!BARS.includes(o.bars))o.bars=DEF.bars;if(!RGS.some(r=>r[0]===o.rg))o.rg=DEF.rg;if(!PALS.some(p=>p[0]===o.pal))o.pal=DEF.pal;
 if(typeof o.sym!=='string'||!/^[A-Z0-9._-]{3,20}$/.test(o.sym))o.sym=DEF.sym;o.bub=o.bub!==false;o.liq=o.liq!==false;return o};
const pickTab=o=>Object.fromEntries(TABF.map(k=>[k,o[k]]));
let H={...DEF};try{H={...H,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(e){}
fix(H);if(typeof H.mt5!=='string')H.mt5=DEF.mt5;H.side=H.side!==false;if(!SVS.some(v=>v[0]===H.sdv))H.sdv=DEF.sdv;
H.fav=Array.isArray(H.fav)?[...new Set(H.fav.filter(x=>typeof x==='string'&&/^[A-Z0-9._-]{3,20}$/.test(x)))].slice(0,60):DEF.fav.slice();
// tab: buang yang rusak/ganda; tanpa tab (data lama) -> satu tab dari pengaturan lama
{const seen=new Set();H.tabs=(Array.isArray(H.tabs)?H.tabs:[]).filter(t=>t&&typeof t==='object'&&Number.isInteger(t.id)&&t.id>0&&!seen.has(t.id)&&seen.add(t.id)).slice(0,MAXTAB).map(t=>({id:t.id,...pickTab(fix({...DEF,...t}))}));
 H.uid=Math.max(Number.isInteger(H.uid)?H.uid:0,0,...H.tabs.map(t=>t.id));
 if(!H.tabs.length)H.tabs=[{id:++H.uid,...pickTab(H)}];
 if(!H.tabs.some(t=>t.id===H.act))H.act=H.tabs[0].id;
 Object.assign(H,pickTab(H.tabs.find(t=>t.id===H.act)))}
const store=()=>{const t=H.tabs.find(t=>t.id===H.act);if(t)for(const k of TABF)t[k]=H[k];try{localStorage.setItem(KEY,JSON.stringify(H))}catch(e){}};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');

// ---------- util murni (diuji) ----------
const niceStep=x=>{if(!(x>0))return 1;const e=Math.pow(10,Math.floor(Math.log10(x))),f=x/e;return(f<=1?1:f<=2?2:f<=5?5:10)*e};
const pctl=(a,p)=>{if(!a.length)return 0;const s=Float64Array.from(a).sort();return s[Math.min(s.length-1,Math.floor(p*(s.length-1)+.5))]};
const isFut=s=>/USDT$/.test(s);
function alignBar(t,tf,off=0){return Math.floor((t+off)/tf)*tf-off}
// tick MT5 -> candle terakhir (bar baru bila melewati batas); volume = jumlah tick
function tickBar(bars,p,now,tf,off=0){if(!(p>0))return false;const t=alignBar(now,tf,off),L=bars[bars.length-1];
 if(L&&t<L.t)return false;
 if(!L||t>L.t){bars.push({t,o:L?L.c:p,h:Math.max(p,L?L.c:p),l:Math.min(p,L?L.c:p),c:p,v:1});return true}
 if(p>L.h)L.h=p;if(p<L.l)L.l=p;L.c=p;L.v++;return true}
function klineBar(bars,k){const b={t:+k.t,o:+k.o,h:+k.h,l:+k.l,c:+k.c,v:+k.q||0},L=bars[bars.length-1];
 if(L&&L.t===b.t)bars[bars.length-1]=b;else if(!L||b.t>L.t)bars.push(b);else return false;
 if(bars.length>1500)bars.splice(0,bars.length-1200);return true}
const parseKlines=j=>Array.isArray(j)?j.map(k=>({t:+k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[7]||0})).filter(b=>b.c>0):[];
// level likuidasi model: tiap candle -> 8 level (4 leverage x long/short) di sekitar harga tipikal; berakhir di candle pertama yang menyentuhnya
function liqLevels(bars){const out=[];
 for(let i=0;i<bars.length;i++){const b=bars[i],tp=(b.h+b.l+b.c)/3||b.c,w=b.v;if(!(w>0&&tp>0))continue;const lw=b.c>=b.o?.55:.45;
  for(const[L,tw]of TIERS){out.push({i,s:'L',p:tp*(1-1/L+MMR),w:w*tw*lw,e:bars.length});out.push({i,s:'S',p:tp*(1+1/L-MMR),w:w*tw*(1-lw),e:bars.length})}}
 for(const lv of out){const L=lv.s==='L';for(let j=lv.i+1;j<bars.length;j++){if(L?bars[j].l<=lv.p:bars[j].h>=lv.p){lv.e=j;break}}}
 return out}
// grid[r*cols+c], baris 0 = harga tertinggi. Kolom = candle i0..n-1 + ext kolom kosong di kanan (level yang belum tersentuh diteruskan)
function liqGrid(levels,i0,n,ext,pMin,pMax,rows){const cols=n-i0+ext,g=new Float32Array(rows*cols),k=rows/(pMax-pMin);
 for(const lv of levels){if(lv.p<pMin||lv.p>=pMax)continue;const r=rows-1-Math.floor((lv.p-pMin)*k),from=Math.max(lv.i+1,i0)-i0,to=lv.e>=n?cols:lv.e-i0;
  for(let c=from,o=r*cols;c<to;c++)g[o+c]+=lv.w}
 return{g,cols,rows}}
// order book terekam: kolom waktu (colMs) -> {s:Map(bucket->usd),n}; bucket = round(harga/bstep)
function obGrid(OBC,colMs,bstep,t0,t1,pMin,pMax,rows){const c0=Math.floor(t0/colMs),c1=Math.floor(t1/colMs),cols=c1-c0+1,g=new Float32Array(rows*cols),k=rows/(pMax-pMin);
 for(let c=c0;c<=c1;c++){const col=OBC.get(c);if(!col||!col.n)continue;for(const[bk,v]of col.s){const p=bk*bstep;if(p<pMin||p>=pMax)continue;g[(rows-1-Math.floor((p-pMin)*k))*cols+(c-c0)]+=v/col.n}}
 return{g,cols,rows,t0:c0*colMs,colMs}}
function blurV(g,cols,rows){const o=new Float32Array(g.length);for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const i=r*cols+c;o[i]=(2*g[i]+(r>0?g[i-cols]:g[i])*.5+(r<rows-1?g[i+cols]:g[i])*.5)/3}return o}
function lutOf(stops){const o=new Uint8ClampedArray(256*3),p=stops.map(([t,h])=>[t,parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]);
 for(let i=0;i<256;i++){const t=i/255;let a=p[0],b=p[p.length-1];for(let j=1;j<p.length;j++)if(t<=p[j][0]){a=p[j-1];b=p[j];break}const f=b[0]===a[0]?0:(t-a[0])/(b[0]-a[0]);for(let k=0;k<3;k++)o[i*3+k]=a[k+1]+(b[k+1]-a[k+1])*f}return o}
const LUT={a:lutOf([[0,'#0a1236'],[.2,'#12308a'],[.42,'#1d5fb8'],[.62,'#22a9be'],[.82,'#98d28a'],[1,'#f0dc5a']]),b:lutOf([[0,'#1c0c44'],[.25,'#3d22a0'],[.5,'#1f9c9c'],[.75,'#5ed15a'],[1,'#f4f23a']])},BG=[7,11,32];
function paintGrid(g,n,vmax,lut,id){const d=id.data;for(let i=0;i<n;i++){const v=g[i],o=i*4;if(!(v>0)){d[o]=BG[0];d[o+1]=BG[1];d[o+2]=BG[2];d[o+3]=255;continue}
  const t=Math.min(1,Math.sqrt(v/vmax)),k=Math.round(t*255)*3;d[o]=lut[k];d[o+1]=lut[k+1];d[o+2]=lut[k+2];d[o+3]=255}}
// buku order Binance: snapshot REST + selisih WS (aturan sinkron resmi spot & futures); 'gap' = harus ambil snapshot ulang
class Book{constructor(fut){this.fut=fut;this.b=new Map();this.a=new Map();this.id=0;this.buf=[];this.ok=false;this.last=0}
 reset(){this.b.clear();this.a.clear();this.id=0;this.buf=[];this.ok=false;this.last=0}
 snapshot(j){this.b.clear();this.a.clear();for(const[p,q]of j.bids||[])this.b.set(+p,+q);for(const[p,q]of j.asks||[])this.a.set(+p,+q);this.id=+j.lastUpdateId;this.ok=false;this.last=0;
  const buf=this.buf;this.buf=[];let r='ok';for(const e of buf){const x=this.feed(e);if(x==='gap')r='gap'}return r}
 feed(e){if(!this.id){this.buf.push(e);if(this.buf.length>5000)this.buf.shift();return'buf'}
  if(e.u<=this.id)return'old';
  if(!this.ok){if(e.U>this.id+1)return'gap';this.ok=true}
  else if(this.fut?e.pu!==this.last:e.U!==this.last+1)return'gap';
  for(const[p,q]of e.b||[]){+q?this.b.set(+p,+q):this.b.delete(+p)}for(const[p,q]of e.a||[]){+q?this.a.set(+p,+q):this.a.delete(+p)}
  this.last=e.u;return'ok'}}
// ambang bubble trade besar: persentil 99,5 dari jendela trade terakhir, minimal 15x median
function bubbleThr(w){if(w.length<200)return Infinity;return Math.max(pctl(w,.995),15*pctl(w,.5))}

// ---------- koneksi WebSocket: sambung ulang berjenjang (maks 10 dtk) + pengawas "diam terlalu lama" ----------
class Link{
 constructor(o){this.o=o;this.ws=null;this.tm=0;this.back=500;this.fail=0;this.last=0;this.st='idle';this.on=false}
 set(s){if(this.st!==s){this.st=s;if(this.o.onstate)this.o.onstate(s)}}
 start(){this.on=true;if(!this.ws&&!this.tm)this.open()}
 stop(){this.on=false;clearTimeout(this.tm);this.tm=0;this.kill();this.set('idle')}
 kill(){const w=this.ws;this.ws=null;if(w){w.onopen=w.onmessage=w.onerror=w.onclose=null;try{w.close()}catch(e){}}}
 restart(){this.kill();clearTimeout(this.tm);this.tm=0;this.back=500;this.fail=0;if(this.on)this.open()}
 open(){const u=this.o.url(this.fail);if(!u){this.set('nokey');return}
  let ws;try{ws=new WebSocket(u)}catch(e){this.fail++;this.set('down');return this.retry()}
  this.ws=ws;this.set('connecting');let ok=false;
  ws.onopen=()=>{ok=true;this.fail=0;this.back=500;this.last=Date.now();this.set('open');if(this.o.onopen)this.o.onopen(this)};
  ws.onmessage=e=>{this.last=Date.now();try{this.o.onmsg(e.data,this)}catch(x){}};
  ws.onerror=()=>{};
  ws.onclose=()=>{if(this.ws!==ws)return;this.ws=null;if(!ok)this.fail++;this.set('down');this.retry()}}
 retry(){if(!this.on)return;clearTimeout(this.tm);const d=this.back*(.75+Math.random()*.5);this.back=Math.min(10000,this.back*2);this.tm=setTimeout(()=>{this.tm=0;if(this.on&&!this.ws)this.open()},d)}
 send(x){if(this.ws&&this.ws.readyState===1)try{this.ws.send(typeof x==='string'?x:JSON.stringify(x))}catch(e){}}
 watch(ms){if(this.on&&this.ws&&this.ws.readyState===1&&Date.now()-this.last>ms)try{this.ws.close()}catch(e){}}}
async function jget(u,ms=10000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(u,{signal:c.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(t)}}

// ---------- state data simbol aktif ----------
let cur=null,CW=null,seqId=0,srcPref='fut',SYMS=[];
const FX=new Map(),MTS=new Set(['XAUUSD']);let mtOff=0,mtReq=0;
function mkD(sym,tf){const kind=isFut(sym)?'cry':'mt5';return{sym,tf,tfMs:TFM[tf],kind,src:kind==='mt5'?'mt5':srcPref,bars:[],levels:null,lvN:-1,ready:false,err:'',busy:true,dirty:1,
 OBC:new Map(),obMs:Math.max(5000,TFM[tf]/6),bstep:0,book:null,bookSt:'',B:[],F:[],TW:[],thr:Infinity,since:0,seq:++seqId}}
const bookUrl=D=>D.src==='fut'?`${API.fut}/depth?symbol=${D.sym}&limit=1000`:`${API.spot}/depth?symbol=${D.sym}&limit=5000`;
async function loadBars(D){
 if(D.kind==='mt5'){mtAsk(D);return}
 let lastErr=null;const order=srcPref==='fut'?['fut','spot']:['spot','fut'];
 for(const s of order){try{const j=await jget(`${API[s]}/klines?symbol=${D.sym}&interval=${D.tf}&limit=1000`,s==='fut'?7000:12000);const b=parseKlines(j);if(b.length<5)throw new Error('data kosong');
   if(D!==cur)return;D.src=s;srcPref=s;D.bars=b;D.ready=true;D.busy=false;D.err='';D.dirty=1;D.bstep=niceStep(b[b.length-1].c/20000);D.since=Date.now();liveSync(true);return}
  catch(e){lastErr=e}}
 if(D!==cur)return;D.busy=false;D.err='Gagal memuat '+D.sym+' dari Binance ('+(lastErr&&lastErr.message||'jaringan')+'). Cek nama simbol/koneksi.';D.dirty=1}
function mtAsk(D){if(MT.st!=='open'){D.err='MT5 belum terhubung. Jalankan mt5-bridge lalu buka Pengaturan MT5 untuk alamatnya.';D.busy=false;D.dirty=1;return}
 D.err='';D.busy=true;D.reqId=++mtReq;MT.send({t:'rates',s:D.sym,tf:D.tf,n:1000,id:D.reqId});clearTimeout(D.rto);D.rto=setTimeout(()=>{if(D===cur&&!D.ready){D.busy=false;D.err='Bridge tidak mengirim riwayat '+D.sym+' (simbol belum ada di Market Watch MT5?).';D.dirty=1}},8000)}
function mtRates(m){const D=cur;if(!D||D.kind!=='mt5'||m.s!==D.sym||m.tf!==D.tf)return;clearTimeout(D.rto);mtOff=+m.off||0;
 const b=(m.bars||[]).map(x=>({t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[5]||0})).filter(x=>x.c>0);
 if(b.length<5){D.busy=false;D.err='Riwayat '+D.sym+' kosong dari MT5.';D.dirty=1;return}
 D.bars=b;D.ready=true;D.busy=false;D.err='';D.dirty=1;D.bstep=niceStep(b[b.length-1].c/20000);D.since=Date.now()}
// ---------- stream Binance ----------
const LIVE=new Link({url:f=>{const D=cur;if(!D||D.kind!=='cry')return null;const h=WSH[D.src];return h[f%h.length]},onopen(l){l.cur=new Set();liveSync()},onmsg:onLive});
const streams=D=>{const s=D.sym.toLowerCase(),o=[s+'@kline_'+D.tf];if(H.bub)o.push(s+'@aggTrade');if(H.mode==='ob')o.push(s+'@depth@100ms');if(H.liq&&D.src==='fut')o.push(s+'@forceOrder');return o};
function liveSync(restart){const D=cur;if(!D||D.kind!=='cry'||!D.ready){LIVE.stop();return}
 if(restart){LIVE.on=true;LIVE.restart();return}LIVE.start();
 const want=new Set(streams(D)),have=LIVE.cur||(LIVE.cur=new Set());
 const add=[...want].filter(s=>!have.has(s)),del=[...have].filter(s=>!want.has(s));
 if(add.length){LIVE.send({method:'SUBSCRIBE',params:add,id:++seqId});add.forEach(s=>have.add(s))}
 if(del.length){LIVE.send({method:'UNSUBSCRIBE',params:del,id:++seqId});del.forEach(s=>have.delete(s))}
 if(add.some(s=>s.includes('@depth')))bookStart(D);if(del.some(s=>s.includes('@depth'))&&D.book){D.book.reset();D.bookSt=''}}
async function bookStart(D){if(!D.book)D.book=new Book(D.src==='fut');const bk=D.book;bk.reset();D.bookSt='sync';
 try{const j=await jget(bookUrl(D),12000);if(D!==cur||!LIVE.cur||![...LIVE.cur].some(s=>s.includes('@depth')))return;const r=bk.snapshot(j);D.bookSt=r==='gap'?'gap':'ok';if(r==='gap')setTimeout(()=>bookStart(D),800)}
 catch(e){if(D===cur){D.bookSt='err';setTimeout(()=>{if(D===cur&&D.bookSt==='err'&&H.mode==='ob')bookStart(D)},4000)}}}
function onLive(raw){const m=JSON.parse(raw),s=m.stream,d=m.data,D=cur;if(!s||!d||!D||D.kind!=='cry')return;
 if(s.includes('@kline_')){if(d.k&&klineBar(D.bars,d.k))D.dirty=1}
 else if(s.includes('@aggTrade')){const usd=+d.p*+d.q,w=D.TW;w.push(usd);if(w.length>3000)w.splice(0,500);if(w.length%100===0)D.thr=bubbleThr(w);
  if(usd>=D.thr){D.B.push({t:+d.T,p:+d.p,usd,buy:!d.m});if(D.B.length>400)D.B.splice(0,100);D.dirty=1}}
 else if(s.includes('@depth')){if(!D.book)return;const r=D.book.feed(d);if(r==='gap'&&D.bookSt!=='sync'){bookStart(D)}}
 else if(s.includes('@forceOrder')){const o=d.o;if(!o)return;const q=+o.z||+o.q,p=+o.ap||+o.p;D.F.push({t:+o.T,p,usd:p*q,long:o.S==='SELL'});if(D.F.length>300)D.F.splice(0,100);D.dirty=1}}
// rekam order book (kripto) / aktivitas harga (MT5) tiap 0,5 dtk
function sample(D){if(!D||!D.ready||!D.bars.length)return;const now=Date.now(),ci=Math.floor(now/D.obMs);let col=D.OBC.get(ci);const last=D.bars[D.bars.length-1].c,bs=D.bstep;
 if(D.kind==='cry'){const bk=D.book;if(!bk||!bk.ok)return;if(!col){col={s:new Map(),n:0,lo:Infinity,hi:-Infinity};D.OBC.set(ci,col)}const lim=last*.08;
  for(const M of[bk.b,bk.a])for(const[p,q]of M){if(Math.abs(p-last)>lim)continue;const k=Math.round(p/bs);col.s.set(k,(col.s.get(k)||0)+p*q);if(k<col.lo)col.lo=k;if(k>col.hi)col.hi=k}col.n++}
 else{if(!col){col={s:new Map(),n:0,lo:Infinity,hi:-Infinity};D.OBC.set(ci,col)}const k=Math.round(last/bs);for(const[o,w]of[[-1,.5],[0,1],[1,.5]])col.s.set(k+o,(col.s.get(k+o)||0)+w);col.lo=Math.min(col.lo,k-1);col.hi=Math.max(col.hi,k+1);col.n++}
 if(D.OBC.size>4000){const ks=[...D.OBC.keys()].sort((a,b)=>a-b);for(const k of ks.slice(0,1000))D.OBC.delete(k)}}
// ---------- MT5 ----------
const MT=new Link({url:()=>/^wss?:\/\//i.test(H.mt5||'')?H.mt5.trim():null,
 onopen(){const D=cur;if(D&&D.kind==='mt5'&&!D.ready)mtAsk(D)},
 onmsg(raw){const m=JSON.parse(raw);
  if(m.t==='hello'){MT.info=m;mtOff=+m.off||mtOff;(m.symbols||[]).forEach(s=>MTS.add(s));if(cur&&cur.kind==='mt5'&&!cur.ready)mtAsk(cur);if(cw()){dlist(cw());if(H.sdv==='mt5'||sq(cw()))sideList(cw())}return}
  if(m.t==='hb')return;
  if(m.t==='rates')return mtRates(m);
  if(m.t==='tick'&&typeof m.s==='string'&&+m.b>0){const r=FX.get(m.s)||{s:m.s,p:0,d:5,at:0};r.p=+m.b;r.a=+m.a||0;r.d=Number.isInteger(m.d)?m.d:r.d;r.at=Date.now();FX.set(m.s,r);MTS.add(m.s);
   const D=cur;if(D&&D.kind==='mt5'&&D.ready&&D.sym===m.s&&tickBar(D.bars,r.p,Date.now(),D.tfMs,mtOff))D.dirty=1}}});
const stTxt={open:'terhubung',connecting:'menyambung…',down:'terputus',idle:'mati',nokey:'alamat kosong'};

// ---------- tampilan ----------
const cw=()=>CW;
let tmr=0,V=null,hc=null,popOpen=false,UPC='#35c28a',DNC='#ef6a5e';
const PADL=64,PADR=70,PADT=8,PADB=22;
const fmtX=(v,st)=>{const d=Math.max(0,Math.min(8,-Math.floor(Math.log10(st||1))));return v.toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d})};
const fmtPx=p=>p.toLocaleString('id-ID',{minimumFractionDigits:p>=1000?2:p>=100?3:p>=1?4:p>=.01?6:8,maximumFractionDigits:p>=1000?2:p>=100?3:p>=1?4:p>=.01?6:8});
const fmtU=(v,usd=true)=>{const a=Math.abs(v),u=usd?'$':'';return a>=1e9?u+(v/1e9).toFixed(2)+'B':a>=1e6?u+(v/1e6).toFixed(2)+'M':a>=1e3?u+(v/1e3).toFixed(1)+'K':u+v.toFixed(a<10?2:0)}
const p2=n=>String(n).padStart(2,'0'),fmtT=t=>{const d=new Date(t);return p2(d.getHours())+':'+p2(d.getMinutes())},fmtDT=t=>{const d=new Date(t);return p2(d.getDate())+'/'+p2(d.getMonth()+1)+' '+fmtT(t)};
function view(D){const n=D.bars.length,ob=H.mode==='ob';let i0=Math.max(0,n-H.bars);
 // order book hanya ada sejak direkam: jendela waktu mulai sedikit sebelum rekaman dan melebar sampai penuh
 if(ob&&D.since){const j=D.bars.findIndex(b=>b.t+D.tfMs>D.since-3*D.tfMs);if(j>=0)i0=Math.max(i0,Math.min(j,n-8))}
 const vis=D.bars.slice(i0),ext=Math.max(2,Math.round(H.bars*.07)),f=RGS.find(r=>r[0]===H.rg)[2]*(ob?.1:1),tL=vis[0].t,tR=vis[vis.length-1].t+D.tfMs*(ext+1);
 let hi=-Infinity,lo=Infinity;for(const b of vis){if(b.h>hi)hi=b.h;if(b.l<lo)lo=b.l}
 if(ob){let l2=Infinity,h2=-Infinity;for(let c=Math.floor(tL/D.obMs),c1=Math.floor(tR/D.obMs);c<=c1;c++){const col=D.OBC.get(c);if(col&&col.n){if(col.lo<l2)l2=col.lo;if(col.hi>h2)h2=col.hi}}
  if(h2>=l2){lo=Math.min(lo,l2*D.bstep);hi=Math.max(hi,h2*D.bstep)}}
 const pad=(hi-lo)*f+(hi+lo)/2*.001;
 return{i0,n,ext,tL,tR,pMax:hi+pad,pMin:lo-pad}}
function grid(D,v,rows){
 if(H.mode==='liq'){if(!D.levels||D.lvN!==D.bars.length||D.dirty===2||Date.now()-D.lvT>1500){D.levels=liqLevels(D.bars);D.lvN=D.bars.length;D.lvT=Date.now()}
  const r=liqGrid(D.levels,v.i0,v.n,v.ext,v.pMin,v.pMax,rows);return{...r,t0:D.bars[v.i0].t,colMs:D.tfMs}}
 return obGrid(D.OBC,D.obMs,D.bstep,v.tL,v.tR,v.pMin,v.pMax,rows)}
function draw(w){const D=cur,cv=$('.hdm-c',w);if(!cv)return;const box=cv.parentNode,W=box.clientWidth,Hh=box.clientHeight;if(W<120||Hh<100)return;
 const dpr=Math.min(2,window.devicePixelRatio||1);if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(Hh*dpr)){for(const c of[cv,$('.hdm-o',w)]){c.width=Math.round(W*dpr);c.height=Math.round(Hh*dpr);c.style.width=W+'px';c.style.height=Hh+'px'}}
 const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.fillStyle='#070b20';x.fillRect(0,0,W,Hh);
 const msg=$('.hdm-msg',w);
 if(!D||!D.ready||D.bars.length<3){msg.hidden=false;msg.textContent=D&&D.err?D.err:'Memuat '+(D?D.sym:'')+'…';V=null;return}
 msg.hidden=true;const pl=PADL,pr=W-PADR,pt=PADT,pb=Hh-PADB,pw=pr-pl,ph=pb-pt,v=view(D);let rows=Math.max(60,Math.min(240,Math.round(ph/3.5)));if(H.mode==='ob')rows=Math.max(12,Math.min(rows,Math.floor((v.pMax-v.pMin)/D.bstep)));
 const G=grid(D,v,rows),tot=G.cols*rows;let g=G.g;if(H.mode==='liq')g=blurV(g,G.cols,rows);
 const nz=[];for(let i=0;i<tot;i+=1)if(g[i]>0)nz.push(g[i]);const vmax=nz.length?Math.max(pctl(nz,.992),1e-9):1;
 if(!hc)hc=document.createElement('canvas');hc.width=G.cols;hc.height=rows;const hx=hc.getContext('2d'),id=hx.createImageData(G.cols,rows);paintGrid(g,tot,vmax,LUT[H.pal],id);hx.putImageData(id,0,0);
 const xs=t=>pl+(t-v.tL)/(v.tR-v.tL)*pw,ys=p=>pt+(v.pMax-p)/(v.pMax-v.pMin)*ph;
 x.save();x.beginPath();x.rect(pl,pt,pw,ph);x.clip();x.imageSmoothingEnabled=false;x.drawImage(hc,xs(G.t0),pt,G.cols*G.colMs/(v.tR-v.tL)*pw,ph);
 // candle
 const bw=Math.max(1,pw/((v.tR-v.tL)/D.tfMs)*.7);
 for(let i=v.i0;i<v.n;i++){const b=D.bars[i],cx=xs(b.t+D.tfMs/2),up=b.c>=b.o;x.strokeStyle=x.fillStyle=up?UPC:DNC;x.lineWidth=1;x.beginPath();x.moveTo(cx,ys(b.h));x.lineTo(cx,ys(b.l));x.stroke();
  const y1=ys(Math.max(b.o,b.c)),y2=ys(Math.min(b.o,b.c));x.fillRect(cx-bw/2,y1,bw,Math.max(1,y2-y1))}
 // bubble trade besar & likuidasi riil
 if(H.bub&&D.kind==='cry'){for(const q of D.B){if(q.t<v.tL||q.p<v.pMin||q.p>v.pMax)continue;const r=Math.max(4,Math.min(22,5+5*Math.log10(q.usd/Math.max(D.thr,1)+1)*2.2));
   x.beginPath();x.arc(xs(q.t),ys(q.p),r,0,6.283);x.fillStyle=q.buy?'rgba(40,150,230,.55)':'rgba(230,70,130,.55)';x.fill();x.strokeStyle=q.buy?'#5cc0ff':'#ff7ab0';x.lineWidth=1;x.stroke();
   if(r>9){x.fillStyle='#fff';x.font='9px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText(fmtU(q.usd),xs(q.t),ys(q.p))}}}
 if(H.liq&&D.src==='fut'){for(const q of D.F){if(q.t<v.tL||q.p<v.pMin||q.p>v.pMax)continue;const r=Math.max(3,Math.min(12,3+Math.log10(q.usd+1)));x.beginPath();x.moveTo(xs(q.t),ys(q.p)-r);x.lineTo(xs(q.t)+r,ys(q.p)+r);x.lineTo(xs(q.t)-r,ys(q.p)+r);x.closePath();x.fillStyle=q.long?'#ff9d3d':'#9d7bff';x.fill()}}
 // harga sekarang
 const last=D.bars[D.bars.length-1].c;x.strokeStyle='rgba(255,255,255,.55)';x.setLineDash([4,4]);x.beginPath();x.moveTo(pl,ys(last));x.lineTo(pr,ys(last));x.stroke();x.setLineDash([]);x.restore();
 // sumbu
 x.font='11px system-ui';x.fillStyle='#aab2c0';x.textBaseline='middle';x.textAlign='left';const st=niceStep((v.pMax-v.pMin)/9);
 for(let p=Math.ceil(v.pMin/st)*st;p<v.pMax;p+=st){const y=ys(p);x.fillText(fmtX(p,st),pr+6,y);x.fillStyle='rgba(255,255,255,.07)';x.fillRect(pl,y,pw,1);x.fillStyle='#aab2c0'}
 x.fillStyle=last>=D.bars[D.bars.length-2].c?UPC:DNC;x.fillRect(pr,ys(last)-8,PADR,16);x.fillStyle='#fff';x.fillText(fmtPx(last),pr+4,ys(last));
 x.fillStyle='#aab2c0';x.textAlign='center';x.textBaseline='top';const ts=Math.max(1,Math.ceil(70/(pw/(v.n-v.i0+v.ext))));
 for(let i=v.i0;i<v.n;i+=ts){x.fillText(D.tfMs>=86400e3?fmtDT(D.bars[i].t).slice(0,5):fmtT(D.bars[i].t),xs(D.bars[i].t+D.tfMs/2),pb+5)}
 // legenda warna (kiri)
 const lg=x.createLinearGradient(0,pt,0,pb),L=LUT[H.pal];for(let i=0;i<=10;i++){const k=Math.round((1-i/10)*255)*3;lg.addColorStop(i/10,`rgb(${L[k]|0},${L[k+1]|0},${L[k+2]|0})`)}
 x.fillStyle=lg;x.fillRect(10,pt+16,12,ph-16);x.fillStyle='#e6e9ef';x.textAlign='left';x.textBaseline='top';x.fillText(fmtU(vmax,D.kind==='cry'),6,pt);
 V={D,v,pl,pr,pt,pb,pw,ph,G,g,rows,vmax,xs,ys};
 const pxe=$('.hdm-px',w);pxe.textContent=fmtPx(last);pxe.style.color=last>=D.bars[D.bars.length-2].c?UPC:DNC;D.dirty=0}
function overlay(w,e){const o=$('.hdm-o',w),dpr=Math.min(2,window.devicePixelRatio||1),x=o.getContext('2d'),tip=$('.hdm-tip',w);x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,o.width,o.height);
 if(!e||!V){tip.hidden=true;return}const b=o.getBoundingClientRect(),mx=e.clientX-b.left,my=e.clientY-b.top,{v,D,pl,pr,pt,pb,pw,ph,G,g,rows}=V;
 if(mx<pl||mx>pr||my<pt||my>pb){tip.hidden=true;return}
 x.strokeStyle='rgba(255,255,255,.4)';x.setLineDash([3,3]);x.beginPath();x.moveTo(mx,pt);x.lineTo(mx,pb);x.moveTo(pl,my);x.lineTo(pr,my);x.stroke();
 const t=v.tL+(mx-pl)/pw*(v.tR-v.tL),p=v.pMax-(my-pt)/ph*(v.pMax-v.pMin),bi=Math.floor((t-D.bars[v.i0].t)/D.tfMs)+v.i0,bar=D.bars[bi],ci=Math.floor((t-G.t0)/G.colMs),ri=Math.min(rows-1,Math.max(0,Math.floor((my-pt)/ph*rows)));
 const hv=ci>=0&&ci<G.cols?g[ri*G.cols+ci]:0;
 tip.innerHTML=`<b>${esc(D.sym)}</b><small>${fmtDT(t)}</small><div class="hdm-tg"><span>Harga</span><em>${fmtX(p,niceStep((v.pMax-v.pMin)/200))}</em><span>${H.mode==='liq'?'Likuidasi (est.)':D.kind==='cry'?'Likuiditas':'Aktivitas'}</span><em>${hv>0?fmtU(hv,D.kind==='cry'):'–'}</em>${bar?`<span>O / H</span><em>${fmtX(bar.o,.01)} / ${fmtX(bar.h,.01)}</em><span>L / C</span><em>${fmtX(bar.l,.01)} / ${fmtX(bar.c,.01)}</em>`:''}</div>`;
 tip.hidden=false;const r=$('.hdm',w).getBoundingClientRect();tip.style.left=Math.max(4,Math.min(r.width-200,e.clientX-r.left+14))+'px';tip.style.top=Math.max(4,Math.min(r.height-170,e.clientY-r.top+14))+'px'}
const seg=(a,items,v)=>`<div class="seg" data-seg="${a}">${items.map(([k,l])=>`<button data-v="${k}" aria-pressed="${String(k)===String(v)}">${l}</button>`).join('')}</div>`;
const tog=(k,l,on)=>`<button class="nb" data-t="${k}" aria-pressed="${on}">${l}</button>`;
function bars2(w){$('.hdm-t2',w).innerHTML=seg('mode',MODES,H.mode)+seg('tf',TFS.map(t=>[t[0],t[0]]),H.tf)+seg('bars',BARS.map(n=>[n,n+' bar']),H.bars)+seg('rg',RGS.map(r=>[r[0],r[1]]),H.rg)+seg('pal',PALS,H.pal)+tog('bub','Bubble trade',H.bub)+tog('liq','Likuidasi riil',H.liq)}
function dlist(w){const dl=$('#hdm-dl',w);if(!dl)return;dl.innerHTML=[...new Set([...MTS,...SYMS])].map(s=>`<option value="${esc(s)}">`).join('')}
function status(w){const D=cur,dot=s=>`<s class="${s==='open'?'on':s==='connecting'?'wt':''}"></s>`;let s='';
 if(D&&D.kind==='cry')s+=`<span class="hdm-chip">${dot(LIVE.st)}Binance ${D.src==='fut'?'Futures':'Spot'} <b>${stTxt[LIVE.st]||LIVE.st}</b></span>`;
 s+=`<span class="hdm-chip">${dot(MT.st)}MT5 <b>${stTxt[MT.st]||MT.st}</b></span>`;$('.hdm-sts',w).innerHTML=s;
 const f=$('.hdm-ft',w),ob=H.mode==='ob';
 f.textContent=!D?'':ob?(D.kind==='cry'?`Order book ${D.src==='fut'?'futures':'spot'} Binance direkam sejak ${D.since?fmtT(D.since):'–'} (tidak ada riwayat) · terang = likuiditas pasang besar · lebar harga mengikuti kedalaman yang Binance berikan`+(D.bookSt&&D.bookSt!=='ok'?' · buku: '+D.bookSt:''):'Broker MT5 tidak memberi order book: heat = aktivitas harga (lama harga di level itu), direkam sejak '+(D.since?fmtT(D.since):'–'))
  :`ESTIMASI model dari volume candle × leverage 10/25/50/100× (long & short); garis hilang saat harga menyentuhnya · warna = perkiraan nilai posisi${D.kind==='cry'?' (USD)':' (bobot tick)'}`+(D.kind==='cry'&&H.bub?' · bubble biru = beli agresif, pink = jual agresif':'')+(H.liq&&D&&D.src==='fut'?' · segitiga = likuidasi riil (oranye long, ungu short)':'')}
function pop(w){const p=$('.hdm-pop',w);p.hidden=!popOpen;if(!popOpen)return;
 p.innerHTML=`<h4>Sambungan MT5 (XAUUSD & forex)</h4><label>Alamat bridge<input class="hdm-url" value="${esc(H.mt5)}" spellcheck="false" autocomplete="off"></label>
 <div class="hdm-pr"><button class="nb hdm-save">Simpan &amp; sambung ulang</button><span class="hdm-chip">${MT.st==='open'?'<s class="on"></s>':'<s></s>'}<b>${stTxt[MT.st]||MT.st}</b></span></div>
 <ol><li>Pasang MetaTrader 5 (Windows), login ke broker, tampilkan <b>XAUUSD</b> di Market Watch.</li><li>Di folder <code>mt5-bridge/</code>: <code>pip install -r requirements.txt</code></li><li>Jalankan <code>python mt5_bridge.py</code> (atau <code>start.bat</code>) dan biarkan terbuka.</li></ol>
 <p>Bridge hanya mengirim harga dan riwayat candle lewat WebSocket lokal. Chrome, Edge, dan Firefox mengizinkan <code>ws://127.0.0.1</code> dari halaman https; Safari tidak. Bila jam candle MT5 meleset, isi <code>MT5_UTC_OFFSET_HOURS</code> pada bridge.</p>`}
// ---------- tab (ala Chart) ----------
const hue=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))%360;return h};
const modeName=k=>(MODES.find(m=>m[0]===k)||[,''])[1];
function tabsUI(w){const tl=$('.hdm-tl',w);if(!tl)return;const many=H.tabs.length>1;
 tl.innerHTML=H.tabs.map(t=>{const x=t.id===H.act?H:t;return`<div class="hdm-tab${t.id===H.act?' on':''}" data-id="${t.id}" role="tab" aria-selected="${t.id===H.act}" draggable="true" title="${esc(x.sym)} · ${x.tf} · ${esc(modeName(x.mode))}"><i class="hdm-ic" style="background:hsl(${hue(x.sym)} 55% 42%)">${esc(x.sym[0])}</i><span>${esc(x.sym)} · ${x.tf}</span>${many?'<button class="hdm-x" aria-label="Tutup tab">×</button>':''}</div>`}).join('');
 const nb=$('.hdm-new',w);if(nb)nb.disabled=H.tabs.length>=MAXTAB}
function loadTab(w,t){Object.assign(H,pickTab(fix({...t})));H.act=t.id;store();bars2(w);reset(w)}
function actTab(w,id){const t=H.tabs.find(t=>t.id===id);if(!t||id===H.act)return;store();loadTab(w,t)}
function newTab(w,sym){if(H.tabs.length>=MAXTAB)return;store();const b=pickTab(H);
 b.sym=sym||[...H.fav,...QUICK].find(s=>!H.tabs.some(t=>t.sym===s))||H.sym;
 const t={id:++H.uid,...b};H.tabs.push(t);loadTab(w,t)}
function closeTab(w,id){if(H.tabs.length<2)return;const i=H.tabs.findIndex(t=>t.id===id);if(i<0)return;
 if(id!==H.act){H.tabs.splice(i,1);store();tabsUI(w);return}
 H.tabs.splice(i,1);loadTab(w,H.tabs[Math.min(i,H.tabs.length-1)])}
// ---------- panel samping (ala Watchlist) ----------
const TK=new Map();
const sq=w=>{const e=$('.hdm-sq',w);return e?e.value.trim().toUpperCase():''};
const sname=s=>isFut(s)?s.replace(/USDT$/,''):s;
function sideQuote(s){const D=cur,t=TK.get(s);
 if(D&&D.ready&&D.sym===s&&D.bars.length)return{p:D.bars[D.bars.length-1].c,c:t?t.c:null};
 const f=FX.get(s);if(f&&f.p>0)return{p:f.p,c:null};return t?{p:t.p,c:t.c}:{p:null,c:null}}
function sideRows(w){const q=sq(w);let ls;
 if(q){const all=[...new Set([...H.fav,...SYMS,...MTS,...QUICK])];ls=all.filter(s=>s.includes(q)).slice(0,60);
  if(!ls.length&&/^[A-Z0-9._-]{3,20}$/.test(q))ls.push(q)}
 else ls=H.sdv==='fav'?H.fav:H.sdv==='cry'?(SYMS.length?SYMS:QUICK.filter(isFut)):[...MTS];
 return ls}
function sideList(w){const el=$('.hdm-sl',w);if(!el)return;
 $$('.hdm-sv button',w).forEach(b=>b.setAttribute('aria-pressed',String(!sq(w)&&b.dataset.sv===H.sdv)));
 const ls=sideRows(w),q=sq(w);
 el.innerHTML=ls.length?ls.map(s=>{const on=H.fav.includes(s);return`<div class="hdm-sr${s===H.sym?' on':''}" data-s="${esc(s)}" role="button" tabindex="0" title="${esc(s)}"><button class="hdm-fv" data-fav="${esc(s)}" aria-pressed="${on}" aria-label="${on?'Hapus dari':'Tambah ke'} favorit">${Icon('star',on?'on':'')}</button><b>${esc(sname(s))}</b><span class="hdm-sv2"><span class="hdm-sp">–</span><span class="hdm-sc"></span></span></div>`}).join('')
  :`<p class="hdm-se">${q?'Tidak ada simbol yang cocok.':H.sdv==='fav'?'Belum ada favorit. Klik bintang pada simbol di daftar Kripto atau MT5.':H.sdv==='cry'?'Memuat daftar kripto…':'Belum ada simbol MT5.'}</p>`;
 if(!q&&H.sdv==='mt5'&&MT.st!=='open')el.insertAdjacentHTML('beforeend','<p class="hdm-se">MT5 belum terhubung: jalankan mt5-bridge lalu cek alamat di pengaturan (ikon gir).</p>');
 sidePatch(w)}
function sidePatch(w){const el=$('.hdm-sl',w);if(!el)return;
 for(const r of $$('.hdm-sr[data-s]',w)){const s=r.dataset.s,q=sideQuote(s),p=r.querySelector('.hdm-sp'),c=r.querySelector('.hdm-sc');if(!p||!c)continue;
  p.textContent=q.p>0?fmtPx(q.p):'–';c.textContent=q.c==null?'':(q.c>0?'+':q.c<0?'−':'')+Math.abs(q.c).toFixed(2)+'%';c.className='hdm-sc'+(q.c>0?' up':q.c<0?' dn':'')}}
function sideMark(w){for(const r of $$('.hdm-sr[data-s]',w))r.classList.toggle('on',r.dataset.s===H.sym)}
function pickSym(w,s,nt){const root=$('.hdm',w);if(root.clientWidth<640)root.classList.add('nosd');
 if(nt){newTab(w,s);return}
 if(s===H.sym)return;const o=H.tabs.find(t=>t.sym===s&&t.id!==H.act);if(o){actTab(w,o.id);return}setSym(w,s)}
function setSym(w,s){s=String(s||'').trim().toUpperCase();if(!/^[A-Z0-9._-]{3,20}$/.test(s))return;H.sym=s;store();reset(w)}
function reset(w){clearTimeout(cur&&cur.rto);LIVE.stop();cur=mkD(H.sym,H.tf);V=null;$('.hdm-sym',w).value=H.sym;tabsUI(w);sideMark(w);bars2(w);loadBars(cur).then(()=>{status(w)});draw(w);status(w)}
function mount(w){const root=$('.hdm',w);
 root.addEventListener('click',e=>{
  const sb=e.target.closest('[data-seg] button');if(sb){const a=sb.parentNode.dataset.seg,v=sb.dataset.v;
   if(a==='tf'){H.tf=v;store();reset(w);return}
   if(a==='mode'&&v==='ob'&&TFM[H.tf]>TFM['5m']){H.mode='ob';H.tf='1m';store();reset(w);return}
   H[a]=a==='bars'?+v:v;store();bars2(w);if(a==='mode')liveSync();cur&&(cur.dirty=2);draw(w);status(w);return}
  const t=e.target.closest('[data-t]');if(t){H[t.dataset.t]=!H[t.dataset.t];store();bars2(w);liveSync();cur&&(cur.dirty=1);draw(w);status(w);return}
  const xb=e.target.closest('.hdm-x');if(xb){closeTab(w,+xb.closest('.hdm-tab').dataset.id);return}
  const tb=e.target.closest('.hdm-tab');if(tb){actTab(w,+tb.dataset.id);return}
  const ab=e.target.closest('[data-a]');if(ab){if(ab.dataset.a==='new'){newTab(w);return}
   if(ab.dataset.a==='sd'){const on=root.classList.toggle('nosd');H.side=!on;store();return}}
  const sv=e.target.closest('[data-sv]');if(sv){H.sdv=sv.dataset.sv;store();sideList(w);return}
  const fv=e.target.closest('[data-fav]');if(fv){const s=fv.dataset.fav,i=H.fav.indexOf(s);i<0?H.fav.push(s):H.fav.splice(i,1);store();sideList(w);return}
  const sr=e.target.closest('.hdm-sr');if(sr){pickSym(w,sr.dataset.s,e.ctrlKey||e.metaKey||e.shiftKey);return}
  if(e.target.closest('.hdm-gear')){popOpen=!popOpen;pop(w);return}
  if(e.target.closest('.hdm-open')&&cur){S.sym=S.go=cur.sym;open('chart');return}
  if(e.target.closest('.hdm-save')){H.mt5=($('.hdm-url',w).value||'').trim();store();MT.restart();setTimeout(()=>pop(w),600)}});
 root.addEventListener('auxclick',e=>{const tb=e.target.closest('.hdm-tab');if(tb&&e.button===1){e.preventDefault();closeTab(w,+tb.dataset.id)}});
 root.addEventListener('keydown',e=>{const sr=e.target.closest&&e.target.closest('.hdm-sr');
  if(sr&&e.key==='Enter'&&!e.target.closest('[data-fav]')){pickSym(w,sr.dataset.s,e.ctrlKey||e.metaKey||e.shiftKey);return}
  if(e.target.matches&&e.target.matches('.hdm-sq')){const q=sq(w);if(e.key==='Escape'&&q){e.target.value='';sideList(w);e.stopPropagation()}
   else if(e.key==='Enter'){const f=$('.hdm-sr',w);if(f)pickSym(w,f.dataset.s,e.ctrlKey||e.metaKey||e.shiftKey)}return}
  if(!e.altKey)return;const k=e.key.toLowerCase();
  if(k==='t'){e.preventDefault();newTab(w)}else if(k==='w'){e.preventDefault();closeTab(w,H.act)}
  else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){const i=H.tabs.findIndex(t=>t.id===H.act),n=H.tabs.length;actTab(w,H.tabs[(i+(e.key==='ArrowRight'?1:n-1))%n].id);e.preventDefault()}});
 // seret tab untuk mengurutkan ulang
 const tl=$('.hdm-tl',w);let dragId=0;
 tl.addEventListener('dragstart',e=>{const tb=e.target.closest('.hdm-tab');if(!tb)return;dragId=+tb.dataset.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','tab')});
 tl.addEventListener('dragover',e=>{if(dragId)e.preventDefault()});
 tl.addEventListener('drop',e=>{if(!dragId)return;e.preventDefault();const tb=e.target.closest('.hdm-tab'),i=H.tabs.findIndex(t=>t.id===dragId);dragId=0;if(i<0)return;
  let j=tb?H.tabs.findIndex(t=>t.id===+tb.dataset.id):H.tabs.length;if(tb){const r=tb.getBoundingClientRect();if(e.clientX>r.left+r.width/2)j++}
  const[m]=H.tabs.splice(i,1);if(i<j)j--;H.tabs.splice(j,0,m);store();tabsUI(w)});
 tl.addEventListener('dragend',()=>{dragId=0});
 $('.hdm-sq',w).addEventListener('input',()=>sideList(w));
 root.classList.toggle('nosd',!H.side||w.clientWidth<560);
 $('.hdm-sym',w).addEventListener('change',e=>setSym(w,e.target.value));
 const cv=$('.hdm-cv',w);cv.addEventListener('pointermove',e=>overlay(w,e));cv.addEventListener('pointerleave',()=>overlay(w,null));
 w._ro&&w._ro.disconnect();let lt=0;w._ro=new ResizeObserver(()=>{clearTimeout(lt);lt=setTimeout(()=>draw(w),60)});w._ro.observe(cv)}
function stop(w){clearInterval(tmr);tmr=0;LIVE.stop();MT.stop();w._ro&&w._ro.disconnect();cur=null;CW=null}
function loop(w){let n=0;tmr=setInterval(()=>{if(!w.isConnected){stop(w);return}if(document.hidden)return;n++;
  LIVE.watch(20000);MT.watch(20000);
  if(n%2===0)sample(cur);
  if(cur&&cur.dirty&&n%2===0)draw(w);if(n%6===0){status(w);if(popOpen)pop(w)}if(n%8===0)sidePatch(w);if(n%240===0)symbols()},250)}
LIVE.o.onstate=MT.o.onstate=()=>{if(CW)status(CW)};
async function symbols(){const had=SYMS.length;try{const j=await jget(API.spot+'/ticker/24hr',15000);
 for(const x of j)if(/USDT$/.test(x.symbol))TK.set(x.symbol,{p:+x.lastPrice,c:+x.priceChangePercent});
 SYMS=j.filter(x=>/USDT$/.test(x.symbol)&&!/(UP|DOWN|BULL|BEAR)USDT$/.test(x.symbol)&&!/^(USDC|FDUSD|TUSD|USDP|DAI|BUSD|EUR|TRY|BRL|GBP|AUD)USDT$/.test(x.symbol)).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,250).map(x=>x.symbol);
 if(CW){dlist(CW);if(had)sidePatch(CW);else sideList(CW)}}
 catch(e){if(!SYMS.length){SYMS=QUICK.filter(isFut);if(CW)sideList(CW)}}}

registerApp('headmaps',{css:'apps/headmaps/headmaps.css',icon:"<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 9h18M3 14h18M8 4v16M14 4v16\"/>",t:'Headmaps',w:1100,h:680,flush:1,
 notes:['Tanpa endpoint server. Kripto: REST klines/depth + WebSocket Binance (futures, cadangan spot). XAUUSD/forex: <code>mt5-bridge/mt5_bridge.py</code> (WebSocket lokal, alamat di <code>tc.headmaps</code> browser ini).','Mode Likuidasi adalah MODEL estimasi dari volume candle x leverage, bukan data bursa. Mode Order Book hanya merekam sejak app dibuka.','Tab ala Chart: tiap tab menyimpan simbol, timeframe, mode, jumlah bar, rentang, palet, dan toggle sendiri (<code>tc.headmaps.tabs</code>); seret untuk mengurutkan, klik tengah / x untuk menutup, Alt+T / Alt+W / Alt+panah. Hanya tab aktif yang punya stream live, jadi rekaman Order Book mulai ulang saat pindah tab.','Panel samping ala Watchlist: Favorit (bintang), Kripto (250 pasangan USDT teratas, harga dari <code>/ticker/24hr</code> Binance tiap 60 dtk), dan MT5 (simbol dari bridge). Klik = ganti simbol tab aktif, Ctrl/Shift+klik = tab baru.'],
 html:()=>`<div class="hdm"><div class="hdm-top"><button class="hdm-rb" data-a="sd" aria-label="Panel simbol" title="Panel simbol"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14"/></svg></button><div class="hdm-tl" role="tablist"></div><button class="hdm-rb hdm-new" data-a="new" aria-label="Tab baru" title="Tab baru (Alt+T)"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button></div>
  <div class="hdm-body"><aside class="hdm-sd" aria-label="Daftar simbol"><div class="hdm-sv">${SVS.map(([k,l])=>`<button data-sv="${k}" aria-pressed="false"${k==='mt5'?' title="Emas & forex (MetaTrader 5)"':''}>${l}</button>`).join('')}</div><input class="hdm-in hdm-sq" type="search" placeholder="Cari atau ketik simbol…" aria-label="Cari simbol" spellcheck="false" autocomplete="off"><div class="hdm-sl"></div><p class="hdm-sh">Klik: ganti simbol tab ini · Ctrl+klik: tab baru · Bintang: favorit</p></aside><section class="hdm-mn"><div class="hdm-t1"><input class="hdm-sym" list="hdm-dl" spellcheck="false" autocomplete="off" aria-label="Simbol" placeholder="BTCUSDT / XAUUSD"><datalist id="hdm-dl"></datalist><b class="hdm-px">–</b><button class="nb hdm-open" title="Buka di Chart">Chart ${Icon('ext')}</button><span class="hdm-sts"></span><button class="hdm-gear nb" aria-label="Pengaturan MT5" title="Pengaturan MT5">${Icon('gear')}</button></div>
  <div class="hdm-t2"></div><div class="hdm-cv"><canvas class="hdm-c"></canvas><canvas class="hdm-o"></canvas><div class="hdm-msg"></div></div><p class="hdm-ft"></p></section></div><div class="hdm-tip" hidden></div><div class="hdm-pop" hidden></div></div>`,
 init(w){if(CW&&CW!==w)stop(CW);CW=w;popOpen=false;const cs=getComputedStyle(document.documentElement);UPC=cs.getPropertyValue('--up').trim()||UPC;DNC=cs.getPropertyValue('--dn').trim()||DNC;
  mount(w);dlist(w);MT.start();reset(w);sideList(w);loop(w);if(!SYMS.length)symbols()}});
window.HM={cur:()=>cur,_t:{niceStep,pctl,alignBar,tickBar,klineBar,parseKlines,liqLevels,liqGrid,obGrid,blurV,lutOf,LUT,paintGrid,Book,bubbleThr,H,TIERS,MMR,fix,TABF,MAXTAB}};
})();
