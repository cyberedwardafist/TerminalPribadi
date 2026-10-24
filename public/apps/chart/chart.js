// App "chart" (dock): tab ala browser + chart ala TradingView. Modul: ind.js (indikator), draw.js (alat gambar), render.js (kanvas), custom.js (indikator custom, opsional).
// File ini mengurus tab, data, interaksi, legenda, dialog, layout/template, alert, dan sinkron gambar per simbol.
(()=>{
const TFS=ChartRender.TFS,N=1000,KEY='tc.chart.tabs',DKEY='tc.chart.drw',LKEY='tc.chart.layouts',TKEY='tc.chart.tpl';
const TYPES={candle:'Candle',hollow:'Candle kosong',bar:'Bar OHLC',line:'Garis',area:'Area',base:'Baseline',ha:'Heikin Ashi'};
const ID=ChartInd.defs;
const rng=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const hue=s=>Math.abs([...s].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7))%360;
const esc=s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const jl=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||'null')||d}catch(e){return d}};
const js=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const srv=()=>typeof apiOn==='function'&&apiOn()&&typeof sessToken==='function'&&!!sessToken();
const api=async(p,o={})=>{const r=await apiFetch(p,{...o,headers:{'content-type':'application/json',...(o.headers||{})}});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()};
const rid=()=>'i'+Math.random().toString(36).slice(2,8);
let INST=0,PEND=null,DRAG=null;const WINS=new Set();

// ---------- data ----------
function gen(sym,tf){const st=TFS[tf],r=rng([...sym+tf].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7)),base=((WATCH.find(x=>x[0]===sym)||[])[2])||100,vol=Math.min(.03,.004*Math.sqrt(st/3600)),end=Math.floor(Date.now()/1000/st)*st,n=1500;
 let p=base,dr=0,o=[];for(let i=0;i<n;i++){if(i%40===0)dr=(r()-.5)*vol*.5;const op=p,c=op*(1+(r()-.5)*2*vol+dr);o.push({t:end-(n-1-i)*st,o:op,h:Math.max(op,c)*(1+r()*vol*.6),l:Math.min(op,c)*(1-r()*vol*.6),c,v:Math.round((500+r()*1500)*(1+Math.abs(c-op)/op/vol))});p=c}
 const k=base/o[n-1].c;o.forEach(b=>{b.o*=k;b.h*=k;b.l*=k;b.c*=k});return o}
const norm=j=>j.map(x=>({t:x.t>1e12?Math.floor(x.t/1000):x.t,o:x.o,h:x.h,l:x.l,c:x.c,v:x.v||0}));
const CACHE=new Map();
async function data(sym,tf){const k=sym+'|'+tf;if(CACHE.has(k))return CACHE.get(k);let d,live=false;
 if(apiOn()){try{d=norm(await(await apiFetch(`/api/candles?symbol=${encodeURIComponent(sym)}&tf=${tf}&limit=${N}`)).json());live=true}catch(e){}}
 d=d&&d.length?d:(live=false,gen(sym,tf));d.live=live;CACHE.set(k,d);return d}
if(typeof ChartCustom!=='undefined')ChartCustom.hook.fetch=async(sym,sec)=>{const tf=Object.keys(TFS).find(k=>TFS[k]===sec);if(!tf)throw new Error('timeframe '+sec+'s tidak tersedia (pakai 1m,5m,15m,30m,1h,4h,1D,1W,1M)');return data(sym,tf)};
async function older(w,T){const D=T.D;if(!D||!D.live||T.busy||T.noMore||!apiOn())return;T.busy=true;
 try{const j=norm(await(await apiFetch(`/api/candles?symbol=${encodeURIComponent(T.sym)}&tf=${T.tf}&limit=${N}&to=${D[0].t-1}`)).json()).filter(x=>x.t<D[0].t);
  if(!j.length)T.noMore=true;else{D.unshift(...j);T.rb+=j.length}}catch(e){T.noMore=true}T.busy=false;sch(w)}
// ---------- realtime: tick WebSocket/REST cepat -> candle terakhir (mesin: shared/rt.js) ----------
// Candle terakhir digerakkan tick (ease ~100 ms supaya mulus). /api/candles hanya untuk rekonsiliasi: isi bar yang terlewat, koreksi bar yang baru tutup, dan cadangan bila tak ada sumber realtime.
const paintD=D=>{for(const w of WINS)if(w.isConnected){const T=cur(w);if(T&&T.D===D)sch(w)}};
function settle(D){const A=D._an;if(A&&A.on){A.on=false;A.bar.c=A.to}}
function glide(D,bar,to){
 const A=D._an||(D._an={on:false});A.bar=bar;A.to=to;if(A.on)return;A.on=true;
 const step=()=>{if(!A.on)return;const d=A.to-A.bar.c;
  if(Math.abs(d)<=Math.abs(A.to)*1e-9){A.bar.c=A.to;A.on=false;paintD(D);return}
  A.bar.c+=d*.5;paintD(D);requestAnimationFrame(step)};
 requestAnimationFrame(step)}
const mergeBars=(D,j,live)=>typeof RT!=='undefined'?RT.bars.merge(D,j,live):(()=>{let n=0;for(const b of j){const l=D[D.length-1];if(b.t===l.t)D[D.length-1]=b;else if(b.t>l.t){D.push(b);n++}}return n})();
const gapN=T=>{const D=T.D,l=D[D.length-1];return l?Math.min(300,Math.max(3,Math.ceil((Date.now()/1000-l.t)/ChartRender.TFS[T.tf])+2)):3};
async function recon(w,T,n){
 const D=T.D;if(!D||!D.live||!apiOn())return;const seq=T._ps=(T._ps||0)+1;     // nomor urut: respons lama (cache) tidak boleh menimpa yang lebih baru
 try{const j=norm(await(await apiFetch(`/api/candles?symbol=${encodeURIComponent(T.sym)}&tf=${T.tf}&limit=${n||3}`,{cache:'no-store'})).json());
  if(T.D!==D||seq<(T._pa||0))return;T._pa=seq;
  const live=typeof RT!=='undefined'&&RT.info(T.sym,T.tf).live,atEnd=T.rb>=D.length-1.5;
  settle(D);const add=mergeBars(D,j,live);if(add&&atEnd)T.rb+=add;paintD(D)}catch(e){}}
function rtTick(w,T,key,tk){
 const D=T.D;if(!D||!D.live||T.sym+'|'+T.tf!==key)return;
 if(D._tid!==tk.id){D._tid=tk.id;const l=D[D.length-1];     // D dipakai bersama beberapa window: tiap tick diterapkan sekali
  if(l){const c0=l.c,r=RT.bars.apply(D,ChartRender.TFS[T.tf],tk);
   if(r==='new'){settle(D);if(T.rb>=D.length-1.5)T.rb++;T.rcAt=Date.now()+2000}     // bar baru: 2 dtk lagi cocokkan OHLC bar yang baru tutup dengan server
   else if(r==='upd'&&!tk.k){const to=l.c;l.c=c0;glide(D,l,to)}}}
 sch(w)}
const rtEvt=(w,T,key,ev)=>{if(ev.type==='gap'&&T.sym+'|'+T.tf===key&&T.D)recon(w,T,gapN(T))};
function rtSync(w){
 const R=w._r,T=cur(w),key=T&&T.D&&T.D.live&&typeof RT!=='undefined'&&apiOn()?T.sym+'|'+T.tf:'';
 if(R.rk===key)return;
 if(R.roff){R.roff();R.roff=null}R.rk=key;if(!key)return;
 R.roff=RT.sub(T.sym,T.tf,tk=>rtTick(w,T,key,tk),ev=>rtEvt(w,T,key,ev));
 recon(w,T,gapN(T))}
const RTN={binance:'Binance',finnhub:'Finnhub',tiingo:'Tiingo',yahoo:'Yahoo',goapi:'GoAPI',ohlcdev:'OHLC.dev'};
function rtBadge(w,T){
 const el=$('.ct-rt',w);if(!el)return;let txt='',c='';
 if(T&&T.D&&T.D.live&&typeof RT!=='undefined'){const i=RT.info(T.sym,T.tf);
  if(i.live){txt=(RTN[i.leader]||i.leader)+(i.lag!=null&&i.lag<60000?' · '+(i.lag<1000?i.lag+' ms':(i.lag/1000).toFixed(1)+' dtk'):'');c='on'}
  else if(i.has){txt='menunggu tick\u2026';c='wait'}else txt='REST'}
 if(el.textContent!==txt)el.textContent=txt;if(el.dataset.c!==c)el.dataset.c=c;
 const ds=$('.ct-ds',w);if(ds&&T){const demo=!(T.D&&T.D.live),late=!demo&&c!=='on',v=demo?'DEMO':late?'D':'';if(ds.textContent!==v)ds.textContent=v;ds.hidden=!v;ds.dataset.k=demo?'demo':'late';ds.title=demo?'Data contoh (acak), bukan harga pasar. Aktifkan mode Live di Setting > API.':'Data tertunda / belum ada tick realtime dari sumber ini.'}}
async function poll(w){      // dipanggil tiap 1 dtk
 const R=w._r;if(!w.isConnected){clearInterval(R.pt);if(R.roff)R.roff();R.roff=null;return}
 if(typeof RT!=='undefined')rtSync(w);const T=cur(w);rtBadge(w,T);
 if(document.hidden){R.hid=1;return}
 if(!apiOn()||!T||!T.D||!T.D.live)return;
 const live=typeof RT!=='undefined'&&RT.info(T.sym,T.tf).live,t=Date.now();
 if(R.hid){R.hid=0;R.lp=t;recon(w,T,gapN(T));return}                  // kembali dari tab tersembunyi: isi bar yang terlewat
 if(T.rcAt&&t>=T.rcAt){T.rcAt=0;R.lp=t;recon(w,T,3);return}
 if(t-(R.lp||0)>=(live?30000:4000)){R.lp=t;recon(w,T,3)}}              // tanpa sumber realtime: tiap 4 dtk (dulu 15 dtk)

