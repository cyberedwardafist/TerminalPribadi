// Dynamic Island di tengah menubar: pusat pertanyaan, alert, dan pantauan ticker.
// Tampilan (satu per waktu, prioritas naik): watch (standby, ticker+grafik) < hub (opsi, muncul saat kursor ke tengah atas) < panel (isi opsi) < note (alert, ada batas waktu) < ask (pertanyaan)
//   Island.ask({title,msg,input:{label,value},ok,cancel,danger,one}) -> Promise (dipakai dlg.prompt/confirm/alert)
//   Island.notify({title,body,icon,tone,timeout,onClick,key}) -> alert dengan batas waktu (default 6 dtk; kursor di atasnya menahan waktu)
//   Island.hub() membuka hub; Island.clear() menutup alert yang tampil.
// Ganti tampilan = island "ditutup" (mengecil ke tengah) lalu "muncul lagi" dengan isi baru. Pindah halaman di dalam hub/panel mengalir (ukuran berubah tanpa ditutup).
// Hub: Watchlist (kiri: tambah ticker, kanan: kelola) | Alert (kiri: buat, kanan: daftar) | Chart (kiri: buka, kanan: cari simbol).
// Strip watch: klik kiri sel = buka chart simbol itu; klik kanan = buka hub. Ticker dipantau disimpan lokal di 'tc.island'.
(()=>{
if(!document.getElementById('mb'))return;
if(typeof loadCss==='function')loadCss('shared/island.css');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const P=d=>`<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const IC={
 bell:P('<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
 info:P('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
 warn:P('<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>'),
 ok:P('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
 up:P('<path d="m4 16 6-6 4 4 6-7"/><path d="M15 7h5v5"/>'),
 down:P('<path d="m4 8 6 6 4-4 6 7"/><path d="M15 17h5v-5"/>'),
 q:P('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>'),
 list:P('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
 chart:P('<path d="M4 4v16h16"/><path d="M8 15l3-4 3 2 5-6"/>')};
const still=()=>(typeof S!=='undefined'&&S.still)||matchMedia('(prefers-reduced-motion: reduce)').matches;
const fm=v=>typeof f==='function'?f(v):String(v);
const rows=()=>typeof WATCH!=='undefined'?WATCH:[];
const jl=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k)||'null');return v==null?d:v}catch(e){return d}};
const js=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const nm=s=>String(s).replace(/USDT$/,'');
const MAXW=4,CLOSE_MS=440;
let wl=[];                       // ticker yang dipantau (urutan = urutan di strip)
const saveW=()=>js('tc.island',{w:wl});

const el=document.createElement('div');el.id='isl';el.dataset.s='off';el.innerHTML='<div class="isl-c"></div>';document.body.append(el);
const box=el.firstChild;
const PRIO={watch:1,hub:2,panel:3,note:4,ask:5};
const KD={watch:'watch',hub:'panel',panel:'panel',note:'note',ask:'ask'};
let cur=null,q=[],seq=0,tm=0,rem=0,t0=0,bar=null,kd=null,prev=null,off=0,hov=false,armed=true,hideT=0;

// ---------- data ticker ----------
const buf={};
function mkSeries(sym,p){let s=0;for(const c of sym)s=(s*31+c.charCodeAt(0))>>>0;const a=[];let v=p;for(let i=0;i<30;i++){s=(s*1664525+1013904223)>>>0;v*=1+((s/4294967296)-.5)*.012;a.push(v)}const k=p/a[29];return a.map(x=>x*k)}
// Live: kuote nyata dari server (Live.extra). Dummy: deret acak yang diputar tiap 4 dtk (sama seperti data dummy app lain).
function quote(sym){const r=rows().find(x=>x[0]===sym);if(!r)return null;
 if(window.Live&&Live.on){const ex=Live.extra[sym];if(!ex||!(r[2]>0))return null;const sp=(ex.spark||[]).slice(-30);return{p:r[2],c:r[3],ser:sp.length>1?sp.concat([r[2]]):[]}}
 if(!(r[2]>0))return null;   // tanpa server harga = null (data nyata saja): island menampilkan 'menunggu data'
 const b=buf[sym]||(buf[sym]=mkSeries(sym,r[2])),last=b[b.length-1];return{p:last,c:r[3]+(last/r[2]-1)*100,ser:b}}
const stepDummy=()=>{for(const s of wl){const b=buf[s];if(!b)continue;const l=b[b.length-1];b.push(l*(1+(Math.random()-.5)*.0016));b.shift()}};
function resolve(tok){const t=String(tok).trim().toUpperCase().replace(/[^A-Z0-9.^-]/g,'');if(!t)return null;const R=rows();
 const ex=R.find(r=>r[0]===t)||R.find(r=>r[0]===t+'USDT');if(ex)return ex[0];const st=R.filter(r=>r[0].startsWith(t));return st.length===1?st[0][0]:null}
function suggest(tok,skip){const t=String(tok||'').trim().toUpperCase();return rows().filter(r=>!skip.includes(r[0])&&(!t||r[0].includes(t)||r[1].toUpperCase().includes(t))).slice(0,6).map(r=>r[0])}
const tokens=v=>String(v).split(/[\s,;]+/).filter(Boolean);

// ---------- strip watch ----------
function cell(sym){const q=quote(sym),n=nm(sym);
 if(!q||!(q.p>0))return`<button type="button" class="isl-w" data-sym="${esc(sym)}" title="${esc(sym)}"><span class="isl-wl"><b>${esc(n)}</b><small>menunggu data</small></span></button>`;
 const up=q.c>=0;let sv='';
 if(q.ser.length>1){const mn=Math.min(...q.ser),d=Math.max(...q.ser)-mn||1;sv=`<svg viewBox="0 0 52 22" class="isl-sp" aria-hidden="true"><polyline points="${q.ser.map((v,i)=>(i*52/(q.ser.length-1)).toFixed(1)+','+(20-(v-mn)/d*18).toFixed(1)).join(' ')}"/></svg>`}
 return`<button type="button" class="isl-w ${up?'up':'dn'}" data-sym="${esc(sym)}" title="${esc(sym)}"><span class="isl-wl"><b>${esc(n)}</b><small>${esc(fm(q.p))}</small></span>${sv}<span class="isl-wc">${up?'+':'\u2212'}${Math.abs(q.c).toFixed(2).replace('.',',')}%</span></button>`}
function watchHtml(){const avail=Math.max(160,innerWidth-440),n=Math.max(1,Math.min(wl.length,Math.floor(avail/178))),more=wl.length-n;
 return`<div class="isl-wt" role="group" aria-label="Ticker dipantau">${wl.slice(0,n).map(cell).join('')}${more>0?`<button type="button" class="isl-mr" data-more aria-label="${more} ticker lainnya">+${more}</button>`:''}</div>`}

// ---------- markup ----------
const hd=(t,ic,back=true)=>`<div class="isl-h">${back?'<button type="button" class="isl-bk" data-bk aria-label="Kembali">\u2039</button>':''}<span class="isl-i">${IC[ic]}</span><b>${esc(t)}</b></div>`;
const ft=ok=>`<div class="isl-b"><button type="button" data-c>Batal</button><button type="submit" class="go">${ok}</button></div>`;
const row=(s,sub,attr)=>`<div class="isl-r"><b>${esc(nm(s))}</b><small>${sub}</small><button type="button" class="isl-cl" ${attr}="${esc(s)}" aria-label="Hapus ${esc(s)}">\u00d7</button></div>`;
const alerts=()=>{const o=jl('tc.watchlist',null)||{};return o.al||{}};
function panelHtml(it){switch(it.page){
 case'wadd':return`<form class="isl-q">${hd('Pantau ticker','up')}<input class="isl-in" data-i autocomplete="off" spellcheck="false" placeholder="Ketik ticker, mis. BTCUSDT" aria-label="Ticker yang dipantau"><div class="isl-sg"></div><p class="isl-er" hidden></p>${ft('Pantau')}</form>`;
 case'wman':return`<form class="isl-q">${hd('Ticker dipantau','list')}${wl.length?`<div class="isl-ls">${wl.map(s=>row(s,esc((rows().find(r=>r[0]===s)||[])[1]||''),'data-del')).join('')}</div>`:'<p>Belum ada ticker. Pilih Watchlist (klik kiri) untuk menambah.</p>'}<div class="isl-b">${wl.length?'<button type="button" data-all>Hentikan semua</button>':''}<button type="submit" class="go">Selesai</button></div></form>`;
 case'aadd':return`<form class="isl-q">${hd('Alert harga','bell')}<div class="isl-2"><input class="isl-in" data-i="s" autocomplete="off" spellcheck="false" placeholder="Ticker" value="${esc(wl[0]||(typeof S!=='undefined'?S.sym:''))}" aria-label="Ticker"><input class="isl-in" data-i="p" inputmode="decimal" autocomplete="off" placeholder="Harga" aria-label="Harga alert"></div><p class="isl-hn" data-h></p><p class="isl-er" hidden></p>${ft('Pasang')}</form>`;
 case'alist':{const al=alerts(),k=Object.keys(al);return`<form class="isl-q">${hd('Alert aktif','bell')}${k.length?`<div class="isl-ls">${k.map(s=>row(s,(al[s].d>0?'\u2265 ':'\u2264 ')+esc(fm(al[s].t)),'data-del')).join('')}</div>`:'<p>Belum ada alert aktif. Pilih Alert (klik kiri) untuk membuat.</p>'}<div class="isl-b"><button type="submit" class="go">Selesai</button></div></form>`}
 case'copen':return`<form class="isl-q">${hd('Buka chart','chart')}<input class="isl-in" data-i autocomplete="off" spellcheck="false" placeholder="Cari simbol, mis. XAUUSD" aria-label="Simbol chart"><div class="isl-sg"></div>${ft('Buka')}</form>`}
 return''}
function html(it){
 if(it.kind==='watch')return watchHtml();
 if(it.kind==='hub')return`<div class="isl-hb" role="group" aria-label="Opsi island"><button type="button" data-o="w"><span class="isl-i">${IC.up}</span><b>Watchlist</b><small>kiri tambah \u00b7 kanan kelola</small></button><button type="button" data-o="a"><span class="isl-i">${IC.bell}</span><b>Alert</b><small>kiri buat \u00b7 kanan daftar</small></button><button type="button" data-o="c"><span class="isl-i">${IC.chart}</span><b>Chart</b><small>kiri buka \u00b7 kanan cari</small></button></div>`;
 if(it.kind==='panel')return panelHtml(it);
 if(it.kind==='note')return`<div class="isl-n"${it.onClick?' role="button"':''} tabindex="0"><span class="isl-i">${IC[it.icon]||IC.bell}</span><div class="isl-x"><b>${esc(it.title)}</b>${it.body?`<span>${esc(it.body)}</span>`:''}</div><button type="button" class="isl-cl" aria-label="Tutup">\u00d7</button><div class="isl-t"><i></i></div></div>`;
 const o=it.o,ic=o.danger?'warn':o.input!=null?'q':'info';
 return`<form class="isl-q"><div class="isl-h"><span class="isl-i">${IC[ic]}</span><b>${esc(o.title)}</b></div>${o.msg?`<p>${esc(o.msg)}</p>`:''}${o.input!=null?`<input class="isl-in" maxlength="40" value="${esc(o.input.value||'')}" placeholder="${esc(o.input.label||'')}" aria-label="${esc(o.input.label||o.title)}">`:''}<div class="isl-b">${o.one?'':`<button type="button" data-c>${esc(o.cancel||'Batal')}</button>`}<button type="submit" class="go${o.danger?' dng':''}">${esc(o.ok||'OK')}</button></div></form>`}

// ---------- ukuran + tampil/tutup ----------
function measure(){const s=el.style,w0=s.width,h0=s.height,tr=s.transition;
 s.transition='none';s.width='max-content';s.height='auto';
 const r={w:Math.ceil(el.offsetWidth),h:Math.ceil(el.offsetHeight)};
 s.width=w0;s.height=h0;void el.offsetWidth;s.transition=tr;return r}
const fit=()=>{if(el.dataset.s!=='on')return;const m=measure();el.style.width=m.w+'px';el.style.height=m.h+'px'};
function teardown(){clearTimeout(tm);if(bar){bar.cancel();bar=null}if(kd){removeEventListener('keydown',kd,true);kd=null}}

function draw(it){
 el.classList.toggle('still',still());
 el.setAttribute('role',it.kind==='watch'||it.kind==='note'?'status':'dialog');
 if(it.kind==='ask'||it.kind==='panel'||it.kind==='hub'){el.setAttribute('aria-modal','false');el.setAttribute('aria-label',it.kind==='ask'?it.o.title:'Opsi island');el.removeAttribute('aria-live')}
 else{el.removeAttribute('aria-modal');el.removeAttribute('aria-label');it.kind==='note'?el.setAttribute('aria-live','polite'):el.removeAttribute('aria-live')}
 if(it.kind==='ask')el.setAttribute('aria-modal','true');
 box.onclick=box.oncontextmenu=null;box.innerHTML=html(it);el.dataset.k=KD[it.kind];el.dataset.tone=it.tone||'';
 const m=measure();el.dataset.s='on';el.style.width=m.w+'px';el.style.height=m.h+'px';el.classList.remove('swap');
 bind(it)}
function show(it,morph){
 const n=++seq,was=el.dataset.s==='on';cur=it;clearTimeout(off);
 if(!was)return draw(it);
 if(morph){el.classList.add('swap');setTimeout(()=>{if(n===seq)draw(it)},still()?0:100);return}
 // ditutup dulu (mengecil ke tengah), lalu muncul lagi dengan isi baru
 el.dataset.s='off';el.style.width='';el.style.height='';
 setTimeout(()=>{if(n===seq)draw(it)},still()?0:CLOSE_MS)}
function hide(){seq++;cur=null;teardown();el.dataset.s='off';el.style.width='';el.style.height='';clearTimeout(off);
 off=setTimeout(()=>{if(!cur){box.innerHTML='';el.dataset.tone='';el.removeAttribute('role')}},700)}
const baseItem=()=>wl.length?{kind:'watch'}:hov&&armed?{kind:'hub'}:null;
function next(){if(q.length)return show(q.shift());const b=baseItem();b?show(b):hide()}
function finish(it,v){
 if(cur!==it)return;teardown();
 if(prev&&it.kind!=='note'&&it.kind!=='watch'){const p=prev;prev=null;document.contains(p)&&p.focus&&p.focus({preventScroll:true})}
 if(it.kind==='ask')it.res(v);cur=null;next()}
const typed=()=>cur&&cur.kind==='panel'&&[...box.querySelectorAll('input')].some(i=>i.value.trim());
function arrive(it){
 if(!cur)return show(it);
 const c=cur;
 if(PRIO[it.kind]>PRIO[c.kind]&&!(c.kind==='panel'&&typed())){teardown();if(c.kind==='note'&&it.kind==='ask')q.unshift(c);return show(it)}
 if(it.kind==='ask'){const i=q.findIndex(x=>x.kind==='note');i<0?q.push(it):q.splice(i,0,it);return}
 if(it.key&&((c.key===it.key)||q.some(x=>x.key===it.key)))return;
 q.push(it);while(q.filter(x=>x.kind==='note').length>4)q.splice(q.findIndex(x=>x.kind==='note'),1)}
// pindah halaman di dalam hub/panel (user yang memilih). Dari strip watch: ditutup lalu muncul lagi; antar halaman: mengalir.
function nav(page){const c=cur,from=c&&c.kind==='watch';teardown();if(!prev)prev=document.activeElement;
 show(page==='hub'?{kind:'hub',pin:true}:{kind:'panel',page,pin:true},!from)}
const dismiss=it=>{armed=false;finish(it)};
const trap=(fm,onEsc)=>{kd=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onEsc()}
 else if(e.key==='Tab'){const f=[...fm.querySelectorAll('input,button')].filter(x=>!x.disabled&&!x.hidden),i=f.indexOf(document.activeElement);if(!f.length)return;e.preventDefault();f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus()}};addEventListener('keydown',kd,true)};

// ---------- isi per jenis ----------
function bind(it){({watch:bindWatch,hub:bindHub,panel:bindPanel,note:bindNote,ask:bindAsk})[it.kind](it)}

function bindWatch(){
 box.onclick=e=>{const m=e.target.closest('[data-more]');if(m)return nav('wman');const c=e.target.closest('[data-sym]');if(c)goChart(c.dataset.sym)};
 box.oncontextmenu=e=>{e.preventDefault();nav('hub')}}
function goChart(s){if(typeof S==='undefined'||typeof APPS==='undefined'||!APPS.chart)return;if(s)S.sym=S.go=String(s);open('chart')}   // open = window manager core.js (bukan window.open bawaan browser)

function bindHub(it){
 const hb=box.querySelector('.isl-hb');
 const act=(o,right)=>{
  if(o==='w')return nav(right?'wman':'wadd');
  if(o==='a')return nav(right?'alist':'aadd');
  if(right)return nav('copen');
  dismiss(it);goChart()};
 hb.onclick=e=>{const b=e.target.closest('[data-o]');if(b)act(b.dataset.o,false)};
 hb.oncontextmenu=e=>{e.preventDefault();const b=e.target.closest('[data-o]');if(b)act(b.dataset.o,true)};
 trap(hb,()=>dismiss(it))}

function bindPanel(it){
 const fm=box.querySelector('form'),ins=[...fm.querySelectorAll('input')],er=fm.querySelector('.isl-er'),sg=fm.querySelector('.isl-sg');
 const bad=m=>{if(er){er.textContent=m;er.hidden=false}fit();fm.animate&&!still()&&fm.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}],{duration:240})};
 const redraw=()=>{box.innerHTML=panelHtml(it);bindPanel(it);fit()};
 const chips=()=>{if(!sg)return;const inp=ins[0],tk=tokens(inp.value),last=/[\s,;]$/.test(inp.value)?'':tk[tk.length-1]||'',skip=(it.page==='wadd'?wl:[]).concat(tk.map(resolve).filter(Boolean));
  sg.innerHTML=suggest(last,skip).map(s=>`<button type="button" data-p="${esc(s)}" title="${esc(s)}">${esc(nm(s))}</button>`).join('');fit()};
 fm.onclick=e=>{
  if(e.target.closest('[data-bk]'))return nav('hub');
  if(e.target.closest('[data-c]'))return dismiss(it);
  const p=e.target.closest('[data-p]');if(p){const inp=ins[0],tk=tokens(inp.value),keep=/[\s,;]$/.test(inp.value)?tk:tk.slice(0,-1);inp.value=keep.concat(p.dataset.p).join(', ')+', ';inp.focus();chips();return}
  const d=e.target.closest('[data-del]');
  if(d){if(it.page==='wman'){wl=wl.filter(s=>s!==d.dataset.del);saveW()}else{const o=jl('tc.watchlist',null)||{};o.al=o.al||{};delete o.al[d.dataset.del];js('tc.watchlist',o)}return redraw()}
  if(e.target.closest('[data-all]')){wl=[];saveW();redraw()}};
 fm.oncontextmenu=e=>{if(!e.target.closest('input'))e.preventDefault()};
 trap(fm,()=>dismiss(it));
 if(it.page==='wadd'||it.page==='copen'){ins[0].oninput=()=>{if(er)er.hidden=true;chips()};chips()}
 if(it.page==='aadd'){const h=fm.querySelector('[data-h]'),hint=()=>{const s=resolve(ins[0].value),q=s&&quote(s),r=s&&rows().find(x=>x[0]===s);h.textContent=s?'Harga sekarang: '+fm_(q&&q.p>0?q.p:r[2]):'';fit()};ins[0].oninput=hint;ins[1].oninput=()=>{er.hidden=true};hint()}
 fm.onsubmit=e=>{e.preventDefault();
  if(it.page==='wman'||it.page==='alist')return dismiss(it);
  if(it.page==='wadd'){const tk=tokens(ins[0].value);if(!tk.length)return bad('Ketik minimal satu ticker.');
   const ok=[],no=[];for(const t of tk){const s=resolve(t);s?(!wl.includes(s)&&!ok.includes(s)&&ok.push(s)):no.push(t)}
   if(!ok.length)return bad(no.length?'Ticker tidak ditemukan: '+no.join(', ')+'.':'Ticker itu sudah dipantau.');
   if(wl.length+ok.length>MAXW)return bad('Maksimal '+MAXW+' ticker (sisa slot '+(MAXW-wl.length)+').');
   wl=wl.concat(ok);saveW();for(const s of ok)quote(s);
   if(no.length)Island.notify({title:'Tidak dikenali',body:no.join(', '),icon:'warn',tone:'warn',timeout:5000});
   return dismiss(it)}
  if(it.page==='aadd'){const s=resolve(ins[0].value),pr=parseFloat(String(ins[1].value).replace(',','.')),r=s&&rows().find(x=>x[0]===s),qq=s&&quote(s),last=qq&&qq.p>0?qq.p:r&&r[2];
   if(!s)return bad('Ticker tidak ditemukan.');if(!(pr>0))return bad('Isi harga yang valid.');if(pr===last)return bad('Harga harus berbeda dari harga sekarang.');
   const o=jl('tc.watchlist',null)||{};o.al=o.al||{};o.al[s]={t:pr,d:pr>last?1:-1};js('tc.watchlist',o);
   Island.notify({title:'Alert dipasang',body:nm(s)+' '+(pr>last?'\u2265 ':'\u2264 ')+fm_(pr),icon:'ok',tone:'up',timeout:4000});return dismiss(it)}
  if(it.page==='copen'){const t=ins[0].value.trim();if(!t)return bad('Ketik simbol.');const s=resolve(t)||t.toUpperCase().replace(/[^A-Z0-9.^-]/g,'');dismiss(it);goChart(s)}};
 setTimeout(()=>{if(cur===it&&ins[0]){ins[0].focus({preventScroll:true});ins[0].select()}else if(cur===it){const b=fm.querySelector('[type=submit]');b&&b.focus({preventScroll:true})}},still()?0:140)}
const fm_=v=>fm(v);

function bindNote(it){
 const n=box.querySelector('.isl-n'),ms=it.timeout>0?it.timeout:6000;rem=ms;
 const run=()=>{t0=performance.now();clearTimeout(tm);tm=setTimeout(()=>finish(it),rem)};
 const hold=()=>{clearTimeout(tm);rem=Math.max(0,rem-(performance.now()-t0));bar&&bar.pause()};
 const play=()=>{run();bar&&bar.play()};
 const i=box.querySelector('.isl-t i');bar=null;
 if(i&&i.animate&&!still())bar=i.animate([{transform:'scaleX(1)'},{transform:'scaleX(0)'}],{duration:ms,easing:'linear',fill:'forwards'});
 run();
 n.onpointerenter=hold;n.onpointerleave=play;n.onfocusin=hold;n.onfocusout=play;
 n.onclick=e=>{if(e.target.closest('.isl-cl')){finish(it);return}if(it.onClick){try{it.onClick()}catch(x){}}finish(it)};
 n.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target===n){e.preventDefault();n.click()}else if(e.key==='Escape')finish(it)};
 n.oncontextmenu=e=>e.preventDefault()}

function bindAsk(it){
 const o=it.o,fm=box.firstChild,inp=fm.querySelector('input');
 prev=document.activeElement;
 const val=ok=>ok?(o.input!=null?inp.value:o.one?undefined:true):(o.input!=null?null:o.one?undefined:false);
 fm.onsubmit=e=>{e.preventDefault();finish(it,val(true))};
 fm.onclick=e=>{if(e.target.closest('[data-c]'))finish(it,val(false))};
 fm.oncontextmenu=e=>{if(!e.target.closest('input'))e.preventDefault()};
 trap(fm,()=>finish(it,val(false)));
 setTimeout(()=>{if(cur!==it)return;const t=inp||fm.querySelector('[type=submit]');t.focus({preventScroll:true});inp&&inp.select()},still()?0:140)}

// ---------- kursor: hub muncul di tengah atas (seperti dock auto-hide), tutup saat kursor menjauh ----------
const mb=document.getElementById('mb');
addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;
 const r=mb.getBoundingClientRect(),inZ=e.clientY<=r.bottom&&Math.abs(e.clientX-innerWidth/2)<=130;let over=false;
 if(el.dataset.s==='on'){const b=el.getBoundingClientRect();over=e.clientX>=b.left-14&&e.clientX<=b.right+14&&e.clientY<=b.bottom+14}
 hov=inZ||over;
 if(hov){clearTimeout(hideT);hideT=0;if(!cur&&armed&&!q.length)arrive({kind:'hub'});return}
 armed=true;leave()});
function leave(){if(hideT||!cur||cur.kind!=='hub'||cur.pin)return;hideT=setTimeout(()=>{hideT=0;if(!hov&&cur&&cur.kind==='hub'&&!cur.pin)finish(cur)},350)}
document.documentElement.addEventListener('mouseleave',()=>{hov=false;leave()});
// layar sentuh: ketuk tengah menubar membuka hub
addEventListener('pointerdown',e=>{
 if(cur&&(cur.kind==='hub'||cur.kind==='panel')&&!el.contains(e.target)){dismiss(cur);return}
 if(e.pointerType==='touch'&&!cur&&e.clientY<=mb.getBoundingClientRect().bottom&&Math.abs(e.clientX-innerWidth/2)<=90&&!e.target.closest('button'))arrive({kind:'hub',pin:true})},true);

// ---------- pembaruan strip ----------
const refresh=()=>{if(document.hidden||!cur||cur.kind!=='watch')return;box.innerHTML=watchHtml();fit()};
addEventListener('tc:quotes',refresh);
setInterval(()=>{if(window.Live&&Live.on||!wl.length)return;stepDummy();refresh()},4000);
let rz=0;addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(refresh,160)});
addEventListener('storage',e=>{if(e.key==='tc.island'){wl=(jl('tc.island',{}).w||[]).filter(s=>resolve(s)===s);if(!cur||cur.kind==='watch')next()}});

window.Island={
 ok:()=>true,
 ask:o=>new Promise(res=>arrive({kind:'ask',o,res})),
 notify:o=>{const it={kind:'note',title:o.title||'',body:o.body||'',icon:o.icon||(o.tone==='up'?'up':o.tone==='down'?'down':'bell'),tone:o.tone||'',timeout:o.timeout>0?o.timeout:6000,onClick:o.onClick,key:o.key};arrive(it);return it},
 hub:()=>{if(!cur||cur.kind==='watch')arrive({kind:'hub',pin:true})},
 clear:()=>{if(cur&&cur.kind==='note')finish(cur);q=q.filter(x=>x.kind==='ask')}};

// strip standby muncul setelah data Live siap
(window.Live?Live.ready:Promise.resolve()).catch(()=>{}).then(()=>{wl=(jl('tc.island',{}).w||[]).filter(s=>rows().some(r=>r[0]===s)).slice(0,MAXW);if(wl.length)setTimeout(()=>{if(!cur)arrive({kind:'watch'})},700)});
})();
