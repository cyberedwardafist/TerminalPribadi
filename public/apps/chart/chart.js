// App "chart" (dock). Tab ala browser + mesin chart canvas ala TradingView. Berdiri sendiri.
(()=>{
const TFS={'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1D':86400,'1W':604800},N=700,KEY='tc.chart.tabs';
const TYPES={candle:'Candle',bar:'Bar OHLC',line:'Garis',area:'Area',ha:'Heikin Ashi'};
const TOOLS=[['cur','Kursor','M6 3l12 9-6 1.5L9.5 20z'],['trend','Garis tren','M4 19L20 5'],['hline','Garis horizontal','M3 12h18'],['rect','Kotak','M5 6h14v12H5z'],['fib','Fibonacci','M4 5h16M4 10h16M4 15h16M4 20h16']];
const IND=[['VOL','Volume','#8a93a0'],['MA20','MA 20','#e8a33d'],['EMA50','EMA 50','#5aa9ff'],['BB','Bollinger 20, 2','#b58cff'],['VWAP','VWAP','#ff7ad9']];
const MO=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'],FIB=[0,.236,.382,.5,.618,.786,1];
const rng=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const dec=s=>/^[A-Z]{6}$/.test(s)&&!/XAU|JPY|IDR/.test(s)?5:2;
const niceStep=r=>{const p=Math.pow(10,Math.floor(Math.log10(r))),m=r/p;return(m<1.5?1:m<3?2:m<7?5:10)*p};
const hue=s=>Math.abs([...s].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7))%360;
let INST=0,PEND=null,DRAG=null;// PEND: tab yang sedang dipindah ke window baru; DRAG: tab yang sedang diseret
const ic=(D,k,fn)=>(D._c||(D._c={}))[k]||(D._c[k]=fn());

// ---------- data ----------
function gen(sym,tf){const st=TFS[tf],r=rng([...sym+tf].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7)),base=(WATCH.find(x=>x[0]===sym)||[0,0,100])[2],vol=Math.min(.03,.004*Math.sqrt(st/3600)),end=Math.floor(Date.now()/1000/st)*st;
 let p=base,dr=0,o=[];for(let i=0;i<N;i++){if(i%40===0)dr=(r()-.5)*vol*.5;const op=p,c=op*(1+(r()-.5)*2*vol+dr);o.push({t:end-(N-1-i)*st,o:op,h:Math.max(op,c)*(1+r()*vol*.6),l:Math.min(op,c)*(1-r()*vol*.6),c,v:Math.round((500+r()*1500)*(1+Math.abs(c-op)/op/vol))});p=c}
 const k=base/o[N-1].c;o.forEach(b=>{b.o*=k;b.h*=k;b.l*=k;b.c*=k});return o}
const CACHE=new Map();
async function data(sym,tf){const k=sym+'|'+tf;if(CACHE.has(k))return CACHE.get(k);let d;
 if(apiOn()){try{const j=await(await apiFetch(`/api/candles?symbol=${encodeURIComponent(sym)}&tf=${tf}&limit=${N}`)).json();d=j.map(x=>({t:x.t>1e12?Math.floor(x.t/1000):x.t,o:x.o,h:x.h,l:x.l,c:x.c,v:x.v||0}))}catch(e){}}
 d=d&&d.length?d:gen(sym,tf);CACHE.set(k,d);return d}

// ---------- indikator ----------
const sma=(a,n)=>{let s=0;return a.map((v,i)=>{s+=v;if(i>=n)s-=a[i-n];return i>=n-1?s/n:null})};
const ema=(a,n)=>{const k=2/(n+1);let e=a[0];return a.map((v,i)=>i?e=v*k+e*(1-k):e)};
function bb(D){const c=D.map(k=>k.c),m=sma(c,20);const sd=m.map((v,i)=>{if(v==null)return null;let s=0;for(let j=i-19;j<=i;j++)s+=(c[j]-v)**2;return Math.sqrt(s/20)});return{m,u:m.map((v,i)=>v==null?null:v+2*sd[i]),l:m.map((v,i)=>v==null?null:v-2*sd[i])}}
function vwap(D){let pv=0,vv=0,dy=-1;return D.map(k=>{const d=Math.floor(k.t/86400);if(d!==dy){dy=d;pv=vv=0}const v=k.v||1;pv+=(k.h+k.l+k.c)/3*v;vv+=v;return pv/vv})}
function rsi(D,n=14){const o=[];let ag=0,al=0;D.forEach((k,i)=>{if(!i){o.push(null);return}const d=k.c-D[i-1].c,u=Math.max(d,0),dn=Math.max(-d,0);if(i<=n){ag+=u/n;al+=dn/n}else{ag=(ag*(n-1)+u)/n;al=(al*(n-1)+dn)/n}o.push(i<n?null:al===0?100:100-100/(1+ag/al))});return o}
function macd(D){const c=D.map(k=>k.c),e1=ema(c,12),e2=ema(c,26),m=e1.map((v,i)=>v-e2[i]),s=ema(m,9);return{m,s,h:m.map((v,i)=>v-s[i])}}
function ha(D){let po,pc;return D.map((k,i)=>{const c=(k.o+k.h+k.l+k.c)/4,o=i?(po+pc)/2:(k.o+k.c)/2;po=o;pc=c;return{t:k.t,o,c,h:Math.max(k.h,o,c),l:Math.min(k.l,o,c),v:k.v}})}

