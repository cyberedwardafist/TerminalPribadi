// Kontrol buatan sendiri: pengganti <select>, input date / time / color bawaan browser.
// Otomatis: setiap elemen itu (yang sudah ada maupun yang dibuat belakangan lewat innerHTML) diberi tombol berdesain sendiri
// di sampingnya; elemen aslinya disembunyikan tapi tetap dipakai sebagai sumber nilai, jadi kode app tidak perlu diubah
// (.value, event input/change, name, dataset semuanya tetap jalan). Tambah atribut data-native untuk melewatkan satu elemen.
const Controls=(()=>{
const D=document,SEL='select,input[type=date],input[type=time],input[type=color],input[list]';
const el=(t,c,h)=>{const e=D.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e};
const CHEV='<svg class="cs-ch" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>';
const MON=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'],DOW=['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
const p2=n=>String(n).padStart(2,'0'),iso=(y,m,d)=>y+'-'+p2(m+1)+'-'+p2(d);
const fire=x=>{x.dispatchEvent(new Event('input',{bubbles:true}));x.dispatchEvent(new Event('change',{bubbles:true}))};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---------- popup bersama (satu saja yang terbuka) ----------
let cur=null;
function close(){if(!cur)return;const c=cur;cur=null;c.pop.remove();c.btn.setAttribute('aria-expanded','false');c.btn.classList.remove('open');removeEventListener('pointerdown',c.od,true);removeEventListener('resize',c.cl);removeEventListener('scroll',c.sc,true);if(c.onclose)c.onclose()}
function openPop(btn,pop,onclose){
 close();pop.classList.add('cp');pop.style.visibility='hidden';D.body.append(pop);
 const place=()=>{const r=btn.getBoundingClientRect(),pw=pop.offsetWidth,ph=pop.offsetHeight,vw=innerWidth,vh=innerHeight;let x=Math.min(Math.max(8,r.left),vw-pw-8),y=r.bottom+6;if(y+ph>vh-8&&r.top-6-ph>8)y=r.top-6-ph;else if(y+ph>vh-8)y=Math.max(8,vh-ph-8);pop.style.left=x+'px';pop.style.top=y+'px'};
 pop.style.minWidth=Math.max(btn.offsetWidth,pop.classList.contains('cp-menu')?0:0)+'px';
 place();pop.style.visibility='';
 const c=cur={btn,pop,onclose,od:e=>{if(!pop.contains(e.target)&&!btn.contains(e.target))close()},cl:()=>close(),sc:e=>{if(!pop.contains(e.target))close()}};
 addEventListener('pointerdown',c.od,true);addEventListener('resize',c.cl);addEventListener('scroll',c.sc,true);
 btn.setAttribute('aria-expanded','true');btn.classList.add('open');return c}
addEventListener('keydown',e=>{if(e.key==='Escape'&&cur){e.stopPropagation();const b=cur.btn;close();b.focus()}},true);

// ---------- tombol pengganti ----------
function mkBtn(x,extra){
 const b=el('button',(x.className?x.className+' ':'')+'cs-btn '+extra);b.type='button';
 ['aria-label','title','id'].forEach(a=>{if(x.hasAttribute(a)&&a!=='id')b.setAttribute(a,x.getAttribute(a))});
 if(x.style.cssText)b.style.cssText=x.style.cssText;b.disabled=x.disabled;b.setAttribute('aria-haspopup','listbox');b.setAttribute('aria-expanded','false');
 x.before(b);x.style.display='none';x.tabIndex=-1;x._cs=b;b._for=x;
 b.addEventListener('click',e=>{e.stopPropagation();e.preventDefault()});
 return b}
function lab(x){const l=x.closest('label');return l?l.textContent.trim():''}

// ---------- SELECT ----------
function enhSelect(s){
 if(s.multiple||s.size>1)return;
 const b=mkBtn(s,'cs-sel');if(!b.hasAttribute('aria-label')&&lab(s))b.setAttribute('aria-label',lab(s));
 b.innerHTML='<span class="cs-v"></span>'+CHEV;
 let hi=-1,typed='',tt=0,menu=null,items=[];
 const paint=()=>{const o=s.options[s.selectedIndex];b.firstChild.textContent=o?o.text:'';b.classList.toggle('empty',!o||!o.value)};
 s._paint=paint;paint();
 const enabled=()=>items.filter(i=>!i.o.disabled);
 const mark=(n,sc)=>{hi=n;items.forEach(i=>i.e.classList.toggle('hi',i.n===n));const it=items.find(i=>i.n===n);if(it){b.setAttribute('aria-activedescendant',it.e.id);if(sc)it.e.scrollIntoView({block:'nearest'})}};
 const pick=n=>{const o=s.options[n];if(!o||o.disabled)return;const ch=s.selectedIndex!==n;s.selectedIndex=n;paint();close();b.focus();if(ch)fire(s)};
 const open=()=>{
  if(b.disabled||cur&&cur.btn===b)return;
  menu=el('div','cp-menu');menu.setAttribute('role','listbox');items=[];let n=0;
  const add=(o,par)=>{const e=el('div','cm-i'+(o.disabled?' dis':'')+(o.index===s.selectedIndex?' sel':''),'<span>'+esc(o.text)+'</span><svg class="cm-ck" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>');e.id='cm'+(Math.random()*1e9|0);e.setAttribute('role','option');e.setAttribute('aria-selected',o.index===s.selectedIndex);if(par)e.classList.add('in-g');const it={e,o,n:o.index};items.push(it);
   e.onpointerdown=ev=>ev.preventDefault();e.onclick=()=>pick(o.index);e.onmousemove=()=>{if(!o.disabled&&hi!==o.index)mark(o.index)};menu.append(e)};
  [...s.children].forEach(c=>{if(c.tagName==='OPTGROUP'){menu.append(el('div','cm-g',esc(c.label)));[...c.children].forEach(o=>add(o,1))}else add(c)});
  if(!items.length)return;
  openPop(b,menu,()=>{menu=null;b.removeAttribute('aria-activedescendant')});
  const si=items.find(i=>i.n===s.selectedIndex);mark(si?si.n:(enabled()[0]||{}).n,0);if(si)si.e.scrollIntoView({block:'center'})};
 b.addEventListener('click',()=>{cur&&cur.btn===b?close():open()});
 b.addEventListener('keydown',e=>{e.stopPropagation();const k=e.key;if(k==='Tab')return;
  if(!menu){if(k==='ArrowDown'||k==='ArrowUp'||k==='Enter'||k===' '){e.preventDefault();open()}return}
  const en=enabled(),ix=en.findIndex(i=>i.n===hi);
  if(k==='ArrowDown'){e.preventDefault();const t=en[Math.min(en.length-1,ix+1)];t&&mark(t.n,1)}
  else if(k==='ArrowUp'){e.preventDefault();const t=en[Math.max(0,ix-1)];t&&mark(t.n,1)}
  else if(k==='Home'){e.preventDefault();en[0]&&mark(en[0].n,1)}
  else if(k==='End'){e.preventDefault();en.length&&mark(en[en.length-1].n,1)}
  else if(k==='Enter'||k===' '){e.preventDefault();pick(hi)}
  else if(k.length===1){clearTimeout(tt);typed+=k.toLowerCase();tt=setTimeout(()=>typed='',700);const t=en.find(i=>i.o.text.toLowerCase().startsWith(typed));t&&mark(t.n,1)}});
 s.addEventListener('change',paint);
 new MutationObserver(()=>{paint()}).observe(s,{childList:true,subtree:true,characterData:true})}

// ---------- DATE ----------
function parseD(v){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v||'');return m?{y:+m[1],m:+m[2]-1,d:+m[3]}:null}
function enhDate(x){
 const b=mkBtn(x,'cs-date');b.setAttribute('aria-haspopup','dialog');if(!b.hasAttribute('aria-label')&&lab(x))b.setAttribute('aria-label',lab(x));
 b.innerHTML='<span class="cs-v"></span><svg class="cs-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/></svg>';
 const paint=()=>{const p=parseD(x.value);b.firstChild.textContent=p?new Date(p.y,p.m,p.d).toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short',year:'numeric'}):'Pilih tanggal';b.classList.toggle('empty',!p)};
 x._paint=paint;paint();
 const set=v=>{if(x.value!==v){x.value=v;paint();fire(x)}};
 const open=()=>{
  const t=new Date(),td=iso(t.getFullYear(),t.getMonth(),t.getDate()),sel=parseD(x.value)||{y:t.getFullYear(),m:t.getMonth(),d:0};let vy=sel.y,vm=sel.m;
  const pop=el('div','cp-cal');pop.setAttribute('role','dialog');
  const draw=()=>{const first=(new Date(vy,vm,1).getDay()+6)%7,dim=new Date(vy,vm+1,0).getDate(),prev=new Date(vy,vm,0).getDate(),mn=x.min||'',mx=x.max||'';
   let g='';for(let i=0;i<42;i++){let d=i-first+1,y=vy,m=vm,out=0;if(d<1){d+=prev;m--;out=1}else if(d>dim){d-=dim;m++;out=1}if(m<0){m=11;y--}if(m>11){m=0;y++}const v=iso(y,m,d),dis=(mn&&v<mn)||(mx&&v>mx);
    g+='<button type="button" class="cd'+(out?' out':'')+(v===td?' today':'')+(v===x.value?' sel':'')+'" data-v="'+v+'"'+(dis?' disabled':'')+'>'+d+'</button>'}
   pop.innerHTML='<div class="cc-h"><button type="button" class="cc-n" data-n="-1" aria-label="Bulan sebelumnya"><svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg></button><b>'+MON[vm]+' '+vy+'</b><button type="button" class="cc-n" data-n="1" aria-label="Bulan berikutnya"><svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg></button></div><div class="cc-w">'+DOW.map(d=>'<span>'+d+'</span>').join('')+'</div><div class="cc-g">'+g+'</div><div class="cc-f"><button type="button" data-t>Hari ini</button>'+(x.required?'':'<button type="button" data-x>Hapus</button>')+'</div>'};
  draw();
  pop.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;e.stopPropagation();
   if(t.dataset.n){vm+=+t.dataset.n;if(vm<0){vm=11;vy--}if(vm>11){vm=0;vy++}draw()}
   else if(t.dataset.v){set(t.dataset.v);close();b.focus()}
   else if('t' in t.dataset){set(td);close();b.focus()}
   else if('x' in t.dataset){set('');close();b.focus()}});
  openPop(b,pop)};
 b.addEventListener('click',()=>{cur&&cur.btn===b?close():open()});
 b.addEventListener('keydown',e=>{e.stopPropagation()});
 x.addEventListener('change',paint)}

