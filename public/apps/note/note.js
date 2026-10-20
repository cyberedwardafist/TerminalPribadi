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
  go(st.f,true)},

 notes:[
  '<b>Jurnal trading</b> : <code>GET/POST /api/journal/trades</code>, <code>PUT/DELETE /api/journal/trades/:id</code>. Bentuk trade <code>{id, date, time, timeEnd, sym, side: buy|sell, res: profit|loss|impas, amount (Rupiah, selalu positif), method, fields:[{k,v}], note, eval, imgs[], cre, upd}</code>. Net harian = jumlah profit dikurangi loss pada tanggal itu',
  '<b>Gambar bukti</b> : <code>POST /api/journal/images</code> (multipart) lalu simpan id di <code>imgs[]</code>; <code>GET /api/journal/images/:id</code>. Maks 8 per jurnal, otomatis diperkecil ke 1400px. Mode Dummy: hanya di IndexedDB browser. Mode Live: IndexedDB jadi cache, gambar diunggah ke server dengan id yang sama (<code>POST /api/journal/images?id=ID</code>, antrean + ulang otomatis bila offline) dan diunduh di perangkat lain saat dibuka',
  '<b>Catatan ilmu/umum</b> : <code>GET /api/notes?cat=&tag=&q=</code>, <code>POST /api/notes</code>, <code>PUT/DELETE /api/notes/:id</code>; bentuk <code>{id, cat: ilmu|umum, html, tags[], pin, cre, upd}</code>. Isi HTML terbatas; server wajib menyaring ulang',
  'Mode Dummy: semua di browser (localStorage <code>tc.notes</code>, <code>tc.journal</code>, IndexedDB <code>tc-journal</code>). Tombol Ekspor/Impor JSON (termasuk gambar) dipakai sebagai cadangan dan pindah perangkat']});
})();
