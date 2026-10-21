// Note > tampilan catatan (folder Semua, Ilmu, Umum, Disematkan): daftar + editor teks kaya ala Apple Notes.
// Isi catatan = HTML terbatas yang disaring lewat Note.u.clean(). Autosave 350 ms.
loadCss('apps/note/views/notes.css');
(()=>{
const {u,store}=Note,{ic,I,esc,fd,uid,clean}=u;
const LBL={all:'Semua catatan',ilmu:'Ilmu trading',umum:'Catatan umum',pin:'Disematkan'};
const TPL={
 ilmu:()=>`<h3>Topik baru</h3><div><b>Ringkasan</b></div><div><br></div><div><b>Poin penting</b></div><ul><li><br></li></ul><div><b>Contoh di chart</b></div><div><br></div><div><b>Sumber</b></div><div><br></div>`,
 umum:()=>`<h3>Catatan baru</h3><div><br></div>`};
let api={};

Note.view({id:'notes',
 html:()=>`<div class="nn" data-view="list">
 <section class="nt-list" aria-label="Daftar catatan">
  <div class="nt-lh">
   <div class="nt-q">${ic(I.search)}<input type="search" placeholder="Cari catatan" aria-label="Cari catatan" autocomplete="off"></div>
   <div class="nt-new"><button type="button" class="nt-rt" data-rt aria-label="Folder" title="Folder">${ic(I.fl)}</button><button type="button" class="btn pri" data-new="ilmu">${ic(I.plus)}Ilmu</button><button type="button" class="btn" data-new="umum">${ic(I.plus)}Catatan</button></div>
  </div>
  <div class="nt-lt"><b></b><small></small></div>
  <div class="nt-items" role="listbox" aria-label="Catatan"></div>
 </section>
 <section class="nt-ed" data-empty="true">
  <div class="nt-tb" role="toolbar" aria-label="Format">
   <button type="button" class="nt-back" data-back>${ic(I.l)}Catatan</button>
   <button type="button" data-cmd="h" title="Judul" aria-label="Judul"><b>H</b></button>
   <button type="button" data-cmd="b" title="Tebal (Ctrl+B)" aria-label="Tebal"><b>B</b></button>
   <button type="button" data-cmd="i" title="Miring (Ctrl+I)" aria-label="Miring"><i>I</i></button>
   <button type="button" data-cmd="ul" title="Daftar poin" aria-label="Daftar poin">${ic(I.ul)}</button>
   <button type="button" data-cmd="cl" title="Daftar centang" aria-label="Daftar centang">${ic(I.cl)}</button>
   <i class="nt-sp"></i><span class="nt-st" role="status" aria-live="polite"></span>
   <button type="button" data-pin title="Sematkan" aria-label="Sematkan" aria-pressed="false">${ic(I.pin)}</button>
   <button type="button" data-del title="Hapus catatan" aria-label="Hapus catatan">${ic(I.trash)}</button>
  </div>
  <div class="nt-meta">
   <div class="seg" role="group" aria-label="Jenis catatan"><button type="button" data-cat="ilmu" aria-pressed="false">Ilmu</button><button type="button" data-cat="umum" aria-pressed="false">Umum</button></div>
   <label class="nt-lb nt-tl">Tag<input class="nt-in" type="text" data-tags placeholder="pisahkan dengan koma" autocomplete="off" maxlength="120"></label>
  </div>
  <div class="nt-body" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true" aria-label="Isi catatan"></div>
  <div class="nt-none"><div class="empty">Pilih catatan di daftar, atau buat <b>Ilmu</b> / <b>Catatan</b> baru.</div></div>
 </section></div>`,

 mount(ctx){
  const root=ctx.q('.nt-v[data-v=notes] .nn'),q=s=>root.querySelector(s),qa=s=>[...root.querySelectorAll(s)];
  const ed=q('.nt-body'),edw=q('.nt-ed'),items=q('.nt-items'),srch=q('.nt-q input'),stEl=q('.nt-st'),st=ctx.st;
  const ns={sel:null,view:'list',q:''};
  let tm=0,arm=0,armT=0;
  const notes=()=>store.notes;
  const match=n=>{
   if(st.f==='pin'?!n.pin:(st.f!=='all'&&n.cat!==st.f))return false;
   if(st.tag&&!n.tags.includes(st.tag))return false;
   if(ns.q){const k=ns.q.toLowerCase();if(!(n.p.includes(k)||n.tags.some(t=>t.includes(k))))return false}
   return true};
  const list=()=>notes().filter(match).sort((a,b)=>(+!!b.pin)-(+!!a.pin)||b.upd-a.upd);
  const cur=()=>notes().find(n=>n.id===ns.sel)||null;
  const status=(m,bad)=>{stEl.textContent=m;stEl.style.color=bad?'var(--dn)':''};
  const view=()=>{root.dataset.view=ns.view};

  function renderList(){
   const L=list();
   q('.nt-lt b').textContent=st.tag?'#'+st.tag:(LBL[st.f]||'Catatan');
   q('.nt-lt small').textContent=L.length+' catatan';
   qa('[data-new]').forEach(b=>b.classList.toggle('pri',b.dataset.new===(st.f==='umum'?'umum':'ilmu')));
   items.innerHTML=L.length?L.map(n=>`<button type="button" class="nt-it" role="option" data-id="${n.id}" aria-selected="${n.id===ns.sel}"><span class="nt-t">${n.pin?`<i class="nt-pn">${ic(I.pin)}</i>`:''}${esc(n.t||'Catatan baru')}</span><span class="nt-m"><span>${fd(u.iso(new Date(n.upd)))}</span><span class="nt-s">${esc(n.s)}</span></span><span class="nt-b"><span class="nt-c ${n.cat}">${n.cat==='ilmu'?'Ilmu':'Umum'}</span>${n.tags.slice(0,3).map(t=>`<span class="nt-c">#${esc(t)}</span>`).join('')}</span></button>`).join('')
    :`<div class="empty">${notes().length?'Tidak ada catatan yang cocok.':'Belum ada catatan. Buat Ilmu atau Catatan baru.'}</div>`}
  function syncMeta(){
   const n=cur();if(!n)return;
   qa('[data-cat]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.cat===n.cat));
   q('[data-tags]').value=n.tags.join(', ');
   const pb=q('[data-pin]');pb.setAttribute('aria-pressed',!!n.pin);pb.title=n.pin?'Lepas sematan':'Sematkan'}
  function renderEditor(){const n=cur();edw.dataset.empty=!n;if(n){ed.innerHTML=n.html;syncMeta()}else ed.innerHTML='';status('')}

  function commit(){
   clearTimeout(tm);tm=0;const n=cur();if(!n)return;
   n.html=clean(ed.innerHTML);store.deriveNote(n);n.upd=Date.now();
   const ok=store.saveNotes();status(ok?'Tersimpan':'Penyimpanan browser penuh',!ok);renderList();ctx.refreshRail()}
  const queue=()=>{if(!cur())return;status('Menyimpan…');clearTimeout(tm);tm=setTimeout(commit,350)};
  const flush=()=>{if(tm)commit()};
  addEventListener('beforeunload',flush);

  function select(id){flush();ns.sel=id;ns.view='edit';renderList();renderEditor();view()}
  function create(cat){
   flush();const t=Date.now(),n=store.normNote({id:uid(),cat,html:TPL[cat](),tags:[],pin:false,cre:t,upd:t});
   notes().push(n);store.saveNotes();
   ns.sel=n.id;ns.q='';srch.value='';ns.view='edit';
   if(st.f==='pin'||(st.f!=='all'&&st.f!==cat))st.f='all';st.tag=null;
   renderList();renderEditor();view();ctx.refreshRail();ed.focus();
   const h=ed.firstElementChild;if(h){const r=document.createRange();r.selectNodeContents(h);const s=getSelection();s.removeAllRanges();s.addRange(r)}}
  function remove(){
   const n=cur();if(!n)return;clearTimeout(tm);tm=0;
   store.notes.splice(store.notes.indexOf(n),1);store.saveNotes();
   ns.sel=(list()[0]||{}).id||null;ns.view='list';renderList();renderEditor();view();ctx.refreshRail()}

  // ---- format teks
  const curUl=()=>{const s=getSelection();let e=s&&s.anchorNode;if(e&&e.nodeType===3)e=e.parentElement;const x=e&&e.closest&&e.closest('ul');return x&&ed.contains(x)?x:null};
  const setList=check=>{const x=curUl();
   if(x){const isCl=x.classList.contains('cl');if(check!==isCl){x.classList.toggle('cl',check);return}document.execCommand('insertUnorderedList');return}
   document.execCommand('insertUnorderedList');const n=curUl();if(n&&check)n.classList.add('cl')};
  const noH3=()=>(document.queryCommandValue('formatBlock')||'').toLowerCase()==='h3';  // daftar tidak diterapkan pada baris judul
  const CMD={
   h:()=>{document.execCommand('formatBlock',false,noH3()?'div':'h3')},
   b:()=>document.execCommand('bold'),i:()=>document.execCommand('italic'),
   ul:()=>noH3()||setList(false),cl:()=>noH3()||setList(true)};
  qa('.nt-tb button').forEach(b=>b.addEventListener('mousedown',e=>e.preventDefault()));  // jaga fokus & seleksi di editor
  ed.addEventListener('input',queue);
  ed.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,(e.clipboardData||window.clipboardData).getData('text/plain'))});
  ed.addEventListener('drop',e=>e.preventDefault());
  ed.addEventListener('click',e=>{const li=e.target.closest&&e.target.closest('ul.cl>li');if(li&&e.target===li&&e.clientX-li.getBoundingClientRect().left<26){li.classList.toggle('done');queue()}});
  ed.addEventListener('keydown',e=>{if(e.key==='Enter')setTimeout(()=>{const x=curUl();const s=getSelection();let el=s.anchorNode;if(el&&el.nodeType===3)el=el.parentElement;const li=el&&el.closest&&el.closest('li');if(x&&x.classList.contains('cl')&&li)li.classList.remove('done')},0)});

  root.addEventListener('click',e=>{
   const t=e.target.closest('button');if(!t||!root.contains(t))return;const D=t.dataset;
   if(D.new)create(D.new);
   else if(D.id)select(D.id);
   else if('rt' in D)ctx.toggleRail();
   else if('back' in D){flush();ns.view='list';view()}
   else if(D.cmd){CMD[D.cmd]();queue()}
   else if('pin' in D){const n=cur();if(n){n.pin=!n.pin;syncMeta();commit()}}
   else if('del' in D){if(!cur())return;if(!arm){arm=1;t.classList.add('arm');t.title='Klik lagi untuk menghapus';armT=setTimeout(()=>{arm=0;t.classList.remove('arm');t.title='Hapus catatan'},3000);return}clearTimeout(armT);arm=0;t.classList.remove('arm');t.title='Hapus catatan';remove()}
   else if(D.cat){const n=cur();if(n){n.cat=D.cat;syncMeta();commit()}}
  });
  q('[data-tags]').onchange=e=>{const n=cur();if(!n)return;n.tags=u.clean?[...new Set(e.target.value.split(',').map(t=>t.trim().toLowerCase().replace(/^#+/,'').slice(0,24)).filter(Boolean))].slice(0,12):[];syncMeta();commit()};
  srch.oninput=()=>{ns.q=srch.value.trim();renderList()};
  srch.onkeydown=e=>{if(e.key==='Escape'&&srch.value){e.stopPropagation();srch.value='';srch.oninput()}};

  api.sv=()=>({sel:ns.sel,view:ns.view,q:ns.q});
  api.ld=s=>{
   if(!s||typeof s!=='object')return;
   if(typeof s.q==='string'&&s.q){ns.q=s.q.slice(0,100);srch.value=ns.q}
   if(typeof s.sel==='string'&&notes().some(n=>n.id===s.sel)){ns.sel=s.sel;ns.view=s.view==='edit'?'edit':'list';renderList();renderEditor();view()}
   else renderList()};
  api.show=()=>{
   flush();ns.q='';srch.value='';
   const L=list();if(!L.some(n=>n.id===ns.sel)){ns.sel=(L[0]||{}).id||null;renderEditor()}
   ns.view='list';renderList();view()};
 },
 show(ctx){api.show()},
 sv(){return api.sv?api.sv():null},
 ld(s){api.ld&&api.ld(s)}});
})();
