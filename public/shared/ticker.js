// Running text di menubar. HANYA data nyata (mode Live). Satu putaran memuat semua simbol: semua daftar Watchlist + semua pasar Maps.
// Putaran dimulai saat ada pergerakan harga nyata; habis satu putaran lalu hilang, muncul lagi saat ada pergerakan baru. Tanpa mode Live: tidak tampil apa pun.
// Watchlist: selisih harga WATCH tiap 'tc:quotes' (hanya simbol yang kuotenya sudah diambil dari server, Live.extra). Maps: Ticker.source('maps', ambilSemua, segarkan).
(()=>{
const box=document.getElementById('tkr');if(!box)return;
if(typeof loadCss==='function')loadCss('shared/ticker.css');
const SPEED=110;   // piksel per detik; naikkan kalau terasa terlalu lama
const track=document.createElement('div');track.className='tk-t';box.append(track);
const esc=s=>String(s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');
const live=()=>!!(window.Live&&Live.on);
const src={},rf={};let run=null,again=false,last=null,busy=false;
const listSyms=()=>{try{const j=JSON.parse(localStorage.getItem('tc.watchlist')||'null');if(j&&Array.isArray(j.lists))return j.lists.flatMap(l=>Array.isArray(l.syms)?l.syms:[])}catch(e){}return[]};
// kuote nyata saja: simbol harus sudah punya data dari server (Live.extra), bukan angka bawaan data.js
const quote=s=>{if(!live()||typeof WATCH==='undefined')return null;const r=WATCH.find(x=>x[0]===s)||WATCH.find(x=>x[0]===s+'USDT');return r&&Live.extra[r[0]]?{p:r[2],c:r[3],k:r[0]}:null};
const fmt=(s,c,p)=>{const u=c>=0?'tk-u':'tk-d';
 return`<span class="tk-i"><b>${esc(s)}</b><span class="${u} tk-a">${c>=0?'\u25b2':'\u25bc'}</span>${p>0?`<span>${esc(f(p))}</span>`:''}<span class="${u}">${(c>=0?'+':'\u2212')+Math.abs(c).toFixed(2).replace('.',',')}%</span></span>`};
async function build(){
 const seen=new Set(),out=[];
 for(const s of listSyms()){if(seen.has(s))continue;const q=quote(s);if(!q)continue;seen.add(s);seen.add(q.k);out.push(fmt(s,q.c,q.p))}
 for(const k in src){let rows=[];try{rows=await src[k]()}catch(e){}
  for(const r of rows){if(seen.has(r.s)||!(typeof r.c==='number'))continue;seen.add(r.s);const q=quote(r.s);if(q){if(seen.has(q.k))continue;seen.add(q.k);out.push(fmt(r.s,q.c,q.p))}else out.push(fmt(r.s,r.c,0))}}
 return out}
async function start(){
 if(run||busy||document.hidden||!live())return;busy=true;again=false;
 let items;try{items=await build()}catch(e){items=[]}busy=false;
 if(!items.length)return;
 track.innerHTML=items.join('');box.classList.add('on');
 const W=box.clientWidth,T=track.scrollWidth,still=typeof S!=='undefined'&&S.still;
 const done=()=>{run=null;box.classList.remove('on');track.innerHTML='';if(again)setTimeout(start,400)};
 if(still||!track.animate){track.style.transform='translateX(0)';run=setTimeout(done,6000);return}
 const a=track.animate([{transform:`translateX(${W}px)`},{transform:`translateX(${-T}px)`}],{duration:(W+T)/SPEED*1000,easing:'linear',fill:'forwards'});
 run=a;a.onfinish=done;a.oncancel=()=>{run=null}}
window.Ticker={source(k,fn,refresh){src[k]=fn;if(refresh)rf[k]=refresh}};
// Watchlist: bandingkan harga nyata WATCH dengan event sebelumnya; hanya simbol di daftar Watchlist atau Maps yang memicu
window.addEventListener('tc:quotes',()=>{
 if(!live()||typeof WATCH==='undefined')return;
 const sc=new Set(listSyms()),now={};let hit=false;
 for(const r of WATCH){if(!Live.extra[r[0]])continue;now[r[0]]=r[2];if(last&&last[r[0]]!=null&&last[r[0]]!==r[2]&&sc.has(r[0]))hit=true}
 last=now;if(hit){again=true;start()}});
// Maps: ambil ulang data nyata tiap 2 menit (server menyimpan heatmap 5 menit)
(function poll(){setTimeout(async()=>{if(!document.hidden&&live())for(const k in rf){try{if(await rf[k]()){again=true;start()}}catch(e){}}poll()},120000)})();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&again)start()});
})();