// ---------- gambar per simbol: lokal + sinkron server ----------
const DRW=jl(DKEY,{}),HIST={},PULLED=new Set(),TMR={};
const drs=sym=>(DRW[sym]||(DRW[sym]={l:[],ts:0})).l;
const hist=sym=>HIST[sym]||(HIST[sym]={u:[],r:[]});
const redrawAll=()=>{for(const w of WINS)if(w.isConnected){legend(w);sch(w)}else WINS.delete(w)};
function touch(sym){DRW[sym].ts=Date.now();js(DKEY,DRW);if(!srv())return;clearTimeout(TMR[sym]);TMR[sym]=setTimeout(()=>pushDrw(sym),1500)}
async function pushDrw(sym){try{const j=await api('/api/chart/drawings/'+encodeURIComponent(sym),{method:'PUT',body:JSON.stringify({drawings:drs(sym)})});if(j.updatedAt){DRW[sym].ts=j.updatedAt;js(DKEY,DRW)}}catch(e){}}
async function pullDrw(sym){if(PULLED.has(sym)||!srv())return;PULLED.add(sym);
 try{const j=await api('/api/chart/drawings/'+encodeURIComponent(sym)),loc=DRW[sym]||{l:[],ts:0};
  if(j.updatedAt&&j.updatedAt>loc.ts&&!TMR[sym]){DRW[sym]={l:Array.isArray(j.drawings)?j.drawings:[],ts:j.updatedAt};js(DKEY,DRW);redrawAll()}
  else if(!j.updatedAt&&loc.l.length)pushDrw(sym)}catch(e){PULLED.delete(sym)}}
// semua perubahan lewat mut(): menyimpan snapshot untuk undo
function mut(sym,fn){const h=hist(sym);h.u.push(JSON.stringify(drs(sym)));if(h.u.length>80)h.u.shift();h.r=[];fn(drs(sym));touch(sym)}
function undo(w,redo){const T=cur(w),h=hist(T.sym),a=redo?h.r:h.u,b=redo?h.u:h.r;if(!a.length)return;b.push(JSON.stringify(drs(T.sym)));DRW[T.sym].l=JSON.parse(a.pop());T.sel=null;touch(T.sym);redrawAll();sync(w)}

// ---------- alert (memakai tc.watchlist.al: satu alert per simbol; server memicu lewat sinkron Live) ----------
const wl=()=>{const o=jl('tc.watchlist',null)||{};o.al=o.al||{};return o};
const alertsOf=sym=>{const a=wl().al[sym];return a&&a.t>0?[{id:sym,price:a.t}]:[]};
function setAlert(sym,price,last){const o=wl();if(price==null)delete o.al[sym];else o.al[sym]={t:price,d:price>last?1:-1};js('tc.watchlist',o)}

// ---------- indikator ----------
const mkInd=(k,extra)=>({id:rid(),k,on:true,p:{},c:{},...extra});
const DEF=[()=>mkInd('vol'),()=>mkInd('sma',{p:{period:20}})];
function defOf(inst){if(inst.k[0]==='c'&&inst.k[1]===':')return typeof ChartCustom!=='undefined'?ChartCustom.def(inst):null;return ID[inst.k]}
const hs=t=>{let h=5381;for(let i=0;i<t.length;i++)h=(h*33^t.charCodeAt(i))|0;return h>>>0};
function serie(w,T,inst){const D=T.D;if(!D||!D.length)return null;const last=D[D.length-1],key=D.length+'|'+last.t+'|'+last.c+'|'+JSON.stringify(inst.p)+(inst.src?inst.src.length+':'+hs(inst.src):'');
 if(inst._k===key&&inst._r)return inst._r;
 if(inst.k.startsWith('c:')){if(typeof ChartCustom==='undefined')return inst._r||null;const r=ChartCustom.series(inst,D,key,()=>{inst._k=null;sch(w)},{sym:T.sym,tfSec:TFS[T.tf]});if(r){inst._k=key;inst._r=r}return r||inst._r||null}
 const def=ID[inst.k];if(!def)return null;try{const c=ChartInd.compute(def,D,inst.p);inst.p=c.p;inst._r={p:c.p,series:c.series,def};inst._k=key;return inst._r}catch(e){return null}}
const instName=inst=>{const d=defOf(inst);if(!d)return inst.name||inst.k;return inst.k.startsWith('c:')?(inst.name||'Custom')+(d.inputs&&d.inputs.length?' '+d.inputs.filter(i=>!i.type||i.type==='int'||i.type==='float').slice(0,4).map(i=>inst.p[i.key]??i.def).join(', '):''):ChartInd.label(d,ChartInd.norm(d,inst.p))};
const colorOf=(inst,pl)=>inst.c&&inst.c[pl.k]||pl.c;

// ---------- tab ----------
const mk=(w,sym,tf)=>({id:++w._r.uid,sym,tf:tf||S.tf,type:'candle',scale:'lin',auto:true,ind:DEF.map(f=>f()),mag:true,vis:120,rb:0,mw:4,tool:'cur',sel:null,m:null,D:null,draft:null,yr:null});
const cur=w=>w._r.tabs.find(t=>t.id===w._r.act);
const tabJson=t=>({id:t.id,sym:t.sym,tf:t.tf,type:t.type,scale:t.scale,ind:t.ind.map(i=>Object.fromEntries(Object.entries(i).filter(([k])=>k[0]!=='_'))),mag:t.mag,mw:t.mw,hideDr:t.hideDr});
function save(w){const R=w._r;if(!R.main)return;js(KEY,{v:2,act:R.act,uid:R.uid,tabs:R.tabs.map(tabJson)})}
function addTab(w,sym,tf){const t=mk(w,sym,tf);w._r.tabs.push(t);act(w,t.id)}
function act(w,id){const R=w._r;R.act=id;const T=cur(w);if(!T)return;S.sym=T.sym;S.tf=T.tf;closePop(w);sync(w);load(w,T);pullDrw(T.sym)}
function load(w,T){if(T.D){rtSync(w);sch(w);return}const k=T.sym+T.tf;data(T.sym,T.tf).then(d=>{if(T.sym+T.tf!==k)return;T.D=d;T.rb=d.length+7;T.noMore=false;rtSync(w);sch(w)})}
function removeTab(w,id){const R=w._r,i=R.tabs.findIndex(t=>t.id===id);if(i<0)return null;const[T]=R.tabs.splice(i,1);
 if(!R.tabs.length){save(w);close(R.inst);return T}
 if(R.act===id)act(w,R.tabs[Math.min(i,R.tabs.length-1)].id);else sync(w);save(w);return T}
const closeTab=(w,id)=>{removeTab(w,id)};
function adopt(w,T,j){const R=w._r;T.id=++R.uid;T.m=null;T.sel=null;T.draft=null;R.tabs.splice(j==null?R.tabs.length:j,0,T);act(w,T.id);save(w)}
function dup(T,w){const c=mk(w,T.sym,T.tf);Object.assign(c,{type:T.type,scale:T.scale,ind:T.ind.map(i=>({...JSON.parse(JSON.stringify(tabJson({ind:[i],sym:'',tf:'',type:'',scale:'',mag:0,mw:0,id:0}).ind[0])),id:rid()})),mag:T.mag,mw:T.mw,D:T.D,rb:T.rb,vis:T.vis});return c}
function detach(w,id,x,y,copy){const R=w._r,T0=R.tabs.find(t=>t.id===id);if(!T0||(!copy&&R.tabs.length<2))return;
 const T=copy?dup(T0,w):removeTab(w,id);while(S.wins['chart#'+(++INST)]);const nid='chart#'+INST;PEND={id:nid,tab:T};const el=open(nid);PEND=null;
 if(el&&x!=null){el.style.left=Math.max(0,Math.min(innerWidth-200,x-120))+'px';el.style.top=Math.max(30,Math.min(innerHeight-160,y-18))+'px'}}
function setTf(w,tf){const T=cur(w);T.tf=tf;T.D=null;T.sel=null;S.tf=tf;sync(w);load(w,T);save(w)}
function setSym(w,sym){const T=cur(w);if(T.sym!==sym){T.sym=sym;T.D=null;T.sel=null;T.draft=null}S.sym=sym;sync(w);load(w,T);save(w);pullDrw(sym)}

function sync(w){const R=w._r,T=cur(w),q=s=>$(s,w);
 $('.ct-tl',w).innerHTML=R.tabs.map(t=>`<div class="ct-tab${t.id===R.act?' on':''}" data-id="${t.id}" draggable="true" title="${esc(t.sym)} · ${t.tf}">${typeof SymIcon!=='undefined'?SymIcon.html(t.sym,16):''}<span>${esc(t.sym)} · ${t.tf}</span><button class="ct-x" aria-label="Tutup tab">×</button></div>`).join('');
 if(!T)return;q('.ct-sym').textContent=T.sym;q('[data-a=type]').value=T.type;
 $$('[data-tf]',w).forEach(b=>b.setAttribute('aria-pressed',b.dataset.tf===T.tf));
 $$('[data-sc]',w).forEach(b=>b.setAttribute('aria-pressed',b.dataset.sc===T.scale));
 q('[data-a=auto]').setAttribute('aria-pressed',T.auto!==false);
 q('[data-a=mag]').setAttribute('aria-pressed',T.mag);q('[data-a=stay]').setAttribute('aria-pressed',!!R.stay);q('[data-a=hide]').setAttribute('aria-pressed',!!T.hideDr);
 q('[data-a=undo]').disabled=!hist(T.sym).u.length;q('[data-a=redo]').disabled=!hist(T.sym).r.length;
 railSync(w);styleBar(w);legend(w);
 q('canvas').style.cursor=T.tool==='cur'?'crosshair':'cell';sch(w)}

// ---------- popover dan modal ----------
function closePop(w){const p=w._p;if(p){const cv=$('canvas',w);if(cv&&p.contains(document.activeElement))cv.focus&&cv.focus({preventScroll:true});p.remove();document.removeEventListener('pointerdown',w._pa,true);w._p=null}}
function pop(w,anchor,html,bind,cls){closePop(w);const root=$('.ct',w),p=document.createElement('div'),r=anchor.getBoundingClientRect(),b=root.getBoundingClientRect();
 p.className='ct-pop'+(cls?' '+cls:'');p.innerHTML=html;root.append(p);const pw=p.offsetWidth;p.style.left=Math.max(4,Math.min(r.left-b.left,b.width-pw-4))+'px';p.style.top=Math.max(4,Math.min(r.bottom-b.top+4,b.height-p.offsetHeight-4))+'px';w._p=p;
 w._pa=e=>{if(!p.contains(e.target)&&!(anchor.contains&&anchor.contains(e.target)))closePop(w)};document.addEventListener('pointerdown',w._pa,true);bind(p);return p}