// ---------- tab ----------
const mk=(w,sym,tf)=>({id:++w._r.uid,sym,tf:tf||S.tf,type:'candle',ind:['VOL','MA20'],sub:null,log:false,vis:120,rb:N+7,draws:[],tool:'cur',mag:true,sel:null,m:null,D:null});
const cur=w=>w._r.tabs.find(t=>t.id===w._r.act);
function save(w){const R=w._r;if(!R.main)return;try{localStorage.setItem(KEY,JSON.stringify({act:R.act,uid:R.uid,tabs:R.tabs.map(t=>({id:t.id,sym:t.sym,tf:t.tf,type:t.type,ind:t.ind,sub:t.sub,log:t.log,mag:t.mag,draws:t.draws}))}))}catch(e){}}
function addTab(w,sym,tf){const t=mk(w,sym,tf);w._r.tabs.push(t);act(w,t.id)}
function act(w,id){const R=w._r;R.act=id;const T=cur(w);if(!T)return;S.sym=T.sym;S.tf=T.tf;closePop(w);sync(w);load(w,T)}
function load(w,T){if(T.D){sch(w);return}const k=T.sym+T.tf;data(T.sym,T.tf).then(d=>{if(T.sym+T.tf!==k)return;T.D=d;sch(w)})}
function removeTab(w,id){const R=w._r,i=R.tabs.findIndex(t=>t.id===id);if(i<0)return null;const[T]=R.tabs.splice(i,1);
 if(!R.tabs.length){save(w);close(R.inst);return T}
 if(R.act===id)act(w,R.tabs[Math.min(i,R.tabs.length-1)].id);else sync(w);save(w);return T}
const closeTab=(w,id)=>{removeTab(w,id)};
function adopt(w,T,j){const R=w._r;T.id=++R.uid;T.m=null;T.sel=null;R.tabs.splice(j==null?R.tabs.length:j,0,T);act(w,T.id);save(w)}
function dup(T,w){const c=mk(w,T.sym,T.tf);Object.assign(c,{type:T.type,ind:[...T.ind],sub:T.sub,log:T.log,mag:T.mag,draws:JSON.parse(JSON.stringify(T.draws)),D:T.D});return c}
// pindahkan tab ke window baru (copy=true: salin, tab asal tetap)
function detach(w,id,x,y,copy){const R=w._r,T0=R.tabs.find(t=>t.id===id);if(!T0||(!copy&&R.tabs.length<2))return;
 const T=copy?dup(T0,w):removeTab(w,id);while(S.wins['chart#'+(++INST)]);const nid='chart#'+INST;PEND={id:nid,tab:T};const el=open(nid);PEND=null;
 if(el&&x!=null){el.style.left=Math.max(0,Math.min(innerWidth-200,x-120))+'px';el.style.top=Math.max(30,Math.min(innerHeight-160,y-18))+'px'}}
function setTf(w,tf){const T=cur(w);T.tf=tf;T.D=null;T.rb=N+7;S.tf=tf;sync(w);load(w,T);save(w)}
function setSym(w,sym){const T=cur(w);if(T.sym!==sym){T.sym=sym;T.D=null;T.draws=[];T.sel=null;T.rb=N+7}S.sym=sym;sync(w);load(w,T);save(w)}

function sync(w){const R=w._r,T=cur(w),q=s=>$(s,w);
 $('.ct-tl',w).innerHTML=R.tabs.map(t=>`<div class="ct-tab${t.id===R.act?' on':''}" data-id="${t.id}" draggable="true" title="${t.sym} \u00b7 ${t.tf}"><i class="ct-ic" style="background:hsl(${hue(t.sym)} 55% 42%)">${t.sym[0]}</i><span>${t.sym} \u00b7 ${t.tf}</span><button class="ct-x" aria-label="Tutup tab">\u00d7</button></div>`).join('');
 if(!T)return;q('.ct-sym').textContent=T.sym;q('[data-a=type]').value=T.type;
 $$('[data-tf]',w).forEach(b=>b.setAttribute('aria-pressed',b.dataset.tf===T.tf));
 $$('[data-t]',w).forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===T.tool));
 q('[data-a=mag]').setAttribute('aria-pressed',T.mag);q('[data-a=log]').setAttribute('aria-pressed',T.log);
 q('canvas').style.cursor=T.tool==='cur'?'crosshair':'cell';sch(w)}

// ---------- popover ----------
function closePop(w){const p=w._p;if(p){p.remove();document.removeEventListener('pointerdown',w._pa,true);w._p=null}}
function pop(w,anchor,html,bind){closePop(w);const root=$('.ct',w),p=document.createElement('div'),r=anchor.getBoundingClientRect(),b=root.getBoundingClientRect();
 p.className='ct-pop';p.innerHTML=html;p.style.left=Math.max(4,Math.min(r.left-b.left,b.width-248))+'px';p.style.top=(r.bottom-b.top+4)+'px';root.append(p);w._p=p;
 w._pa=e=>{if(!p.contains(e.target)&&!anchor.contains(e.target))closePop(w)};document.addEventListener('pointerdown',w._pa,true);bind(p);return p}
