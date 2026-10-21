// Dynamic Island di tengah menubar. Satu-satunya tempat pertanyaan dan alert tampil (tidak ada lagi popup modal / toast di pojok).
//   Island.ask({title,msg,input:{label,value},ok,cancel,danger,one}) -> Promise (sama persis dengan dlg.prompt/confirm/alert; dlg memakai ini)
//   Island.notify({title,body,icon,tone,timeout,onClick,key}) -> alert dengan batas waktu (default 6 dtk). Kursor di atasnya menahan waktu.
//     icon: bell|info|warn|ok|up|down|q   tone: up|down|warn|'' (warna aksen)
//   Island.clear() menutup yang tampil. Pertanyaan tidak punya batas waktu (menunggu jawaban / Esc); alert selalu punya.
// Antrean: pertanyaan menyela alert; alert berikutnya menunggu giliran (maks 4 menunggu, yang terlama dibuang).
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
 q:P('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>')};
const el=document.createElement('div');el.id='isl';el.dataset.s='off';el.innerHTML='<div class="isl-c"></div>';document.body.append(el);
const box=el.firstChild;
const still=()=>(typeof S!=='undefined'&&S.still)||matchMedia('(prefers-reduced-motion: reduce)').matches;
let cur=null,q=[],tm=0,rem=0,t0=0,bar=null,kd=null,prev=null,off=0;

// ukuran alami isi (dipakai sebagai target animasi lebar/tinggi)
function measure(){const s=el.style,w0=s.width,h0=s.height,tr=s.transition;
 s.transition='none';s.width='max-content';s.height='auto';
 const r={w:Math.ceil(el.offsetWidth),h:Math.ceil(el.offsetHeight)};
 s.width=w0;s.height=h0;void el.offsetWidth;s.transition=tr;return r}

function html(it){
 if(it.kind==='note')return`<div class="isl-n"${it.onClick?' role="button"':''} tabindex="0"><span class="isl-i">${IC[it.icon]||IC.bell}</span><div class="isl-x"><b>${esc(it.title)}</b>${it.body?`<span>${esc(it.body)}</span>`:''}</div><button type="button" class="isl-cl" aria-label="Tutup">\u00d7</button><div class="isl-t"><i></i></div></div>`;
 const o=it.o,ic=o.danger?'warn':o.input!=null?'q':'info';
 return`<form class="isl-q"><div class="isl-h"><span class="isl-i">${IC[ic]}</span><b>${esc(o.title)}</b></div>${o.msg?`<p>${esc(o.msg)}</p>`:''}${o.input!=null?`<input class="isl-in" maxlength="40" value="${esc(o.input.value||'')}" placeholder="${esc(o.input.label||'')}" aria-label="${esc(o.input.label||o.title)}">`:''}<div class="isl-b">${o.one?'':`<button type="button" data-c>${esc(o.cancel||'Batal')}</button>`}<button type="submit" class="go${o.danger?' dng':''}">${esc(o.ok||'OK')}</button></div></form>`}

function render(it){
 cur=it;clearTimeout(off);const was=el.dataset.s==='on';
 el.classList.toggle('still',still());
 const go=()=>{
  el.setAttribute('role',it.kind==='ask'?'dialog':'status');
  if(it.kind==='ask'){el.setAttribute('aria-modal','true');el.setAttribute('aria-label',it.o.title);el.removeAttribute('aria-live')}else{el.removeAttribute('aria-modal');el.removeAttribute('aria-label');el.setAttribute('aria-live','polite')}
  box.innerHTML=html(it);el.dataset.k=it.kind;el.dataset.tone=it.tone||'';
  const m=measure();el.dataset.s='on';el.style.width=m.w+'px';el.style.height=m.h+'px';el.classList.remove('swap');
  it.kind==='ask'?bindAsk(it):bindNote(it)};
 if(was){el.classList.add('swap');setTimeout(go,still()?0:100)}else go()}

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
 n.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&e.target===n){e.preventDefault();n.click()}else if(e.key==='Escape')finish(it)}}

function bindAsk(it){
 const o=it.o,fm=box.firstChild,inp=fm.querySelector('input');
 prev=document.activeElement;
 const val=ok=>ok?(o.input!=null?inp.value:o.one?undefined:true):(o.input!=null?null:o.one?undefined:false);
 fm.onsubmit=e=>{e.preventDefault();finish(it,val(true))};
 fm.onclick=e=>{if(e.target.closest('[data-c]'))finish(it,val(false))};
 kd=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(it,val(false))}
  else if(e.key==='Tab'){const f=[...fm.querySelectorAll('input,button')],i=f.indexOf(document.activeElement);e.preventDefault();f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus()}};
 addEventListener('keydown',kd,true);
 setTimeout(()=>{if(cur!==it)return;const t=inp||fm.querySelector('[type=submit]');t.focus({preventScroll:true});inp&&inp.select()},still()?0:140)}

function finish(it,v){
 if(cur!==it)return;
 clearTimeout(tm);bar&&bar.cancel();bar=null;
 if(kd){removeEventListener('keydown',kd,true);kd=null}
 if(it.kind==='ask'){const p=prev;prev=null;p&&p.focus&&p.focus({preventScroll:true});it.res(v)}
 cur=null;
 if(q.length)return render(q.shift());
 el.dataset.s='off';el.style.width='';el.style.height='';
 off=setTimeout(()=>{if(!cur){box.innerHTML='';el.dataset.tone='';el.removeAttribute('role')}},520)}

function push(it){
 if(it.kind==='ask'){
  if(!cur)return render(it);
  if(cur.kind==='note'){const c=cur;q.unshift(it);return finish(c)}   // pertanyaan menyela alert
  const i=q.findIndex(x=>x.kind==='note');i<0?q.push(it):q.splice(i,0,it);return}
 if(it.key&&((cur&&cur.key===it.key)||q.some(x=>x.key===it.key)))return;
 if(!cur)return render(it);
 q.push(it);while(q.filter(x=>x.kind==='note').length>4)q.splice(q.findIndex(x=>x.kind==='note'),1)}

window.Island={
 ok:()=>true,
 ask:o=>new Promise(res=>push({kind:'ask',o,res,tone:o.danger?'down':''})),
 notify:o=>{const it={kind:'note',title:o.title||'',body:o.body||'',icon:o.icon||(o.tone==='up'?'up':o.tone==='down'?'down':'bell'),tone:o.tone||'',timeout:o.timeout>0?o.timeout:6000,onClick:o.onClick,key:o.key};push(it);return it},
 clear:()=>{if(cur&&cur.kind==='note')finish(cur);q=q.filter(x=>x.kind==='ask')}};
})();