// ---------- TIME ----------
function enhTime(x){
 const b=mkBtn(x,'cs-time');b.setAttribute('aria-haspopup','dialog');if(!b.hasAttribute('aria-label')&&lab(x))b.setAttribute('aria-label',lab(x));
 b.innerHTML='<span class="cs-v"></span><svg class="cs-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
 const paint=()=>{const v=/^\d{2}:\d{2}/.test(x.value)?x.value.slice(0,5):'';b.firstChild.textContent=v||'--:--';b.classList.toggle('empty',!v)};
 x._paint=paint;paint();
 const open=()=>{
  const m=/^(\d{2}):(\d{2})/.exec(x.value);let H=m?+m[1]:null,M=m?+m[2]:null;
  const pop=el('div','cp-time');pop.setAttribute('role','dialog');
  const col=(n,k)=>'<div class="ct-col" data-k="'+k+'">'+[...Array(n)].map((_,i)=>'<button type="button" data-v="'+i+'">'+p2(i)+'</button>').join('')+'</div>';
  pop.innerHTML='<div class="ct-cols">'+col(24,'h')+col(60,'m')+'</div><div class="cc-f"><button type="button" data-t>Sekarang</button>'+(x.required?'':'<button type="button" data-x>Hapus</button>')+'<button type="button" class="pri" data-ok>Selesai</button></div>';
  const mark=(sc)=>pop.querySelectorAll('.ct-col').forEach(c=>{const v=c.dataset.k==='h'?H:M;c.querySelectorAll('button').forEach(t=>{const on=+t.dataset.v===v;t.classList.toggle('sel',on);if(on&&sc)c.scrollTop=t.offsetTop-c.clientHeight/2+t.offsetHeight/2})});
  const apply=()=>{if(H==null||M==null)return;set(p2(H)+':'+p2(M))};
  const set=v=>{if(x.value!==v){x.value=v;paint();fire(x)}};
  pop.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;e.stopPropagation();
   if(t.dataset.v!==undefined){const k=t.parentNode.dataset.k;if(k==='h'){H=+t.dataset.v;if(M==null)M=0}else{M=+t.dataset.v;if(H==null)H=0}mark(0);apply()}
   else if('t' in t.dataset){const n=new Date();H=n.getHours();M=n.getMinutes();mark(1);apply()}
   else if('x' in t.dataset){set('');close();b.focus()}
   else if('ok' in t.dataset){close();b.focus()}});
  openPop(b,pop);mark(1)};
 b.addEventListener('click',()=>{cur&&cur.btn===b?close():open()});
 b.addEventListener('keydown',e=>{e.stopPropagation()});
 x.addEventListener('change',paint)}

