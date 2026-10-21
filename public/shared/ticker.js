// Running text di menubar. Tampil hanya saat ada pergerakan harga pada simbol di Watchlist atau Maps; habis satu putaran lalu hilang,
// muncul lagi saat ada pergerakan baru. Sumber: mode Live = selisih harga WATCH tiap event 'tc:quotes'; mode Dummy = Watchlist memanggil Ticker.move().
// Maps mendaftarkan simbol yang sedang dibukanya lewat Ticker.watch('maps', [...]).
(()=>{
const box=document.getElementById('tkr');if(!box)return;
if(typeof loadCss==='function')loadCss('shared/ticker.css');
const track=document.createElement('div');track.className='tk-t';box.append(track);
const DEF=['BTCUSDT','ETHUSDT','XAUUSD','EURUSD','BBCA','TLKM','SOLUSDT','BNBUSDT','XRPUSDT','BBRI','BMRI','ASII','AMMN'];
const esc=s=>String(s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');
const maps=new Set();let pend=new Map(),run=null,last=null;
const listSyms=()=>{try{const j=JSON.parse(localStorage.getItem('tc.watchlist')||'null');if(j&&Array.isArray(j.lists)&&j.lists.length)return j.lists.flatMap(l=>Array.isArray(l.syms)?l.syms:[])}catch(e){}return DEF};
const inScope=()=>{const s=new Set(listSyms());maps.forEach(m=>{s.add(m);s.add(m+'USDT')});return s};
const fmt=(p,c,d,s)=>{const u=d>=0?'tk-u':'tk-d',cu=c>=0?'tk-u':'tk-d';
 return`<span class="tk-i"><b>${esc(s)}</b><span class="${u} tk-a">${d>=0?'\u25b2':'\u25bc'}</span><span>${esc(f(p))}</span><span class="${cu}">${(c>=0?'+':'\u2212')+Math.abs(c).toFixed(2).replace('.',',')}%</span></span>`};
function start(){
 if(run||!pend.size||document.hidden)return;
 const items=[...pend.values()].slice(0,40);pend=new Map();
 track.innerHTML=items.map(i=>fmt(i.p,i.c,i.d,i.s)).join('');box.classList.add('on');
 const W=box.clientWidth,T=track.scrollWidth,still=typeof S!=='undefined'&&S.still;
 const done=()=>{run=null;box.classList.remove('on');track.innerHTML='';setTimeout(start,400)};
 if(still||!track.animate){track.style.transform='translateX(0)';run=setTimeout(done,6000);return}
 const a=track.animate([{transform:`translateX(${W}px)`},{transform:`translateX(${-T}px)`}],{duration:(W+T)/70*1000,easing:'linear',fill:'forwards'});
 run=a;a.onfinish=done;a.oncancel=()=>{run=null}}
// items: [[simbol, harga, ubah%, arah(+1/-1)]]
function move(rows){
 const sc=inScope();
 for(const [s,p,c,d] of rows){if(!d||!(p>0))continue;const k=sc.has(s)?s:null;if(!k)continue;pend.set(s,{s,p,c,d})}
 start()}
window.Ticker={move,watch(src,syms){if(src==='maps'){maps.clear();(syms||[]).forEach(x=>maps.add(x))}}};
// Live: bandingkan harga WATCH dengan event sebelumnya
window.addEventListener('tc:quotes',()=>{
 if(typeof WATCH==='undefined')return;
 const now={},mv=[];
 for(const r of WATCH){now[r[0]]=r[2];if(last&&last[r[0]]!=null&&last[r[0]]!==r[2])mv.push([r[0],r[2],r[3],r[2]>last[r[0]]?1:-1])}
 last=now;if(mv.length)move(mv)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)start()});
})();
