// Mode Live: harga nyata ke WATCH, sinkron state app, catatan/jurnal (termasuk gambar bukti), pengaturan Umum/Background, dan alert ke server. Tidak aktif (tidak melakukan apa pun) saat mode Dummy.
// Cara kerja: sebelum app dimuat, Live.ready mengambil data server dan menulisnya ke localStorage (format yang sudah dipakai tiap app).
// Sesudah itu setiap localStorage.setItem pada key yang disinkronkan dikirim ke server (ditunda 1,5 dtk).
(()=>{
const on=()=>typeof apiOn==='function'&&apiOn()&&!!sessToken();
const BLOB={'tc.watchlist':'watchlist','tc.news':'news','tc.maps':'maps','tc.chart.tabs':'chart.tabs'};
const KN='tc.notes',KJ='tc.journal';
const KCFG='tc.cfg',KBG='bg',KBGI='bg.img',KBGV='bg.img.v';   // pengaturan: tc.cfg (hanya tema/simbol/tf/gerakan; blok api TIDAK pernah dikirim), bg, gambar background
const Live={on:false,extra:{},ready:Promise.resolve(),status:'dummy',q:{state:'idle',err:null,at:0,n:0}};window.Live=Live;
const api=async(path,opt={})=>{const r=await apiFetch(path,{...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});if(!r.ok){const e=new Error('HTTP '+r.status);e.status=r.status;throw e}return r.status===204?null:r.json()};
const put=(path,body)=>api(path,{method:'PUT',body:JSON.stringify(body)});
let hydrating=false;
const raw=Storage.prototype.setItem,rawRm=Storage.prototype.removeItem;
const write=(k,v)=>{hydrating=true;try{raw.call(localStorage,k,v)}finally{hydrating=false}};
const unwrite=k=>{hydrating=true;try{rawRm.call(localStorage,k)}finally{hydrating=false}};

// ---------- harga ----------
// Status terakhir ada di Live.q ('idle' | 'ok' | 'err'). Event 'tc:quotes' saat berhasil, 'tc:qfail' saat gagal.
// Tidak ada angka cadangan: gagal = harga tetap kosong (atau yang terakhir nyata), dan penyebabnya dijelaskan oleh shared/fault.js.
async function pullQuotes(){
 const syms=WATCH.map(r=>r[0]);let n=0;
 for(let i=0;i<syms.length;i+=50){
  const list=await apiJson('/api/quotes?symbols='+syms.slice(i,i+50).join(','));
  if(!Array.isArray(list))throw new ApiError('parse',{path:'/api/quotes'});
  for(const q of list){const r=WATCH.find(x=>x[0]===q.sym);if(!r||!(q.price>0))continue;r[2]=q.price;r[3]=q.changePct;Live.extra[q.sym]={vr:q.volRatio,rsi:q.rsi14,pos:q.pos52w,spark:q.spark};n++}}
 return n}
let pulling=null;
Live.pull=()=>pulling||(pulling=(async()=>{
 try{const n=await pullQuotes();if(!n)throw new ApiError('empty',{what:'quotes',path:'/api/quotes'});Live.q={state:'ok',err:null,at:Date.now(),n};window.dispatchEvent(new Event('tc:quotes'));return n}
 catch(e){Live.q={state:'err',err:e,at:Date.now(),n:0};window.dispatchEvent(new Event('tc:qfail'));throw e}
 finally{pulling=null}})());
const quotesTick=async()=>{if(document.hidden)return;try{await Live.pull()}catch(e){}};

// ---------- pengaturan Umum + Background ----------
// Server menyimpan {theme, defaultSymbol, defaultTf, background, reduceMotion} dan satu gambar background sendiri.
// CFG dan core.js sudah dibuat dari localStorage sebelum hidrasi selesai, jadi hasil hidrasi diterapkan lewat Live.applySettings() (dipanggil index.html sebelum app dimuat).
const PREF_DEF={theme:'auto',defaultSymbol:'BTCUSDT',defaultTf:'1h',background:'angin',reduceMotion:null};
const prefsNow=()=>{let bg=null;try{bg=localStorage.getItem(KBG)}catch(e){}return{theme:CFG.theme,defaultSymbol:CFG.sym,defaultTf:CFG.tf,background:bg||'angin',reduceMotion:typeof CFG.still==='boolean'?CFG.still:null}};
let lastPrefs='',srvBg=null,prefsLoaded=false;
const isDefault=p=>Object.keys(PREF_DEF).every(k=>p[k]===PREF_DEF[k]);
function applyPrefs(p){
 if(p.theme)CFG.theme=p.theme;if(p.defaultSymbol)CFG.sym=p.defaultSymbol;if(p.defaultTf)CFG.tf=p.defaultTf;
 if('reduceMotion' in p)CFG.still=p.reduceMotion;
 write(KCFG,JSON.stringify(CFG));if(p.background)write(KBG,p.background);
 lastPrefs=JSON.stringify(prefsNow())}
async function syncPrefs(){
 const p=prefsNow(),now=JSON.stringify(p);if(now===lastPrefs)return;
 const prev=lastPrefs?JSON.parse(lastPrefs):null,body=prev?Object.fromEntries(Object.entries(p).filter(([k,x])=>x!==prev[k])):p;   // hanya yang berubah, supaya perangkat dengan data lama tidak menimpa kunci lain
 await put('/api/settings/preferences',body);lastPrefs=now}
const dataToBlob=u=>{const m=/^data:([^;,]+);base64,(.*)$/.exec(u||'');if(!m)return null;const s=atob(m[2]),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new Blob([a],{type:m[1]})};
const blobToData=async b=>{const a=new Uint8Array(await b.arrayBuffer());let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode.apply(null,a.subarray(i,i+32768));return 'data:'+(b.type||'image/webp')+';base64,'+btoa(s)};
const bgLocal=()=>{try{return localStorage.getItem(KBGI)}catch(e){return null}};
async function bgUp(u){
 const b=dataToBlob(u);if(!b)return;
 const r=await apiFetch('/api/settings/background-image',{method:'PUT',headers:{'content-type':b.type},body:b});
 if(r.ok){write(KBGV,String((await r.json()).ts));return}
 if(r.status>=400&&r.status<500&&![401,408,429].includes(r.status)){console.warn('[live] gambar background ditolak server',r.status);return}   // mis. >3 MB: tidak diulang
 throw new Error('HTTP '+r.status)}
async function bgDel(){const r=await apiFetch('/api/settings/background-image',{method:'DELETE'});if(!r.ok)throw new Error('HTTP '+r.status);unwrite(KBGV)}
// samakan gambar lokal dengan server. Berjalan SESUDAH Live.ready (gambar bisa ~2 MB), lalu memuat ulang animasi background
async function bgSync(){
 if(!prefsLoaded)return;                       // hidrasi gagal/timeout: jangan menyimpulkan apa pun soal gambar di server
 try{
  const have=bgLocal();let ver=null;try{ver=localStorage.getItem(KBGV)}catch(e){}
  if(srvBg){
   if(!have||ver!==String(srvBg.ts)){const r=await apiFetch('/api/settings/background-image');if(r.ok){write(KBGI,await blobToData(await r.blob()));write(KBGV,String(srvBg.ts))}}}
  else if(have){
   if(ver){unwrite(KBGI);unwrite(KBGV)}      // pernah tersinkron lalu dihapus di perangkat lain
   else await bgUp(have)}                    // gambar lama yang belum pernah diunggah
  if(!bgLocal()){let b=null;try{b=localStorage.getItem(KBG)}catch(e){}if(b==='custom'){write(KBG,'angin');if(typeof S!=='undefined')S.bg='angin'}}   // dipilih 'custom' tapi gambarnya tidak ada
  if(typeof Bg!=='undefined')Bg.load()}
 catch(e){console.warn('[live] gambar background belum tersinkron:',e.message)}}
Live.applySettings=()=>{
 try{
  applyTheme();
  if(typeof S!=='undefined'){
   let b=null;try{b=localStorage.getItem(KBG)}catch(e){}S.bg=b||'angin';
   S.still=typeof CFG.still==='boolean'?CFG.still:matchMedia('(prefers-reduced-motion: reduce)').matches;
   if(WATCH.some(x=>x[0]===CFG.sym))S.sym=CFG.sym;if(['1m','5m','1h','1D'].includes(CFG.tf))S.tf=CFG.tf}
  if(typeof Bg!=='undefined')Bg.load()}
 catch(e){console.warn('[live] applySettings',e.message)}};
// dipakai tombol "Reset semua pengaturan": kosongkan di server juga, kalau tidak hidrasi berikutnya mengembalikannya
Live.resetSettings=async()=>{if(!Live.on)return;try{await api('/api/settings/preferences',{method:'DELETE'})}catch(e){console.warn('[live] reset pengaturan gagal',e.message)}};

// ---------- hydrate dari server ----------
async function hydrate(){
 const [st,notes,trades,sv]=await Promise.all([api('/api/state'),api('/api/notes?limit=1000'),api('/api/journal/trades?limit=2000'),api('/api/settings/preferences')]);
 const up=[];
 const {bgImage,...sp}=sv||{};srvBg=bgImage||null;prefsLoaded=true;
 if(Object.keys(sp).length)applyPrefs(sp);                                   // server menang
 else{lastPrefs='';const p=prefsNow();if(!isDefault(p))up.push(put('/api/settings/preferences',p).then(()=>{lastPrefs=JSON.stringify(p)}).catch(()=>{}))}   // pertama kali: unggah pengaturan lokal yang sudah diubah
 for(const [lk,key] of Object.entries(BLOB)){
  if(st[key]&&st[key].data)write(lk,JSON.stringify(st[key].data));
  else{const v=localStorage.getItem(lk);if(v)up.push(put('/api/state/'+key,{data:JSON.parse(v)}).catch(()=>{}))}}
 const ln=readLocal(KN),lj=readLocal(KJ);
 if(notes.length||trades.length){
  // server menang. Catatan awal bawaan aplikasi (seed) diganti isi server.
  write(KN,JSON.stringify({v:2,notes}));write(KJ,JSON.stringify({v:1,trades}));
 }else if((ln&&ln.notes&&ln.notes.length)||(lj&&lj.trades&&lj.trades.length)){
  up.push(api('/api/import',{method:'POST',body:JSON.stringify({notes:(ln&&ln.notes)||[],trades:(lj&&lj.trades)||[]})}).catch(()=>{}))}
 try{const me=(await api('/api/auth/me')).user,u=Auth.mine&&Auth.mine();if(me&&me.avatar&&u&&!Auth.avatar(u.id))write('tc.av.'+u.id,me.avatar)}catch(e){}
 snapNotes(readLocal(KN));snapTrades(readLocal(KJ));
 await Promise.all(up)}
const readLocal=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}};