function at(x,y){return{getBoundingClientRect:()=>({left:x,bottom:y,top:y,right:x,width:0,height:0}),contains:()=>false}}
// modal di dalam jendela chart. ok(form)->false untuk tetap terbuka
function modal(w,title,body,ok,o={}){closeModal(w);const root=$('.ct',w),bd=document.createElement('div');bd.className='ct-md';
 bd.innerHTML=`<form class="ct-mb${o.wide?' wide':''}${o.cls?' '+o.cls:''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><b>${esc(title)}</b><button type="button" class="ct-x" data-m="x" aria-label="Tutup">×</button></header><div class="ct-mc">${body}</div>${ok?`<footer>${(o.extra||[]).map(x=>`<button type="button" class="ct-b ${x[2]||''}" data-m="${x[0]}">${x[1]}</button>`).join('')}<i class="ct-sp"></i><button type="button" class="ct-b" data-m="x">Batal</button><button type="submit" class="ct-b ct-pri">${o.okText||'Simpan'}</button></footer>`:''}</form>`;
 root.append(bd);w._m=bd;const fm=bd.firstChild,done=()=>closeModal(w);
 fm.onsubmit=e=>{e.preventDefault();if(ok&&ok(fm)===false)return;done()};
 bd.onclick=e=>{if(e.target===bd||e.target.closest('[data-m=x]'))done();else{const x=e.target.closest('[data-m]');if(x&&o.on&&o.on[x.dataset.m])o.on[x.dataset.m](fm,done)}};
 bd.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();done()}};
 const f=fm.querySelector('input,select,textarea,button');f&&f.focus();return fm}
function closeModal(w){if(w._m){w._m.remove();w._m=null}}

// ---------- simbol, tab ----------
function symPicker(w,anchor,mode){
 const row=(s,n,r)=>`<button class="ct-r" data-s="${esc(s)}"><b>${esc(s)}</b><span>${esc(n)}</span><em>${r||''}</em></button>`;
 pop(w,anchor,`<input class="ct-in" placeholder="Cari simbol…" aria-label="Cari simbol"><div class="ct-ls"></div>`,p=>{
  const inp=$('input',p),ls=$('.ct-ls',p);
  const fill=()=>{const q=inp.value.trim().toUpperCase(),m=WATCH.filter(r=>!q||r[0].includes(q)||r[1].toUpperCase().includes(q));
   ls.innerHTML=m.map(r=>row(r[0],r[1],pc(r[3]))).join('')+(q&&!WATCH.some(r=>r[0]===q)&&/^[A-Z0-9.:_-]{2,16}$/.test(q)?row(q,'Buka simbol ini',''):'')||'<p class="ct-em">Tidak ada hasil</p>'};
  fill();inp.oninput=fill;inp.onkeydown=e=>{if(e.key==='Enter'){const b=$('.ct-r',ls);if(b)b.click()}};
  ls.onclick=e=>{const b=e.target.closest('[data-s]');if(!b)return;closePop(w);mode==='new'?addTab(w,b.dataset.s):setSym(w,b.dataset.s);save(w)};
  inp.focus()})}
function tabSearch(w,anchor){const R=w._r;
 pop(w,anchor,`<div class="ct-ls">${R.tabs.map(t=>`<div class="ct-r${t.id===R.act?' on':''}" data-id="${t.id}">${typeof SymIcon!=='undefined'?SymIcon.html(t.sym,16):''}<b>${esc(t.sym)}</b><span>${t.tf} · ${TYPES[t.type]}</span><button class="ct-x" aria-label="Tutup tab">×</button></div>`).join('')}</div>`,p=>{
  p.onclick=e=>{const r=e.target.closest('[data-id]');if(!r)return;const id=+r.dataset.id;if(e.target.closest('.ct-x')){closeTab(w,id);if(w._r.tabs.length)tabSearch(w,anchor);else closePop(w)}else{closePop(w);act(w,id)}}})}

// ---------- panel indikator ----------
const hex=c=>{if(/^#[0-9a-f]{6}$/i.test(c||''))return c;const m=/^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c||'');return m?'#'+[m[1],m[2],m[3]].map(v=>(+v).toString(16).padStart(2,'0')).join(''):'#8a93a0'};
function indPanel(w){const T=cur(w);let mine=[];
 const body=`<input class="ct-in" placeholder="Cari indikator…" aria-label="Cari indikator"><div class="ct-il"></div>`;
 const fm=modal(w,'Indikator',body,null,{cls:'ind'});const inp=$('input',fm),ls=$('.ct-il',fm);
 const draw=()=>{const q=inp.value.trim().toLowerCase();let h='';
  const cust=mine.filter(m=>!q||m.name.toLowerCase().includes(q));
  for(const[g,ks]of ChartInd.GROUPS){const it=ks.filter(k=>!q||ID[k].name.toLowerCase().includes(q)||ID[k].short.toLowerCase().includes(q));if(it.length)h+=`<h5>${g}</h5>`+it.map(k=>`<button type="button" class="ct-r" data-k="${k}"><b>${ID[k].short}</b><span>${ID[k].name}</span><em>${ID[k].overlay?'overlay':'panel'}</em></button>`).join('')}
  if(typeof ChartCustom!=='undefined')h+=`<h5>Indikator custom (JS / Pine)</h5><button type="button" class="ct-r" data-new="1"><b>+ Baru</b><span>Tulis indikator sendiri</span></button>`+cust.map(m=>`<div class="ct-r" data-c="${esc(m.id)}"><b>${esc(m.name)}</b><span>${m.language==='pine'?'Pine':'JS'}${m.mine===false?' · komunitas':''}</span><button type="button" class="ct-b" data-add="${esc(m.id)}">Tambah</button><button type="button" class="ct-b" data-ed="${esc(m.id)}">${m.mine===false?'Fork':'Ubah'}</button></div>`).join('');
  ls.innerHTML=h||'<p class="ct-em">Tidak ada hasil</p>'};
 draw();inp.oninput=draw;
 const reload=()=>typeof ChartCustom!=='undefined'&&ChartCustom.list().then(l=>{mine=l;if(w._m)draw()}).catch(()=>{});reload();
 const addC=m=>ChartCustom.full(m).then(f=>{T.ind.push(mkInd('c:'+f.id,{name:f.name,lang:f.language,src:f.source,ver:f.version||1,p:{}}));save(w);sync(w)});
 fm.onclick=e=>{const b=e.target.closest('[data-k]');if(b){const k=b.dataset.k;T.ind.push(mkInd(k));save(w);sync(w);closeModal(w);return}
  if(e.target.closest('[data-new]')){ChartCustom.edit(w,null,m=>{reload();if(m&&m.id)addC(m)},{modal,closeModal});return}
  const a=e.target.closest('[data-add]');if(a){const m=mine.find(x=>x.id===a.dataset.add);if(m){addC(m);closeModal(w)}return}
  const ed=e.target.closest('[data-ed]');if(ed){const m=mine.find(x=>x.id===ed.dataset.ed);if(m)ChartCustom.edit(w,m,r=>{reload();if(r&&m.mine!==false)for(const t of w._r.tabs)for(const i of t.ind)if(i.k==='c:'+m.id){i.name=r.name;i.lang=r.language;i.src=r.source;i._k=null;i._runKey=null}else{}save(w);sync(w)},{modal,closeModal})}}}

function inputsHtml(ins,p){let g=null,h='';for(const i of ins){if(i.group&&i.group!==g){g=i.group;h+=`<h5>${esc(g)}</h5>`}
 const n='p:'+esc(i.key),v=p[i.key],t=i.type,L=esc(i.label||i.key);
 if(t==='bool')h+=`<label class="ct-f"><span>${L}</span><input type="checkbox" name="${n}" data-t="bool"${v?' checked':''}></label>`;
 else if(t==='color')h+=`<label class="ct-f"><span>${L}</span><input type="color" name="${n}" data-t="color" value="${hex(v)}"></label>`;
 else if(i.options&&i.options.length)h+=`<label class="ct-f"><span>${L}</span><select name="${n}" data-t="str">${i.options.map(o=>`<option value="${esc(o)}"${String(o)===String(v)?' selected':''}>${esc(o)}</option>`).join('')}</select></label>`;
 else if(t==='string'||t==='timeframe'||t==='symbol'||t==='session')h+=`<label class="ct-f"><span>${L}</span><input type="text" name="${n}" data-t="str" value="${esc(v??'')}"></label>`;
 else h+=`<label class="ct-f"><span>${L}</span><input type="number" name="${n}" data-t="num" value="${v}" min="${i.min??''}" max="${i.max??''}" step="${i.step||(t==='int'?1:'any')}"></label>`}
 return h}
function stratReport(w,inst){const R=inst._res&&inst._res.strategy;if(!R)return;
 const st=R.stats,f=(v,d=2)=>v==null||!isFinite(v)?'∞':(+v).toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d}),sg=v=>v>0?'ct-up':v<0?'ct-dn':'';
 const row=(a,b,c)=>`<tr><td>${a}</td><td class="${c||''}">${b}</td></tr>`;
 const eq=R.equity.filter(v=>v!=null),mn=Math.min(...eq),mx=Math.max(...eq),pts=eq.map((v,i)=>((i/(eq.length-1||1))*300).toFixed(1)+','+(70-(v-mn)/((mx-mn)||1)*66).toFixed(1)).join(' ');
 const body=`<div class="ct-rp"><svg viewBox="0 0 300 74" preserveAspectRatio="none" class="ct-eq"><polyline fill="none" stroke="currentColor" stroke-width="1.4" points="${pts}"/></svg>
<table class="ct-st">${row('Laba bersih',f(st.net)+' ('+f(st.netPct)+'%)',sg(st.net))}${row('Ekuitas akhir',f(st.equity))}${row('Jumlah trade',st.n+' (menang '+st.win+')')}${row('Win rate',f(st.winRate)+'%')}${row('Profit factor',f(st.pf))}${row('Rata-rata trade',f(st.avg),sg(st.avg))}${row('Rata-rata menang / kalah',f(st.avgWin)+' / '+f(st.avgLoss))}${row('Terbaik / terburuk',f(st.best)+' / '+f(st.worst))}${row('Max drawdown',f(st.maxDD)+' ('+f(st.maxDDPct)+'%)','ct-dn')}${row('Sharpe (perkiraan)',f(st.sharpe))}${row('Long / Short',f(st.longNet)+' ('+st.longN+') / '+f(st.shortNet)+' ('+st.shortN+')')}${row('Posisi terbuka',st.open+' · '+f(st.openPnl),sg(st.openPnl))}</table>
<h5>Trade terakhir</h5><div class="ct-tw"><table class="ct-st"><tr><th>ID</th><th>Arah</th><th>Masuk</th><th>Keluar</th><th>P/L</th></tr>${R.trades.slice(-40).reverse().map(t=>`<tr><td>${esc(t.id)}</td><td>${t.dir>0?'Long':'Short'}</td><td>${f(t.ep)}</td><td>${f(t.xp)}</td><td class="${sg(t.pnl)}">${f(t.pnl)}</td></tr>`).join('')}</table></div></div>`;
 modal(w,'Laporan: '+(inst.name||'Strategi'),body,()=>true,{wide:1,okText:'Tutup'})}
