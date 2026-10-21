// Penyalaan: dock dari app yang sudah mendaftar (urutan dock = urutan <script> di index.html), jam, lalu buka Home.
$('#dock').innerHTML=Object.keys(APPS).map(k=>`<button class="d" data-k="${k}" data-l="${APPS[k].t}" aria-label="${APPS[k].t}"><svg viewBox="0 0 24 24" aria-hidden="true">${typeof APPS[k].icon==='function'?APPS[k].icon():APPS[k].icon}</svg></button>`).join('');
$$('.d').forEach(b=>b.onclick=()=>{const k=b.dataset.k,g=grp(k),vis=g.filter(i=>!S.wins[i].min);if(vis.length&&S.act&&base(S.act)===k){vis.forEach(minimize);return}if(!g.length){b.classList.add('bounce');setTimeout(()=>b.classList.remove('bounce'),1000);open(k);return}g.sort((a,c)=>S.wins[a].el.style.zIndex-S.wins[c].el.style.zIndex).forEach(open)});
// clock
const tick=()=>{$('#clk').textContent=new Date().toLocaleString('id-ID',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})};tick();setInterval(tick,20000);
// Pulihkan tampilan terakhir (window, isian, scroll); bila belum ada sesi tersimpan, buka Home seperti biasa.
Sesi.restore()||open('home');Sesi.start();

// Dock ala macOS: ikon membesar mengikuti kursor (kurva cosine, tetangga ikut membesar dan mendorong ikon lain), kembali dengan pegas halus. Hanya mouse/pen; mati bila gerakan dikurangi.
(()=>{const dk=$('#dock'),ic=$$('.d'),MAX=1.8,R=130,K=.22;let tg=ic.map(()=>1),cu=ic.map(()=>1),mx=null,raf=0;
 const ok=e=>e.pointerType!=='touch'&&!(typeof S!=='undefined'&&S.still)&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const loop=()=>{raf=0;let busy=mx!==null;
  if(mx!==null){ic.forEach((b,i)=>{const r=b.getBoundingClientRect(),d=Math.abs(mx-(r.left+r.width/2));tg[i]=d<R?1+(MAX-1)*(.5+.5*Math.cos(Math.PI*d/R)):1})}
  ic.forEach((b,i)=>{const t=mx===null?1:tg[i];cu[i]+=(t-cu[i])*K;if(Math.abs(t-cu[i])<.003)cu[i]=t;else busy=true;b.style.setProperty('--s',cu[i].toFixed(3))});
  if(busy)raf=requestAnimationFrame(loop)};
 const go=()=>{if(!raf)raf=requestAnimationFrame(loop)};
 dk.addEventListener('pointermove',e=>{if(!ok(e))return;mx=e.clientX;go()});
 dk.addEventListener('pointerleave',()=>{mx=null;go()});
 dk.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){mx=null;go()}})})();

// Dock auto-hide: bila ada jendela fullscreen (desktop/mouse), dock sembunyi dan muncul lagi saat kursor menyentuh tepi bawah layar, lalu sembunyi saat kursor menjauh.
(()=>{const dk=$('#dock'),fine=matchMedia('(hover:hover) and (pointer:fine)');let t=0;
 const keep=()=>{clearTimeout(t);t=0},later=()=>{if(!t)t=setTimeout(()=>{t=0;dk.classList.remove('show')},350)};
 const sync=()=>{const f=fine.matches&&Object.values(S.wins).some(w=>w.full&&!w.min);document.body.classList.toggle('has-full',f);if(!f){keep();if(dk.classList.contains('show'))dk.classList.remove('show')}};
 new MutationObserver(sync).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});sync();
 document.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||!document.body.classList.contains('has-full'))return;
  if(e.clientY>=innerHeight-4){keep();dk.classList.add('show');return}
  if(!dk.classList.contains('show'))return;
  const r=dk.getBoundingClientRect();(e.clientY>=r.top-16&&e.clientX>=r.left-24&&e.clientX<=r.right+24)?keep():later()});
 document.documentElement.addEventListener('mouseleave',()=>{if(dk.classList.contains('show'))later()})})();
