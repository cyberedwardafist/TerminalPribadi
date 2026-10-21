// App "maps" (dock). Sidebar + peta pasar (treemap) per pasar. Berdiri sendiri: ubah file ini tidak memengaruhi app lain.
(()=>{
const KEY='tc.maps';
const MKT=[['ihsg','IHSG',1.8,3],['kripto','Kripto',4.5,8],['komoditas','Komoditas',1.6,3],['luar','Saham Luar',1.7,3],['lain','Lainnya',.7,1.2]];
const RG={'1D':1,'1W':2.3,'1M':4.6};
const STABLE=['USDT','USDC','DAI'];
const PAGES=[['map','Peta Pasar'],['sum','Ringkasan Pasar'],['mov','Top Movers'],['sec','Performa Sektor']];
let M={page:'map',mk:'ihsg',rg:'1D'};try{M={...M,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(e){}
if(!PAGES.some(p=>p[0]===M.page))M.page='map';if(!MKT.some(m=>m[0]===M.mk))M.mk='ihsg';if(!RG[M.rg])M.rg='1D';
const store=()=>{try{localStorage.setItem(KEY,JSON.stringify(M))}catch(e){}};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');
const mc=()=>MKT.find(m=>m[0]===M.mk);
const fcap=v=>v>=1000?(v/1000).toFixed(2).replace('.',',')+' T':v.toLocaleString('id-ID')+' '+(M.mk==='ihsg'?'T':'B');

// ---------- data: hanya dari server (/api/heatmap, /api/summary). Gagal = ApiError, tidak ada data karangan ----------
const CACHE={};
async function load0(mk=M.mk,rg=M.rg,force=false){const k=mk+'|'+rg;if(CACHE[k]&&!force)return CACHE[k];
 const j=await apiJson(`/api/heatmap?market=${mk}&range=${rg.toLowerCase()}`);
 if(!Array.isArray(j)||!j.length)throw new ApiError('empty',{what:'heatmap',path:'/api/heatmap'});
 const m={};j.forEach(x=>(m[x.group]=m[x.group]||[]).push({s:x.sym,v:x.cap,c:x.changePct}));
 return CACHE[k]=Object.entries(m).map(([n,it])=>({n,it}))}
const load=()=>load0();
// Running text menubar: semua simbol dari kelima pasar Maps (ubah% 1D). Hanya data nyata; tanpa mode Live kosong. Stablecoin dilewati (server memberi ubah% 0 sebagai penanda statis, bukan harga nyata)
if(window.Ticker){
 const all=async()=>{if(!apiOn())return[];const o=[];for(const m of MKT){let g=null;try{g=await load0(m[0],'1D')}catch(e){}if(g)g.forEach(x=>x.it.forEach(t=>{if(!STABLE.includes(t.s))o.push({s:t.s,c:t.c})}))}return o};
 const snap=()=>{const o={};for(const k in CACHE)if(k.endsWith('|1D'))CACHE[k].forEach(x=>x.it.forEach(t=>o[k+t.s]=t.c));return o};
 // true bila ada ubah% simbol Maps yang berbeda dari sebelumnya: ambil ulang /api/heatmap semua pasar (1D)
 const refresh=async()=>{if(!apiOn())return false;await all();const before=snap();
  for(const m of MKT){try{await load0(m[0],'1D',true)}catch(e){}}
  const after=snap();return Object.keys(after).some(k=>k in before&&before[k]!==after[k])};
 Ticker.source('maps',all,refresh)}
// Gagal memuat: ganti area data dengan panel penyebab (internet, server, atau sumber data) dari shared/fault.js
async function fail(w,tk,err,what){const info=await Fault.explain(err,{what,fresh:true});if(tk!==w._tk)return;
 const box=$('.mp-map,.mp-two,.mp-sec,.mp-cards',w);if(!box)return;const d=document.createElement('div');d.className='mp-fail';box.replaceWith(d);Fault.mount(d,info,()=>show(w))}

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
 async map(w,main,tk){main.innerHTML=bar(1,1,1)+`<div class="mp-map">${Fault.loading('Memuat peta pasar\u2026')}</div><p class="mp-ft">Data live \u00b7 ukuran = kapitalisasi, warna = perubahan ${M.rg} \u00b7 klik tile untuk buka di Chart</p>`;
  let g;try{g=await load()}catch(e){return fail(w,tk,e,'heatmap')}if(tk!==w._tk)return;const draw=()=>paint(w,g);draw();w._ro&&w._ro.disconnect();w._ro=new ResizeObserver(draw);w._ro.observe($('.mp-map',w))},
 async sum(w,main,tk){main.innerHTML=`<div class="mp-cards">${Fault.loading('Memuat ringkasan pasar\u2026')}</div><p class="mp-ft"></p>`;
  let j;try{j=await apiJson('/api/summary');if(!j||!((j.indices||[]).length+(j.highlights||[]).length))throw new ApiError('empty',{what:'summary',path:'/api/summary'})}catch(e){return fail(w,tk,e,'summary')}if(tk!==w._tk)return;
  const rows=[...(j.indices||[]),...(j.highlights||[])].filter(r=>r&&r.price!=null);
  $('.mp-cards',w).innerHTML=rows.map(r=>{const sp=Array.isArray(r.spark)&&r.spark.length>1?r.spark:null;let d='';if(sp){const mn=Math.min(...sp),mx=Math.max(...sp);d=sp.map((p,i)=>`${(i*145/(sp.length-1)).toFixed(1)},${(30-(p-mn)/((mx-mn)||1)*28).toFixed(1)}`).join(' ')}
   return`<div class="mp-card" title="${esc(r.name||r.sym)}"><span>${esc(r.sym)}</span><b>${f(r.price)}</b><em class="${cls(r.changePct)}">${pc(r.changePct)}</em>${sp?`<svg viewBox="0 0 145 32" preserveAspectRatio="none"><polyline points="${d}" fill="none" stroke="var(--${r.changePct>=0?'up':'dn'})" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`:''}</div>`}).join('');
  $('.mp-ft',w).textContent='Data live \u00b7 perubahan harian \u00b7 garis = 30 penutupan harian terakhir \u00b7 diperbarui '+new Date(j.time||Date.now()).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})},
 async mov(w,main,tk){main.innerHTML=bar(1,1,0)+`<div class="mp-two">${Fault.loading('Memuat data\u2026')}</div>`;let g;try{g=await load()}catch(e){return fail(w,tk,e,'heatmap')}if(tk!==w._tk)return;
  const all=g.flatMap(x=>x.it.map(i=>({...i,g:x.n}))).sort((a,b)=>b.c-a.c),top=all.slice(0,10),low=all.slice(-10).reverse();
  $('.mp-two',w).innerHTML=`<div><h3>Naik terbanyak</h3>${top.map(row).join('')}</div><div><h3>Turun terbanyak</h3>${low.map(row).join('')}</div>`},
 async sec(w,main,tk){main.innerHTML=bar(1,1,0)+`<div class="mp-sec">${Fault.loading('Memuat data\u2026')}</div>`;let g;try{g=await load()}catch(e){return fail(w,tk,e,'heatmap')}if(tk!==w._tk)return;
  const r=g.map(x=>{const t=x.it.reduce((a,i)=>a+i.v,0);return{n:x.n,c:x.it.reduce((a,i)=>a+i.c*i.v,0)/t}}).sort((a,b)=>b.c-a.c),mx=Math.max(...r.map(x=>Math.abs(x.c)),.01);
  $('.mp-sec',w).innerHTML=r.map(x=>`<div class="mp-bar"><span>${x.n}</span><div><i class="${cls(x.c)}" style="width:${Math.abs(x.c)/mx*50}%;margin-${x.c>=0?'left':'right'}:50%;background:var(--${x.c>=0?'up':'dn'});${x.c<0?'margin-left:auto;':''}"></i></div><em class="${cls(x.c)}">${pc(x.c)}</em></div>`).join('')+`<p class="mp-ft">Rata-rata berbobot kapitalisasi per sektor</p>`}};
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