function indSettings(w,iid){const T=cur(w),inst=T.ind.find(i=>i.id===iid),def=inst&&defOf(inst);if(!def)return;const p=inst.k.startsWith('c:')?{...Object.fromEntries((def.inputs||[]).map(i=>[i.key,i.def])),...inst.p}:ChartInd.norm(def,inst.p);
 const body=`${(def.inputs||[]).length?'<h5>Parameter</h5>':''}${inputsHtml(def.inputs||[],p)}<h5>Warna</h5>${def.plots.filter(pl=>!pl.dirKey||true).map(pl=>`<label class="ct-f"><span>${esc(pl.k)}</span><input type="color" name="c:${esc(pl.k)}" value="${hex(colorOf(inst,pl))}"></label>`).join('')}${def.overlay?'':`<label class="ct-f"><span>Tinggi panel</span><input type="number" name="h" min="0.6" max="6" step="0.1" value="${inst.h||1.3}"></label>`}`;
 modal(w,instName(inst),body,fm=>{const np={},nc={};for(const el of fm.elements){if(!el.name)continue;const[a,k]=el.name.split(/:(.*)/);if(a==='p'){const t=el.dataset.t;if(t==='bool')np[k]=el.checked;else if(t==='str'||t==='color')np[k]=el.value;else{const v=parseFloat(el.value);if(isFinite(v))np[k]=v}}else if(a==='c'){const pl=def.plots.find(x=>x.k===k);if(pl&&el.value.toLowerCase()!==hex(pl.c).toLowerCase())nc[k]=el.value}else if(el.name==='h')inst.h=Math.max(.6,Math.min(6,parseFloat(el.value)||1.3))}
  inst.p=np;inst.c=nc;inst._k=null;save(w);sync(w)},{extra:(inst._res&&inst._res.strategy?[['rep','Laporan','']]:[]).concat([['rm','Hapus','ct-dng']]),on:{rep:(fm,done)=>{done();stratReport(w,inst)},rm:(fm,done)=>{T.ind=T.ind.filter(i=>i.id!==iid);save(w);sync(w);done()}}})}

// ---------- layout, template ----------
const lsGet=async(kind)=>{if(srv()){try{return kind==='layout'?(await api('/api/chart/layouts')).map(x=>({id:x.id,name:x.name})):(await api('/api/chart/templates?kind=indicators')).map(x=>({id:x.id,name:x.name}))}catch(e){}}return jl(kind==='layout'?LKEY:TKEY,[]).map(x=>({id:x.id,name:x.name}))};
async function lsLoad(kind,id){if(srv()&&/^[0-9a-f-]{36}$/.test(id)){try{const j=await api(kind==='layout'?'/api/chart/layouts/'+id:'/api/chart/templates/'+id);return kind==='layout'?j.layout:j.data}catch(e){}}const x=jl(kind==='layout'?LKEY:TKEY,[]).find(x=>x.id===id);return x&&x.data}
async function lsSave(kind,name,data){if(srv()){try{if(kind==='layout'){const ex=(await api('/api/chart/layouts')).find(x=>x.name===name);if(ex)await api('/api/chart/layouts/'+ex.id,{method:'PUT',body:JSON.stringify({layout:data})});else await api('/api/chart/layouts',{method:'POST',body:JSON.stringify({name,layout:data})})}else await api('/api/chart/templates',{method:'POST',body:JSON.stringify({kind:'indicators',name,data})});return true}catch(e){}}
 const k=kind==='layout'?LKEY:TKEY,L=jl(k,[]),i=L.findIndex(x=>x.name===name),o={id:i>=0?L[i].id:'l'+rid(),name,data};i>=0?L[i]=o:L.push(o);js(k,L);return true}
async function lsDel(kind,id){if(srv()&&/^[0-9a-f-]{36}$/.test(id)){try{await api((kind==='layout'?'/api/chart/layouts/':'/api/chart/templates/')+id,{method:'DELETE'});return}catch(e){}}const k=kind==='layout'?LKEY:TKEY;js(k,jl(k,[]).filter(x=>x.id!==id))}
async function layoutMenu(w,anchor){const[ls,ts]=await Promise.all([lsGet('layout'),lsGet('tpl')]);if(!w.isConnected)return;
 const sec=(t,items,kind)=>`<h5>${t}</h5>${items.map(x=>`<div class="ct-r" data-${kind}="${esc(x.id)}"><b style="min-width:0;flex:1">${esc(x.name)}</b><button class="ct-x" data-del="${kind}:${esc(x.id)}" aria-label="Hapus">${Icon('x')}</button></div>`).join('')||'<p class="ct-em">Belum ada</p>'}`;
 pop(w,anchor,`<button class="ct-r" data-s="layout">Simpan layout saat ini…</button>${sec('Layout tersimpan',ls,'lay')}<button class="ct-r" data-s="tpl">Simpan indikator tab ini sebagai template…</button>${sec('Template indikator',ts,'tp')}`,p=>{
  p.onclick=async e=>{const R=w._r,T=cur(w);
   const d=e.target.closest('[data-del]');if(d){const[k,id]=d.dataset.del.split(':');await lsDel(k==='lay'?'layout':'tpl',id);layoutMenu(w,anchor);return}
   const s=e.target.closest('[data-s]');if(s){closePop(w);const nm=await dlg.prompt(s.dataset.s==='layout'?'Simpan layout':'Simpan template','Nama',T.sym+' '+T.tf);if(!nm||!nm.trim())return;
    await lsSave(s.dataset.s==='layout'?'layout':'tpl',nm.trim(),s.dataset.s==='layout'?{v:2,act:R.act,tabs:R.tabs.map(tabJson)}:{ind:tabJson(T).ind,type:T.type,scale:T.scale});return}
   const l=e.target.closest('[data-lay]');if(l){closePop(w);const lay=await lsLoad('layout',l.dataset.lay);if(!lay||!Array.isArray(lay.tabs)||!lay.tabs.length){dlg.alert('Layout','Layout tidak dapat dimuat.');return}
    R.tabs=lay.tabs.filter(s=>s.sym&&TFS[s.tf]).map(s=>fromSaved(w,s));if(!R.tabs.length)R.tabs=[mk(w,S.sym,S.tf)];act(w,(R.tabs.find(t=>t.id===lay.act)||R.tabs[0]).id);save(w);return}
   const t=e.target.closest('[data-tp]');if(t){closePop(w);const tp=await lsLoad('tpl',t.dataset.tp);if(!tp||!Array.isArray(tp.ind))return;T.ind=tp.ind.map(i=>({...i,id:rid()}));if(tp.type)T.type=tp.type;if(tp.scale)T.scale=tp.scale;save(w);sync(w)}}})}

// tab dari data tersimpan (termasuk format lama)
const OLD={VOL:()=>mkInd('vol'),MA20:()=>mkInd('sma',{p:{period:20}}),EMA50:()=>mkInd('ema',{p:{period:50}}),BB:()=>mkInd('bb'),VWAP:()=>mkInd('vwap')};
function fromSaved(w,s){const R=w._r,t={...mk(w,s.sym,s.tf),type:TYPES[s.type]?s.type:'candle',scale:s.scale||(s.log?'log':'lin'),mag:s.mag!==false,mw:s.mw||4,hideDr:!!s.hideDr};
 t.id=s.id|0||++R.uid;R.uid=Math.max(R.uid,t.id);
 let ind=Array.isArray(s.ind)?s.ind:[];
 if(ind.some(x=>typeof x==='string')||s.sub){ind=ind.filter(x=>typeof x==='string'&&OLD[x]).map(x=>OLD[x]());if(s.sub==='RSI')ind.push(mkInd('rsi'));if(s.sub==='MACD')ind.push(mkInd('macd'))}
 t.ind=ind.filter(i=>i&&typeof i.k==='string'&&(i.k.startsWith('c:')||ID[i.k])).map(i=>({id:i.id||rid(),k:i.k,on:i.on!==false,p:i.p||{},c:i.c||{},h:i.h,name:i.name,lang:i.lang,src:i.src,ver:i.ver}));
 if(Array.isArray(s.draws)&&s.draws.length&&!drs(s.sym).length){drs(s.sym).push(...s.draws.filter(d=>d.a&&ChartDraw.BY[d.k]).map(d=>({id:ChartDraw.uid(),k:d.k,pts:d.k==='hline'?[d.a]:[d.a,d.b||d.a],s:{}})));js(DKEY,DRW)}
 return t}

// ---------- legenda ----------
function legend(w){const T=cur(w),box=$('.ct-lg',w);if(!T||!box)return;
 const nm=typeof SymName!=='undefined'?SymName.info(T.sym):{name:T.sym,ex:'',full:true};if(!nm.full&&typeof SymName!=='undefined')SymName.load(T.sym,()=>{w._lk=null;if(w.isConnected)legend(w)});
 const key=T.sym+T.tf+T.type+nm.name+nm.ex+T.ind.map(i=>i.id+i.on+instName(i)).join();if(w._lk===key)return;w._lk=key;
 const tfl=typeof SymName!=='undefined'?SymName.tf(T.tf):T.tf,dot='<i class="ct-dt">·</i>';
 box.innerHTML=`<div class="ct-lh"><span class="ct-nm" title="${esc(nm.name)} (${esc(T.sym)})${nm.full?'':' · nama belum terverifikasi'}">${typeof SymIcon!=='undefined'?SymIcon.html(T.sym,18):''}<b>${esc(nm.name)}</b>${dot}<span>${esc(tfl)}</span>${nm.ex?dot+'<span>'+esc(nm.ex)+'</span>':''}</span><span class="ct-ds" hidden></span><span class="ct-ohlc"></span><span class="ct-rt"></span></div>`+T.ind.map(i=>`<div class="ct-li${i.on?'':' off'}${(defOf(i)||{}).overlay===false?' sub':''}" data-iid="${i.id}"><span class="ct-ln">${esc(instName(i))}</span><span class="ct-lv"></span><span class="ct-la"><button data-ia="eye" title="${i.on?'Sembunyikan':'Tampilkan'}" aria-label="Sembunyikan">${Icon(i.on?'eye':'eyeoff')}</button><button data-ia="set" title="Pengaturan" aria-label="Pengaturan">${Icon('gear')}</button><button data-ia="rm" title="Hapus" aria-label="Hapus">${Icon('x')}</button></span></div>`).join('')}
