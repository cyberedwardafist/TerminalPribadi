// Inti: state bersama, registry app, window manager, tata letak (snap).
// Tidak tahu isi app apa pun. Tiap app mendaftar sendiri lewat registerApp() di js/apps/<nama>.js
// Kontrak app: {t, w, h, flush?, icon (string path SVG atau fungsi), html(), init(win)?, show(win)?}
//   css: path css milik app (opsional)
//   show(win) dipanggil saat window yang sudah terbuka dibuka lagi dari app lain (mis. ganti simbol chart)
const $=(s,e=document)=>e.querySelector(s),$$=(s,e=document)=>[...e.querySelectorAll(s)];
const S={sym:'BTCUSDT',tf:'1h',z:10,n:0,bg:'angin',still:CFG.still??matchMedia('(prefers-reduced-motion: reduce)').matches,note:'',day:new Date().getDate(),wins:{},act:null};
try{S.bg=localStorage.getItem('bg')||S.bg}catch(e){}
if(WATCH.some(x=>x[0]===CFG.sym))S.sym=CFG.sym;if(['1m','5m','1h','1D'].includes(CFG.tf))S.tf=CFG.tf;
const APPS={};
// muat file CSS sekali saja (path relatif terhadap index.html)
const loadCss=h=>{if(document.querySelector('link[data-css="'+h+'"]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href=h;l.dataset.css=h;document.head.append(l)};
// daftar app; properti css (string/array) otomatis dimuat bersama app
const base=id=>String(id).split('#')[0];// 'chart#2' = window tambahan milik app 'chart'
const registerApp=(id,a)=>{APPS[id]=a;[].concat(a.css||[]).forEach(loadCss)};
const grp=k=>Object.keys(S.wins).filter(i=>base(i)===k);// semua window milik satu app (utama + 'chart#2', dst)
function upd(){$$('.d').forEach(b=>{const g=grp(b.dataset.k).map(i=>S.wins[i]),a=S.wins[S.act];b.classList.toggle('run',g.length>0);b.classList.toggle('mn',g.length>0&&g.every(x=>x.min));b.classList.toggle('act',!!a&&base(S.act)===b.dataset.k&&!a.min)});$('#mbapp').textContent=S.act&&S.wins[S.act]?APPS[base(S.act)].t:'Terminal Chart'}
function focus(id){const w=S.wins[id];if(!w)return;w.el.style.zIndex=++S.z;S.act=id;upd()}
function open(id){let w=S.wins[id];if(w){if(w.min)restore(id);focus(id);APPS[base(id)].show&&APPS[base(id)].show(w.el);return w.el}
 const A=APPS[base(id)],el=document.createElement('div');el.className='win';el.setAttribute('role','dialog');el.setAttribute('aria-label',A.t);el.tabIndex=-1;
 el.innerHTML=`<div class="tbar"><div class="lights"><button class="l r" aria-label="Tutup"><i>\u00d7</i></button><button class="l y" aria-label="Sembunyikan"><i>\u2212</i></button><button class="l g" aria-label="Layar penuh"><i>+</i></button></div><span class="ttl">${A.t}</span><button class="nb tl" aria-label="Tata letak window">Tata letak</button></div><div class="app${A.flush?' flush':''}">${A.html()}</div>`;
 el.style.cssText=`width:${Math.min(A.w,innerWidth-60)}px;height:${Math.min(A.h,innerHeight-200)}px;left:${40+(S.n%6)*30}px;top:${50+(S.n%6)*28}px`;S.n++;
 document.body.append(el);w=S.wins[id]={el,min:false,full:false};genie(id,true).onfinish=()=>{el.style.transformOrigin=''};
 const tb=$('.tbar',el);
 $('.r',el).onclick=()=>close(id);const gb=$('.g',el);gb.onmouseenter=()=>{keep();st=setTimeout(()=>showSnap(id,gb),350)};gb.onmouseleave=later;$('.tl',el).onclick=e=>showSnap(id,e.currentTarget);$('.y',el).onclick=()=>minimize(id);$('.g',el).onclick=()=>full(id);tb.ondblclick=e=>{if(!e.target.closest('button'))full(id)};
  el.addEventListener('pointerdown',()=>focus(id));el.onkeydown=e=>{if(e.key==='Escape')close(id)};
 tb.addEventListener('pointerdown',e=>{if(e.target.closest('button')||w.full)return;const r=el.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;tb.setPointerCapture(e.pointerId);const mv=v=>{el.style.left=Math.max(120-r.width,Math.min(innerWidth-80,v.clientX-dx))+'px';el.style.top=Math.max(30,Math.min(innerHeight-120,v.clientY-dy))+'px';edge(v)};const up=()=>{edgeApply(id);tb.removeEventListener('pointermove',mv);tb.removeEventListener('pointerup',up)};tb.addEventListener('pointermove',mv);tb.addEventListener('pointerup',up)});
 A.init&&A.init(el);$$('[data-go]',el).forEach(b=>b.onclick=()=>{open(b.dataset.go)});
 if(innerWidth<700)full(id,true);focus(id);el.focus({preventScroll:true});return el}
function close(id){const w=S.wins[id];if(!w)return;w.el.style.pointerEvents='none';w.el.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.94)'}],{duration:170,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});delete S.wins[id];setTimeout(()=>w.el.remove(),175);if(S.act===id){const k=Object.keys(S.wins).filter(k=>!S.wins[k].min).sort((a,b)=>S.wins[b].el.style.zIndex-S.wins[a].el.style.zIndex)[0];S.act=k||null}upd()}
function genie(id,rev){const el=S.wins[id].el,r=el.getBoundingClientRect(),b=$(`.d[data-k="${base(id)}"]`).getBoundingClientRect(),P=['polygon(0 0,100% 0,100% 100%,0 100%)','polygon(0 0,100% 0,88% 100%,12% 100%)','polygon(0 0,100% 0,62% 100%,38% 100%)','polygon(0 0,100% 0,52% 100%,48% 100%)'],T=['scale(1,1)','scale(.82,.7)','scale(.45,.35)','scale(.04,.03)'],kf=[0,1,2,3].map(i=>({transform:T[i],clipPath:P[i],opacity:i===3?.5:1}));if(rev)kf.reverse();kf.forEach((k,i)=>k.offset=[0,.35,.7,1][i]);el.style.transformOrigin=`${b.left+b.width/2-r.left}px ${b.top+b.height/2-r.top}px`;return el.animate(kf,rev?{duration:420,easing:'cubic-bezier(.2,.8,.25,1)'}:{duration:460,easing:'cubic-bezier(.5,0,.85,.4)',fill:'forwards'})}
function minimize(id){const w=S.wins[id],el=w.el,r=el.getBoundingClientRect(),b=$(`.d[data-k="${base(id)}"]`).getBoundingClientRect();w.min=true;const a=genie(id,false);a.onfinish=()=>{if(w.min)el.classList.add('hid');a.cancel()};const k=Object.keys(S.wins).filter(k=>!S.wins[k].min)[0];S.act=k||null;upd()}
function restore(id){const w=S.wins[id],el=w.el;w.min=false;el.classList.remove('hid');genie(id,true).onfinish=()=>{el.style.transformOrigin=''}}
function full(id,instant){const w=S.wins[id];w.full=!w.full;if(!instant){w.el.classList.add('fx');setTimeout(()=>w.el.classList.remove('fx'),320)}w.el.classList.toggle('full',w.full)}
// tata letak window (snap)
const LAY=[[[0,0,.5,1],[.5,0,.5,1]],[[0,0,.34,1],[.34,0,.66,1]],[[0,0,.66,1],[.66,0,.34,1]],[[0,0,.34,1],[.34,0,.33,1],[.67,0,.33,1]],[[0,0,.5,1],[.5,0,.5,.5],[.5,.5,.5,.5]],[[0,0,.5,.5],[0,.5,.5,.5],[.5,0,.5,1]],[[0,0,.5,.5],[.5,0,.5,.5],[0,.5,.5,.5],[.5,.5,.5,.5]],[[0,0,1,.5],[0,.5,1,.5]],[[0,0,.25,1],[.25,0,.5,1],[.75,0,.25,1]]];
const area=()=>({x:0,y:30,w:innerWidth,h:innerHeight-122});
const zr=z=>{const A=area(),i=6;return{x:A.x+z[0]*A.w+i,y:A.y+z[1]*A.h+i,w:z[2]*A.w-2*i,h:z[3]*A.h-2*i}};
function place(id,z){const w=S.wins[id];if(!w)return;if(w.min)restore(id);const el=w.el,r=zr(z);if(!w.snap)w.prev=[el.style.left,el.style.top,el.style.width,el.style.height];w.snap=true;w.full=false;el.classList.remove('full');el.classList.add('fx');Object.assign(el.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});setTimeout(()=>el.classList.remove('fx'),320);focus(id)}
function unsnap(id){const w=S.wins[id],el=w.el;if(w.prev){el.classList.add('fx');[el.style.left,el.style.top,el.style.width,el.style.height]=w.prev;setTimeout(()=>el.classList.remove('fx'),320)}if(w.full){w.full=false;el.classList.remove('full')}w.snap=false}
const sn=document.createElement('div');sn.id='snap';sn.setAttribute('role','dialog');sn.setAttribute('aria-label','Tata letak window');
sn.innerHTML=`<div class="lays">${LAY.map((l,i)=>`<div class="lay">${l.map((z,j)=>`<button data-l="${i}" data-z="${j}" aria-label="Tata letak ${i+1}, zona ${j+1}" style="left:calc(${z[0]*100}% + 2px);top:calc(${z[1]*100}% + 2px);width:calc(${z[2]*100}% - 4px);height:calc(${z[3]*100}% - 4px)"></button>`).join('')}</div>`).join('')}</div><div class="snh">Atur sendiri: geser di kotak untuk menentukan area</div><div class="cg">${[...Array(24)].map((_,k)=>`<button class="cc" data-c="${k%6}" data-r="${k/6|0}" aria-label="Kolom ${k%6+1}, baris ${(k/6|0)+1}"></button>`).join('')}</div><button class="btn" id="ub">Ukuran awal</button>`;
document.body.append(sn);
const pv=document.createElement('div');pv.id='pv';document.body.append(pv);
let sid=null,st=0,sel=null,end=null,ez=null;
const hide=()=>{sn.style.display='none';sid=null},keep=()=>clearTimeout(st),later=()=>{clearTimeout(st);st=setTimeout(hide,400)};
function showSnap(id,a){const r=a.getBoundingClientRect();sid=id;sn.style.left=Math.max(8,Math.min(r.left-20,innerWidth-324))+'px';sn.style.top=Math.max(34,Math.min(r.bottom+8,innerHeight-390))+'px';sn.style.display='block'}
sn.onmouseenter=keep;sn.onmouseleave=later;
sn.onclick=e=>{const b=e.target.closest('button');if(!b||sid==null)return;if(b.dataset.z!=null){place(sid,LAY[b.dataset.l][b.dataset.z]);hide()}else if(b.id==='ub'){unsnap(sid);hide()}else if(b.classList.contains('cc')&&e.detail===0){place(sid,[b.dataset.c/6,b.dataset.r/4,1/6,1/4]);hide()}};
const cells=$$('.cc',sn),cg=$('.cg',sn),cellAt=(x,y)=>{const e=document.elementFromPoint(x,y);return e&&e.closest?e.closest('.cc'):null},rc=b=>({c:+b.dataset.c,r:+b.dataset.r});
const gpaint=b=>cells.forEach(c=>c.classList.toggle('on',!!(sel&&b&&+c.dataset.c>=Math.min(sel.c,b.c)&&+c.dataset.c<=Math.max(sel.c,b.c)&&+c.dataset.r>=Math.min(sel.r,b.r)&&+c.dataset.r<=Math.max(sel.r,b.r))));
cg.onpointerdown=e=>{const b=cellAt(e.clientX,e.clientY);if(!b)return;e.preventDefault();sel=rc(b);end=sel;gpaint(end)};
cg.onpointermove=e=>{if(!sel)return;const b=cellAt(e.clientX,e.clientY);if(b){end=rc(b);gpaint(end)}};
addEventListener('pointerup',()=>{if(!sel)return;const a=sel,b=end;sel=null;gpaint(null);if(sid!=null){const c0=Math.min(a.c,b.c),c1=Math.max(a.c,b.c),r0=Math.min(a.r,b.r),r1=Math.max(a.r,b.r);place(sid,[c0/6,r0/4,(c1-c0+1)/6,(r1-r0+1)/4]);hide()}});
addEventListener('pointerdown',e=>{if(sn.style.display==='block'&&!e.target.closest('#snap,.tl,.l.g'))hide()});
addEventListener('keydown',e=>{if(e.key==='Escape'&&sn.style.display==='block'){hide();e.stopPropagation()}},true);
function edge(v){const x=v.clientX,y=v.clientY,A=area(),m=10,q=y<A.y+A.h*.25?0:y>A.y+A.h*.75?1:2;let z=null;if(x<=m||x>=innerWidth-m){const fx=x<=m?0:.5;z=q===2?[fx,0,.5,1]:[fx,q*.5,.5,.5]}else if(y<=34)z=[0,0,1,1];ez=z;if(z){const r=zr(z);Object.assign(pv.style,{display:'block',left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'})}else pv.style.display='none'}
function edgeApply(id){pv.style.display='none';if(ez){place(id,ez);ez=null}}
