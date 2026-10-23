// Indikator custom (JS atau subset Pine). Kode pengguna HANYA dijalankan di Web Worker terisolasi (tanpa DOM, tanpa jaringan, batas waktu 5 detik).
// Format JS: badan fungsi dengan variabel open, high, low, close, volume, time (array), p (parameter), ta, plot(), hline(), marker().
//   //@input period 14 2 200     <- deklarasi parameter: nama, bawaan, min, maks (opsional)
//   //@overlay true
// Pine: interpreter v5 penuh (pine/*.js): var/varip, if/for/while/switch, fungsi buatan, tuple, type/method, array/map, ta.* (60+), str/math/color,
// input.*, plot*/fill/bgcolor/barcolor/hline/alertcondition, label/line/box, request.security, strategy.* (entry/exit/close + laporan).
const ChartCustom=(()=>{
const LKEY='tc.chart.ci',TIMEOUT=5000;

// Kode worker ada di worker.js (berkas terpisah, CSP sendiri).
// ---------- sisi halaman ----------
let RID=0;const WURL='apps/chart/worker.js';
const H={fetch:null};   // chart.js mengisi H.fetch(sym,sec) -> Promise<{t,o,h,l,c,v}[]> untuk request.security
function exec(lang,src,p,D,ctx){ctx=ctx||{};return new Promise((res,rej)=>{
 const f=k=>D.map(b=>b[k]),bars={t:f('t'),o:f('o'),h:f('h'),l:f('l'),c:f('c'),v:f('v')},sec={},opts={sym:ctx.sym||'SYMBOL',tfSec:ctx.tfSec||(D.length>1?D[1].t-D[0].t:3600),mintick:ctx.mintick||.01,live:false};let rounds=0;
 const go=()=>{let wk;try{wk=new Worker(WURL)}catch(e){return rej(new Error('Worker tidak dapat dimuat (butuh halaman dari server http/https, bukan file://)'))}
  const id=++RID,t=setTimeout(()=>{wk.terminate();rej(new Error('Batas waktu 5 detik terlampaui (loop tak berujung?)'))},TIMEOUT);
  wk.onmessage=e=>{clearTimeout(t);wk.terminate();const d=e.data;
   if(d.err)return rej(new Error(d.err));
   if(d.need){if(++rounds>6)return rej(new Error('request.security terlalu banyak (maks. 6 sumber data)'));if(!H.fetch)return rej(new Error('request.security belum tersedia di sini'));
    H.fetch(d.need.sym,d.need.sec).then(bs=>{if(!bs||!bs.length)throw new Error('Data '+d.need.sym+' '+d.need.tf+' tidak tersedia');const g=k=>bs.map(b=>b[k]);sec[d.need.sym+'|'+d.need.sec]={t:g('t'),o:g('o'),h:g('h'),l:g('l'),c:g('c'),v:g('v')};go()}).catch(er=>rej(new Error('request.security: '+(er.message||er))));return}
   res(d)};
  wk.onerror=e=>{clearTimeout(t);wk.terminate();rej(new Error(e.message||'Error di worker'))};
  wk.postMessage({id,lang,src,p,bars,sec,opts})};go()})}

// meta dari kode (tanpa menjalankan): parameter dan overlay
function meta(lang,src){const inputs=[];let overlay=false;
 if(lang==='pine'){if(/indicator\s*\([^)]*overlay\s*=\s*true/.test(src))overlay=true;
  for(const m of src.matchAll(/^\s*(?:\w+\s+)?(\w+)\s*=\s*input\.(int|float)\s*\(\s*([-\d.]+)([^)]*)\)/gm)){const mi=/minval\s*=\s*([-\d.]+)/.exec(m[4]),ma=/maxval\s*=\s*([-\d.]+)/.exec(m[4]),ti=/title\s*=\s*"([^"]*)"/.exec(m[4])||/,\s*"([^"]*)"/.exec(m[4]);inputs.push({key:m[1],label:ti?ti[1]:m[1],def:+m[3],min:mi?+mi[1]:undefined,max:ma?+ma[1]:undefined})}}
 else{for(const m of src.matchAll(/^\s*\/\/@input\s+(\w+)\s+([-\d.]+)(?:\s+([-\d.]+))?(?:\s+([-\d.]+))?/gm))inputs.push({key:m[1],label:m[1],def:+m[2],min:m[3]!=null?+m[3]:undefined,max:m[4]!=null?+m[4]:undefined});
  const o=/^\s*\/\/@overlay\s+(true|false)/m.exec(src);overlay=!!(o&&o[1]==='true')}
 return{inputs,overlay}}

// def untuk render.js; plots diketahui setelah eksekusi pertama
function def(inst){const m=meta(inst.lang||'js',inst.src||''),r=inst._res;
 return{name:inst.name||'Custom',short:inst.name||'Custom',overlay:r&&r.overlay!=null?r.overlay:m.overlay,inputs:r&&r.inputs&&r.inputs.length?r.inputs:m.inputs,plots:r?r.plots:[],levels:r?r.levels:[],markers:r?r.markers:null,fills:r&&r.fills||[],bg:r&&r.bg,barcol:r&&r.barcol,candles:r&&r.candles||[],objs:r&&r.objs||[],alerts:r&&r.alerts||[],run:null}}
const COL=['#e8a33d','#5aa9ff','#b58cff','#ff7ad9','#3ecf8e','#ff6b6b','#4dd0e1','#c0ca33'];
function series(inst,D,key,done,ctx){
 if(inst._ck===key&&inst._res)return build(inst);
 if(inst._runKey!==key){inst._runKey=key;const lang=inst.lang||'js',known=inst._res&&inst._res.inputs&&inst._res.inputs.length?inst._res.inputs:meta(lang,inst.src||'').inputs,p=lang==='pine'?{...(inst.p||{})}:{};
  if(lang!=='pine')for(const i of known)p[i.key]=inst.p&&inst.p[i.key]!==undefined?inst.p[i.key]:i.def;
  exec(lang,inst.src||'',p,D,ctx).then(r=>{if(inst._runKey!==key)return;const o=r.ok;o.plots.forEach((pl,i)=>{pl.c=pl.c||COL[i%COL.length];if(lang==='pine')pl.px=1;pl.k=pl.k+(o.plots.slice(0,i).some(q=>q.k===pl.k)?'#'+i:'')});inst._res=o;inst._ck=key;inst.err=null;done()}).catch(e=>{if(inst._runKey!==key)return;inst.err=e.message;inst._res=inst._res||{overlay:null,plots:[],levels:[],markers:[]};inst._ck=key;console.warn('Indikator custom:',e.message);done()})}
 return inst._res&&inst._ck===key?build(inst):null}
function build(inst){const r=inst._res,d=def(inst);if(inst.err)d.name=(inst.name||'Custom')+' - galat: '+inst.err;const s={};r.plots.forEach(pl=>{s[pl.k]=pl.data});const p={};for(const i of d.inputs)p[i.key]=inst.p&&inst.p[i.key]!==undefined?inst.p[i.key]:i.def;return{p,series:s,def:d}}

// ---------- penyimpanan: server (bila login) atau lokal ----------
const jl=()=>{try{return JSON.parse(localStorage.getItem(LKEY)||'[]')}catch(e){return[]}};
const srv=()=>typeof apiOn==='function'&&apiOn()&&typeof sessToken==='function'&&!!sessToken();
const api=async(p,o={})=>{const r=await apiFetch(p,{...o,headers:{'content-type':'application/json',...(o.headers||{})}});if(!r.ok){let m='HTTP '+r.status;try{m=(await r.json()).error||m}catch(e){}throw new Error(m)}return r.json()};
async function list(){const loc=jl().map(x=>({id:x.id,name:x.name,language:x.language,source:x.source,version:x.version||1,mine:true}));
 if(!srv())return loc;try{const a=await api('/api/indicators?limit=100'),b=await api('/api/indicators?scope=public&limit=30');const ids=new Set(a.map(x=>x.id));return[...loc,...a.map(x=>({...x,mine:true})),...b.filter(x=>!ids.has(x.id)&&!x.mine).map(x=>({...x,mine:false}))]}catch(e){return loc}}
async function full(m){if(m.source!=null)return m;try{return{...m,...(await api('/api/indicators/'+m.id))}}catch(e){return m}}
async function save(item,o){const body={name:o.name,language:o.language,source:o.source,overlay:meta(o.language,o.source).overlay,inputs:meta(o.language,o.source).inputs,isPublic:!!o.isPublic};
 if(srv()&&(!item||/^[0-9a-f-]{36}$/.test(item.id))){if(item&&item.mine===false)return api('/api/indicators/'+item.id+'/fork',{method:'POST',body:'{}'});return item?api('/api/indicators/'+item.id,{method:'PUT',body:JSON.stringify(body)}):api('/api/indicators',{method:'POST',body:JSON.stringify(body)})}
 const L=jl(),id=item&&!/^[0-9a-f-]{36}$/.test(item.id)?item.id:'l'+Math.random().toString(36).slice(2,8),i=L.findIndex(x=>x.id===id),r={id,name:o.name,language:o.language,source:o.source,version:i>=0?(L[i].version||1)+(L[i].source!==o.source?1:0):1};i>=0?L[i]=r:L.push(r);localStorage.setItem(LKEY,JSON.stringify(L));return r}
async function remove(item){if(srv()&&/^[0-9a-f-]{36}$/.test(item.id))return api('/api/indicators/'+item.id,{method:'DELETE'});localStorage.setItem(LKEY,JSON.stringify(jl().filter(x=>x.id!==item.id)))}

const TPL={js:`//@input period 14 2 200
//@overlay false
// Tersedia: open, high, low, close, volume, time (array), p.period, ta.*, plot(), hline(), marker()
const r = ta.rsi(close, p.period);
plot('RSI', r, { color: 'purple' });
hline(70); hline(30);
// Sinyal: panah saat RSI keluar dari area jenuh jual
const up = ta.crossover(r, 30);
up.forEach((v, i) => { if (v) marker(i, 'up', { color: 'green' }); });
`,pine:`//@version=6
indicator("Bollinger + MACD warna", overlay=true)
len  = input.int(20, "Panjang", minval=1, group="Bollinger")
mult = input.float(2.0, "Pengali", minval=0.1, step=0.1, group="Bollinger")
src  = input.source(close, "Sumber")
colUp = input.color(color.new(color.teal, 0), "Warna atas")
[mid, up, lo] = ta.bb(src, len, mult)
pm = plot(mid, "Tengah", color=color.orange)
pu = plot(up, "Atas", color=colUp)
pl = plot(lo, "Bawah", color=colUp)
fill(pu, pl, color=color.new(colUp, 90), title="Latar")
// tanda saat harga menembus pita
plotshape(ta.crossover(close, up), "Tembus atas", shape.triangledown, location.abovebar, color.red, text="Jual")
plotshape(ta.crossunder(close, lo), "Tembus bawah", shape.triangleup, location.belowbar, color.green, text="Beli")
bgcolor(close > up ? color.new(color.red, 92) : close < lo ? color.new(color.green, 92) : na)
alertcondition(ta.crossover(close, up), "Tembus atas", "Harga menembus pita atas")
`};
const esc=s=>String(s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
// editor: item=null untuk baru. h={modal,closeModal,fork}
function edit(w,item,done,h){
 (item?full(item):Promise.resolve(null)).then(it=>{const lang=it?it.language:'js',fork=it&&it.mine===false;
  const body=`<label class="ct-f"><span>Nama</span><input name="n" maxlength="60" required value="${esc(it?it.name+(fork?' (salinan)':''):'Indikator baru')}"></label><label class="ct-f"><span>Bahasa</span><select name="l"><option value="js"${lang==='js'?' selected':''}>JavaScript</option><option value="pine"${lang==='pine'?' selected':''}>Pine (subset v5)</option></select></label><textarea name="s" class="ct-code" spellcheck="false" rows="16" aria-label="Kode">${esc(it?it.source||'':TPL.js)}</textarea><p class="ct-em" data-msg>Kode berjalan di Web Worker terisolasi (tanpa jaringan, batas 5 detik).</p>${srv()?'<label class="ct-f"><span>Publik</span><input type="checkbox" name="pub"'+(it&&it.isPublic?' checked':'')+'></label>':''}`;
  const fm=h.modal(w,it&&!fork?'Ubah indikator':fork?'Fork indikator':'Indikator baru',body,f=>{
   const o={name:f.n.value.trim(),language:f.l.value,source:f.s.value,isPublic:f.pub&&f.pub.checked};if(!o.name)return false;
   const bars=w._r&&w._r.tabs.find(t=>t.id===w._r.act);
   save(fork?it:it,o).then(r=>done(r)).catch(e=>{done(null);console.warn(e)});return true},{wide:1,okText:'Simpan',extra:[['test','Uji','']].concat(it&&!fork?[['del','Hapus','ct-dng']]:[]),on:{
    test:fm=>{const T=w._r.tabs.find(t=>t.id===w._r.act),msg=fm.querySelector('[data-msg]');if(!T||!T.D){msg.textContent='Data chart belum dimuat.';return}msg.textContent='Menjalankan\u2026';
     const l=fm.l.value,s=fm.s.value,p={};if(l!=='pine')for(const i of meta(l,s).inputs)p[i.key]=i.def;
     exec(l,s,p,T.D,{sym:T.sym,tfSec:ChartRender.TFS[T.tf]}).then(r=>{const o=r.ok;msg.className='ct-em ok';msg.textContent='OK: '+o.plots.length+' plot, '+o.markers.length+' penanda'+(o.objs.length?', '+o.objs.length+' objek':'')+(o.fills.length?', '+o.fills.length+' fill':'')+(o.inputs.length?', '+o.inputs.length+' input':'')+'.'}).catch(e=>{msg.className='ct-em bad';msg.textContent=e.message})},
    del:(fm,close)=>{h.closeModal(w);remove(it).then(()=>done(null))}}});
  fm.l.onchange=()=>{const cur=fm.s.value.trim();if(!cur||cur===TPL.js.trim()||cur===TPL.pine.trim())fm.s.value=TPL[fm.l.value]}})}

return{def,series,list,full,edit,meta,exec,TPL,hook:H};
})();