function updLegend(w,T,res){const box=$('.ct-lg',w),G=w._g;if(!box||!res||!G)return;const{hv,R,V,F}=res,k=V[hv],pk=V[hv-1]||k,ch=k.c-pk.c,up=k.c>=k.o;
 const o=$('.ct-ohlc',box);if(o){o.className='ct-ohlc '+(up?'up':'dn');o.textContent=`O${F(k.o)} H${F(k.h)} L${F(k.l)} C${F(k.c)} ${ch>=0?'+':'−'}${F(Math.abs(ch))} (${pc(ch/pk.c*100)})`}
 for(const row of $$('.ct-li',box)){const inst=T.ind.find(i=>i.id===row.dataset.iid),r=R.find(x=>x.i===inst),vl=$('.ct-lv',row);
  if(!inst||!vl)continue;
  if(!r){vl.textContent=inst.on?'…':'';}
  else if(r.r.def.kind==='volume')vl.innerHTML=`<i style="color:${colorOf(inst,r.r.def.plots[0])}">${(G.D[hv].v||0).toLocaleString('id-ID')}</i>`;
  else vl.innerHTML=r.r.def.plots.map(pl=>{const s=r.r.series[pl.k],sh=pl.shift?pl.shift(r.r.p):0,v=s&&s[hv-sh];return v==null||!isFinite(v)?'':`<i style="color:${colorOf(inst,pl)}">${Math.abs(v)>=1e6?(v/1e6).toFixed(2)+'M':Math.abs(v)>=1e4?F(v).replace(/,.*$/,''):+v.toFixed(Math.abs(v)<10?4:2)}</i>`}).join(' ');
  if(row.classList.contains('sub')){const pn=G.panes.find(p=>p.o&&p.o.i===inst);row.style.top=pn?pn.y0+3+'px':'-99px'}
  else row.style.top=''}}

// ---------- render ----------
const sch=w=>{if(w._q)return;w._q=requestAnimationFrame(()=>{w._q=0;draw(w)})};
function draw(w){const T=cur(w);if(!T)return;T._dp=T.draft&&w._r.dc?w._r.dc.placed:0;hint(w,T);
 const deps={series:i=>serie(w,T,i),drawings:()=>T.hideDr?[]:drs(T.sym),alerts:()=>w._al=alertsOf(T.sym),now:Date.now},res=ChartRender.draw(w,T,deps);
 if(res){updLegend(w,T,res);const G=w._g;if(G&&G.i0<25&&T.D&&T.D.live&&!T.busy&&!T.noMore)older(w,T)}else{const g=w._g;if(!T.D)w._g=null}}

// ---------- gambar: interaksi ----------
function snap(w,T,mx,my,noMag){const G=w._g,j=G.iX(mx),bi=Math.max(0,Math.min(G.D.length-1,Math.round(j)));let p=G.P(my),t=G.tAt(j);
 if(T.mag&&!noMag&&!w._r.alt){t=G.D[bi].t;const k=G.V[bi];let best=1e9;[k.o,k.h,k.l,k.c].forEach(v=>{const dd=Math.abs(G.Y(v)-my);if(dd<best&&dd<18){best=dd;p=v}})}
 return{t,p}}
const isLocked=d=>!!d.lock;
function finishDraft(w,T){const R=w._r,d=T.draft;T.draft=null;R.dc=null;if(!d)return;
 if(d.k==='long'||d.k==='short')ChartDraw.complete(d);
 const add=()=>{mut(T.sym,L=>L.push(d));T.sel=d;if(!R.stay)T.tool='cur';sync(w);redrawAll()};     // R.stay: tetap di alat yang sama untuk gambar berikutnya
 if(d.k==='text'){dlg.prompt('Teks','Isi teks','').then(v=>{if(v==null||!v.trim()){T.tool='cur';sync(w);return}d.txt=v.trim();add()});return}
 add()}
function drawDown(w,T,mx,my){const R=w._r,G=w._g;if(my>=G.mH)return;const pt=snap(w,T,mx,my),k=T.tool,n=ChartDraw.BY[k].n;
 if(!T.draft){const d=ChartDraw.create(k,pt);if(k==='long'||k==='short')ChartDraw.complete(d);T.draft=d;R.dc={x:mx,y:my,placed:1,n,brush:n===0};if(n===1||k==='text'){finishDraft(w,T)}sch(w);return}
 const dc=R.dc;if(dc.brush)return;
 for(let i=dc.placed;i<T.draft.pts.length;i++)T.draft.pts[i]={...pt};dc.placed++;dc.moved=true;
 if(dc.placed>=dc.n)finishDraft(w,T);sch(w)}
function drawMove(w,T,mx,my,down){const R=w._r,dc=R.dc,d=T.draft;if(!d||!dc||my<0)return;const pt=snap(w,T,mx,Math.min(my,w._g.mH-1));
 if(dc.brush){if(down){const l=d.pts[d.pts.length-1],G=w._g;if(Math.hypot(G.X(G.idx(pt.t))-G.X(G.idx(l.t)),G.Y(pt.p)-G.Y(l.p))>=3)d.pts.push(pt)}}
 else{for(let i=dc.placed;i<d.pts.length;i++)d.pts[i]={...pt};if(d.k==='long'||d.k==='short')ChartDraw.complete(d)}sch(w)}

function styleBar(w){const T=cur(w),bar=$('.ct-sb',w);if(!bar)return;const d=T&&T.sel;if(!d||!drs(T.sym).includes(d)){bar.hidden=true;return}
 bar.hidden=false;const s=d.s||(d.s={}),nc=ChartDraw.NOCOLOR[d.k];
 bar.innerHTML=`<span class="ct-sn">${esc(ChartDraw.BY[d.k].name)}</span>`+(nc?'':ChartDraw.COLORS.map(c=>`<button class="ct-cs${(s.c||'')===c?' on':''}" data-sc2="${c}" style="background:${c}" aria-label="Warna ${c}"></button>`).join('')+`<input type="color" class="ct-cc" data-cc value="${/^#[0-9a-f]{6}$/i.test(s.c||'')?s.c:'#4c9aff'}" title="Warna lain" aria-label="Warna lain">`)+
  `<select data-sw aria-label="Tebal garis">${[1,1.5,2,3,4].map(v=>`<option value="${v}"${(s.w||1.5)==v?' selected':''}>${v}px</option>`).join('')}</select><select data-sd aria-label="Gaya garis"><option value="0">Solid</option><option value="1"${s.dash===1?' selected':''}>Putus</option><option value="2"${s.dash===2?' selected':''}>Titik</option></select>`+
  (d.k==='fib'||d.k==='fibx'?`<button class="ct-b" data-sa="ext" aria-pressed="${!!s.ext}" title="Perpanjang ke kanan">${Icon('arrowR')}</button>`:'')+(d.k==='text'?'<button class="ct-b" data-sa="txt">Ubah teks</button>':'')+(['hline','hray','cross'].includes(d.k)?'<button class="ct-b" data-sa="price" title="Ketik harga tepat">Harga…</button>':'')+
  `<button class="ct-b" data-sa="lock" aria-pressed="${!!d.lock}" title="Kunci">${Icon('lock')}</button><button class="ct-b" data-sa="hide" title="Sembunyikan">${Icon('eye')}</button><button class="ct-b" data-sa="clone" title="Duplikat (Ctrl+D)">${Icon('copy')}</button><button class="ct-b ct-dng" data-sa="del" title="Hapus (Del)">${Icon('trash')}</button>`}
function styleAct(w,e){const T=cur(w),d=T.sel;if(!d)return;const t=e.target;
 const ch=fn=>{mut(T.sym,()=>fn());sync(w);redrawAll()};
 if(t.dataset.sc2)return ch(()=>{d.s=d.s||{};d.s.c=t.dataset.sc2});
 if(t.matches('[data-cc]'))return ch(()=>{d.s=d.s||{};d.s.c=t.value});
 if(t.matches('[data-sw]'))return ch(()=>{d.s=d.s||{};d.s.w=+t.value});
 if(t.matches('[data-sd]'))return ch(()=>{d.s=d.s||{};d.s.dash=+t.value});
 const b=t.closest('[data-sa]');if(b)doAct(w,b.dataset.sa)}
// aksi pada gambar terpilih (tombol style bar, menu klik kanan, pintasan keyboard, klik dua kali)
function doAct(w,a){const T=cur(w),d=T&&T.sel;if(!d)return;
 const ch=fn=>{mut(T.sym,()=>fn());sync(w);redrawAll()};
 if(a==='del')return ch(()=>{const L=drs(T.sym);L.splice(L.indexOf(d),1);T.sel=null});
 if(a==='lock')return ch(()=>{d.lock=!d.lock});
 if(a==='hide')return ch(()=>{d.hide=true;T.sel=null});
 if(a==='ext')return ch(()=>{d.s=d.s||{};d.s.ext=!d.s.ext});
 if(a==='clone')return ch(()=>{const c=ChartDraw.clone(d);ChartDraw.translate(c,TFS[T.tf]*3,0);drs(T.sym).push(c);T.sel=c});
 if(a==='front'||a==='back')return ch(()=>{const L=drs(T.sym);L.splice(L.indexOf(d),1);a==='front'?L.push(d):L.unshift(d)});
 if(a==='txt')return dlg.prompt('Teks','Isi teks',d.txt||'').then(v=>{if(v&&v.trim())ch(()=>{d.txt=v.trim()})});
 if(a==='price')return dlg.prompt('Harga '+T.sym,'Harga',String(+d.pts[0].p.toPrecision(8))).then(v=>{if(v==null)return;const n=parseFloat(String(v).replace(',','.'));
  if(n>0&&isFinite(n))ch(()=>{d.pts[0].p=n});else dlg.alert('Harga','Isi angka harga yang valid.')})}
// geser halus gambar terpilih dengan tombol panah (satu bar / satu piksel harga; Shift = 10x). Penekanan beruntun dalam 0,8 dtk = satu langkah undo.
function nudge(w,T,e){const G=w._g,R=w._r,d=T.sel,L=drs(T.sym);if(!G||!L.includes(d))return;
 const n=e.shiftKey?10:1;let dt=0,dp=0;
 if(e.key==='ArrowLeft')dt=-TFS[T.tf]*n;else if(e.key==='ArrowRight')dt=TFS[T.tf]*n;else dp=Math.abs(G.P(0)-G.P(1))*n*(e.key==='ArrowUp'?1:-1);
 const t=Date.now();if(R.nd===d&&t-R.nt<800){ChartDraw.translate(d,dt,dp);touch(T.sym)}else mut(T.sym,()=>ChartDraw.translate(d,dt,dp));
 R.nd=d;R.nt=t;sync(w);redrawAll()}
