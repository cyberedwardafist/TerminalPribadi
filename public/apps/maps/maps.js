// App "maps" (dock). Sidebar + peta pasar (treemap) per pasar. Berdiri sendiri: ubah file ini tidak memengaruhi app lain.
(()=>{
const KEY='tc.maps';
const MKT=[['ihsg','IHSG',1.8,3],['kripto','Kripto',4.5,8],['komoditas','Komoditas',1.6,3],['luar','Saham Luar',1.7,3],['lain','Lainnya',.7,1.2]];
const RG={'1D':1,'1W':2.3,'1M':4.6};
const STABLE=['USDT','USDC','DAI'];
const PAGES=[['map','Peta Pasar'],['sum','Ringkasan Pasar'],['mov','Top Movers'],['sec','Performa Sektor']];
const esc=x=>String(x).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');
let M={page:'map',mk:'ihsg',rg:'1D'};try{M={...M,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(e){}
if(!PAGES.some(p=>p[0]===M.page))M.page='map';if(!MKT.some(m=>m[0]===M.mk))M.mk='ihsg';if(!RG[M.rg])M.rg='1D';
const store=()=>{try{localStorage.setItem(KEY,JSON.stringify(M))}catch(e){}};
const rng=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const hs=s=>[...s].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7);
const mc=()=>MKT.find(m=>m[0]===M.mk);
const fcap=v=>v>=1000?(v/1000).toFixed(2).replace('.',',')+' T':v.toLocaleString('id-ID')+' '+(M.mk==='ihsg'?'T':'B');

// ---------- data ----------
const CACHE={};
// Hanya data nyata dari /api/heatmap. Gagal = melempar galat ber-kind (offline, noserver, provider, dst.), tidak pernah jatuh ke data karangan.
async function load0(mk=M.mk,rg=M.rg,force=false){const k=mk+'|'+rg;if(CACHE[k]&&!force)return CACHE[k];
 const r=await Status.jjson(`/api/heatmap?market=${mk}&range=${rg.toLowerCase()}`),m={};
 r.forEach(x=>{if(mk==='kripto'&&STABLE.includes(x.sym))return;(m[x.group]=m[x.group]||[]).push({s:x.sym,v:x.cap,c:x.changePct})});   // stablecoin: server memberi ubah% 0 sebagai penanda statis, bukan harga nyata
 const g=Object.entries(m).map(([n,it])=>({n,it}));if(!g.length)throw Status.mk('provider','Server tidak mengembalikan data untuk pasar ini');
 return CACHE[k]=g}
const load=()=>load0();
// Running text menubar: semua simbol dari kelima pasar Maps (ubah% 1D)
if(window.Ticker){
 // Hanya data nyata dari server (/api/heatmap). Tanpa mode Live: kosong. Stablecoin dilewati (server memberi ubah% 0 sebagai penanda statis, bukan harga nyata)
 const all=async()=>{if(!apiOn())return[];const o=[];for(const m of MKT){let g;try{g=await load0(m[0],'1D')}catch(e){continue}g.forEach(x=>x.it.forEach(t=>o.push({s:t.s,c:t.c})))}return o};
 const snap=()=>{const o={};for(const k in CACHE)if(k.endsWith('|1D'))CACHE[k].forEach(x=>x.it.forEach(t=>o[k+t.s]=t.c));return o};
 // true bila ada ubah% simbol Maps yang berbeda dari sebelumnya: ambil ulang /api/heatmap semua pasar (1D)
 const refresh=async()=>{if(!apiOn())return false;await all();const before=snap();
  for(const m of MKT){try{await load0(m[0],'1D',true)}catch(e){}}
  const after=snap();return Object.keys(after).some(k=>k in before&&before[k]!==after[k])};
 Ticker.source('maps',all,refresh)}
const fail=(w,tk,e)=>{if(tk!==w._tk)return;const el=$('.mp-map,.mp-two,.mp-sec,.mp-sm',w);if(el){w._ro&&w._ro.disconnect();Status.mount(el,{err:e,retry:async()=>show(w)})}};

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
 async map(w,main,tk){main.innerHTML=bar(1,1,1)+`<div class="mp-map"><div class="st-ld">Memuat peta pasar\u2026</div></div><p class="mp-ft">Data nyata dari server \u00b7 ukuran = kapitalisasi, warna = perubahan ${M.rg} \u00b7 klik tile untuk buka di Chart</p>`;
  let g;try{g=await load()}catch(e){fail(w,tk,e);return}if(tk!==w._tk)return;const draw=()=>paint(w,g);draw();w._ro&&w._ro.disconnect();w._ro=new ResizeObserver(draw);w._ro.observe($('.mp-map',w))},
 async sum(w,main,tk){main.innerHTML=bar(0,0,0)+`<div class="mp-sm"><div class="st-ld">Memuat ringkasan pasar\u2026</div></div>`;
  let j;try{j=await Status.jjson('/api/summary')}catch(e){fail(w,tk,e);return}if(tk!==w._tk)return;
  const list=[...(j.indices||[]),...(j.highlights||[])].filter(x=>x&&x.price>0);
  if(!list.length){fail(w,tk,Status.mk('provider','Ringkasan pasar kosong dari server'));return}
  const sp={};try{(await Status.jjson('/api/quotes?symbols='+list.map(x=>x.sym).join(','))).forEach(x=>{sp[x.sym]=x.spark})}catch(e){}
  if(tk!==w._tk)return;
  $('.mp-sm',w).innerHTML=`<div class="mp-cards">${list.map(x=>{const c=x.changePct,pts=sp[x.sym]&&sp[x.sym].length>1?sp[x.sym]:null;let svg='';
   if(pts){const mn=Math.min(...pts),mx=Math.max(...pts),d=pts.map((p,i)=>`${(i*145/(pts.length-1)).toFixed(1)},${(30-(p-mn)/((mx-mn)||1)*28).toFixed(1)}`).join(' ');svg=`<svg viewBox="0 0 145 32" preserveAspectRatio="none"><polyline points="${d}" fill="none" stroke="var(--${c>=0?'up':'dn'})" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`}
   return`<div class="mp-card" title="${esc(x.name||x.sym)}"><span>${esc(x.sym)}</span><b>${f(x.price)}</b><em class="${cls(c)}">${pc(c)}</em>${svg}</div>`}).join('')}</div><p class="mp-ft">Data nyata dari server \u00b7 perubahan harian</p>`},
 async mov(w,main,tk){main.innerHTML=bar(1,1,0)+`<div class="mp-two"><div class="st-ld">Memuat\u2026</div></div>`;let g;try{g=await load()}catch(e){fail(w,tk,e);return}if(tk!==w._tk)return;
  const all=g.flatMap(x=>x.it.map(i=>({...i,g:x.n}))).sort((a,b)=>b.c-a.c),top=all.slice(0,10),low=all.slice(-10).reverse();
  $('.mp-two',w).innerHTML=`<div><h3>Naik terbanyak</h3>${top.map(row).join('')}</div><div><h3>Turun terbanyak</h3>${low.map(row).join('')}</div>`},
 async sec(w,main,tk){main.innerHTML=bar(1,1,0)+`<div class="mp-sec"><div class="st-ld">Memuat\u2026</div></div>`;let g;try{g=await load()}catch(e){fail(w,tk,e);return}if(tk!==w._tk)return;
  const r=g.map(x=>{const t=x.it.reduce((a,i)=>a+i.v,0);return{n:x.n,c:x.it.reduce((a,i)=>a+i.c*i.v,0)/t}}).sort((a,b)=>b.c-a.c),mx=Math.max(...r.map(x=>Math.abs(x.c)),.01);
  $('.mp-sec',w).innerHTML=r.map(x=>`<div class="mp-bar"><span>${x.n}</span><div><i class="${cls(x.c)}" style="width:${Math.abs(x.c)/mx*50}%;margin-${x.c>=0?'left':'right'}:50%;background:var(--${x.c>=0?'up':'dn'});${x.c<0?'margin-left:auto;':''}"></i></div><em class="${cls(x.c)}">${pc(x.c)}</em></div>`).join('')+`<p class="mp-ft">Rata-rata berbobot kapitalisasi per sektor \u00b7 data nyata dari server</p>`}};
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
