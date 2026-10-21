// Sesi: simpan & pulihkan tampilan terakhir supaya refresh / Ctrl+Shift+R tidak mengulang dari awal.
// Yang dipulihkan: window yang terbuka (posisi, ukuran, layar penuh, snap, diminimize, urutan tumpukan, window aktif),
// isian teks yang belum disimpan, posisi scroll, dan state internal app (lewat w._ses).
// Disimpan di localStorage 'tc.ui' (tidak ikut disinkronkan ke server). Dihapus saat logout; hanya dipakai untuk akun yang sama.
// Kontrak app (semua opsional):
//   di init(w): w._ses={get():obj, set(obj)}  -> state internal yang belum punya penyimpanan sendiri (mis. catatan yang sedang dibuka)
//   di registerApp: nofields:true             -> isian di window app itu tidak disimpan (mis. Setting, sudah tersimpan otomatis)
//   atribut data-nosave pada elemen           -> isian di dalamnya dilewati
// Window tambahan chart ('chart#2', dst) tidak dipulihkan; tab chart utama tetap dipulihkan oleh app chart sendiri.
const Sesi=(()=>{
 const KEY='tc.ui',VER=1,MAXB=300000,DELAY=450,SETTLE=1500;
 const rd=()=>{try{const j=JSON.parse(localStorage.getItem(KEY)||'null');return j&&j.v===VER&&j.wins&&typeof j.wins==='object'?j:null}catch(e){return null}};
 const who=()=>{try{const u=Auth.mine();return u?String(u.id||u.email||u.name||''):''}catch(e){return''}};
 const BAD=/^(password|file|hidden|checkbox|radio|range|button|submit|reset|image|color)$/i,SECRET=/key|token|secret|pass|sandi|kunci/i;
 const TXT=/^(input|textarea)$/;
 let on=false,tm=0;

 // ---------- alamat elemen di dalam .app: "div:0.section:2.input:1" ----------
 const root=el=>$('.app',el);
 const path=(el,top)=>{const p=[];for(let e=el;e!==top;e=e.parentElement){if(!e||!e.parentElement)return null;p.push(e.localName+':'+[...e.parentElement.children].indexOf(e))}return p.reverse().join('.')};
 const find=(top,pt)=>{let e=top;if(pt==='')return e;for(const s of pt.split('.')){const i=s.lastIndexOf(':');if(i<1||!e)return null;e=e.children[+s.slice(i+1)];if(!e||e.localName!==s.slice(0,i))return null}return e};

 // ---------- tangkap ----------
 const fields=(el,A)=>{const r=root(el),o=[];if(!r||A.nofields)return o;
  for(const f of r.querySelectorAll('input,textarea')){
   if(o.length>=60)break;
   if(f.disabled||f.readOnly||BAD.test(f.type||'')||f.closest('[data-nosave]'))continue;
   const v=f.value;if(!v||v.length>20000||v===f.defaultValue)continue;
   if(SECRET.test([f.name,f.id,f.autocomplete,f.getAttribute('aria-label')].join(' ')))continue;
   const p=path(f,r);if(p!==null)o.push([p,v])}
  return o};
 const SC=new Map();   // elemen window -> kumpulan elemen yang pernah di-scroll
 const scrolls=el=>{const r=root(el),s=SC.get(el),o=[];if(!r||!s)return o;
  for(const t of s){if(!t.isConnected||!el.contains(t)){s.delete(t);continue}
   if(!(t.scrollTop>0||t.scrollLeft>0))continue;
   const p=t===r?'':path(t,r);if(p!==null&&o.length<30)o.push([p,Math.round(t.scrollTop),Math.round(t.scrollLeft)])}
  return o};
 const KEEP={};   // window yang diminimize tidak bisa diukur (display:none): pakai catatan terakhir saat masih tampak
 function snapWin(id){
  const w=S.wins[id],el=w.el,A=APPS[base(id)];
  let a=null;try{a=el._ses&&el._ses.get?el._ses.get():null}catch(e){}
  let f,sc;
  if(w.min&&KEEP[id]){f=KEEP[id].f;sc=KEEP[id].sc}else{f=fields(el,A);sc=scrolls(el);KEEP[id]={f,sc}}
  return{min:!!w.min,full:!!w.full,snap:!!w.snap,prev:w.prev||null,geo:[el.style.left,el.style.top,el.style.width,el.style.height],z:+el.style.zIndex||0,f,sc,a}}
 function build(){
  const ids=Object.keys(S.wins).filter(i=>!i.includes('#')&&APPS[base(i)]),wins={};
  ids.forEach(i=>{wins[i]=snapWin(i)});
  ids.sort((a,b)=>wins[a].z-wins[b].z);
  return{v:VER,u:who(),vw:innerWidth,vh:innerHeight,order:ids,act:S.act&&wins[S.act]?S.act:null,
   sym:S.sym,tf:S.tf,cal:S.cal||null,day:S.day,tab:S.setTab||null,wins}}
 function save(){
  clearTimeout(tm);tm=0;if(!on)return;
  try{const s=build();let j=JSON.stringify(s);
   if(j.length>MAXB){Object.values(s.wins).forEach(w=>{w.f=[];w.sc=[]});j=JSON.stringify(s)}
   localStorage.setItem(KEY,j)}catch(e){}}
 const later=()=>{if(on&&!tm)tm=setTimeout(save,DELAY)};

 // ---------- pantau perubahan ----------
 const inWin=e=>{const t=e.target;return t&&t.closest&&t.closest('.win')};
 ['pointerup','keyup','input','change','focusin'].forEach(n=>addEventListener(n,e=>{
  if(!inWin(e))return;
  if(n==='input'&&e.isTrusted&&TXT.test(e.target.localName))e.target._tcT=1;   // diubah pengguna: jangan ditimpa saat pemulihan
  later()},true));
 addEventListener('scroll',e=>{const t=e.target;if(!(t instanceof Element))return;const w=t.closest('.win');if(!w)return;
  let s=SC.get(w);if(!s)SC.set(w,s=new Set());s.add(t);later()},true);
 addEventListener('pagehide',save);addEventListener('beforeunload',save);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)save()});
 const seen=new WeakSet(),mo=new MutationObserver(later);
 const watch=()=>Object.values(S.wins).forEach(w=>{if(!seen.has(w.el)){seen.add(w.el);mo.observe(w.el,{attributes:true,attributeFilter:['style','class']})}});
 new MutationObserver(()=>{watch();later()}).observe(document.body,{childList:true});

 // ---------- pulihkan ----------
 function applyFields(el,list){
  const r=root(el);if(!r)return;
  for(const [p,v] of list){
   const f=find(r,p);
   if(!f||!TXT.test(f.localName)||BAD.test(f.type||'')||f._tcT||document.activeElement===f)continue;
   if(f.value===v||(f.value&&f.value!==f.defaultValue))continue;   // sudah sama, atau app sudah mengisi sendiri
   f.value=v;f.dispatchEvent(new Event('input',{bubbles:true}))}}
 function applyScroll(el,list,mem){
  const r=root(el);if(!r)return;
  for(const [p,t,l] of list){
   const x=find(r,p);if(!x)continue;
   const k=mem.get(x)||{};
   if(k.u)continue;
   if(k.s!=null&&Math.abs(x.scrollTop-k.s)>2){k.u=1;mem.set(x,k);continue}   // pengguna sudah menggeser sendiri
   x.scrollTop=t;x.scrollLeft=l;k.s=x.scrollTop;mem.set(x,k)}}
 const px=s=>{const n=parseFloat(s);return typeof s==='string'&&/px$/.test(s)&&isFinite(n)?n:null};
 function applyGeo(el,d,sv){
  const g=(d.geo||[]).map(px);if(g.length<4||g.some(x=>x===null))return;
  const kx=d.snap&&sv.vw?innerWidth/sv.vw:1,ky=d.snap&&sv.vh?innerHeight/sv.vh:1;
  let [l,t,w,h]=g;w=Math.min(w*kx,innerWidth-20);h=Math.min(h*ky,innerHeight-60);l*=kx;t*=ky;
  l=Math.max(120-w,Math.min(innerWidth-80,l));t=Math.max(30,Math.min(innerHeight-120,t));
  Object.assign(el.style,{left:l+'px',top:t+'px',width:w+'px',height:h+'px'})}
 function topState(sv){
  if(sv.sym&&WATCH.some(r=>r[0]===sv.sym))S.sym=sv.sym;
  if(['1m','5m','1h','1D'].includes(sv.tf))S.tf=sv.tf;
  const c=sv.cal;
  if(c&&typeof c==='object'){const t={};
   if(Number.isInteger(c.y)&&c.y>1990&&c.y<2100)t.y=c.y;
   if(Number.isInteger(c.m)&&c.m>=0&&c.m<12)t.m=c.m;
   if(typeof c.cat==='string')t.cat=c.cat;
   if(Array.isArray(c.types))t.types=c.types.filter(x=>typeof x==='string');
   if(Number.isFinite(c.imp))t.imp=c.imp;
   if(typeof c.q==='string')t.q=c.q.slice(0,100);
   S.cal=Object.assign(S.cal||{},t)}
  if(Number.isInteger(sv.day)&&sv.day>=1&&sv.day<=31)S.day=sv.day;
  if(typeof sv.tab==='string')S.setTab=sv.tab}
 // true = ada sesi tersimpan (walau tanpa window); false = tidak ada sesi, biarkan boot membuka Home
 function restore(){
  const sv=rd();if(!sv||sv.u!==who())return false;
  const ids=(Array.isArray(sv.order)?sv.order:[]).filter(i=>sv.wins[i]&&!String(i).includes('#')&&APPS[base(i)]);
  if(!ids.length&&Object.keys(sv.wins).length)return false;
  topState(sv);
  for(const id of ids){
   const d=sv.wins[id];let el;
   try{el=open(id)}catch(e){continue}
   const w=S.wins[id];if(!w||!el)continue;
   el.getAnimations&&el.getAnimations().forEach(a=>a.cancel());el.style.transformOrigin='';   // muncul langsung, tanpa animasi buka
   applyGeo(el,d,sv);
   if(!!d.full!==!!w.full)full(id,true);
   if(d.snap&&Array.isArray(d.prev)&&d.prev.length===4){w.snap=true;w.prev=d.prev.map(String)}
   if(d.min){w.min=true;el.classList.add('hid')}
   if(d.a!=null&&el._ses&&el._ses.set){try{el._ses.set(d.a)}catch(e){}}
   const mem=new Map(),run=()=>{if(!el.isConnected)return;applyFields(el,d.f||[]);applyScroll(el,d.sc||[],mem)};
   run();[250,900,2000].forEach(ms=>setTimeout(run,ms))}
  const vis=ids.filter(i=>S.wins[i]&&!S.wins[i].min);
  S.act=sv.act&&S.wins[sv.act]&&!S.wins[sv.act].min?sv.act:(vis.length?vis[vis.length-1]:null);
  upd();return true}
 // dipanggil boot sesudah restore()/open('home'): baru menyimpan setelah tampilan stabil
 const start=()=>setTimeout(()=>{on=true;watch();save()},SETTLE);
 const clear=()=>{on=false;clearTimeout(tm);tm=0;try{localStorage.removeItem(KEY)}catch(e){}};
 return{restore,start,save,clear}})();