function symPicker(w,anchor,mode){
 const row=(s,n,r)=>`<button class="ct-r" data-s="${s}"><b>${s}</b><span>${n}</span><em>${r||''}</em></button>`;
 pop(w,anchor,`<input class="ct-in" placeholder="Cari simbol\u2026" aria-label="Cari simbol"><div class="ct-ls"></div>`,p=>{
  const inp=$('input',p),ls=$('.ct-ls',p);
  const fill=()=>{const q=inp.value.trim().toUpperCase(),m=WATCH.filter(r=>!q||r[0].includes(q)||r[1].toUpperCase().includes(q));
   ls.innerHTML=m.map(r=>row(r[0],r[1],pc(r[3]))).join('')+(q&&!WATCH.some(r=>r[0]===q)&&/^[A-Z0-9.:_-]{2,16}$/.test(q)?row(q,'Buka simbol ini',''):'')||'<p class="ct-em">Tidak ada hasil</p>'};
  fill();inp.oninput=fill;inp.onkeydown=e=>{if(e.key==='Enter'){const b=$('.ct-r',ls);if(b)b.click()}};
  ls.onclick=e=>{const b=e.target.closest('[data-s]');if(!b)return;closePop(w);mode==='new'?addTab(w,b.dataset.s):setSym(w,b.dataset.s);save(w)};
  inp.focus()})}
function tabSearch(w,anchor){const R=w._r;
 pop(w,anchor,`<div class="ct-ls">${R.tabs.map(t=>`<div class="ct-r${t.id===R.act?' on':''}" data-id="${t.id}"><i class="ct-ic" style="background:hsl(${hue(t.sym)} 55% 42%)">${t.sym[0]}</i><b>${t.sym}</b><span>${t.tf} \u00b7 ${TYPES[t.type]}</span><button class="ct-x" aria-label="Tutup tab">\u00d7</button></div>`).join('')}</div>`,p=>{
  p.onclick=e=>{const r=e.target.closest('[data-id]');if(!r)return;const id=+r.dataset.id;if(e.target.closest('.ct-x')){closeTab(w,id);if(w._r.tabs.length)tabSearch(w,anchor);else closePop(w)}else{closePop(w);act(w,id)}}})}
function indMenu(w,anchor){const T=cur(w);
 pop(w,anchor,`<h5>Overlay</h5>${IND.map(i=>`<label class="ct-r"><input type="checkbox" data-i="${i[0]}"${T.ind.includes(i[0])?' checked':''}><i class="ct-sw" style="background:${i[2]}"></i><span>${i[1]}</span></label>`).join('')}<h5>Panel bawah</h5>${[[null,'Tidak ada'],['RSI','RSI 14'],['MACD','MACD 12, 26, 9']].map(s=>`<label class="ct-r"><input type="radio" name="sub" data-sub="${s[0]||''}"${T.sub===s[0]?' checked':''}><span>${s[1]}</span></label>`).join('')}`,p=>{
  p.onchange=e=>{const t=e.target;if(t.dataset.i!=null){T.ind=t.checked?[...T.ind,t.dataset.i]:T.ind.filter(x=>x!==t.dataset.i)}else T.sub=t.dataset.sub||null;save(w);sch(w)}})}