// petunjuk singkat di kiri bawah kanvas: apa yang harus dilakukan sekarang
function hint(w,T){const el=$('.ct-hint',w);if(!el)return;const R=w._r,tl=ChartDraw.BY[T.tool];let s='';
 if(T.tool!=='cur'&&tl){const dc=R.dc;
  if(T.draft&&dc)s=dc.brush?'Seret untuk menggambar, lepas untuk selesai':`${tl.name}: klik titik ke-${Math.min(dc.placed+1,tl.n)} dari ${tl.n}`;
  else s=tl.n===1?`${tl.name}: klik untuk menaruh`:tl.n===0?`${tl.name}: tekan lalu seret`:`${tl.name}: klik titik awal, lalu klik (atau seret) ke titik berikutnya`;
  s+=' · Alt = tanpa magnet · Esc / klik kanan = selesai'}
 else if(T.sel&&!T.hideDr&&drs(T.sym).includes(T.sel))s=T.sel.lock?'Terkunci · klik ikon gembok di bilah atas untuk membuka':'Seret titik putih = ubah bentuk · seret garis = pindah · panah = geser halus (Shift = cepat) · Del = hapus · klik kanan = menu';
 if(el.textContent!==s){el.textContent=s;el.hidden=!s}}

const TOOLKEY={t:'trend',h:'hline',v:'vline',r:'rect',f:'fib',a:'arrow',x:'text',c:'channel',m:'measure',l:'long',s:'short',b:'brush',e:'ellipse'};
const KEYOF=Object.fromEntries(Object.entries(TOOLKEY).map(([k,v])=>[v,k.toUpperCase()]));
function railSync(w){const T=cur(w),R=w._r;$$('[data-g]',w).forEach(b=>{const g=b.dataset.g,tl=ChartDraw.TOOLS.filter(t=>t.grp===g),on=tl.some(t=>t.k===T.tool),sh=on?T.tool:R.last[g]||tl[0].k,n=ChartDraw.BY[sh];
 b.setAttribute('aria-pressed',on);b.innerHTML=svg(n.ic)+(tl.length>1?'<u></u>':'');
 b.title=n.name+(KEYOF[sh]?` (${KEYOF[sh]})`:'')+(tl.length>1?' · klik = pakai alat ini; panah kecil atau klik kanan = alat lain':'')})}
// Klik pada tombol grup = langsung pakai alat terakhir grup itu (1 klik). Daftar alat lain: klik panah kecil di pojok tombol, atau klik kanan.
function toolMenu(w,b,e){const g=b.dataset.g,T=cur(w),R=w._r,tl=ChartDraw.TOOLS.filter(t=>t.grp===g);
 const pick=k=>{T.tool=T.tool===k?'cur':k;if(T.tool!=='cur')R.last[g]=k;T.draft=null;R.dc=null;closePop(w);sync(w)};
 if(tl.length===1){pick(tl[0].k);return}
 const arrow=e&&(e.type==='contextmenu'||(e.target.closest&&e.target.closest('u'))||e.clientX-b.getBoundingClientRect().left>b.offsetWidth-12);
 if(!arrow){pick(R.last[g]||tl[0].k);return}
 pop(w,b,tl.map(t=>`<button class="ct-r${T.tool===t.k?' on':''}" data-t="${t.k}">${svg(t.ic)}<span style="color:var(--ink)">${t.name}</span>${KEYOF[t.k]?`<kbd>${KEYOF[t.k]}</kbd>`:''}</button>`).join(''),p=>{p.onclick=ev=>{const x=ev.target.closest('[data-t]');if(!x)return;closePop(w);T.tool=x.dataset.t;R.last[g]=T.tool;T.draft=null;R.dc=null;sync(w)}},'ct-fly');
 const p=w._p;if(p){const r=b.getBoundingClientRect(),rr=$('.ct',w).getBoundingClientRect();p.style.left=r.right-rr.left+4+'px';p.style.top=Math.max(4,r.top-rr.top)+'px'}}