// ---------- tulis-balik ----------
const timers={};let chain=Promise.resolve();
const enqueue=fn=>{chain=chain.then(fn).catch(e=>console.warn('[live] sinkron gagal',e.message))};
const snapN=new Map(),snapT=new Map();
const snapNotes=j=>{snapN.clear();((j&&j.notes)||[]).forEach(n=>snapN.set(n.id,n.upd))};
const snapTrades=j=>{snapT.clear();((j&&j.trades)||[]).forEach(t=>snapT.set(t.id,t.upd))};
async function diff(items,snap,base){
 const seen=new Set();
 for(const it of items){seen.add(it.id);if(snap.get(it.id)!==it.upd){await put(`${base}/${encodeURIComponent(it.id)}`,it);snap.set(it.id,it.upd)}}
 for(const id of [...snap.keys()])if(!seen.has(id)){await api(`${base}/${encodeURIComponent(id)}`,{method:'DELETE'}).catch(e=>{if(e.status!==404)throw e});snap.delete(id)}}
async function alerts(wl){
 const want=(wl&&wl.al)||{},srv=await api('/api/alerts?active=1');
 for(const a of srv){const w=want[a.symbol];if(!w||Math.abs(w.t-a.price)>1e-9)await api('/api/alerts/'+a.id,{method:'DELETE'}).catch(()=>{})}
 for(const [s,w] of Object.entries(want)){const ok=srv.some(a=>a.symbol===s&&Math.abs(w.t-a.price)<=1e-9);if(!ok)await api('/api/alerts',{method:'POST',body:JSON.stringify({symbol:s,price:w.t})}).catch(()=>{})}}