// ---------- render ----------
const sch=w=>{if(w._q)return;w._q=requestAnimationFrame(()=>{w._q=0;draw(w)})};
function draw(w){
 const T=cur(w),cv=$('canvas',w);if(!T||!cv)return;
 const dp=devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight;if(W<120||H<120)return;
 if(cv.width!==Math.round(W*dp)||cv.height!==Math.round(H*dp)){cv.width=Math.round(W*dp);cv.height=Math.round(H*dp)}
 const x=cv.getContext('2d');x.setTransform(dp,0,0,dp,0,0);x.clearRect(0,0,W,H);
 const cs=getComputedStyle(w),g=n=>cs.getPropertyValue(n).trim(),up=g('--up'),dn=g('--dn'),ln=g('--line'),mu=g('--mute'),ink=g('--ink'),bg=g('--win'),acc=g('--acc');
 x.font='11px ui-monospace,Menlo,Consolas,monospace';x.textBaseline='middle';
 const D=T.D;if(!D){x.fillStyle=mu;x.fillText('Memuat data\u2026',16,24);return}
 const st=TFS[T.tf],dc=dec(T.sym),F=v=>v.toLocaleString('id-ID',{minimumFractionDigits:dc,maximumFractionDigits:dc});
 const PR=74,TB=26,pw=W-PR,subH=T.sub?Math.round((H-TB)*.25):0,mH=H-TB-subH,bw=pw/T.vis,rb=T.rb;
 const X=i=>pw-(rb-i)*bw-bw/2,iX=px=>rb-(pw-bw/2-px)/bw;
 const i0=Math.max(0,Math.floor(iX(0))),i1=Math.min(D.length-1,Math.ceil(iX(pw)));
 const V=T.type==='ha'?ic(D,'ha',()=>ha(D)):D,line=T.type==='line'||T.type==='area',has=k=>T.ind.includes(k),vol=has('VOL');
 const OV=[];
 if(has('MA20'))OV.push(['MA 20','#e8a33d',ic(D,'ma',()=>sma(D.map(k=>k.c),20))]);
 if(has('EMA50'))OV.push(['EMA 50','#5aa9ff',ic(D,'ema',()=>ema(D.map(k=>k.c),50))]);
 if(has('VWAP'))OV.push(['VWAP','#ff7ad9',ic(D,'vwap',()=>vwap(D))]);
 if(has('BB')){const b=ic(D,'bb',()=>bb(D));OV.push(['BB','#b58cff',b.m],[null,'#b58cff',b.u],[null,'#b58cff',b.l])}
 // rentang harga
 let hi=-Infinity,lo=Infinity;
 for(let i=i0;i<=i1;i++){const k=V[i],a=line?k.c:k.h,b=line?k.c:k.l;if(a>hi)hi=a;if(b<lo)lo=b;for(const o of OV){const v=o[2][i];if(v!=null){if(v>hi)hi=v;if(v<lo)lo=v}}}
 if(!(hi>lo)){const c=D[D.length-1].c;hi=c*1.01;lo=c*.99}
 const tr=v=>T.log?Math.log(v):v,hiT=tr(hi),loT=tr(lo),span=hiT-loT,y0=mH*.05,y1=vol?mH*.82:mH*.94;
 const Y=v=>y0+(hiT-tr(v))/span*(y1-y0),P=y=>{const t=hiT-(y-y0)/(y1-y0)*span;return T.log?Math.exp(t):t};
 const pt=P(y0),pb=P(y1);
 // grid + sumbu waktu
 x.save();x.beginPath();x.rect(0,0,pw,H-TB);x.clip();
 x.strokeStyle=ln;x.lineWidth=1;x.globalAlpha=.55;
 const stp=niceStep((pt-pb)/Math.max(2,Math.floor((y1-y0)/56)));
 for(let n=Math.ceil(pb/stp);n*stp<=pt;n++){const y=Math.round(Y(n*stp))+.5;x.beginPath();x.moveTo(0,y);x.lineTo(pw,y);x.stroke()}
 const ks=[1,2,3,5,10,15,20,30,50,100,200,500],kk=ks.find(k=>k>=105/bw)||500,tks=[];
 for(let i=Math.ceil(i0/kk)*kk;i<=i1;i+=kk){const px=Math.round(X(i))+.5;x.beginPath();x.moveTo(px,0);x.lineTo(px,H-TB);x.stroke();tks.push(i)}
 x.globalAlpha=1;
 // volume
 if(vol){let vm=1;for(let i=i0;i<=i1;i++)vm=Math.max(vm,D[i].v);x.globalAlpha=.35;for(let i=i0;i<=i1;i++){const k=D[i],h=k.v/vm*mH*.14;x.fillStyle=k.c>=k.o?up:dn;x.fillRect(Math.round(X(i)-Math.max(1,bw*.7)/2),mH*.985-h,Math.max(1,Math.floor(bw*.7)),h)}x.globalAlpha=1}
 // seri harga
 const cw=Math.max(1,Math.floor(bw*.7)),BL='#4c9aff';
 if(line){x.beginPath();for(let i=i0;i<=i1;i++){const px=X(i),py=Y(V[i].c);i===i0?x.moveTo(px,py):x.lineTo(px,py)}
  if(T.type==='area'){const s=x.createLinearGradient(0,y0,0,y1);s.addColorStop(0,'rgba(76,154,255,.35)');s.addColorStop(1,'rgba(76,154,255,0)');x.save();x.lineTo(X(i1),y1);x.lineTo(X(i0),y1);x.closePath();x.fillStyle=s;x.fill();x.restore();x.beginPath();for(let i=i0;i<=i1;i++){const px=X(i),py=Y(V[i].c);i===i0?x.moveTo(px,py):x.lineTo(px,py)}}
  x.strokeStyle=BL;x.lineWidth=1.8;x.lineJoin='round';x.stroke();x.lineWidth=1}
 else for(let i=i0;i<=i1;i++){const k=V[i],cx=Math.round(X(i)),u=k.c>=k.o,yh=Math.round(Y(k.h)),yl=Math.round(Y(k.l)),yo=Math.round(Y(k.o)),yc=Math.round(Y(k.c));x.fillStyle=u?up:dn;
  if(T.type==='bar'){const tk=Math.max(2,cw>>1);x.fillRect(cx,yh,1,Math.max(1,yl-yh));x.fillRect(cx-tk,yo,tk,1);x.fillRect(cx+1,yc,tk,1)}
  else{x.fillRect(cx,yh,1,Math.max(1,yl-yh));x.fillRect(cx-(cw>>1),Math.min(yo,yc),cw,Math.max(1,Math.abs(yo-yc)))}}
 // overlay
 for(const o of OV){x.beginPath();let on=false;for(let i=i0;i<=i1;i++){const v=o[2][i];if(v==null){on=false;continue}const px=X(i),py=Y(v);on?x.lineTo(px,py):x.moveTo(px,py);on=true}x.strokeStyle=o[1];x.lineWidth=o[0]==='BB'||o[0]===null?1:1.5;x.stroke()}x.lineWidth=1;
 // gambar (drawing)
 const D0=D[0].t,pxo=a=>({x:X((a.t-D0)/st),y:Y(a.p)});
 T.draws.forEach(d=>{const s=d===T.sel,a=pxo(d.a);x.strokeStyle=x.fillStyle=acc;x.lineWidth=s?2:1.3;
  if(d.k==='hline'){x.beginPath();x.moveTo(0,Math.round(a.y)+.5);x.lineTo(pw,Math.round(a.y)+.5);x.stroke()}
  else{const b=pxo(d.b);
   if(d.k==='trend'){x.beginPath();x.moveTo(a.x,a.y);x.lineTo(b.x,b.y);x.stroke()}
   else if(d.k==='rect'){x.globalAlpha=.12;x.fillRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));x.globalAlpha=1;x.strokeRect(Math.min(a.x,b.x)+.5,Math.min(a.y,b.y)+.5,Math.abs(b.x-a.x),Math.abs(b.y-a.y))}
   else{const l=Math.min(a.x,b.x);FIB.forEach(r=>{const p=d.b.p+(d.a.p-d.b.p)*r,py=Math.round(Y(p))+.5;x.globalAlpha=.8;x.beginPath();x.moveTo(l,py);x.lineTo(pw,py);x.stroke();x.globalAlpha=1;x.fillText(r+'  '+F(p),l+4,py-7)})}
   if(s)[a,b].forEach(q=>{x.beginPath();x.arc(q.x,q.y,4,0,7);x.fillStyle=bg;x.fill();x.stroke()})}
  if(s&&d.k==='hline'){x.beginPath();x.arc(40,a.y,4,0,7);x.fillStyle=bg;x.fill();x.stroke()}});x.lineWidth=1;
 // harga terakhir
 const L=D[D.length-1],ly=Y(L.c),lu=L.c>=L.o;
 if(ly>0&&ly<mH){x.setLineDash([4,3]);x.strokeStyle=lu?up:dn;x.beginPath();x.moveTo(0,Math.round(ly)+.5);x.lineTo(pw,Math.round(ly)+.5);x.stroke();x.setLineDash([])}
 x.restore();
 // panel bawah
 const SY0=mH+1;T._sv=null;
 if(T.sub){const sH=subH-6,top=SY0+3;x.strokeStyle=ln;x.beginPath();x.moveTo(0,SY0+.5);x.lineTo(W,SY0+.5);x.stroke();
  x.save();x.beginPath();x.rect(0,SY0,pw,subH);x.clip();let SYf,ticks;
  if(T.sub==='RSI'){const r=ic(D,'rsi',()=>rsi(D));SYf=v=>top+(100-v)/100*sH;ticks=[30,50,70];
   x.setLineDash([3,3]);[30,70].forEach(v=>{x.beginPath();x.moveTo(0,Math.round(SYf(v))+.5);x.lineTo(pw,Math.round(SYf(v))+.5);x.stroke()});x.setLineDash([]);
   x.beginPath();let on=false;for(let i=i0;i<=i1;i++){const v=r[i];if(v==null){on=false;continue}on?x.lineTo(X(i),SYf(v)):x.moveTo(X(i),SYf(v));on=true}x.strokeStyle='#b58cff';x.stroke();T._sv=i=>r[i]!=null?'RSI 14  '+r[i].toFixed(2):'RSI 14'}
  else{const m=ic(D,'macd',()=>macd(D));let a=0,b=0;for(let i=i0;i<=i1;i++){a=Math.max(a,m.m[i],m.s[i],m.h[i]);b=Math.min(b,m.m[i],m.s[i],m.h[i])}const sp=(a-b)||1;SYf=v=>top+(a-v)/sp*sH;ticks=[b,0,a];
   x.beginPath();x.moveTo(0,Math.round(SYf(0))+.5);x.lineTo(pw,Math.round(SYf(0))+.5);x.stroke();
   for(let i=i0;i<=i1;i++){const h=m.h[i];x.globalAlpha=.6;x.fillStyle=h>=0?up:dn;x.fillRect(Math.round(X(i)-cw/2),Math.min(SYf(0),SYf(h)),cw,Math.max(1,Math.abs(SYf(h)-SYf(0))));x.globalAlpha=1}
   [[m.m,'#5aa9ff'],[m.s,'#e8a33d']].forEach(([s,c])=>{x.beginPath();for(let i=i0;i<=i1;i++)i===i0?x.moveTo(X(i),SYf(s[i])):x.lineTo(X(i),SYf(s[i]));x.strokeStyle=c;x.stroke()});T._sv=i=>`MACD  ${m.m[i].toFixed(2)}  Sinyal ${m.s[i].toFixed(2)}  Hist ${m.h[i].toFixed(2)}`}
  x.restore();T._yt=[ticks,SYf]}
 // sumbu kanan + waktu
 x.fillStyle=bg;x.fillRect(pw,0,PR,H);x.fillRect(0,H-TB,W,TB);x.strokeStyle=ln;x.beginPath();x.moveTo(pw+.5,0);x.lineTo(pw+.5,H);x.moveTo(0,H-TB+.5);x.lineTo(W,H-TB+.5);x.stroke();
 x.fillStyle=mu;for(let n=Math.ceil(pb/stp);n*stp<=pt;n++)x.fillText(F(n*stp),pw+8,Y(n*stp));
 if(T.sub&&T._yt)T._yt[0].forEach(v=>x.fillText(v.toFixed(T.sub==='RSI'?0:2),pw+8,T._yt[1](v)));
 const tl=(t,full)=>{const a=new Date(t*1000),p=n=>String(n).padStart(2,'0'),dm=a.getDate()+' '+MO[a.getMonth()],yy=String(a.getFullYear()).slice(2);
  if(full)return st<86400?`${dm} '${yy} ${p(a.getHours())}:${p(a.getMinutes())}`:`${dm} '${yy}`;
  if(st<86400)return a.getHours()===0&&a.getMinutes()===0?dm:p(a.getHours())+':'+p(a.getMinutes());
  return st===86400?(a.getDate()===1?MO[a.getMonth()]+" '"+yy:dm):MO[a.getMonth()]+" '"+yy};
 x.textAlign='center';x.fillStyle=mu;tks.forEach(i=>{const px=X(i);if(px>24&&px<pw-24&&D[i])x.fillText(tl(D[i].t),px,H-TB/2)});x.textAlign='left';
 if(ly>0&&ly<mH){x.fillStyle=lu?up:dn;x.fillRect(pw,ly-9,PR,18);x.fillStyle='#fff';x.fillText(F(L.c),pw+8,ly)}
 // crosshair
 const m=T.m;let hv=D.length-1;
 if(m&&m.x>=0&&m.x<=pw&&m.y>=0&&m.y<H-TB){hv=Math.max(0,Math.min(D.length-1,Math.round(iX(m.x))));const cx=Math.round(X(hv))+.5;
  x.strokeStyle=mu;x.setLineDash([3,3]);x.beginPath();x.moveTo(cx,0);x.lineTo(cx,H-TB);x.moveTo(0,Math.round(m.y)+.5);x.lineTo(pw,Math.round(m.y)+.5);x.stroke();x.setLineDash([]);
  const inMain=m.y<mH,val=inMain?P(m.y):(T.sub==='RSI'?100-(m.y-SY0-3)/(subH-6)*100:null);
  if(val!=null){x.fillStyle=ink;x.fillRect(pw,m.y-9,PR,18);x.fillStyle=bg;x.fillText(inMain?F(val):val.toFixed(2),pw+8,m.y)}
  const lb=tl(D[hv].t,true),tw=x.measureText(lb).width+16,tx=Math.max(0,Math.min(pw-tw,cx-tw/2));x.fillStyle=ink;x.fillRect(tx,H-TB+1,tw,TB-2);x.fillStyle=bg;x.textAlign='center';x.fillText(lb,tx+tw/2,H-TB/2);x.textAlign='left'}
 // legenda
 const k=V[hv],pk=V[hv-1]||k,ch=k.c-pk.c,u=k.c>=k.o;let ly2=14;
 x.fillStyle=ink;x.font='bold 12px ui-monospace,Menlo,Consolas,monospace';const hd=`${T.sym} \u00b7 ${T.tf} \u00b7 ${TYPES[T.type]}`;x.fillText(hd,10,ly2);const hw=x.measureText(hd).width;x.font='11px ui-monospace,Menlo,Consolas,monospace';
 x.fillStyle=u?up:dn;x.fillText(`O ${F(k.o)}  H ${F(k.h)}  L ${F(k.l)}  C ${F(k.c)}  ${ch>=0?'+':'\u2212'}${F(Math.abs(ch))} (${pc(ch/pk.c*100)})`,hw+22,ly2);
 if(vol){ly2+=16;x.fillStyle=mu;x.fillText('Vol  '+D[hv].v.toLocaleString('id-ID'),10,ly2)}
 OV.forEach(o=>{if(!o[0])return;ly2+=16;const v=o[2][hv];x.fillStyle=o[1];x.fillText(o[0]+(v!=null?'  '+F(v):''),10,ly2)});
 if(T._sv){x.fillStyle=mu;x.fillText(T._sv(hv),10,SY0+14)}
 w._g={X,iX,Y,P,pw,mH,bw,st,D0,D,V}}