function bind(w){const cv=$('canvas',w),R=w._r;
 const pos=e=>{const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]};
 const tol=()=>R.ptype==='touch'?{t:16,hr:22}:{t:8,hr:10};      // layar sentuh: area tekan lebih besar
 const sel=(T,mx,my)=>{const G=w._g;if(my>=G.mH||T.hideDr)return null;const L=drs(T.sym);
  const o=tol();
  if(T.sel&&L.includes(T.sel)){const h=ChartDraw.hit(T.sel,G.E,mx,my,o);if(h)return{d:T.sel,h}}
  for(let i=L.length-1;i>=0;i--){const h=ChartDraw.hit(L[i],G.E,mx,my,o);if(h)return{d:L[i],h}}return null};
 const hover=(T,mx,my)=>{const G=w._g;let h=null;       // sorot gambar di bawah kursor + ubah bentuk kursor
  if(G&&T.tool==='cur'&&!T.draft&&mx<=G.pw&&my<G.mH&&!T.hideDr)h=sel(T,mx,my);
  const o=T.hov,hh=h&&h.h.h!=null?h.h.h:null;if(h?!(o&&o.d===h.d&&o.h===hh):o)T.hov=h?{d:h.d,h:hh}:null;
  cv.style.cursor=T.tool!=='cur'?'cell':h?ChartDraw.cursorOf(h.d,h.h):'crosshair'};
 const drawMenu=(e,d)=>{const pr=['hline','hray','cross'].includes(d.k);
  pop(w,at(e.clientX,e.clientY),`<h5>${esc(ChartDraw.BY[d.k].name)}</h5>${pr?'<button class="ct-r" data-m="price">Ubah harga…</button>':''}${d.k==='text'?'<button class="ct-r" data-m="txt">Ubah teks…</button>':''}<button class="ct-r" data-m="clone">Duplikat<em>Ctrl+D</em></button><button class="ct-r" data-m="lock">${d.lock?'Buka kunci':'Kunci posisi'}</button><button class="ct-r" data-m="hide">Sembunyikan</button><button class="ct-r" data-m="front">Bawa ke depan</button><button class="ct-r" data-m="back">Kirim ke belakang</button><button class="ct-r ct-dng" data-m="del">Hapus<em>Del</em></button>`,
   p=>{p.onclick=ev=>{const b=ev.target.closest('[data-m]');if(!b)return;closePop(w);doAct(w,b.dataset.m)}})};
 cv.addEventListener('pointerdown',e=>{const T=cur(w),G=w._g;if(!T||!T.D||!G||e.button!==0)return;const[mx,my]=pos(e);R.alt=e.altKey;R.ptype=e.pointerType;cv.setPointerCapture(e.pointerId);closePop(w);cv.focus&&cv.focus();
  if(mx>G.pw){if(my<G.PH){T.auto=false;R.drag={mode:'ys',my,yr:[...T.yr]};sync(w)}return}
  if(my>G.PH){R.drag={mode:'xs',mx,vis:T.vis,rb:T.rb};return}
  for(const a of w._al||[])if(a._box&&mx>=a._box[0]&&mx<=a._box[0]+a._box[2]&&my>=a._box[1]&&my<=a._box[1]+a._box[3]){const l=G.D[G.D.length-1].c;setAlert(a.id,null,l);sch(w);return}
  if(T.tool!=='cur'&&!T.draft&&T.sel&&!isLocked(T.sel)&&drs(T.sym).includes(T.sel)){        // alat gambar masih aktif: titik gambar yang baru dibuat tetap bisa ditarik untuk merapikan
   const hh=ChartDraw.hit(T.sel,G.E,mx,my,tol());
   if(hh&&hh.h!=null){R.drag={mode:'handle',d:T.sel,h:hh.h,mx,my,o:JSON.parse(JSON.stringify(T.sel.pts)),pre:JSON.stringify(drs(T.sym)),moved:false};sch(w);return}}
  if(T.tool!=='cur'){drawDown(w,T,mx,my);if(T.draft){R.drag={mode:'draw'}}return}
  for(let i=1;i<G.panes.length;i++)if(Math.abs(my-G.panes[i].y0)<=3){R.drag={mode:'rs',i,my,w0:G.panes.map(p=>p.k==='main'?T.mw:p.o.i.h||1.3)};return}
  const h=sel(T,mx,my);
  if(h){T.sel=h.d;styleBar(w);
   if(isLocked(h.d)){sch(w);return}
   R.drag={mode:h.h.h!=null?'handle':'move',d:h.d,h:h.h.h,mx,my,o:JSON.parse(JSON.stringify(h.d.pts)),pre:JSON.stringify(drs(T.sym)),moved:false}}
  else{if(T.sel){T.sel=null;styleBar(w)}R.drag={mode:'pan',mx,my,rb:T.rb,yr:T.yr&&[...T.yr]}}sch(w)});
 cv.addEventListener('pointermove',e=>{const T=cur(w);if(!T)return;const[mx,my]=pos(e),G=w._g,dr=R.drag;T.m={x:mx,y:my};R.alt=e.altKey;R.ptype=e.pointerType;
  if(G&&dr){
   if(dr.mode==='pan'){T.rb=Math.max(-T.vis*.5,Math.min(T.D.length+T.vis*.6,dr.rb-(mx-dr.mx)/G.bw));if(T.auto===false&&dr.yr){const pr=(dr.yr[1]-dr.yr[0])/(T._yrMain.m1-T._yrMain.m0),dy=(my-dr.my)*pr;T.yr=[dr.yr[0]+dy,dr.yr[1]+dy]}}
   else if(dr.mode==='ys'){const k=Math.exp((my-dr.my)/180),c=(dr.yr[0]+dr.yr[1])/2,hs=(dr.yr[1]-dr.yr[0])/2*k;T.yr=[c-hs,c+hs]}
   else if(dr.mode==='xs'){const v=Math.max(10,Math.min(1500,dr.vis*Math.exp((dr.mx-mx)/220)));T.vis=v}
   else if(dr.mode==='rs'){const tot=G.panes.reduce((a,p,i)=>a+(i?p.o.i.h||1.3:T.mw),0),u=tot/G.PH,dy=(my-dr.my)*u,a=dr.i-1,b=dr.i,wa=dr.w0[a]+dy,wb=dr.w0[b]-dy;
    if(wa>=.6&&wb>=.6){const set=(i,v)=>{i===0?T.mw=v:G.panes[i].o.i.h=v};set(a,wa);set(b,wb)}}
   else if(dr.mode==='draw')drawMove(w,T,mx,my,true);
   else if(dr.mode==='handle'&&(dr.moved||Math.hypot(mx-dr.mx,my-dr.my)>=3)){dr.moved=true;ChartDraw.moveHandle(dr.d,dr.h,snap(w,T,mx,Math.min(my,G.mH-1),e.altKey))}
   else if(dr.mode==='move'&&(dr.moved||Math.hypot(mx-dr.mx,my-dr.my)>=3)){dr.moved=true;const dt=G.tAt(G.iX(mx))-G.tAt(G.iX(dr.mx)),log=G.mode==='log',r=G.P(my)/G.P(dr.my),dp=G.P(my)-G.P(dr.my);dr.d.pts.forEach((q,i)=>{q.t=dr.o[i].t+dt;q.p=log?dr.o[i].p*r:dr.o[i].p+dp})}}
  else if(T.draft)drawMove(w,T,mx,my,false);
  else hover(T,mx,my);
  sch(w)});
 const end=e=>{const T=cur(w),dr=R.drag;R.drag=null;if(!T)return;
  if(dr&&dr.mode==='draw'&&T.draft&&R.dc){const[mx,my]=pos(e),dc=R.dc;if(dc.brush){if(T.draft.pts.length>1)finishDraft(w,T);else{T.draft=null;R.dc=null}}
   else if(dc.placed===1&&!dc.moved&&dc.n>=2&&Math.hypot(mx-dc.x,my-dc.y)>8){const pt=snap(w,T,mx,Math.min(my,w._g.mH-1));for(let i=1;i<T.draft.pts.length;i++)T.draft.pts[i]={...pt};dc.placed=2;dc.moved=true;if(dc.placed>=dc.n)finishDraft(w,T)}}
  if(dr&&(dr.mode==='move'||dr.mode==='handle')&&dr.moved){const h=hist(T.sym);h.u.push(dr.pre);if(h.u.length>80)h.u.shift();h.r=[];touch(T.sym);redrawAll();sync(w)}
  if(dr&&(dr.mode==='rs'||dr.mode==='xs'))save(w);
  sch(w)};
 cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',e=>{R.drag=null;sch(w)});
 cv.addEventListener('pointerleave',()=>{const T=cur(w);if(T&&!R.drag){T.m=null;T.hov=null;sch(w)}});
 cv.addEventListener('dblclick',e=>{const T=cur(w),G=w._g;if(!T||!G)return;const[mx,my]=pos(e);
  if(mx>G.pw){T.auto=true;sync(w);return}
  if(my<G.mH){const h=sel(T,mx,my);if(h&&(h.d.k==='text'||['hline','hray','cross'].includes(h.d.k))){T.sel=h.d;doAct(w,h.d.k==='text'?'txt':'price');return}}
  T.vis=120;T.rb=T.D.length+7;T.auto=true;sync(w)});
 cv.addEventListener('contextmenu',e=>{e.preventDefault();const T=cur(w),G=w._g;if(!T||!G)return;const[mx,my]=pos(e);if(mx>G.pw||my>=G.mH)return;
  if(T.tool!=='cur'||T.draft){T.tool='cur';T.draft=null;R.dc=null;sync(w);return}          // klik kanan saat menggambar = selesai
  {const hd=sel(T,mx,my);if(hd){T.sel=hd.d;sync(w);drawMenu(e,hd.d);return}}                 // klik kanan pada gambar = menu gambar
  const price=G.P(my),last=G.D[G.D.length-1].c,rr=$('.ct',w).getBoundingClientRect();
  const al=alertsOf(T.sym)[0];
  pop(w,at(e.clientX,e.clientY),`<button class="ct-r" data-m="al">${Icon('bell')} Pasang alert di ${G.F(price)}</button>${al?'<button class="ct-r" data-m="alx">Hapus alert</button>':''}<button class="ct-r" data-m="cp">Salin harga ${G.F(price)}</button><button class="ct-r" data-m="rs">Reset tampilan</button><button class="ct-r" data-m="clr">Hapus semua gambar</button>`,p=>{
   p.onclick=async ev=>{const b=ev.target.closest('[data-m]');if(!b)return;closePop(w);const m=b.dataset.m;
    if(m==='al'){setAlert(T.sym,+price.toFixed(8),last);sch(w)}else if(m==='alx'){setAlert(T.sym,null,last);sch(w)}
    else if(m==='cp'){try{await navigator.clipboard.writeText(String(+price.toFixed(8)))}catch(x){}}
    else if(m==='rs'){T.vis=120;T.rb=T.D.length+7;T.auto=true;sync(w)}else if(m==='clr')A.clr(w)}})});
 cv.addEventListener('wheel',e=>{e.preventDefault();const T=cur(w),G=w._g;if(!T||!G)return;const[mx]=pos(e);
  if(Math.abs(e.deltaX)>Math.abs(e.deltaY)){T.rb=Math.max(-T.vis*.5,Math.min(T.D.length+T.vis*.6,T.rb+e.deltaX/G.bw));sch(w);return}
  const ia=G.iX(mx),v=Math.max(10,Math.min(1500,T.vis*(e.deltaY<0?.88:1.14))),nb=G.pw/v;T.vis=v;T.rb=Math.max(-v*.5,Math.min(T.D.length+v*.6,ia+(G.pw-nb/2-mx)/nb));sch(w)},{passive:false});
 const sb=$('.ct-sb',w);sb.addEventListener('click',e=>{if(!e.target.matches('select,[data-cc]'))styleAct(w,e)});sb.addEventListener('change',e=>{if(e.target.matches('select,[data-cc]'))styleAct(w,e)});
 $('.ct-lg',w).addEventListener('click',e=>{const b=e.target.closest('[data-ia]'),row=e.target.closest('[data-iid]');if(!b||!row)return;const T=cur(w),i=T.ind.find(x=>x.id===row.dataset.iid);if(!i)return;
  if(b.dataset.ia==='eye')i.on=!i.on;else if(b.dataset.ia==='rm')T.ind=T.ind.filter(x=>x!==i);else{indSettings(w,i.id);return}save(w);sync(w)});
 $('.ct-lg',w).addEventListener('dblclick',e=>{const row=e.target.closest('[data-iid]');if(row&&!e.target.closest('button'))indSettings(w,row.dataset.iid)});
 w.addEventListener('keydown',e=>{const T=cur(w);if(!T||e.target.matches('input,textarea,select'))return;const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
  if((e.key==='Delete'||e.key==='Backspace')&&T.sel){const d=T.sel;mut(T.sym,L=>{L.splice(L.indexOf(d),1)});T.sel=null;sync(w);redrawAll();e.preventDefault()}
  else if(mod&&k==='z'){undo(w,e.shiftKey);e.preventDefault()}
  else if(mod&&k==='y'){undo(w,true);e.preventDefault()}
  else if(mod&&k==='d'&&T.sel){doAct(w,'clone');e.preventDefault()}
  else if(!mod&&!e.altKey&&e.key.startsWith('Arrow')&&T.sel&&!T.draft&&!isLocked(T.sel)&&w._g){nudge(w,T,e);e.preventDefault()}
  else if(!mod&&!e.altKey&&!e.shiftKey&&TOOLKEY[k]&&e.key.length===1){const tk=TOOLKEY[k];T.tool=T.tool===tk?'cur':tk;if(T.tool!=='cur')R.last[ChartDraw.BY[tk].grp]=tk;T.draft=null;R.dc=null;closePop(w);sync(w);e.preventDefault()}
  else if(e.key==='Escape'&&(T.draft||T.tool!=='cur'||T.sel||w._p||w._m)){e.stopImmediatePropagation();if(w._m){closeModal(w);return}T.draft=null;R.dc=null;T.tool='cur';T.sel=null;closePop(w);sync(w)}
  else if(e.altKey&&k==='t'){e.preventDefault();symPicker(w,$('.ct-new',w),'new')}
  else if(e.altKey&&k==='w'){e.preventDefault();closeTab(w,R.act)}
  else if(e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){const i=R.tabs.findIndex(t=>t.id===R.act),n=R.tabs.length;act(w,R.tabs[(i+(e.key==='ArrowRight'?1:n-1))%n].id);e.preventDefault()}},true)}

