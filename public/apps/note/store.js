// Note: data bersama. Tiga penyimpanan:
//   localStorage 'tc.notes'    catatan ilmu/umum  {v:2,notes:[...]}
//   localStorage 'tc.journal'  jurnal trading     {v:1,trades:[...]}
//   IndexedDB 'tc-journal'     gambar bukti (Blob), dirujuk dari trade.imgs[]; di mode Live juga diunggah ke server (Live.img)
// Juga: helper format (Rupiah, tanggal), penyaring HTML, migrasi data lama, ekspor/impor.
const Note=(()=>{
const KN='tc.notes',KJ='tc.journal';
const ic=p=>`<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const I={
 all:'<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>',
 jurnal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
 ilmu:'<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
 umum:'<path d="M5 5h14v10H9l-4 4z"/>',
 pin:'<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>',
 search:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2"/>',
 trash:'<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 ul:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
 cl:'<path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17"/><path d="M12 6h8M12 12h8M12 18h8"/>',
 l:'<path d="M14 6l-6 6 6 6"/>',r:'<path d="M10 6l6 6-6 6"/>',
 fl:'<path d="M3 6h18M6 12h12M10 18h4"/>',
 img:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
 x:'<path d="M6 6l12 12M18 6L6 18"/>'};

// ---------- format ----------
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>iso(new Date());
const fd=s=>new Date(s+'T00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
const fdl=s=>new Date(s+'T00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const nf=new Intl.NumberFormat('id-ID',{maximumFractionDigits:0});
const rp=(v,sg)=>{v=Math.round(v||0);return(v>0?(sg?'+':''):v<0?'\u2212':'')+'Rp\u00a0'+nf.format(Math.abs(v))};
const short=v=>{const a=Math.abs(v),s=v>0?'+':v<0?'\u2212':'',t=n=>String(+n.toFixed(2)).replace('.',',');return a>=1e9?s+t(a/1e9)+'M':a>=1e6?s+t(a/1e6)+'jt':a>=1e3?s+t(a/1e3)+'rb':s+Math.round(a)};
// "1.250.000", "1250000", "1,5jt" tidak didukung; koma = desimal, titik = pemisah ribuan (format Indonesia)
const parseRp=s=>{s=String(s).replace(/[^\d.,]/g,'');if(!s)return 0;let v;
 if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))v=s.replace(/\./g,'').replace(',','.');
 else if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))v=s.replace(/,/g,'');
 else v=s.replace(',','.');
 const n=parseFloat(v);return isFinite(n)?Math.abs(n):0};
const pl=t=>t.res==='profit'?t.amount:t.res==='loss'?-t.amount:0;

// ---------- penyaring HTML catatan ----------
const OK=new Set(['DIV','P','BR','B','STRONG','I','EM','U','S','H3','UL','OL','LI','SPAN','HR']);
function clean(html){
 const doc=new DOMParser().parseFromString('<body>'+html,'text/html'),out=document.createElement('div');
 const walk=(src,dst)=>src.childNodes.forEach(c=>{
  if(c.nodeType===3)dst.append(document.createTextNode(c.nodeValue));
  else if(c.nodeType===1){
   if(OK.has(c.tagName)){const e=document.createElement(c.tagName);if(c.classList.contains('cl'))e.className='cl';if(c.classList.contains('done'))e.classList.add('done');dst.append(e);walk(c,e)}
   else if(!/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE|NOSCRIPT)$/.test(c.tagName))walk(c,dst)}});
 walk(doc.body,out);return out.innerHTML}
const lines=h=>new DOMParser().parseFromString('<body>'+h.replace(/<\/(div|p|li|h\d|ul|ol)>|<br\s*\/?>/gi,'\n$&'),'text/html').body.textContent.split('\n').map(x=>x.replace(/\u00a0/g,' ').trim()).filter(Boolean);

// ---------- normalisasi ----------
const tagList=a=>Array.isArray(a)?[...new Set(a.map(t=>String(t).trim().toLowerCase().replace(/^#+/,'').slice(0,24)).filter(Boolean))].slice(0,12):[];
function deriveNote(n){const L=lines(n.html);n.t=(L[0]||'').slice(0,120);n.s=L.slice(1).join(' ').slice(0,140);n.p=L.join(' ').toLowerCase().slice(0,20000)}
function normNote(x){
 if(!x||typeof x.html!=='string')return null;
 const n={id:String(x.id||uid()).slice(0,40),cat:x.cat==='umum'?'umum':'ilmu',html:clean(x.html.slice(0,500000)),tags:tagList(x.tags),pin:!!x.pin,cre:+x.cre||Date.now(),upd:+x.upd||Date.now()};
 deriveNote(n);return n}
const hhmm=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s)?s:'';
function normTrade(x){
 if(!x||typeof x!=='object')return null;
 const res=['profit','loss','impas'].includes(x.res)?x.res:'';
 const amt=Math.abs(+x.amount);
 return{id:String(x.id||uid()).slice(0,40),date:/^\d{4}-\d{2}-\d{2}$/.test(x.date)?x.date:today(),time:hhmm(x.time),timeEnd:hhmm(x.timeEnd),
  sym:String(x.sym||'').trim().slice(0,24),side:['buy','sell'].includes(x.side)?x.side:'',res,amount:res==='impas'||!isFinite(amt)?0:amt,
  method:String(x.method||'').trim().slice(0,60),
  fields:(Array.isArray(x.fields)?x.fields:[]).map(f=>({k:String((f&&f.k)||'').trim().slice(0,40),v:String((f&&f.v)||'').slice(0,160)})).filter(f=>f.k||f.v).slice(0,20),
  note:String(x.note||'').slice(0,6000),eval:String(x.eval||'').slice(0,6000),
  imgs:(Array.isArray(x.imgs)?x.imgs:[]).map(String).filter(Boolean).slice(0,8),cre:+x.cre||Date.now(),upd:+x.upd||Date.now()}}
// catatan lama kategori "jurnal" (versi awal) -> trade
const fromOld=r=>normTrade({id:'m'+String(r.id||uid()),date:r.date,sym:r.sym,res:{p:'profit',l:'loss',b:'impas'}[r.res]||'',amount:0,note:lines(String(r.html||'')).join('\n'),cre:r.cre,upd:r.upd});

// ---------- penyimpanan ----------
const S={notes:[],trades:[]};
const readJson=k=>{try{const r=localStorage.getItem(k);return r===null?undefined:JSON.parse(r)}catch(e){return null}};
const saveNotes=()=>{try{localStorage.setItem(KN,JSON.stringify({v:2,notes:S.notes.map(({t,s,p,...r})=>r)}));return true}catch(e){return false}};
const saveTrades=()=>{try{localStorage.setItem(KJ,JSON.stringify({v:1,trades:S.trades}));return true}catch(e){return false}};
const seed=()=>{const t=Date.now();return[normNote({id:uid(),cat:'ilmu',html:'<h3>Risk management dasar</h3><div><b>Ringkasan</b></div><div>Tentukan risiko per transaksi sebelum entry, bukan sesudahnya.</div><div><br></div><div><b>Poin penting</b></div><ul><li>Risiko per transaksi sekitar 1% dari modal</li><li>Stop loss ditaruh di level yang membatalkan ide, bukan angka acak</li><li>Ukuran posisi dihitung dari jarak stop loss</li></ul>',tags:['risk','dasar'],pin:true,cre:t,upd:t})]};
function load(){
 const tj=readJson(KJ);S.trades=(tj&&Array.isArray(tj.trades)?tj.trades:[]).map(normTrade).filter(Boolean);
 const nj=readJson(KN);
 if(nj===undefined){S.notes=window.Live&&Live.on?[]:seed();saveNotes();return}
 const arr=nj&&Array.isArray(nj.notes)?nj.notes:[];let mig=false;S.notes=[];
 arr.forEach(r=>{
  if(r&&r.cat==='jurnal'){const t=fromOld(r);if(t&&!S.trades.some(x=>x.id===t.id))S.trades.push(t);mig=true}
  else{const n=normNote(r);if(n)S.notes.push(n)}});
 if(mig){saveTrades();saveNotes()}}

// ---------- gambar bukti (IndexedDB) ----------
const idb=(()=>{let p=null;
 const open=()=>p||(p=new Promise((ok,no)=>{if(!window.indexedDB){no(new Error('IndexedDB tidak tersedia'));return}const r=indexedDB.open('tc-journal',1);r.onupgradeneeded=()=>r.result.createObjectStore('img');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}).catch(e=>{p=null;throw e}));
 const tx=(m,f)=>open().then(db=>new Promise((ok,no)=>{const t=db.transaction('img',m),r=f(t.objectStore('img'));t.oncomplete=()=>ok(r&&r.result);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error)}));
 return{get:id=>tx('readonly',s=>s.get(id)),put:(id,b)=>tx('readwrite',s=>s.put(b,id)),del:id=>tx('readwrite',s=>s.delete(id))}})();
// Mode Live: gambar juga disimpan di server (shared/live.js). IndexedDB tetap cache lokal; gambar yang belum ada di perangkat ini diunduh dari server.
const LI=()=>window.Live&&Live.on&&Live.img||null;
const img={
 get:async id=>{let b=await idb.get(id).catch(()=>null);if(!b&&LI()){b=await LI().down(id).catch(()=>null);if(b)idb.put(id,b).catch(()=>{})}return b||undefined},
 put:async(id,b)=>{await idb.put(id,b);const l=LI();if(l)l.up(id)},
 del:async id=>{await idb.del(id);const l=LI();if(l)l.rm(id)}};
if(window.Live&&Live.bindImages)Live.bindImages({get:idb.get});
// perkecil gambar (maks 1400px) lalu jadikan WebP/JPEG
async function shrink(file){
 let bmp;try{bmp=await createImageBitmap(file)}catch(e){bmp=await new Promise((ok,no)=>{const u=URL.createObjectURL(file),i=new Image();i.onload=()=>{URL.revokeObjectURL(u);ok(i)};i.onerror=()=>{URL.revokeObjectURL(u);no(new Error('Gambar tidak bisa dibaca'))};i.src=u})}
 const w=bmp.width||bmp.naturalWidth,h=bmp.height||bmp.naturalHeight,k=Math.min(1,1400/Math.max(w,h)),c=document.createElement('canvas');
 c.width=Math.max(1,Math.round(w*k));c.height=Math.max(1,Math.round(h*k));c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
 let b=await new Promise(ok=>c.toBlob(ok,'image/webp',.82));if(!b||b.type!=='image/webp')b=await new Promise(ok=>c.toBlob(ok,'image/jpeg',.85));
 if(!b)throw new Error('Gambar tidak bisa diproses');return b}
const blobData=b=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(r.error);r.readAsDataURL(b)});

// ---------- ekspor / impor ----------
async function exportAll(){
 const trades=[];
 for(const t of S.trades){const images=[];for(const id of t.imgs){try{const b=await idb.get(id);if(b)images.push({id,data:await blobData(b)})}catch(e){}}trades.push({...t,images})}
 return{app:'terminal-chart-notes',v:2,exported:new Date().toISOString(),notes:S.notes.map(({t,s,p,...r})=>r),trades}}
async function importAll(d){
 const res={notes:0,trades:0,images:0};
 const nIds=new Set(S.notes.map(n=>n.id)),tIds=new Set(S.trades.map(t=>t.id));
 const na=Array.isArray(d)?d:(d&&d.notes)||[],ta=(d&&!Array.isArray(d)&&d.trades)||[];
 if(!Array.isArray(na)||!Array.isArray(ta))throw new Error('format');
 na.slice(0,5000).forEach(r=>{
  if(r&&r.cat==='jurnal'){const t=fromOld(r);if(t&&!tIds.has(t.id)){S.trades.push(t);tIds.add(t.id);res.trades++}}
  else{const n=normNote(r);if(n&&!nIds.has(n.id)){S.notes.push(n);nIds.add(n.id);res.notes++}}});
 for(const r of ta.slice(0,20000)){
  const t=normTrade(r);if(!t||tIds.has(t.id))continue;
  const ok=[];
  for(const im of(Array.isArray(r.images)?r.images:[]).slice(0,8)){
   if(!im||typeof im.data!=='string'||!/^data:image\/(webp|jpeg|png|gif);base64,/.test(im.data)||!t.imgs.includes(String(im.id)))continue;
   try{const b=await(await fetch(im.data)).blob();await idb.put(String(im.id),b);ok.push(String(im.id));res.images++}catch(e){}}
  t.imgs=ok;S.trades.push(t);tIds.add(t.id);res.trades++}
 if(res.notes)saveNotes();if(res.trades)saveTrades();return res}

return{u:{ic,I,esc,pad,iso,today,fd,fdl,uid,rp,short,parseRp,pl,clean,lines},
 store:{get notes(){return S.notes},get trades(){return S.trades},load,saveNotes,saveTrades,normNote,normTrade,deriveNote,img:{get:img.get,put:img.put,del:img.del,shrink},exportAll,importAll},
 views:{},view(v){this.views[v.id]=v}}})();
