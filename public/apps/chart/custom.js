// Indikator custom (JS atau subset Pine). Kode pengguna HANYA dijalankan di Web Worker terisolasi (tanpa DOM, tanpa jaringan, batas waktu 5 detik).
// Format JS: badan fungsi dengan variabel open, high, low, close, volume, time (array), p (parameter), ta, plot(), hline(), marker().
//   //@input period 14 2 200     <- deklarasi parameter: nama, bawaan, min, maks (opsional)
//   //@overlay true
// Pine: subset v5 (indicator, input.*, ta.sma/ema/rma/wma/rsi/stdev/highest/lowest/change/crossover/crossunder/tr/atr/macd/bb, plot, hline, plotshape). if/for/fungsi buatan belum didukung.
const ChartCustom=(()=>{
const LKEY='tc.chart.ci',TIMEOUT=5000;

// Kode worker ada di worker.js (berkas terpisah, CSP sendiri).
// ---------- sisi halaman ----------
let RID=0;const WURL='apps/chart/worker.js';
function exec(lang,src,p,D){return new Promise((res,rej)=>{let wk;try{wk=new Worker(WURL)}catch(e){return rej(new Error('Worker tidak dapat dimuat (butuh halaman dari server http/https, bukan file://)'))}const id=++RID,t=setTimeout(()=>{wk.terminate();rej(new Error('Waktu habis (>5 detik): periksa perulangan tak berujung'))},TIMEOUT);
 wk.onmessage=e=>{clearTimeout(t);wk.terminate();e.data.err?rej(new Error(e.data.err)):res(e.data)};wk.onerror=e=>{clearTimeout(t);wk.terminate();rej(new Error(e.message||'Error di worker'))};
 const f=k=>D.map(b=>b[k]);wk.postMessage({id,lang,src,p,bars:{t:f('t'),o:f('o'),h:f('h'),l:f('l'),c:f('c'),v:f('v')}})})}

// meta dari kode (tanpa menjalankan): parameter dan overlay
function meta(lang,src){const inputs=[];let overlay=false;
 if(lang==='pine'){if(/indicator\s*\([^)]*overlay\s*=\s*true/.test(src))overlay=true;
  for(const m of src.matchAll(/^\s*(?:\w+\s+)?(\w+)\s*=\s*input\.(int|float)\s*\(\s*([-\d.]+)([^)]*)\)/gm)){const mi=/minval\s*=\s*([-\d.]+)/.exec(m[4]),ma=/maxval\s*=\s*([-\d.]+)/.exec(m[4]),ti=/title\s*=\s*"([^"]*)"/.exec(m[4])||/,\s*"([^"]*)"/.exec(m[4]);inputs.push({key:m[1],label:ti?ti[1]:m[1],def:+m[3],min:mi?+mi[1]:undefined,max:ma?+ma[1]:undefined})}}
 else{for(const m of src.matchAll(/^\s*\/\/@input\s+(\w+)\s+([-\d.]+)(?:\s+([-\d.]+))?(?:\s+([-\d.]+))?/gm))inputs.push({key:m[1],label:m[1],def:+m[2],min:m[3]!=null?+m[3]:undefined,max:m[4]!=null?+m[4]:undefined});
  const o=/^\s*\/\/@overlay\s+(true|false)/m.exec(src);overlay=!!(o&&o[1]==='true')}
 return{inputs,overlay}}

// def untuk render.js; plots diketahui setelah eksekusi pertama
function def(inst){const m=meta(inst.lang||'js',inst.src||''),r=inst._res;
 return{name:inst.name||'Custom',short:inst.name||'Custom',overlay:r&&r.overlay!=null?r.overlay:m.overlay,inputs:m.inputs,plots:r?r.plots:[],levels:r?r.levels:[],markers:r?r.markers:null,fills:[],run:null}}
const COL=['#e8a33d','#5aa9ff','#b58cff','#ff7ad9','#3ecf8e','#ff6b6b','#4dd0e1','#c0ca33'];
function series(inst,D,key,done){
 if(inst._ck===key&&inst._res)return build(inst);
 if(inst._runKey!==key){inst._runKey=key;const p={};for(const i of meta(inst.lang||'js',inst.src||'').inputs)p[i.key]=inst.p&&inst.p[i.key]!==undefined?inst.p[i.key]:i.def;
  exec(inst.lang||'js',inst.src||'',p,D).then(r=>{if(inst._runKey!==key)return;const o=r.ok;o.plots.forEach((pl,i)=>{pl.c=pl.c||COL[i%COL.length];pl.k=pl.k+(o.plots.slice(0,i).some(q=>q.k===pl.k)?'#'+i:'')});inst._res=o;inst._ck=key;inst.err=null;done()}).catch(e=>{if(inst._runKey!==key)return;inst.err=e.message;inst._res=inst._res||{overlay:null,plots:[],levels:[],markers:[]};inst._ck=key;console.warn('Indikator custom:',e.message);done()})}
 return inst._res&&inst._ck===key?build(inst):null}
function build(inst){const r=inst._res,d=def(inst);if(inst.err)d.name=(inst.name||'Custom')+' \u26a0 '+inst.err;const s={};r.plots.forEach(pl=>{s[pl.k]=pl.data});const p={};for(const i of d.inputs)p[i.key]=inst.p&&inst.p[i.key]!==undefined?inst.p[i.key]:i.def;return{p,series:s,def:d}}

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
`,pine:`//@version=5
indicator("Contoh EMA Cross", overlay=true)
fast = input.int(12, "Cepat", minval=1)
slow = input.int(26, "Lambat", minval=1)
a = ta.ema(close, fast)
b = ta.ema(close, slow)
plot(a, title="EMA cepat", color=color.blue)
plot(b, title="EMA lambat", color=color.orange)
plotshape(ta.crossover(a, b), style=shape.triangleup, color=color.green)
plotshape(ta.crossunder(a, b), style=shape.triangledown, color=color.red)
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
     const l=fm.l.value,s=fm.s.value,p={};for(const i of meta(l,s).inputs)p[i.key]=i.def;
     exec(l,s,p,T.D).then(r=>{msg.className='ct-em ok';msg.textContent='OK: '+r.ok.plots.length+' plot, '+r.ok.markers.length+' penanda.'}).catch(e=>{msg.className='ct-em bad';msg.textContent=e.message})},
    del:(fm,close)=>{h.closeModal(w);remove(it).then(()=>done(null))}}});
  fm.l.onchange=()=>{const cur=fm.s.value.trim();if(!cur||cur===TPL.js.trim()||cur===TPL.pine.trim())fm.s.value=TPL[fm.l.value]}})}

return{def,series,list,full,edit,meta,exec,TPL};
})();