function flush(k){
 clearTimeout(timers[k]);delete timers[k];
 if(k===KCFG||k===KBG){enqueue(syncPrefs);return}
 if(k===KBGI){enqueue(()=>{const u=bgLocal();return u?bgUp(u):bgDel()});return}
 const j=readLocal(k);if(!j)return;
 if(BLOB[k]){enqueue(()=>put('/api/state/'+BLOB[k],{data:j}));if(k==='tc.watchlist')enqueue(()=>alerts(j))}
 else if(k===KN)enqueue(()=>diff(j.notes||[],snapN,'/api/notes'));
 else if(k===KJ)enqueue(()=>diff(j.trades||[],snapT,'/api/journal/trades'))}
const synced=k=>k in BLOB||k===KN||k===KJ||k===KCFG||k===KBG||k===KBGI;
function install(){
 Storage.prototype.setItem=function(k,v){raw.call(this,k,v);if(this===localStorage&&!hydrating&&Live.on&&synced(k)){clearTimeout(timers[k]);timers[k]=setTimeout(()=>flush(k),1500)}};
 Storage.prototype.removeItem=function(k){rawRm.call(this,k);if(this===localStorage&&!hydrating&&Live.on&&k===KBGI){clearTimeout(timers[k]);timers[k]=setTimeout(()=>flush(k),1500)}};
 const now=()=>Object.keys(timers).forEach(flush);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)now()});addEventListener('pagehide',now)}