// ---------- interaksi ----------
function snap(w,mx,my,T){const G=w._g,bi=Math.max(0,Math.round(G.iX(mx))),k=G.V[Math.min(bi,G.V.length-1)];let p=G.P(my);
 if(T.mag&&bi<G.V.length){let best=1e9;[k.o,k.h,k.l,k.c].forEach(v=>{const dd=Math.abs(G.Y(v)-my);if(dd<best&&dd<16){best=dd;p=v}})}
 return{t:G.D0+bi*G.st,p}}
function segDist(px,py,a,b){const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((px-a.x)*dx+(py-a.y)*dy)/l)):0;return Math.hypot(px-a.x-t*dx,py-a.y-t*dy)}
function hit(w,T,mx,my){const G=w._g,po=a=>({x:G.X((a.t-G.D0)/G.st),y:G.Y(a.p)});
 for(let i=T.draws.length-1;i>=0;i--){const d=T.draws[i],a=po(d.a);
  if(d.k==='hline'){if(Math.abs(a.y-my)<6)return d}else{const b=po(d.b);
   if(d.k==='trend'){if(segDist(mx,my,a,b)<6)return d}
   else if(d.k==='rect'){const l=Math.min(a.x,b.x),r=Math.max(a.x,b.x),t=Math.min(a.y,b.y),bt=Math.max(a.y,b.y);if(mx>=l-4&&mx<=r+4&&my>=t-4&&my<=bt+4)return d}
   else{const l=Math.min(a.x,b.x);if(mx>=l&&FIB.some(r=>Math.abs(G.Y(d.b.p+(d.a.p-d.b.p)*r)-my)<5))return d}}}
 return null}
