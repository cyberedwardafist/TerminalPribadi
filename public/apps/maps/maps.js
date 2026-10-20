// App "maps" (dock). Sidebar + peta pasar (treemap) per pasar. Berdiri sendiri: ubah file ini tidak memengaruhi app lain.
(()=>{
const KEY='tc.maps';
// Data dummy: 'Grup:KODE=bobot,...|Grup:...'. Bobot = kapitalisasi kasar (IHSG Rp T, kripto/saham luar USD B, lainnya bobot relatif)
const DATA={
 ihsg:'Keuangan:BBCA=1100,BBRI=700,BMRI=600,BBNI=240,BRIS=130,ARTO=70,BNGA=60,BBTN=20|Energi:BYAN=300,ADRO=80,PGAS=40,PTBA=40,AKRA=35,ITMG=30,MEDC=30,BUMI=30|Barang Baku:AMMN=900,TPIA=600,BRPT=150,MDKA=70,NCKL=70,ANTM=60,MBMA=60,INCO=55|Konsumer Primer:ICBP=130,AMRT=100,UNVR=90,HMSP=90,CPIN=80,INDF=70,MYOR=50,GGRM=40|Konsumer Siklikal:MAPI=30,SCMA=15,ACES=20,ERAA=12,MNCN=10|Infrastruktur & Telko:TLKM=330,ISAT=60,MTEL=50,TBIG=45,TOWR=40,JSMR=40,EXCL=35|Teknologi:DCII=300,MLPT=80,GOTO=70,EMTK=50,BUKA=20|Kesehatan:KLBF=80,MIKA=40,SIDO=35,HEAL=20|Industri:ASII=250,UNTR=130|Properti:BSDE=30,CTRA=25,PWON=25,SMRA=15',
 kripto:'Layer 1:BTC=1300,ETH=380,BNB=90,SOL=80,TRX=25,ADA=22,AVAX=15,TON=15,SUI=12,DOT=10,NEAR=7|Pembayaran:XRP=130,BCH=9,LTC=8,XLM=10|Stablecoin:USDT=120,USDC=35,DAI=5|DeFi & Infra:LINK=10,UNI=6,AAVE=4,ARB=3,OP=3,ATOM=3,MKR=2,INJ=2|Meme:DOGE=25,SHIB=10,PEPE=6,WIF=2,BONK=2',
 komoditas:'Logam:XAU=100,XAG=30,COPPER=25,ALU=15,XPT=10|Energi:BRENT=65,WTI=60,NGAS=25,COAL=20|Pertanian:CPO=25,SOY=20,CORN=20,WHEAT=15,COFFEE=12,SUGAR=10,COCOA=10,RUBBER=6',
 luar:'Teknologi Elektronik:AAPL=3500,NVDA=3400,AVGO=800,TSM=800,ASML=400,AMD=250,INTC=100|Teknologi Layanan:MSFT=3100,GOOGL=2000,META=1400,ORCL=450,NFLX=400,CRM=280,ADBE=200|Ritel & Konsumer:AMZN=1900,WMT=700,COST=400,HD=380,PG=380,KO=270,PEP=220,MCD=210,NKE=110|Keuangan:BRK.B=900,JPM=600,V=550,MA=450,BAC=300,WFC=220,GS=150|Kesehatan:LLY=800,UNH=500,JNJ=380,ABBV=300,MRK=260,PFE=150|Otomotif:TSLA=800,TM=250,F=45|Energi:XOM=450,CVX=280',
 lain:'Forex Mayor:EURUSD=100,USDJPY=80,GBPUSD=50,USDIDR=40,AUDUSD=30,USDCHF=25,USDCAD=25,EURJPY=20,NZDUSD=15,USDSGD=15|Indeks Global:SPX=100,NDX=80,DJI=60,DAX=40,SSEC=40,N225=45,FTSE=35,HSI=30,IHSG=25,KS11=20,STI=15'};
const MKT=[['ihsg','IHSG',1.8,3],['kripto','Kripto',4.5,8],['komoditas','Komoditas',1.6,3],['luar','Saham Luar',1.7,3],['lain','Lainnya',.7,1.2]];
const RG={'1D':1,'1W':2.3,'1M':4.6};
const STABLE=['USDT','USDC','DAI'];
const PAGES=[['map','Peta Pasar'],['sum','Ringkasan Pasar'],['mov','Top Movers'],['sec','Performa Sektor']];
const SUM=[['IHSG',7300],['LQ45',920],['S&P 500',5800],['NASDAQ',18400],['Dow Jones',42500],['Nikkei 225',38500],['Hang Seng',20500],['BTCUSDT',67420.5],['ETHUSDT',3180.2],['XAUUSD',2386.4],['WTI',78.4],['USDIDR',15700],['EURUSD',1.0842]];
let M={page:'map',mk:'ihsg',rg:'1D'};try{M={...M,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(e){}
if(!PAGES.some(p=>p[0]===M.page))M.page='map';if(!MKT.some(m=>m[0]===M.mk))M.mk='ihsg';if(!RG[M.rg])M.rg='1D';
const store=()=>{try{localStorage.setItem(KEY,JSON.stringify(M))}catch(e){}};
const rng=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const hs=s=>[...s].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7);
const mc=()=>MKT.find(m=>m[0]===M.mk);
const fcap=v=>v>=1000?(v/1000).toFixed(2).replace('.',',')+' T':v.toLocaleString('id-ID')+' '+(M.mk==='ihsg'?'T':'B');

// ---------- data ----------
const CACHE={};
function dummy(mk,rg){const day=Math.floor(Date.now()/864e5),vol=MKT.find(m=>m[0]===mk)[2]*RG[rg];
 return DATA[mk].split('|').map(g=>{const[n,l]=g.split(':'),gd=(rng(hs(n+day+rg))()-.5)*vol*.7;
  return{n,it:l.split(',').map(x=>{const[s,v]=x.split('='),r=rng(hs(s+day+rg)),st=STABLE.includes(s);return{s,v:+v,c:+(st?(r()-.5)*.06:gd+(r()+r()+r()-1.5)*vol*1.1).toFixed(2)}})}})}
async function load(){const k=M.mk+'|'+M.rg;if(CACHE[k])return CACHE[k];let g;
 if(apiOn()){try{const r=await apiFetch(`/api/heatmap?market=${M.mk}&range=${M.rg.toLowerCase()}`);if(!r.ok)throw 0;const j=await r.json(),m={};j.forEach(x=>(m[x.group]=m[x.group]||[]).push({s:x.sym,v:x.cap,c:x.changePct}));g=Object.entries(m).map(([n,it])=>({n,it}))}catch(e){g=null}
  return g&&g.length?(CACHE[k]=g):null}   // Live: tidak pernah jatuh ke data dummy; gagal = null (tidak di-cache)
 return CACHE[k]=dummy(M.mk,M.rg)}
const loadErr=w=>{const e=$('.mp-map,.mp-two,.mp-sec',w);if(e)e.innerHTML='<p class="mp-ft">Data pasar live tidak bisa dimuat. Coba lagi beberapa saat.</p>'};

// ---------- treemap (squarified) ----------
function squarify(items,x,y,w,h){const tot=items.reduce((a,i)=>a+i.v,0),out=[];if(!tot||w<=0||h<=0)return out;
 let rest=items.map(i=>({i,a:i.v*w*h/tot}));
 while(rest.length){const sh=Math.min(w,h),worst=r=>{const mx=Math.max(...r.map(z=>z.a)),mn=Math.min(...r.map(z=>z.a)),s=r.reduce((a,z)=>a+z.a,0);return Math.max(sh*sh*mx/(s*s),s*s/(sh*sh*mn))};
  let k=1;while(k<rest.length&&worst(rest.slice(0,k+1))<=worst(rest.slice(0,k)))k++;
  const row=rest.slice(0,k),rs=row.reduce((a,z)=>a+z.a,0);
  if(w>=h){const rw=rs/h;let cy=y;row.forEach(z=>{const rh=z.a/rw;out.push({i:z.i,x,y:cy,w:rw,h:rh});cy+=rh});x+=rw;w-=rw}
  else{const rh=rs/w;let cx=x;row.forEach(z=>{const rw=z.a/rh;out.push({i:z.i,x:cx,y,w:rw,h:rh});cx+=rw});y+=rh;h-=rh}
  rest=rest.slice(k)}
 return out}
function layout(groups,W,H){const gs=groups.map(g=>({...g,v:g.it.reduce((a,i)=>a+i.v,0)})).sort((a,b)=>b.v-a.v),res=[];
 squarify(gs,0,0,W,H).forEach(r=>{const hd=r.w>70&&r.h>46?16:0;
  const tiles=squarify([...r.i.it].sort((a,b)=>b.v-a.v),r.x,r.y+hd,r.w,r.h-hd);res.push({g:r.i.n,x:r.x,y:r.y,w:r.w,h:r.h,hd,tiles})});
 return res}
const col=(c,cap)=>`color-mix(in srgb,var(--${c>=0?'up':'dn'}) ${Math.round(24+Math.min(1,Math.abs(c)/cap)*76)}%,#2b3038)`;
function paint(w,groups){const box=$('.mp-map',w),W=box.clientWidth,H=box.clientHeight;if(W<80||H<60)return;const cap=mc()[3]*RG[M.rg]**.6;
 box.innerHTML=layout(groups,W,H).map(g=>`<div class="mp-g" style="left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px">${g.hd?`<span class="mp-gl">${g.g}</span>`:''}${g.tiles.map(t=>{const k=t.i,fs=Math.max(8,Math.min(24,t.w/(k.s.length*.72),t.h/2.4)),txt=t.w>26&&t.h>17;
  return`<button class="mp-t" data-s="${k.s}" data-g="${g.g}" data-v="${k.v}" data-c="${k.c}" style="left:${t.x-g.x}px;top:${t.y-g.y}px;width:${t.w}px;height:${t.h}px;background:${col(k.c,cap)}">${txt?`<b style="font-size:${fs}px">${k.s}</b>${t.h>fs*2.3&&t.w>fs*2.6?`<i style="font-size:${Math.max(8,fs*.72)}px">${pc(k.c)}</i>`:''}`:''}</button>`}).join('')}</div>`).join('')}

// ---------- halaman ----------
const seg=(a,items,v)=>`<div class="seg" data-seg="${a}">${items.map(([k,l])=>`<button data-v="${k}" aria-pressed="${k===v}">${l}</button>`).join('')}</div>`;
const bar=(mk,rg,leg)=>`<div class="mp-tb">${mk?seg('mk',MKT.map(m=>[m[0],m[1]]),M.mk):''}${rg?seg('rg',Object.keys(RG).map(k=>[k,k]),M.rg):''}${leg?`<span class="mp-leg"><i>\u2212</i><s></s><i>+</i></span>`:''}</div>`;
const row=(r,max)=>`<button class="mp-row" data-s="${r.s}"><b>${r.s}</b><span>${r.g}</span><em class="${cls(r.c)}">${pc(r.c)}</em></button>`;
const PG={
 async map(w,main,tk){main.innerHTML=bar(1,1,1)+`<div class="mp-map"></div><p class="mp-ft">${apiOn()?'Data live':'Data dummy'} \u00b7 ukuran = kapitalisasi, warna = perubahan ${M.rg} \u00b7 klik tile untuk buka di Chart</p>`;
  const g=await load();if(tk!==w._tk)return;if(!g){loadErr(w);return}const draw=()=>paint(w,g);draw();w._ro&&w._ro.disconnect();w._ro=new ResizeObserver(draw);w._ro.observe($('.mp-map',w))},
 async sum(w,main,tk){main.innerHTML=bar(0,1,0)+`<div class="mp-cards">${SUM.map(([n,v])=>{const r=rng(hs(n+M.rg+Math.floor(Date.now()/864e5))),vol=(n==='BTCUSDT'||n==='ETHUSDT'?.04:.012)*RG[M.rg]**.7,pts=[v];for(let i=0;i<29;i++)pts.unshift(pts[0]/(1+(r()-.5)*2*vol/5.4));
   const mn=Math.min(...pts),mx=Math.max(...pts),c=(v/pts[0]-1)*100,d=pts.map((p,i)=>`${i*5},${(30-(p-mn)/((mx-mn)||1)*28).toFixed(1)}`).join(' ');
   return`<div class="mp-card"><span>${n}</span><b>${f(v)}</b><em class="${cls(c)}">${pc(c)}</em><svg viewBox="0 0 145 32" preserveAspectRatio="none"><polyline points="${d}" fill="none" stroke="var(--${c>=0?'up':'dn'})" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg></div>`}).join('')}</div><p class="mp-ft">Data dummy \u00b7 perubahan dihitung dari rentang ${M.rg}</p>`},
 async mov(w,main,tk){main.innerHTML=bar(1,1,0)+`<div class="mp-two"></div>`;const g=await load();if(tk!==w._tk)return;if(!g){loadErr(w);return}
  const all=g.flatMap(x=>x.it.map(i=>({...i,g:x.n}))).sort((a,b)=>b.c-a.c),top=all.slice(0,10),low=all.slice(-10).reverse();
  $('.mp-two',w).innerHTML=`<div><h3>Naik terbanyak</h3>${top.map(row).join('')}</div><div><h3>Turun terbanyak</h3>${low.map(row).join('')}</div>`},
 async sec(w,main,tk){main.innerHTML=bar(1,1,0)+`<div class="mp-sec"></div>`;const g=await load();if(tk!==w._tk)return;if(!g){loadErr(w);return}
  const r=g.map(x=>{const t=x.it.reduce((a,i)=>a+i.v,0);return{n:x.n,c:x.it.reduce((a,i)=>a+i.c*i.v,0)/t}}).sort((a,b)=>b.c-a.c),mx=Math.max(...r.map(x=>Math.abs(x.c)),.01);
  $('.mp-sec',w).innerHTML=r.map(x=>`<div class="mp-bar"><span>${x.n}</span><div><i class="${cls(x.c)}" style="width:${Math.abs(x.c)/mx*50}%;margin-${x.c>=0?'left':'right'}:50%;background:var(--${x.c>=0?'up':'dn'});${x.c<0?'margin-left:auto;':''}"></i></div><em class="${cls(x.c)}">${pc(x.c)}</em></div>`).join('')+`<p class="mp-ft">Rata-rata berbobot kapitalisasi per sektor \u00b7 data dummy</p>`}};
function show(w){const tk=w._tk=(w._tk||0)+1,main=$('.mp-main',w);
 $$('.mp-n',w).forEach(b=>b.setAttribute('aria-pressed',b.dataset.p===M.page));w._ro&&w._ro.disconnect();PG[M.page](w,main,tk)}
registerApp('maps',{css:'apps/maps/maps.css',icon:"<rect x=\"3\" y=\"3\" width=\"10\" height=\"10\" rx=\"1.5\"/><rect x=\"15\" y=\"3\" width=\"6\" height=\"6\" rx=\"1.5\"/><rect x=\"15\" y=\"11\" width=\"5\" height=\"10\" rx=\"1.5\"/><rect x=\"3\" y=\"15\" width=\"10\" height=\"6\" rx=\"1.5\"/>",t:'Maps',w:960,h:600,flush:1,
 html:()=>`<div class="mp"><nav class="mp-nav" aria-label="Menu pasar"><h4>Pasar</h4>${PAGES.map(p=>`<button class="mp-n" data-p="${p[0]}" aria-pressed="false">${p[1]}</button>`).join('')}</nav><section class="mp-main"></section><div class="mp-tip" hidden></div></div>`,
 init(w){const root=$('.mp',w),tip=$('.mp-tip',w);
  root.addEventListener('click',e=>{const n=e.target.closest('.mp-n');if(n){M.page=n.dataset.p;store();show(w);return}
   const sb=e.target.closest('[data-seg] button');if(sb){const a=sb.parentNode.dataset.seg;M[a]=sb.dataset.v;store();show(w);return}
   const t=e.target.closest('[data-s]');if(t){S.sym=S.go=t.dataset.s;open('chart')}});
  root.addEventListener('pointermove',e=>{const t=e.target.closest('.mp-t');if(!t){tip.hidden=true;return}const c=+t.dataset.c,b=root.getBoundingClientRect();
   tip.innerHTML=`<b>${t.dataset.s}</b> <em class="${cls(c)}">${pc(c)}</em><br><span>${t.dataset.g} \u00b7 kap. ${fcap(+t.dataset.v)}</span>`;tip.hidden=false;
   tip.style.left=Math.min(b.width-180,e.clientX-b.left+14)+'px';tip.style.top=Math.min(b.height-60,e.clientY-b.top+14)+'px'});
  root.addEventListener('pointerleave',()=>{tip.hidden=true});
  show(w)}});
})();