// ---------- gambar bukti jurnal ----------
// IndexedDB tetap sumber lokal. Unggahan masuk antrean (id di localStorage 'tc.img.pending') dan diulang sampai server menerima.
// Id gambar = id dari klien (trade.imgs[]), jadi gambar yang sama terbaca di semua perangkat.
const PEND='tc.img.pending';let loc=null,imgBusy=false,imgT=0;
const pend=()=>{try{return new Set(JSON.parse(localStorage.getItem(PEND)||'[]'))}catch(e){return new Set()}};
const pendSave=p=>write(PEND,JSON.stringify([...p]));
const imgUrl=id=>'/api/journal/images/'+encodeURIComponent(id);
async function imgFlush(){
 if(imgBusy||!loc||!Live.on)return;imgBusy=true;
 try{const p=pend();
  for(const id of [...p]){
   const b=await loc.get(id).catch(()=>null);
   if(!b){p.delete(id);pendSave(p);continue}                                  // sudah dihapus lokal
   const r=await apiFetch('/api/journal/images?id='+encodeURIComponent(id),{method:'POST',headers:{'content-type':b.type||'image/webp'},body:b});
   if(r.ok||(r.status>=400&&r.status<500&&![401,408,429].includes(r.status))){p.delete(id);pendSave(p);if(!r.ok)console.warn('[live] gambar ditolak server',id,r.status)}
   else throw new Error('HTTP '+r.status)}}
 catch(e){console.warn('[live] gambar belum terkirim, dicoba lagi:',e.message)}
 finally{imgBusy=false}}
const imgSoon=()=>{clearTimeout(imgT);imgT=setTimeout(imgFlush,600)};
Live.img={
 async down(id){const r=await apiFetch(imgUrl(id));if(r.status===404)return null;if(!r.ok)throw new Error('HTTP '+r.status);return r.blob()},
 up(id){const p=pend();p.add(id);pendSave(p);imgSoon()},
 rm(id){const p=pend();if(p.delete(id))pendSave(p);enqueue(()=>apiFetch(imgUrl(id),{method:'DELETE'}).catch(()=>{}))}};
// dipanggil note/store.js saat dimuat. Gambar yang dirujuk jurnal lokal tapi belum ada di server ikut diantrekan (data lama / sempat offline).
Live.bindImages=l=>{loc=l;if(!Live.on)return;
 setTimeout(async()=>{
  try{const refs=new Set(((readLocal(KJ)||{}).trades||[]).flatMap(t=>t.imgs||[]));
   if(refs.size){const have=new Set((await api('/api/journal/images')).map(x=>x.id)),p=pend();let n=0;
    for(const id of refs)if(!have.has(id)&&!p.has(id)){p.add(id);n++}
    if(n)pendSave(p)}}catch(e){}
  imgFlush()},2000);
 setInterval(()=>{if(!document.hidden&&pend().size)imgFlush()},60000);
 addEventListener('online',imgSoon)};

// ---------- mulai ----------
Live.ready=(async()=>{
 if(!on())return;
 Live.on=true;Live.status='memuat';
 try{
  await Promise.race([Promise.all([Live.pull().catch(()=>0),hydrate()]),new Promise((_,no)=>setTimeout(()=>no(new Error('timeout')),7000))]);
  Live.status='live'}
 catch(e){Live.status='sebagian: '+e.message;console.warn('[live]',e.message)}
 install();setInterval(quotesTick,10000);bgSync()})();
})();