function bind(w){const cv=$('canvas',w),R=w._r;
 const pos=e=>{const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]};
 cv.addEventListener('pointerdown',e=>{const T=cur(w);if(!T||!T.D||!w._g||e.button!==0)return;const[mx,my]=pos(e),G=w._g;if(mx>G.pw)return;cv.setPointerCapture(e.pointerId);closePop(w);
  if(T.tool!=='cur'){if(my>G.mH)return;const a=snap(w,mx,my,T);
   if(T.tool==='hline'){const d={k:'hline',a};T.draws.push(d);T.sel=d;T.tool='cur';save(w);sync(w);return}
   const d={k:T.tool,a,b:{...a}};T.draws.push(d);R.drag={mode:'draw',d,mx,my};return}
  const h=hit(w,T,mx,my);T.sel=h;
  if(h)R.drag={mode:'move',d:h,mx,my,o:JSON.parse(JSON.stringify(h))};else R.drag={mode:'pan',mx,rb:T.rb};sch(w)});
 cv.addEventListener('pointermove',e=>{const T=cur(w);if(!T)return;const[mx,my]=pos(e),G=w._g,dr=R.drag;T.m={x:mx,y:my};
  if(dr&&G){if(dr.mode==='pan')T.rb=Math.max(8,Math.min(N+T.vis*.6,dr.rb-(mx-dr.mx)/G.bw));
   else if(dr.mode==='draw')dr.d.b=snap(w,mx,my,T);
   else{const dt=(mx-dr.mx)/G.bw*G.st,dy=my-dr.my;['a','b'].forEach(k=>{if(dr.o[k])dr.d[k]={t:dr.o[k].t+dt,p:G.P(G.Y(dr.o[k].p)+dy)}})}}
  sch(w)});
 const end=()=>{const T=cur(w),dr=R.drag;R.drag=null;if(!T||!dr)return;
  if(dr.mode==='draw'){const G=w._g,a=dr.d.a,b=dr.d.b,ax=G.X((a.t-G.D0)/G.st),bx=G.X((b.t-G.D0)/G.st);if(Math.hypot(bx-ax,G.Y(b.p)-G.Y(a.p))<4)T.draws=T.draws.filter(d=>d!==dr.d);else T.sel=dr.d;T.tool='cur';sync(w)}
  if(dr.mode!=='pan')save(w);sch(w)};
 cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
 cv.addEventListener('pointerleave',()=>{const T=cur(w);if(T){T.m=null;sch(w)}});
 cv.addEventListener('dblclick',()=>{const T=cur(w);if(T){T.vis=120;T.rb=N+7;sch(w)}});
 cv.addEventListener('wheel',e=>{e.preventDefault();const T=cur(w),G=w._g;if(!T||!G)return;const[mx]=pos(e);
  if(Math.abs(e.deltaX)>Math.abs(e.deltaY)){T.rb=Math.max(8,Math.min(N+T.vis*.6,T.rb+e.deltaX/G.bw));sch(w);return}
  const ia=G.iX(mx),v=Math.max(15,Math.min(N,T.vis*(e.deltaY<0?.88:1.14))),nb=G.pw/v;T.vis=v;T.rb=Math.max(8,Math.min(N+v*.6,ia+(G.pw-nb/2-mx)/nb));sch(w)},{passive:false});
 w.addEventListener('keydown',e=>{const T=cur(w);if(!T||e.target.matches('input'))return;
  if((e.key==='Delete'||e.key==='Backspace')&&T.sel){T.draws=T.draws.filter(d=>d!==T.sel);T.sel=null;save(w);sch(w);e.preventDefault()}
  else if(e.key==='Escape'&&(T.tool!=='cur'||T.sel||w._p)){e.stopImmediatePropagation();T.tool='cur';T.sel=null;closePop(w);sync(w)}
  else if(e.altKey&&e.key.toLowerCase()==='t'){e.preventDefault();symPicker(w,$('.ct-new',w),'new')}
  else if(e.altKey&&e.key.toLowerCase()==='w'){e.preventDefault();closeTab(w,R.act)}
  else if(e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){const i=R.tabs.findIndex(t=>t.id===R.act),n=R.tabs.length;act(w,R.tabs[(i+(e.key==='ArrowRight'?1:n-1))%n].id);e.preventDefault()}},true)}