// ---------- app ----------
const A={
 sym:(w,b)=>symPicker(w,b,'rep'),ind:w=>indPanel(w),new:(w,b)=>symPicker(w,b,'new'),srch:(w,b)=>tabSearch(w,b),lay:(w,b)=>layoutMenu(w,b),
 mag:w=>{const T=cur(w);T.mag=!T.mag;sync(w);save(w)},
 stay:w=>{const R=w._r;R.stay=!R.stay;try{localStorage.setItem('tc.chart.stay',R.stay?'1':'0')}catch(e){}sync(w)},auto:w=>{const T=cur(w);T.auto=true;sync(w)},
 hide:w=>{const T=cur(w);T.hideDr=!T.hideDr;T.sel=null;sync(w);save(w)},
 undo:w=>undo(w),redo:w=>undo(w,true),
 al:async w=>{const T=cur(w);if(!T.D)return;const last=T.D[T.D.length-1].c,ex=alertsOf(T.sym)[0],v=await dlg.prompt('Alert harga '+T.sym,'Harga',String(ex?ex.price:+last.toPrecision(7)));if(v==null)return;const n=parseFloat(String(v).replace(',','.'));
  if(v.trim()===''){setAlert(T.sym,null,last);sch(w);return}if(!(n>0)||n===last){dlg.alert('Alert','Isi harga yang valid dan berbeda dari harga sekarang.');return}setAlert(T.sym,n,last);sch(w)},
 det:w=>{const R=w._r;detach(w,R.act,null,null,R.tabs.length<2)},
 clr:async w=>{const T=cur(w);if(!drs(T.sym).length)return;if(await dlg.confirm('Hapus semua gambar','Semua gambar di '+T.sym+' akan dihapus. Bisa dibatalkan dengan Ctrl+Z.',{ok:'Hapus',danger:true})){mut(T.sym,L=>L.length=0);T.sel=null;sync(w);redrawAll()}},
 shot:w=>{const T=cur(w);draw(w);$('canvas',w).toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`${T.sym}-${T.tf}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1e4)})}};
const svg=d=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
registerApp('chart',{css:'apps/chart/chart.css',icon:"<path d=\"M7 3v18M17 5v15\"/><rect x=\"4.5\" y=\"8\" width=\"5\" height=\"7\" rx=\"1\"/><rect x=\"14.5\" y=\"9\" width=\"5\" height=\"6\" rx=\"1\"/>",t:'Chart',w:1080,h:660,flush:1,
 html:()=>`<div class="ct"><div class="ct-top"><button class="ct-b ct-round" data-a="srch" aria-label="Cari tab" title="Semua tab">${svg('M6 9l6 6 6-6')}</button><div class="ct-tl" role="tablist"></div><button class="ct-b ct-round ct-new" data-a="new" aria-label="Tab baru" title="Tab baru (Alt+T)">${svg('M12 5v14M5 12h14')}</button></div>
<div class="ct-bar"><button class="ct-b ct-sym" data-a="sym" title="Ganti simbol"></button><div class="seg">${Object.keys(TFS).map(t=>`<button data-tf="${t}" aria-pressed="false">${t}</button>`).join('')}</div><select class="ct-b" data-a="type" aria-label="Tipe chart">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><button class="ct-b" data-a="ind">Indikator</button><button class="ct-b" data-a="lay">Layout</button><button class="ct-b" data-a="al" title="Alert harga">${Icon('bell')} Alert</button><i class="ct-sp"></i><button class="ct-b" data-a="undo" title="Urungkan (Ctrl+Z)" aria-label="Urungkan">${Icon('undo')}</button><button class="ct-b" data-a="redo" title="Ulangi (Ctrl+Y)" aria-label="Ulangi">${Icon('redo')}</button><button class="ct-b" data-a="det" title="Pindahkan tab ini ke window baru (atau seret tab keluar dari strip)">Window baru</button><button class="ct-b" data-a="shot">PNG</button></div>
<div class="ct-main"><div class="ct-rail">${ChartDraw.GROUPS.map(g=>`<button class="ct-b" data-g="${g[0]}" aria-pressed="false"></button>`).join('')}<i class="ct-sp"></i><button class="ct-b" data-a="mag" aria-pressed="true" title="Magnet: tempel ke O/H/L/C" aria-label="Magnet">${svg('M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4z')}</button><button class="ct-b" data-a="stay" aria-pressed="true" title="Tetap di alat setelah menggambar (matikan = otomatis kembali ke kursor)" aria-label="Tetap menggambar">${svg('M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z')}</button><button class="ct-b" data-a="hide" aria-pressed="false" title="Sembunyikan semua gambar" aria-label="Sembunyikan gambar">${svg('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z')}</button><button class="ct-b" data-a="clr" title="Hapus semua gambar" aria-label="Hapus semua gambar">${svg('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13')}</button></div>
<div class="ct-cv"><canvas tabindex="0"></canvas><div class="ct-lg"></div><div class="ct-sb" hidden></div><div class="ct-hint" hidden></div><div class="ct-sc"><button class="ct-b" data-sc="lin" aria-pressed="true" title="Skala linear">Lin</button><button class="ct-b" data-sc="log" aria-pressed="false" title="Skala logaritmik">Log</button><button class="ct-b" data-sc="pct" aria-pressed="false" title="Skala persen">%</button><button class="ct-b" data-a="auto" aria-pressed="true" title="Skala otomatis (klik dua kali sumbu harga)">Auto</button></div></div></div></div>`,
 show(w){if(!S.go)return;const R=w._r,s=S.go,t=R.tabs.find(t=>t.sym===s);S.go=null;t?act(w,t.id):addTab(w,s);save(w)},
 init(w){const P=PEND;PEND=null;const R=w._r={tabs:[],act:0,uid:0,main:!P,inst:P?P.id:'chart',last:{},stay:(()=>{try{return localStorage.getItem('tc.chart.stay')!=='0'}catch(e){return true}})()};let sv=null;WINS.add(w);
  if(P){P.tab.id=R.uid=1;R.tabs.push(P.tab)}
  if(R.main)sv=jl(KEY,null);
  if(sv&&Array.isArray(sv.tabs))sv.tabs.forEach(s=>{if(!TFS[s.tf]||!s.sym)return;R.tabs.push(fromSaved(w,s))});
  R.uid=Math.max(R.uid,sv&&sv.uid|0);
  if(!R.tabs.length)R.tabs.push(mk(w,S.sym,S.tf));
  let a=R.tabs.find(t=>t.id===(sv&&sv.act))||R.tabs[0];
  if(R.main&&S.go){const t=R.tabs.find(t=>t.sym===S.go);if(t)a=t;else{const n=mk(w,S.go,S.tf);R.tabs.push(n);a=n}S.go=null}
  const root=$('.ct',w),L=$('.ct-tl',w);
  root.addEventListener('click',e=>{if(e.target.closest('.ct-md,.ct-pop,.ct-sb,.ct-lg'))return;const x=e.target.closest('.ct-tl .ct-x');if(x){closeTab(w,+x.closest('.ct-tab').dataset.id);return}
   const tb=e.target.closest('.ct-tab');if(tb){act(w,+tb.dataset.id);return}
   const g=e.target.closest('[data-g]');if(g){toolMenu(w,g,e);return}
   const b=e.target.closest('button[data-a]');if(b&&A[b.dataset.a]){A[b.dataset.a](w,b);return}
   const tf=e.target.closest('[data-tf]');if(tf){setTf(w,tf.dataset.tf);return}
   const sc=e.target.closest('[data-sc]');if(sc){const T=cur(w);T.scale=T.scale===sc.dataset.sc&&sc.dataset.sc!=='lin'?'lin':sc.dataset.sc;T.auto=true;sync(w);save(w)}});
  root.addEventListener('change',e=>{if(e.target.matches('[data-a=type]')){cur(w).type=e.target.value;save(w);sync(w)}});
  L.addEventListener('auxclick',e=>{const tb=e.target.closest('.ct-tab');if(tb&&e.button===1){e.preventDefault();closeTab(w,+tb.dataset.id)}});
  L.addEventListener('mousedown',e=>{if(e.button===1)e.preventDefault()});
  L.addEventListener('dragstart',e=>{const tb=e.target.closest('.ct-tab');if(!tb)return;DRAG={w,id:+tb.dataset.id,done:false};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','tab')});
  const strips=e=>e.target.closest('.ct-top');
  root.addEventListener('dragover',e=>{if(DRAG&&strips(e))e.preventDefault()});
  root.addEventListener('drop',e=>{if(!DRAG||!strips(e))return;e.preventDefault();const tb=e.target.closest('.ct-tab'),src=DRAG.w;DRAG.done=true;
   let j=tb?R.tabs.findIndex(t=>t.id===+tb.dataset.id):R.tabs.length;if(tb){const r=tb.getBoundingClientRect();if(e.clientX>r.left+r.width/2)j++}
   if(src===w){const i=R.tabs.findIndex(t=>t.id===DRAG.id);if(i<0)return;const[m]=R.tabs.splice(i,1);if(i<j)j--;R.tabs.splice(j,0,m);sync(w);save(w)}
   else{const T=removeTab(src,DRAG.id);if(T)adopt(w,T,j)}});
  L.addEventListener('dragend',e=>{const d=DRAG;DRAG=null;if(!d||d.done||R.tabs.length<2)return;
   const r=$('.ct-top',w).getBoundingClientRect(),wr=w.getBoundingClientRect(),x=e.clientX,y=e.clientY;if(!x&&!y)return;
   if(y>r.bottom+36||y<r.top-36||x<wr.left-10||x>wr.right+10)detach(w,d.id,x,y)});
  L.addEventListener('contextmenu',e=>{const tb=e.target.closest('.ct-tab');if(!tb)return;e.preventDefault();const id=+tb.dataset.id;
   pop(w,tb,`<button class="ct-r" data-c="det">Pindahkan ke window baru</button><button class="ct-r" data-c="dup">Duplikat tab</button><button class="ct-r" data-c="cls">Tutup tab</button><button class="ct-r" data-c="oth">Tutup tab lain</button>`,p=>{
    p.onclick=ev=>{const c=ev.target.closest('[data-c]');if(!c)return;closePop(w);const T=R.tabs.find(t=>t.id===id);if(!T)return;
     if(c.dataset.c==='det')detach(w,id,null,null,R.tabs.length<2);
     else if(c.dataset.c==='dup'){const n=dup(T,w);R.tabs.splice(R.tabs.indexOf(T)+1,0,n);act(w,n.id);save(w)}
     else if(c.dataset.c==='cls')closeTab(w,id);
     else{R.tabs=[T];act(w,id);save(w)}}})});
  root.addEventListener('contextmenu',e=>{const g=e.target.closest('.ct-rail [data-g]');if(g){e.preventDefault();toolMenu(w,g,e)}});
  bind(w);new ResizeObserver(()=>sch(w)).observe($('.ct-cv',w));
  R.pt=setInterval(()=>poll(w),1000);
  act(w,a.id);save(w)},
 notes:['<code>GET /api/candles?symbol&tf&limit=1000&to=</code> : <code>[{t,o,h,l,c,v}]</code>. Bar lama dimuat otomatis saat chart digeser ke kiri (parameter <code>to</code>); candle terakhir digerakkan tick realtime (<code>shared/rt.js</code>: Binance/Finnhub/Tiingo WebSocket, GoAPI + OHLC.dev lewat <code>/api/rt/quote</code>), sedangkan endpoint ini dipakai untuk rekonsiliasi dan cadangan (tiap 4 detik bila tak ada sumber realtime). Bila API Live mati, chart memakai data acak berbenih','Indikator: 21 bawaan dihitung di klien (<code>apps/chart/ind.js</code>, rumus sama dengan <code>lib/indicators.js</code>), tiap indikator punya parameter, warna, dan tinggi panel sendiri; indikator custom (JS/Pine) berjalan di Web Worker (<code>custom.js</code>)','Alat gambar: 20 alat (<code>draw.js</code>), titik disimpan sebagai <code>{t,p}</code> (waktu, harga) per simbol di localStorage <code>tc.chart.drw</code> dan disinkronkan lewat <code>GET/PUT /api/chart/drawings/:symbol</code> (server menang bila lebih baru)','Tab, indikator terpasang, dan skala tersimpan di <code>tc.chart.tabs</code> (ikut sinkron akun). Layout bernama: <code>/api/chart/layouts</code>; template indikator: <code>/api/chart/templates?kind=indicators</code>; tanpa login disimpan di localStorage','Alert: klik kanan chart atau tombol Alert; memakai <code>tc.watchlist.al</code> (satu alert per simbol) sehingga ikut dikirim ke <code>/api/alerts</code> oleh Live. Pemicunya server (cron), bukan klien','Pintasan: Ctrl+Z / Ctrl+Y (urungkan gambar), Ctrl+D (duplikat), Del, Esc, Alt+T / Alt+W / Alt+panah (tab)','Window tambahan memakai id <code>chart#2</code>, <code>chart#3</code>; hanya window utama yang menyimpan tab ke localStorage','Klik baris di Watchlist membuka simbol sebagai tab baru (atau pindah ke tab yang sudah ada) lewat state <code>S.go</code>']});
})();
