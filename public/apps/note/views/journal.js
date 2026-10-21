// Note > Jurnal trading: kalender bulanan (net profit/loss per hari) + panel samping per tanggal.
// Satu tanggal bisa punya banyak trade. Klik tanggal -> daftar trade + "+ Tambah jurnal"; klik trade -> edit.
// Form: hasil (profit/loss/impas) + nilai Rupiah, jam masuk/keluar, simbol, arah, metode, kolom bebas (custom), catatan, evaluasi, bukti gambar.
// Data: Note.store.trades (localStorage 'tc.journal'); gambar di IndexedDB (Note.store.img).
loadCss('apps/note/views/journal.css');
(()=>{
const {u,store}=Note,{ic,I,esc,fd,fdl,rp,short,today,pad,uid,parseRp,pl}=u;
const DEF_METHODS=['Breakout','Pullback','Reversal','Supply & Demand','Support/Resistance','Trendline','SMC / ICT','Scalping','Swing'];
const DEF_FIELDS=['Lot','Timeframe','Risk:Reward','Sesi','Emosi'];
const RES={profit:'Profit',loss:'Loss',impas:'Impas'};
const WD=['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
let api={};

Note.view({id:'journal',
 html:()=>`<div class="nj" data-panel="false">
 <section class="jc" aria-label="Kalender jurnal">
  <div class="jc-h">
   <button type="button" class="nt-rt" data-rt aria-label="Folder" title="Folder">${ic(I.fl)}</button>
   <div class="jc-nav"><button type="button" data-mv="-1" aria-label="Bulan sebelumnya">${ic(I.l)}</button><b class="jc-mon"></b><button type="button" data-mv="1" aria-label="Bulan berikutnya">${ic(I.r)}</button><button type="button" class="btn" data-today>Hari ini</button></div>
  </div>
  <div class="jc-sum"></div>
  <div class="jc-wd">${WD.map(d=>`<span>${d}</span>`).join('')}</div>
  <div class="jc-cal" role="grid" aria-label="Kalender"></div>
 </section>
 <aside class="jp" aria-label="Jurnal harian">
  <div class="jp-top"><button type="button" class="jp-back" data-pback>${ic(I.l)}Kalender</button><div class="jp-ti"></div><button type="button" class="jp-x" data-pclose aria-label="Tutup panel" title="Tutup">${ic(I.x)}</button></div>
  <div class="jp-day"></div>
  <div class="jp-form" hidden></div>
 </aside>
 <div class="jlb" hidden tabindex="-1" role="dialog" aria-label="Bukti gambar"><img alt="Bukti trading"><button type="button" data-lbx aria-label="Tutup gambar">${ic(I.x)}</button></div>
 </div>`,

 mount(ctx){
  const root=ctx.q('.nt-v[data-v=journal] .nj'),q=s=>root.querySelector(s),qa=s=>[...root.querySelectorAll(s)];
  const now=new Date(),T=()=>store.trades;
  const J={mon:new Date(now.getFullYear(),now.getMonth(),1),sel:null,draft:null,dirty:false,err:'',saving:false};
  let arm=0,armT=0;

  // ---------- agregat ----------
  const agg=()=>{const m={};T().forEach(t=>{const a=m[t.date]||(m[t.date]={net:0,n:0});a.net+=pl(t);a.n++});return m};
  const dayTrades=d=>T().filter(t=>t.date===d).sort((a,b)=>(a.time||'99').localeCompare(b.time||'99')||a.cre-b.cre);
  const cls=v=>v>0?'up':v<0?'dn':'';

  // ---------- kalender ----------
  function renderCal(){
   const y=J.mon.getFullYear(),m=J.mon.getMonth(),off=(new Date(y,m,1).getDay()+6)%7,nd=new Date(y,m+1,0).getDate(),td=today(),A=agg(),pre=y+'-'+pad(m+1);
   q('.jc-mon').textContent=J.mon.toLocaleDateString('id-ID',{month:'long',year:'numeric'});
   let net=0,n=0,w=0,l=0,gp=0,gl=0;
   T().forEach(t=>{if(t.date.slice(0,7)!==pre)return;n++;const v=pl(t);net+=v;if(t.res==='profit'){w++;gp+=v}else if(t.res==='loss'){l++;gl+=v}});
   q('.jc-sum').innerHTML=[['Net bulan ini',rp(net,true),cls(net)],['Trade',n,''],['Win rate',w+l?Math.round(w/(w+l)*100)+'%':'-',''],['Profit',rp(gp,true),gp?'up':''],['Loss',rp(gl,true),gl?'dn':'']]
    .map(x=>`<div class="jc-s"><small>${x[0]}</small><b class="${x[2]}">${x[1]}</b></div>`).join('');
   q('.jc-cal').innerHTML='<i></i>'.repeat(off)+[...Array(nd)].map((_,i)=>{
    const k=pre+'-'+pad(i+1),a=A[k],c=a?(a.net>0?'pos':a.net<0?'neg':'zero'):'';
    return`<button type="button" data-d="${k}" class="jc-d ${c}${k===td?' td':''}" aria-pressed="${J.sel===k}" aria-label="${fdl(k)}${a?', '+a.n+' trade, net '+rp(a.net,true):', belum ada jurnal'}">
     <span class="jc-n">${i+1}</span>${a?`<span class="jc-v ${cls(a.net)}"><span class="jc-full">${rp(a.net,true)}</span><span class="jc-sh">${short(a.net)}</span></span><span class="jc-c">${a.n} trade</span>`:''}</button>`}).join('')}

  // ---------- panel: daftar trade ----------
  function renderDay(){
   const k=J.sel,L=dayTrades(k),net=L.reduce((s,t)=>s+pl(t),0);
   q('.jp-ti').innerHTML=`<b>${fdl(k)}</b><small>${L.length?`${L.length} trade · <span class="${cls(net)}">${rp(net,true)}</span>`:'Belum ada jurnal'}</small>`;
   q('.jp-day').innerHTML=`<div class="jp-add"><button type="button" class="btn pri" data-add>${ic(I.plus)}Tambah jurnal</button></div>`+
    (L.length?`<div class="jp-list">${L.map(t=>{const v=pl(t);return`<button type="button" class="jt" data-edit="${t.id}">
      <span class="jt-h"><b>${t.time?esc(t.time)+(t.timeEnd?'\u2013'+esc(t.timeEnd):''):'Tanpa jam'}</b>${t.sym?`<span class="jt-sym">${esc(t.sym)}</span>`:''}${t.side?`<span class="nt-c ${t.side==='buy'?'up':'dn'}">${t.side==='buy'?'Buy':'Sell'}</span>`:''}<span class="jt-pl ${cls(v)}">${t.res?(t.res==='impas'?'Impas':rp(v,true)):'-'}</span></span>
      <span class="jt-m">${esc(t.method||'Tanpa metode')}${t.fields.length?' · '+t.fields.slice(0,3).map(f=>esc(f.k)+(f.v?' '+esc(f.v):'')).join(' · '):''}</span>
      ${t.note?`<span class="jt-n">${esc(t.note.split('\n')[0])}</span>`:''}
      ${t.imgs.length?`<span class="jt-i">${ic(I.img)}${t.imgs.length} gambar</span>`:''}</button>`}).join('')}</div>`
    :'<div class="empty">Belum ada jurnal di tanggal ini. Klik <b>Tambah jurnal</b> untuk mencatat trade.</div>')}

  // ---------- panel: form ----------
  const usedMethods=()=>{const c={};T().forEach(t=>{if(t.method)c[t.method]=(c[t.method]||0)+1});return Object.keys(c).sort((a,b)=>c[b]-c[a])};
  const usedFields=()=>{const c={};T().forEach(t=>t.fields.forEach(f=>{if(f.k)c[f.k]=(c[f.k]||0)+1}));return Object.keys(c).sort((a,b)=>c[b]-c[a])};
  const usedSyms=()=>[...new Set([...WATCH.map(r=>r[0]),...T().map(t=>t.sym).filter(Boolean)])];
  const uniq=a=>[...new Set(a)];

  function formHtml(){
   const d=J.draft;
   return`<div class="jf-sc">
    <div class="jf-g"><label class="nt-lb">Tanggal<input class="nt-in" type="date" data-f="date" value="${d.date}"></label>
     <label class="nt-lb">Jam masuk<input class="nt-in" type="time" data-f="time" value="${d.time}"></label>
     <label class="nt-lb">Jam keluar<input class="nt-in" type="time" data-f="timeEnd" value="${d.timeEnd}"></label></div>
    <div class="jf-b"><div class="jf-l">Hasil</div>
     <div class="seg" role="group" aria-label="Hasil trading">${Object.keys(RES).map(k=>`<button type="button" data-res="${k}" aria-pressed="false">${RES[k]}</button>`).join('')}</div>
     <label class="nt-lb jf-amt">Nilai (Rp)<input class="nt-in" type="text" inputmode="decimal" data-amt placeholder="0" autocomplete="off"></label>
     <div class="jf-pv" aria-live="polite"></div></div>
    <div class="jf-g"><label class="nt-lb">Simbol<input class="nt-in" type="text" data-f="sym" list="jdl-sym" placeholder="BTCUSDT" maxlength="24" value="${esc(d.sym)}" autocomplete="off"></label>
     <div class="jf-b2"><div class="jf-l">Arah</div><div class="seg" role="group" aria-label="Arah"><button type="button" data-side="buy" aria-pressed="false">Buy</button><button type="button" data-side="sell" aria-pressed="false">Sell</button></div></div></div>
    <div class="jf-b"><label class="nt-lb jf-wide">Teknik / metode<input class="nt-in" type="text" data-f="method" list="jdl-met" placeholder="mis. Breakout, SMC, Scalping" maxlength="60" value="${esc(d.method)}" autocomplete="off"></label><div class="jf-chips jf-cm"></div></div>
    <div class="jf-b"><div class="jf-l">Kolom tambahan <small>(bebas, sesuai gaya entry-mu)</small></div><div class="jf-fields"></div><div class="jf-chips jf-cf"></div></div>
    <label class="nt-lb jf-wide jf-ta">Catatan<textarea class="nt-in" data-f="note" rows="3" placeholder="Alasan masuk, kondisi market, rencana..." maxlength="6000">${esc(d.note)}</textarea></label>
    <label class="nt-lb jf-wide jf-ta">Evaluasi<textarea class="nt-in" data-f="eval" rows="3" placeholder="Apa yang benar, apa yang perlu diperbaiki..." maxlength="6000">${esc(d.eval)}</textarea></label>
    <div class="jf-b"><div class="jf-l">Bukti gambar <small>(maks 8)</small></div><div class="jf-dz" tabindex="0" role="button" data-addimg aria-label="Tambah gambar">${ic(I.img)}<span>Klik, seret, atau tempel (Ctrl+V) screenshot chart</span></div><div class="jf-imgs"></div></div>
   </div>
   <div class="jf-ft"><small class="jf-err" role="alert"></small><button type="button" class="nb jf-del" data-del hidden>${ic(I.trash)}Hapus</button><i class="nt-sp"></i><button type="button" class="btn" data-cancel>Batal</button><button type="button" class="btn pri" data-save>Simpan</button></div>
   <datalist id="jdl-sym">${usedSyms().map(s=>`<option value="${esc(s)}">`).join('')}</datalist><datalist id="jdl-met">${uniq([...usedMethods(),...DEF_METHODS]).map(s=>`<option value="${esc(s)}">`).join('')}</datalist>`}

  function renderResult(){
   const d=J.draft,f=q('.jp-form');
   f.querySelectorAll('[data-res]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.res===d.res));
   f.querySelectorAll('[data-side]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.side===d.side));
   const a=f.querySelector('[data-amt]');a.disabled=d.res==='impas';
   const v=d.res==='profit'?d.amount:d.res==='loss'?-d.amount:0;
   const pv=f.querySelector('.jf-pv');pv.className='jf-pv '+cls(v);pv.textContent=d.res?(d.res==='impas'?'Impas: Rp 0':rp(v,true)):''}
  function renderFields(){
   const d=J.draft,f=q('.jp-form');
   f.querySelector('.jf-fields').innerHTML=d.fields.map((x,i)=>`<div class="jf-kv"><input class="nt-in" data-fk="${i}" list="jdl-fld" placeholder="Nama (mis. Lot)" maxlength="40" value="${esc(x.k)}" aria-label="Nama kolom"><input class="nt-in" data-fv="${i}" placeholder="Nilai" maxlength="160" value="${esc(x.v)}" aria-label="Nilai kolom"><button type="button" class="jf-rm" data-rmf="${i}" aria-label="Hapus kolom" title="Hapus kolom">${ic(I.x)}</button></div>`).join('')+`<datalist id="jdl-fld">${uniq([...usedFields(),...DEF_FIELDS]).map(s=>`<option value="${esc(s)}">`).join('')}</datalist>`;
   const have=new Set(d.fields.map(x=>x.k.toLowerCase())),sug=uniq([...usedFields(),...DEF_FIELDS]).filter(n=>!have.has(n.toLowerCase())).slice(0,8);
   f.querySelector('.jf-cf').innerHTML=sug.map(n=>`<button type="button" class="nt-tg" data-chipf="${esc(n)}">+ ${esc(n)}</button>`).join('')+`<button type="button" class="nt-tg" data-addf>+ Kolom baru</button>`;
   const um=uniq(usedMethods().length?usedMethods():DEF_METHODS).slice(0,6);
   f.querySelector('.jf-cm').innerHTML=um.map(n=>`<button type="button" class="nt-tg" data-chipm="${esc(n)}" aria-pressed="${d.method===n}">${esc(n)}</button>`).join('')}
  function renderImgs(){
   const d=J.draft,el=q('.jf-imgs');if(!el)return;
   el.innerHTML=d._imgs.map(im=>`<div class="jf-im">${im.url?`<button type="button" data-view="${im.id}" aria-label="Lihat gambar"><img src="${im.url}" alt="Bukti"></button>`:'<span class="jf-ld">Memuat…</span>'}<button type="button" class="jf-rm" data-rmi="${im.id}" aria-label="Hapus gambar" title="Hapus gambar">${ic(I.x)}</button></div>`).join('');
   q('[data-addimg]').hidden=d._imgs.length>=8}
  const err=m=>{J.err=m;const e=q('.jf-err');if(e)e.textContent=m};

  function openForm(t,sd){
   const isNew=sd?!!sd.isNew:!t,base=sd?{...sd}:t?JSON.parse(JSON.stringify(t)):{id:uid(),date:J.sel,time:J.sel===today()?pad(new Date().getHours())+':'+pad(new Date().getMinutes()):'',timeEnd:'',sym:S.sym||'',side:'',res:'',amount:0,method:'',fields:[],note:'',eval:'',imgs:[],cre:Date.now()};
   J.draft={...base,isNew,_imgs:base.imgs.map(id=>({id,blob:null,url:null,new:false})),_removed:[]};J.dirty=false;err('');
   const f=q('.jp-form');f.innerHTML=formHtml();
   const a=f.querySelector('[data-amt]');a.value=J.draft.amount?u.rp(J.draft.amount).replace('Rp\u00a0',''):'';
   f.querySelector('[data-del]').hidden=isNew;
   q('.jp-day').hidden=true;f.hidden=false;f.scrollTop=0;
   renderResult();renderFields();renderImgs();
   const dd=J.draft;J.draft._imgs.forEach(im=>store.img.get(im.id).then(b=>{if(b&&J.draft===dd){im.blob=b;im.url=URL.createObjectURL(b);renderImgs()}else if(!b){im.missing=true}}).catch(()=>{}));
   q('.jp-ti').innerHTML=`<b>${isNew?'Jurnal baru':'Edit jurnal'}</b><small>${fdl(J.draft.date)}</small>`;
   root.dataset.pform='true'}
  function closeForm(){
   if(J.draft)J.draft._imgs.forEach(im=>{if(im.url)URL.revokeObjectURL(im.url)});
   J.draft=null;J.dirty=false;arm=0;clearTimeout(armT);
   q('.jp-form').hidden=true;q('.jp-day').hidden=false;root.dataset.pform='false'}
  const dirty=()=>{J.dirty=true};

  // ---------- simpan / hapus ----------
  async function save(){
   const d=J.draft;if(!d||J.saving)return;
   if(!d.res){err('Pilih hasil: Profit, Loss, atau Impas.');return}
   if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)){err('Tanggal belum valid.');return}
   J.saving=true;const btn=q('[data-save]');btn.disabled=true;
   try{for(const im of d._imgs)if(im.new&&im.blob)await store.img.put(im.id,im.blob)}
   catch(e){J.saving=false;btn.disabled=false;err('Gambar gagal disimpan (penyimpanan browser penuh atau diblokir).');return}
   const t=store.normTrade({...d,imgs:d._imgs.filter(i=>!i.missing).map(i=>i.id),upd:Date.now()}),i=T().findIndex(x=>x.id===t.id);
   if(i>=0)T()[i]=t;else T().push(t);
   if(!store.saveTrades()){J.saving=false;btn.disabled=false;err('Penyimpanan browser penuh. Ekspor cadangan lalu hapus data lama.');return}
   for(const id of d._removed)store.img.del(id).catch(()=>{});
   J.saving=false;J.sel=t.date;J.mon=new Date(+t.date.slice(0,4),+t.date.slice(5,7)-1,1);
   closeForm();renderCal();renderDay();ctx.refreshRail()}
  function remove(){
   const d=J.draft;if(!d||d.isNew)return;
   const t=T().find(x=>x.id===d.id);if(!t)return;
   T().splice(T().indexOf(t),1);store.saveTrades();t.imgs.forEach(id=>store.img.del(id).catch(()=>{}));
   closeForm();renderCal();renderDay();ctx.refreshRail()}
  // canLeave(next): true bila boleh langsung pindah. Bila ada isian belum disimpan, tampilkan dialog dan jalankan next() setelah dikonfirmasi.
  const canLeave=next=>{if(!J.draft||!J.dirty)return true;dlg.confirm('Buang perubahan?','Jurnal yang sedang diisi belum disimpan.',{ok:'Buang',danger:1}).then(ok=>{if(ok){J.dirty=false;next&&next()}});return false};
  const back=()=>{closeForm();renderDay()};

  // ---------- panel buka/tutup ----------
  function openDay(k){
   if(!canLeave(()=>openDay(k)))return;
   if(J.draft)closeForm();
   J.sel=k;root.dataset.panel='true';renderCal();renderDay()}
  function closePanel(){
   if(!canLeave(closePanel))return;if(J.draft)closeForm();
   J.sel=null;root.dataset.panel='false';renderCal()}
  const lb=q('.jlb');
  const showLb=url=>{lb.querySelector('img').src=url;lb.hidden=false;lb.focus()};
  const hideLb=()=>{lb.hidden=true;lb.querySelector('img').removeAttribute('src')};

  // ---------- gambar ----------
  async function addFiles(files){
   const d=J.draft;if(!d)return;
   for(const f of files){
    if(!/^image\//.test(f.type))continue;
    if(d._imgs.length>=8){err('Maksimal 8 gambar per jurnal.');break}
    try{const b=await store.img.shrink(f);if(J.draft!==d){return}d._imgs.push({id:uid(),blob:b,url:URL.createObjectURL(b),new:true});dirty();err('')}
    catch(e){err('Gambar tidak bisa dibaca.')}}
   renderImgs()}
  function pickImages(){
   const fi=document.createElement('input');fi.type='file';fi.accept='image/*';fi.multiple=true;fi.hidden=true;root.append(fi);
   fi.onchange=()=>{const fl=[...fi.files];fi.remove();addFiles(fl)};fi.addEventListener('cancel',()=>fi.remove());fi.click()}

  // ---------- event ----------
  root.addEventListener('click',e=>{
   const t=e.target.closest('button,.jf-dz');if(!t||!root.contains(t))return;const D=t.dataset;
   if(D.mv){J.mon=new Date(J.mon.getFullYear(),J.mon.getMonth()+ +D.mv,1);renderCal()}
   else if('today' in D){J.mon=new Date(now.getFullYear(),now.getMonth(),1);openDay(today())}
   else if(D.d){J.sel===D.d&&root.dataset.panel==='true'&&!J.draft?closePanel():openDay(D.d)}
   else if('rt' in D)ctx.toggleRail();
   else if('pclose' in D)closePanel();
   else if('pback' in D){if(J.draft){if(canLeave(back))back()}else closePanel()}
   else if('add' in D)openForm(null);
   else if(D.edit){const tr=T().find(x=>x.id===D.edit);if(tr)openForm(tr)}
   else if(D.res){J.draft.res=D.res;if(D.res==='impas')J.draft.amount=0,q('[data-amt]').value='';dirty();err('');renderResult()}
   else if(D.side){J.draft.side=J.draft.side===D.side?'':D.side;dirty();renderResult()}
   else if(D.chipm!==undefined){J.draft.method=J.draft.method===D.chipm?'':D.chipm;q('[data-f=method]').value=J.draft.method;dirty();renderFields()}
   else if(D.chipf!==undefined){J.draft.fields.push({k:D.chipf,v:''});dirty();renderFields();const v=q(`[data-fv="${J.draft.fields.length-1}"]`);v&&v.focus()}
   else if('addf' in D){J.draft.fields.push({k:'',v:''});dirty();renderFields();const k=q(`[data-fk="${J.draft.fields.length-1}"]`);k&&k.focus()}
   else if(D.rmf!==undefined){J.draft.fields.splice(+D.rmf,1);dirty();renderFields()}
   else if('addimg' in D)pickImages();
   else if(D.view){const im=J.draft._imgs.find(x=>x.id===D.view);if(im&&im.url)showLb(im.url)}
   else if(D.rmi){const i=J.draft._imgs.findIndex(x=>x.id===D.rmi);if(i>=0){const im=J.draft._imgs.splice(i,1)[0];if(im.url)URL.revokeObjectURL(im.url);if(!im.new)J.draft._removed.push(im.id);dirty();renderImgs()}}
   else if('save' in D)save();
   else if('cancel' in D){if(canLeave(back))back()}
   else if('del' in D){
    if(!arm){arm=1;t.classList.add('arm');t.lastChild.textContent='Klik lagi';armT=setTimeout(()=>{arm=0;t.classList.remove('arm');t.lastChild.textContent='Hapus'},3000);return}
    clearTimeout(armT);arm=0;remove()}
   else if('lbx' in D)hideLb();
  });
  root.addEventListener('keydown',e=>{
   if(e.key==='Escape'){
    if(!lb.hidden){e.stopPropagation();hideLb();return}
    if(J.draft){e.stopPropagation();if(canLeave(back))back();return}
    if(root.dataset.panel==='true'){e.stopPropagation();closePanel()}}
   else if((e.key==='Enter'||e.key===' ')&&e.target.classList&&e.target.classList.contains('jf-dz')){e.preventDefault();pickImages()}});
  lb.addEventListener('click',e=>{if(e.target===lb)hideLb()});
  root.addEventListener('input',e=>{
   const el=e.target;if(!J.draft)return;
   if(el.dataset.f){J.draft[el.dataset.f]=el.value;dirty();if(el.dataset.f==='date'&&/^\d{4}-/.test(el.value)){const s=q('.jp-ti small');if(s)s.textContent=fdl(el.value)}if(el.dataset.f==='method')q('.jf-cm').querySelectorAll('[data-chipm]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.chipm===el.value))}
   else if('amt' in el.dataset){J.draft.amount=parseRp(el.value);dirty();renderResult()}
   else if(el.dataset.fk!==undefined){J.draft.fields[+el.dataset.fk].k=el.value;dirty()}
   else if(el.dataset.fv!==undefined){J.draft.fields[+el.dataset.fv].v=el.value;dirty()}});
  root.addEventListener('change',e=>{const el=e.target;if(el.dataset&&'amt' in el.dataset&&J.draft){el.value=J.draft.amount?u.rp(J.draft.amount).replace('Rp\u00a0',''):''}if(el.dataset&&el.dataset.fk!==undefined)renderFields_keep()});
  function renderFields_keep(){const a=document.activeElement;renderChipsOnly();if(a&&a.isConnected)a.focus()}
  function renderChipsOnly(){
   const d=J.draft,f=q('.jp-form');if(!d)return;
   const have=new Set(d.fields.map(x=>x.k.toLowerCase())),sug=uniq([...usedFields(),...DEF_FIELDS]).filter(n=>!have.has(n.toLowerCase())).slice(0,8);
   f.querySelector('.jf-cf').innerHTML=sug.map(n=>`<button type="button" class="nt-tg" data-chipf="${esc(n)}">+ ${esc(n)}</button>`).join('')+`<button type="button" class="nt-tg" data-addf>+ Kolom baru</button>`}
  // tempel screenshot dari clipboard (Ctrl+V) saat form terbuka
  root.addEventListener('paste',e=>{if(!J.draft)return;const fl=[...(e.clipboardData&&e.clipboardData.files||[])].filter(f=>/^image\//.test(f.type));if(fl.length){e.preventDefault();addFiles(fl)}});
  // seret & lepas gambar
  const dz=()=>q('.jp-form');
  ['dragenter','dragover'].forEach(n=>root.addEventListener(n,e=>{if(J.draft&&e.dataTransfer&&[...e.dataTransfer.types].includes('Files')){e.preventDefault();dz().classList.add('over')}}));
  ['dragleave','drop'].forEach(n=>root.addEventListener(n,e=>{dz().classList.remove('over')}));
  root.addEventListener('drop',e=>{if(J.draft&&e.dataTransfer&&e.dataTransfer.files.length){e.preventDefault();addFiles([...e.dataTransfer.files])}});

  // Sesi (core/session.js): bulan, tanggal terbuka, dan jurnal yang sedang diisi (gambar yang belum tersimpan tidak ikut)
  api.sv=()=>{const d=J.draft;
   return{mon:[J.mon.getFullYear(),J.mon.getMonth()],sel:J.sel,dirty:J.dirty,
    draft:d?{id:d.id,isNew:d.isNew,date:d.date,time:d.time,timeEnd:d.timeEnd,sym:d.sym,side:d.side,res:d.res,amount:d.amount,method:d.method,fields:d.fields,note:d.note,eval:d.eval,cre:d.cre,imgs:d._imgs.filter(i=>!i.new).map(i=>i.id)}:null}};
  api.ld=s=>{
   if(!s||typeof s!=='object')return;
   const m=s.mon;if(Array.isArray(m)&&Number.isInteger(m[0])&&Number.isInteger(m[1])&&m[1]>=0&&m[1]<12)J.mon=new Date(m[0],m[1],1);
   if(typeof s.sel!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s.sel)){renderCal();return}
   J.sel=s.sel;root.dataset.panel='true';renderCal();renderDay();
   const d=s.draft;if(!d||typeof d!=='object'||typeof d.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d.date))return;
   const str=x=>typeof x==='string'?x:'';
   openForm(null,{id:str(d.id)||uid(),isNew:!!d.isNew,date:d.date,time:str(d.time),timeEnd:str(d.timeEnd),sym:str(d.sym),
    side:['buy','sell'].includes(d.side)?d.side:'',res:['profit','loss','impas'].includes(d.res)?d.res:'',amount:Math.max(0,+d.amount||0),
    method:str(d.method),fields:(Array.isArray(d.fields)?d.fields:[]).slice(0,30).map(x=>({k:str(x&&x.k),v:str(x&&x.v)})),
    note:str(d.note),eval:str(d.eval),cre:+d.cre||Date.now(),imgs:(Array.isArray(d.imgs)?d.imgs:[]).filter(x=>typeof x==='string').slice(0,8)});
   J.dirty=!!s.dirty};
  api.show=()=>{renderCal();if(J.sel&&!J.draft)renderDay();root.dataset.panel=J.sel?'true':'false'};
  api.canLeave=canLeave;
 },
 show(ctx){api.show()},
 sv(){return api.sv?api.sv():null},
 ld(s){api.ld&&api.ld(s)},
 canLeave(n){return api.canLeave?api.canLeave(n):true}});
})();