// ---------- app ----------
const A={
 sym:(w,b)=>symPicker(w,b,'rep'),ind:(w,b)=>indMenu(w,b),new:(w,b)=>symPicker(w,b,'new'),srch:(w,b)=>tabSearch(w,b),
 mag:w=>{const T=cur(w);T.mag=!T.mag;sync(w);save(w)},log:w=>{const T=cur(w);T.log=!T.log;sync(w);save(w)},
 det:w=>{const R=w._r;detach(w,R.act,null,null,R.tabs.length<2)},
 clr:w=>{const T=cur(w);T.draws=[];T.sel=null;save(w);sch(w)},
 shot:w=>{const T=cur(w);draw(w);$('canvas',w).toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`${T.sym}-${T.tf}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1e4)})}};
const svg=d=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
registerApp('chart',{css:'apps/chart/chart.css',icon:"<path d=\"M7 3v18M17 5v15\"/><rect x=\"4.5\" y=\"8\" width=\"5\" height=\"7\" rx=\"1\"/><rect x=\"14.5\" y=\"9\" width=\"5\" height=\"6\" rx=\"1\"/>",t:'Chart',w:980,h:600,flush:1,
 html:()=>`<div class="ct"><div class="ct-top"><button class="ct-b ct-round" data-a="srch" aria-label="Cari tab" title="Semua tab">${svg('M6 9l6 6 6-6')}</button><div class="ct-tl" role="tablist"></div><button class="ct-b ct-round ct-new" data-a="new" aria-label="Tab baru" title="Tab baru (Alt+T)">${svg('M12 5v14M5 12h14')}</button></div>
<div class="ct-bar"><button class="ct-b ct-sym" data-a="sym" title="Ganti simbol"></button><div class="seg">${Object.keys(TFS).map(t=>`<button data-tf="${t}" aria-pressed="false">${t}</button>`).join('')}</div><select class="ct-b" data-a="type" aria-label="Tipe chart">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><button class="ct-b" data-a="ind">Indikator</button><button class="ct-b" data-a="mag" aria-pressed="true" title="Tempel ke harga O/H/L/C">Magnet</button><button class="ct-b" data-a="log" aria-pressed="false">Log</button><i class="ct-sp"></i><button class="ct-b" data-a="det" title="Pindahkan tab ini ke window baru (atau seret tab keluar dari strip)">Window baru</button><button class="ct-b" data-a="clr">Hapus gambar</button><button class="ct-b" data-a="shot">Simpan PNG</button></div>
<div class="ct-main"><div class="ct-rail">${TOOLS.map(t=>`<button class="ct-b" data-t="${t[0]}" title="${t[1]}" aria-label="${t[1]}" aria-pressed="false">${svg(t[2])}</button>`).join('')}</div><div class="ct-cv"><canvas></canvas></div></div></div>`,
 show(w){if(!S.go)return;const R=w._r,s=S.go,t=R.tabs.find(t=>t.sym===s);S.go=null;t?act(w,t.id):addTab(w,s);save(w)},
 init(w){const P=PEND;PEND=null;const R=w._r={tabs:[],act:0,uid:0,main:!P,inst:P?P.id:'chart'};let sv=null;
  if(P){P.tab.id=R.uid=1;R.tabs.push(P.tab)}
  if(R.main)try{sv=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
  if(sv&&Array.isArray(sv.tabs))sv.tabs.forEach(s=>{if(!TFS[s.tf]||!s.sym)return;R.uid=Math.max(R.uid,s.id|0);R.tabs.push({...mk(w,s.sym,s.tf),...s,vis:120,rb:N+7,tool:'cur',sel:null,m:null,D:null,draws:s.draws||[]})});
  R.uid=Math.max(R.uid,sv&&sv.uid|0);
  if(!R.tabs.length)R.tabs.push(mk(w,S.sym,S.tf));
  let a=R.tabs.find(t=>t.id===(sv&&sv.act))||R.tabs[0];
  if(R.main&&S.go){const t=R.tabs.find(t=>t.sym===S.go);if(t)a=t;else{const n=mk(w,S.go,S.tf);R.tabs.push(n);a=n}S.go=null}
  const root=$('.ct',w),L=$('.ct-tl',w);
  root.addEventListener('click',e=>{const x=e.target.closest('.ct-tl .ct-x');if(x){closeTab(w,+x.closest('.ct-tab').dataset.id);return}
   const tb=e.target.closest('.ct-tab');if(tb){act(w,+tb.dataset.id);return}
   const b=e.target.closest('button[data-a]');if(b&&A[b.dataset.a]){A[b.dataset.a](w,b);return}
   const tf=e.target.closest('[data-tf]');if(tf){setTf(w,tf.dataset.tf);return}
   const t=e.target.closest('[data-t]');if(t){const T=cur(w);T.tool=T.tool===t.dataset.t?'cur':t.dataset.t;sync(w)}});
  root.addEventListener('change',e=>{if(e.target.matches('[data-a=type]')){cur(w).type=e.target.value;save(w);sch(w)}});
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
  bind(w);new ResizeObserver(()=>sch(w)).observe($('.ct-cv',w));
  act(w,a.id);save(w)},
 notes:['<code>GET /api/candles?symbol&tf&limit=700</code> : <code>[{t,o,h,l,c,v}]</code>, <code>t</code> detik epoch (milidetik juga diterima). Bila API Live mati atau gagal, chart memakai data acak berbenih di klien','WebSocket <code>candles:{symbol}:{tf}</code> : update candle berjalan (TODO: belum ada tick live)','Tab, indikator, dan gambar tersimpan di localStorage <code>tc.chart.tabs</code> (TODO: sinkron ke akun lewat <code>PUT /api/chart/layout</code>)','Indikator dihitung di klien (MA, EMA, Bollinger, VWAP, RSI, MACD). Menambah indikator: tulis fungsi hitung lalu tambah baris di <code>IND</code>','Window tambahan memakai id <code>chart#2</code>, <code>chart#3</code> (core: <code>base(id)</code> mengarah ke app <code>chart</code>); hanya window utama yang menyimpan tab ke localStorage','Klik baris di Watchlist membuka simbol sebagai tab baru (atau pindah ke tab yang sudah ada) lewat state <code>S.go</code>']});
})();