// ---------- COLOR ----------
const PAL=['#ef5350','#ff7043','#ffa726','#ffca28','#d4e157','#66bb6a','#26a69a','#26c6da','#42a5f5','#5c6bc0','#7e57c2','#ab47bc','#ec407a','#8d6e63','#78909c','#ffffff','#bdbdbd','#757575','#424242','#000000'];
function enhColor(x){
 const b=mkBtn(x,'cs-color');b.setAttribute('aria-haspopup','dialog');if(!b.hasAttribute('aria-label'))b.setAttribute('aria-label','Pilih warna'+(lab(x)?' '+lab(x):''));
 b.innerHTML='<span class="cs-sw"></span>';
 const paint=()=>{b.firstChild.style.background=x.value||'#000';b.title=x.value||''};
 x._paint=paint;paint();
 const set=v=>{v=v.toLowerCase();if(/^#[0-9a-f]{6}$/.test(v)&&x.value!==v){x.value=v;paint();fire(x)}};
 const open=()=>{
  const pop=el('div','cp-col');pop.setAttribute('role','dialog');
  const sw=PAL.map(c=>'<button type="button" class="cl'+(c===x.value.toLowerCase()?' sel':'')+'" data-c="'+c+'" style="background:'+c+'" aria-label="Warna '+c+'"></button>').join('');
  pop.innerHTML='<div class="cl-g">'+sw+'</div><label class="cl-h"><span class="cl-p" style="background:'+x.value+'"></span><input type="text" maxlength="7" spellcheck="false" value="'+x.value+'" aria-label="Kode warna hex"></label>';
  const hx=pop.querySelector('input'),pv=pop.querySelector('.cl-p');
  const sync=v=>{hx.value=v;pv.style.background=v;pop.querySelectorAll('.cl').forEach(c=>c.classList.toggle('sel',c.dataset.c===v))};
  pop.addEventListener('click',e=>{const t=e.target.closest('.cl');if(!t)return;e.stopPropagation();set(t.dataset.c);sync(t.dataset.c)});
  hx.addEventListener('input',()=>{let v=hx.value.trim();if(v&&v[0]!=='#')v='#'+v;if(/^#[0-9a-fA-F]{6}$/.test(v)){set(v);pv.style.background=v}});
  hx.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){close();b.focus()}});
  openPop(b,pop);hx.focus();hx.select()};
 b.addEventListener('click',()=>{cur&&cur.btn===b?close():open()});
 b.addEventListener('keydown',e=>{e.stopPropagation()});
 x.addEventListener('change',paint)}


// ---------- COMBOBOX (input dengan list="datalist") ----------
function enhCombo(x){
 const id=x.getAttribute('list');x._cb=1;x.removeAttribute('list');x.setAttribute('autocomplete','off');x.setAttribute('role','combobox');x.setAttribute('aria-expanded','false');
 let menu=null,items=[],hi=-1;
 const opts=()=>{const dl=D.getElementById(id);return dl?[...dl.options].map(o=>o.value).filter(Boolean):[]};
 const mark=(n,sc)=>{hi=n;items.forEach((it,i)=>it.e.classList.toggle('hi',i===n));if(sc&&items[n])items[n].e.scrollIntoView({block:'nearest'})};
 const pick=v=>{x.value=v;fire(x);close()};
 const show=all=>{
  const q=all?'':x.value.trim().toLowerCase();let list=opts().filter(v=>!q||v.toLowerCase().includes(q));if(q&&list.length===1&&list[0].toLowerCase()===q)list=[];
  if(!list.length){if(cur&&cur.btn===x)close();return}
  const m=el('div','cp-menu');m.setAttribute('role','listbox');items=list.map(v=>{const e=el('div','cm-i',esc(v));e.setAttribute('role','option');e.onpointerdown=ev=>ev.preventDefault();e.onclick=()=>pick(v);e.onmousemove=()=>mark(items.findIndex(i=>i.e===e));m.append(e);return{e,v}});
  const was=cur&&cur.btn===x;menu=m;hi=-1;openPop(x,m,()=>{menu=null;x.setAttribute('aria-expanded','false')});m.style.minWidth=x.offsetWidth+'px';if(was)x.classList.remove('open');x.classList.remove('open')};
 x.addEventListener('input',()=>show(false));
 x.addEventListener('focus',()=>{if(!x.value)show(true)});
 x.addEventListener('click',()=>{if(!menu)show(!x.value)});
 x.addEventListener('keydown',e=>{const k=e.key;
  if(k==='ArrowDown'||k==='ArrowUp'){if(!menu)show(true);if(!menu)return;e.preventDefault();mark(k==='ArrowDown'?Math.min(items.length-1,hi+1):Math.max(0,hi-1),1)}
  else if(k==='Enter'&&menu&&hi>=0){e.preventDefault();pick(items[hi].v)}
  else if(k==='Tab'&&menu)close()});
 x.addEventListener('blur',()=>{setTimeout(()=>{if(cur&&cur.btn===x&&D.activeElement!==x)close()},120)})}

// ---------- pasang ke semua elemen ----------
function enhance(x){
 if(x._cs||x._cb||x.hasAttribute('data-native')||!x.parentNode)return;
 if(x.tagName==='INPUT'&&x.hasAttribute('list')&&!/^(date|time|color)$/.test(x.type)){try{enhCombo(x)}catch(e){}return}
 const t=x.tagName==='SELECT'?'select':x.type;
 try{({select:enhSelect,date:enhDate,time:enhTime,color:enhColor})[t](x)}catch(e){if(x._cs){x._cs.remove();x.style.display='';x._cs=null}}}
const scan=n=>{if(n.nodeType!==1)return;if(n.matches(SEL))enhance(n);n.querySelectorAll&&n.querySelectorAll(SEL).forEach(enhance)};
// nilai yang diubah lewat kode (el.value = ..., selectedIndex = ...) ikut menyegarkan tampilan tombol
[[HTMLSelectElement.prototype,'value'],[HTMLSelectElement.prototype,'selectedIndex'],[HTMLInputElement.prototype,'value']].forEach(([pr,k])=>{
 const d=Object.getOwnPropertyDescriptor(pr,k);if(!d||!d.set)return;
 Object.defineProperty(pr,k,{configurable:true,enumerable:d.enumerable,get:d.get,set(v){d.set.call(this,v);if(this._paint)this._paint()}})});
const start=()=>{scan(D.body);
 new MutationObserver(ms=>{ms.forEach(m=>{
  if(m.type==='attributes'){const t=m.target;if(t._cs){if(m.attributeName==='disabled')t._cs.disabled=t.disabled;else if(m.attributeName==='hidden')t._cs.hidden=t.hidden;else if(t._paint)t._paint()}return}
  m.addedNodes.forEach(scan);
  m.removedNodes.forEach(n=>{if(n.nodeType!==1)return;(n.matches(SEL)?[n]:[...n.querySelectorAll(SEL)]).forEach(x=>{if(x._cs&&!x.isConnected)x._cs.remove()});if(cur&&!cur.btn.isConnected)close()})})})
  .observe(D.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','hidden','min','max']})};
if(D.body)start();else addEventListener('DOMContentLoaded',start);
return{close,enhance,scan}})();
