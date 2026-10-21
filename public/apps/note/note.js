// App "Note" (dock): kerangka + rail folder. Tiap folder punya tampilan sendiri:
//   Jurnal trading           -> views/journal.js (kalender + panel jurnal per tanggal)
//   Semua / Ilmu / Umum / Disematkan -> views/notes.js (daftar + editor catatan)
// Data & helper ada di store.js. Menambah tampilan: Note.view({id, html(), mount(ctx), show(ctx), canLeave?(next)}).
(()=>{
const {u,store}=Note,{ic,I,esc}=u;
const F=[['all','Semua catatan',I.all,'notes'],['jurnal','Jurnal trading',I.jurnal,'journal'],['ilmu','Ilmu trading',I.ilmu,'notes'],['umum','Catatan umum',I.umum,'notes'],['pin','Disematkan',I.pin,'notes']];
const KF='tc.note.f';

registerApp('note',{css:'apps/note/note.css',icon:"<path d=\"M6 3h9l4 4v14H6z\"/><path d=\"M9 12h7M9 16h7\"/>",t:'Note',w:1080,h:660,flush:1,
 html:()=>`<div class="nt-w"><div class="nt" data-rail="false">
 <aside class="nt-rail" aria-label="Folder catatan">
  <div class="nt-fl"></div>
  <div class="nt-tsec"><div class="nt-sec">Tag</div><div class="nt-tgs"></div></div>
  <div class="nt-io"><button type="button" class="nb" data-exp>Ekspor</button><button type="button" class="nb" data-imp>Impor</button></div>
  <small class="nt-msg" role="status" aria-live="polite"></small>
 </aside>
 <div class="nt-main">${Object.values(Note.views).map(v=>`<div class="nt-v" data-v="${v.id}" hidden>${v.html()}</div>`).join('')}</div>
 </div></div>`,

 init(w){
  const q=s=>$(s,w),qa=s=>$$(s,w),root=q('.nt'),msg=q('.nt-msg');
  store.load();
  let f0='all';try{const v=localStorage.getItem(KF);if(F.some(x=>x[0]===v))f0=v}catch(e){}
  const st={f:f0,tag:null,rail:false};
  let curId=null;
  const viewOf=f=>Note.views[F.find(x=>x[0]===f)[3]];
  const ctx={w,q,qa,st,store,u,
   refreshRail,toggleRail:()=>{st.rail=!st.rail;root.dataset.rail=st.rail},go,
   say:(m,bad)=>{msg.textContent=m;msg.style.color=bad?'var(--dn)':''}};

  function refreshRail(){
   const N=store.notes,cnt={all:N.length,jurnal:store.trades.length,ilmu:N.filter(n=>n.cat==='ilmu').length,umum:N.filter(n=>n.cat==='umum').length,pin:N.filter(n=>n.pin).length};
   q('.nt-fl').innerHTML=F.map(x=>`<button type="button" class="nt-f" data-f="${x[0]}" aria-pressed="${st.f===x[0]}">${ic(x[2])}<span>${x[1]}</span><small>${cnt[x[0]]}</small></button>`).join('');
   const tg={};N.forEach(n=>n.tags.forEach(t=>tg[t]=(tg[t]||0)+1));
   if(st.tag&&!tg[st.tag])st.tag=null;
   q('.nt-tgs').innerHTML=Object.keys(tg).sort().map(t=>`<button type="button" class="nt-tg" data-tag="${esc(t)}" aria-pressed="${st.tag===t}">#${esc(t)} ${tg[t]}</button>`).join('')||'<small class="nt-nt">Belum ada tag</small>';
   q('.nt-tsec').hidden=st.f==='jurnal'}

  function go(f,force){
   const v=viewOf(f),cur=curId&&Note.views[curId];
   if(!force&&cur&&cur.canLeave&&!cur.canLeave(()=>go(f,true)))return false;
   st.f=f;st.rail=false;root.dataset.rail='false';curId=v.id;
   try{localStorage.setItem(KF,f)}catch(e){}
   qa('.nt-v').forEach(e=>e.hidden=e.dataset.v!==v.id);
   v.show(ctx);refreshRail();return true}

  q('.nt-rail').addEventListener('click',async e=>{
   const b=e.target.closest('button');if(!b)return;const D=b.dataset;
   if(D.f)go(D.f);
   else if(D.tag){const v=Note.views[curId],ap=()=>{st.tag=st.tag===D.tag?null:D.tag;if(curId!=='notes'){go('all',true)}else{Note.views.notes.show(ctx)}refreshRail();st.rail=false;root.dataset.rail='false'};if(v.canLeave&&!v.canLeave(ap))return;ap()}
   else if('exp' in D){
    try{const d=await store.exportAll(),blob=new Blob([JSON.stringify(d)],{type:'application/json'}),a=document.createElement('a');
     a.href=URL.createObjectURL(blob);a.download='catatan-trading-'+u.today()+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
     ctx.say(`Diekspor: ${d.notes.length} catatan, ${d.trades.length} jurnal`)}catch(x){ctx.say('Ekspor gagal',true)}}
   else if('imp' in D){
    const fi=document.createElement('input');fi.type='file';fi.accept='application/json,.json';fi.hidden=true;w.append(fi);
    fi.onchange=async()=>{const file=fi.files[0];fi.remove();if(!file)return;
     try{const r=await store.importAll(JSON.parse(await file.text()));
      ctx.say(r.notes+r.trades?`Diimpor: ${r.notes} catatan, ${r.trades} jurnal, ${r.images} gambar`:'Tidak ada data baru');refreshRail();Note.views[curId].show(ctx)}
     catch(x){ctx.say('File tidak valid',true)}};
    fi.addEventListener('cancel',()=>fi.remove());fi.click()}
  });

  Object.values(Note.views).forEach(v=>v.mount(ctx));
  // Sesi (core/session.js): ingat folder, tag, catatan yang sedang dibuka, dan jurnal yang sedang diisi
  w._ses={
   get:()=>({f:st.f,tag:st.tag,v:Object.fromEntries(Object.values(Note.views).filter(v=>v.sv).map(v=>[v.id,v.sv()]))}),
   set:s=>{if(!s||typeof s!=='object')return;
    if(typeof s.tag==='string')st.tag=s.tag.slice(0,24);
    if(F.some(x=>x[0]===s.f))go(s.f,true);
    Object.values(Note.views).forEach(v=>{if(v.ld&&s.v&&s.v[v.id])v.ld(s.v[v.id])});
    refreshRail()}};
  go(st.f,true)}});
})();
