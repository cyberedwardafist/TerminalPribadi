// App "aset" (dock). Catatan aset yang dimiliki dan penjualannya. Berdiri sendiri; data di localStorage 'tc.aset' {v:1,tx:[...]}.
// Model buku transaksi:
//   Beli  = aset bertambah sebesar jumlah x harga beli. Saham dihitung per lot (1 lot = 100 lembar):
//           1 lot BBCA @6.000 = 1 x 100 x 6.000 = Rp 600.000.
//   Jual  = aset berkurang sebesar MODAL bagian yang dijual (harga rata-rata beli x jumlah), bukan sebesar harga jual.
//           Selisih harga jual dan modal dicatat sebagai untung/rugi terealisasi.
// tx: {id, k:'b'|'s', ty, sym, q (jumlah dalam satuan tampil, mis. lot), p (harga per satuan dasar, mis. per lembar), d:'YYYY-MM-DD', n, cre, upd}
(()=>{
const KEY='tc.aset',EPS=1e-9;
const TY={
 saham:{n:'Saham',u:'lot',mul:100,pr:'Harga per lembar',c:'#5b9bd5',ph:'mis. BBCA'},
 kripto:{n:'Kripto',u:'koin',mul:1,pr:'Harga per koin',c:'#e8a33d',ph:'mis. BTC'},
 emas:{n:'Emas',u:'gram',mul:1,pr:'Harga per gram',c:'#9b7fd6',ph:'mis. Emas Antam'},
 reksa:{n:'Reksadana',u:'unit',mul:1,pr:'Harga per unit',c:'#4fb3a9',ph:'mis. Reksa Dana Pasar Uang'},
 lain:{n:'Lainnya',u:'unit',mul:1,pr:'Harga per unit',c:'#8b94a3',ph:'mis. Motor, Tanah'}};
const TK=Object.keys(TY);

// ---------- format ----------
const esc=s=>String(s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');
const nf=new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}),nfp=new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}),nfq=new Intl.NumberFormat('id-ID',{maximumFractionDigits:8}),nfi=new Intl.NumberFormat('id-ID',{useGrouping:false,maximumFractionDigits:8});
const rp=(v,sg)=>{v=Math.round(v||0);return(v>0?(sg?'+':''):v<0?'\u2212':'')+'Rp\u00a0'+nf.format(Math.abs(v))};
const pct=v=>(v>0?'+':v<0?'\u2212':'')+nfp.format(Math.abs(v))+'%';
const pad=n=>String(n).padStart(2,'0');
const today=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const fd=s=>new Date(s+'T00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const cl=v=>v>0?'up':v<0?'dn':'';
// Format Indonesia: titik = pemisah ribuan ("6.000", "1.250.000"), koma = desimal ("0,5"). "0.005" tetap desimal. NaN bila tidak terbaca.
const num=s=>{s=String(s).replace(/[^\d.,]/g,'');if(!s)return NaN;
 const v=/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(s)?s.replace(/\./g,'').replace(',','.'):s.replace(',','.');
 const n=Number(v);return isFinite(n)?n:NaN};
const r8=x=>Math.round(x*1e8)/1e8;
const mulOf=ty=>TY[ty].mul,U=t=>t.q*mulOf(t.ty);          // U = jumlah dalam satuan dasar (lembar untuk saham)
const qt=(ty,u)=>nfq.format(r8(u/mulOf(ty)))+'\u00a0'+TY[ty].u;
const nameOf=(ty,s)=>ty==='saham'||ty==='kripto'?s.toUpperCase():s;

// ---------- buku transaksi -> posisi ----------
// Urut tanggal lalu waktu input. Jual yang melebihi jumlah yang dimiliki pada saat itu masuk `bad` (tidak dihitung).
function ledger(list){
 const L=[...list].sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:a.cre-b.cre),H=new Map(),per={},bad=[];let real=0,ns=0;
 for(const t of L){
  const key=t.ty+'|'+t.sym.toLowerCase(),u=U(t),val=u*t.p;let h=H.get(key);
  if(t.k==='b'){if(!h)H.set(key,h={key,sym:t.sym,ty:t.ty,u:0,cost:0});h.u=r8(h.u+u);h.cost+=val;per[t.id]={val}}
  else if(!h||u>h.u+EPS){bad.push(t.id);per[t.id]={val,cost:0,pl:0}}
  else{const cost=h.cost*u/h.u;h.u=r8(h.u-u);h.cost=h.u<=EPS?0:h.cost-cost;per[t.id]={val,cost,pl:val-cost};real+=val-cost;ns++}}
 const hold=[...H.values()].filter(h=>h.u>EPS).map(h=>({...h,avg:h.cost/h.u})).sort((a,b)=>b.cost-a.cost);
 return{hold,total:hold.reduce((a,h)=>a+h.cost,0),real,ns,per,bad}}
window.AsetCalc={ledger,num};   // hanya untuk tes (tests/aset.test.js); app lain tidak boleh memakainya

// ---------- penyimpanan ----------
function norm(x){
 if(!x||typeof x!=='object')return null;
 const ty=TY[x.ty]?x.ty:'lain',q=+x.q,p=+x.p,sym=String(x.sym||'').trim().slice(0,40);
 if(!sym||!(q>0)||!(p>=0)||!isFinite(q)||!isFinite(p))return null;
 return{id:String(x.id||uid()).slice(0,40),k:x.k==='s'?'s':'b',ty,sym,q,p,d:/^\d{4}-\d{2}-\d{2}$/.test(x.d)?x.d:today(),n:String(x.n||'').slice(0,300),cre:+x.cre||Date.now(),upd:+x.upd||Date.now()}}
function load(){try{const j=JSON.parse(localStorage.getItem(KEY)||'null');return j&&Array.isArray(j.tx)?j.tx.slice(0,5000).map(norm).filter(Boolean):[]}catch(e){return[]}}
const IC={
 plus:'<path d="M12 5v14M5 12h14"/>',
 edit:'<path d="M5 19l1-4L16 5l3 3L9 18z"/><path d="M14 7l3 3"/>',
 del:'<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>'};
const ic=p=>`<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;

registerApp('aset',{css:'apps/aset/aset.css',t:'Aset',w:940,h:620,flush:1,
 icon:'<path d="M4 7a2 2 0 012-2h11v3"/><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M16 13h3"/>',
 html:()=>`<div class="as-w"><div class="as">
 <div class="as-top">
  <div class="as-kpi"></div>
  <div class="as-act"><button type="button" class="btn pri" data-a="add">Tambah aset</button><button type="button" class="btn" data-a="sell">Jual aset</button></div>
 </div>
 <div class="as-alloc"></div>
 <div class="as-bar"><div class="seg" role="group" aria-label="Tampilan"><button type="button" data-t="port" aria-pressed="true">Portofolio</button><button type="button" data-t="log" aria-pressed="false">Riwayat</button></div><small class="as-msg" role="status" aria-live="polite"></small></div>
 <div class="as-body"></div>
 <div class="as-md" hidden></div>
</div></div>`,

 init(w){
  const q=s=>$(s,w);
  let tx=load(),tab='port',L=ledger(tx),msgT=0,back=null;
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({v:1,tx}));return true}catch(e){return false}};
  const say=(m,bad)=>{const e=q('.as-msg');e.textContent=m;e.style.color=bad?'var(--dn)':'';clearTimeout(msgT);if(m)msgT=setTimeout(()=>{e.textContent=''},5000)};

  // ---------- tampilan ----------
  function render(){
   L=ledger(tx);
   q('.as-kpi').innerHTML=`
    <div class="as-k"><span>Total aset</span><b>${rp(L.total)}</b><small>${L.hold.length} aset dipegang</small></div>
    <div class="as-k"><span>Untung / rugi terealisasi</span><b class="${cl(L.real)}">${rp(L.real,1)}</b><small>${L.ns?`dari ${L.ns} penjualan`:'belum ada penjualan'}</small></div>`;
   q('[data-a=sell]').disabled=!L.hold.length;
   const by={};L.hold.forEach(h=>by[h.ty]=(by[h.ty]||0)+h.cost);
   const ks=TK.filter(k=>by[k]>0);
   q('.as-alloc').hidden=!ks.length;
   q('.as-alloc').innerHTML=ks.length?`<div class="as-ab" role="img" aria-label="Komposisi aset">${ks.map(k=>`<i style="flex:${by[k]};background:${TY[k].c}"></i>`).join('')}</div><ul class="as-lg">${ks.map(k=>`<li><i style="background:${TY[k].c}"></i>${TY[k].n} <b>${nfp.format(by[k]/L.total*100)}%</b></li>`).join('')}</ul>`:'';
   $$('[data-t]',w).forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===tab));
   q('.as-body').innerHTML=tab==='port'?portHtml():logHtml()}

  function portHtml(){
   if(!L.hold.length)return`<div class="as-em"><div class="empty"><b>Belum ada aset</b><p>Catat aset yang kamu miliki. Contoh: saham BBCA 1 lot di harga 6.000 per lembar berarti nilai asetmu Rp 600.000 (1 lot = 100 lembar). Aset berikutnya ditambahkan ke total.</p><button type="button" class="btn pri" data-a="add">Tambah aset pertama</button></div></div>`;
   return`<div class="as-t" role="table" aria-label="Aset yang dimiliki">
    <div class="as-r as-p as-hd" role="row"><span role="columnheader">Aset</span><span role="columnheader" class="n x">Jumlah</span><span role="columnheader" class="n x">Harga rata-rata</span><span role="columnheader" class="n">Nilai</span><span role="columnheader" class="n x">Porsi</span><span role="columnheader"><span class="sr">Aksi</span></span></div>
    ${L.hold.map(h=>`<div class="as-r as-p" role="row">
     <span role="cell" class="as-nm"><b>${esc(h.sym)}</b><small><i class="as-dot" style="background:${TY[h.ty].c}"></i>${TY[h.ty].n}<span class="as-nr"> \u00b7 ${qt(h.ty,h.u)}</span></small></span>
     <span role="cell" class="n x">${qt(h.ty,h.u)}</span>
     <span role="cell" class="n x">${rp(h.avg)}</span>
     <span role="cell" class="n"><b>${rp(h.cost)}</b></span>
     <span role="cell" class="n x">${nfp.format(h.cost/L.total*100)}%</span>
     <span role="cell" class="as-ac"><button type="button" class="nb" data-a="more" data-k="${esc(h.key)}" aria-label="Beli lagi ${esc(h.sym)}">Beli</button><button type="button" class="nb" data-a="sell" data-k="${esc(h.key)}" aria-label="Jual ${esc(h.sym)}">Jual</button></span>
    </div>`).join('')}
    <div class="as-r as-p as-ft" role="row"><span role="cell">Total</span><span class="x"></span><span class="x"></span><span role="cell" class="n"><b>${rp(L.total)}</b></span><span class="x"></span><span></span></div>
   </div>`}

  function logHtml(){
   if(!tx.length)return`<div class="as-em"><div class="empty">Belum ada transaksi.</div></div>`;
   const rows=[...tx].sort((a,b)=>a.d<b.d?1:a.d>b.d?-1:b.cre-a.cre);
   return`<div class="as-t" role="table" aria-label="Riwayat transaksi">
    <div class="as-r as-l as-hd" role="row"><span role="columnheader">Transaksi</span><span role="columnheader" class="n x">Jumlah</span><span role="columnheader" class="n x">Harga</span><span role="columnheader" class="n">Nilai</span><span role="columnheader" class="n">Untung / rugi</span><span role="columnheader"><span class="sr">Aksi</span></span></div>
    ${rows.map(t=>{const e=L.per[t.id]||{val:U(t)*t.p},bad=L.bad.includes(t.id),s=t.k==='s';
     return`<div class="as-r as-l${bad?' as-bad':''}" role="row">
      <span role="cell" class="as-nm"><b><em class="as-bj ${s?'s':'b'}">${s?'Jual':'Beli'}</em>${esc(t.sym)}</b><small>${fd(t.d)}<span class="as-nr"> \u00b7 ${qt(t.ty,U(t))} \u00d7 ${rp(t.p)}</span>${t.n?` \u00b7 ${esc(t.n)}`:''}${bad?' \u00b7 melebihi jumlah yang dimiliki':''}</small></span>
      <span role="cell" class="n x">${qt(t.ty,U(t))}</span>
      <span role="cell" class="n x">${rp(t.p)}</span>
      <span role="cell" class="n">${rp(e.val)}</span>
      <span role="cell" class="n">${s&&!bad?`<b class="${cl(e.pl)}">${rp(e.pl,1)}</b><small class="as-pc ${cl(e.pl)}">${e.cost?pct(e.pl/e.cost*100):''}</small>`:'\u2013'}</span>
      <span role="cell" class="as-ac"><button type="button" class="as-ib" data-a="edit" data-id="${esc(t.id)}" aria-label="Ubah transaksi ${esc(t.sym)}">${ic(IC.edit)}</button><button type="button" class="as-ib dn" data-a="del" data-id="${esc(t.id)}" aria-label="Hapus transaksi ${esc(t.sym)}">${ic(IC.del)}</button></span>
     </div>`}).join('')}
   </div>`}

  // ---------- form ----------
  const md=q('.as-md');
  const behind=on=>$$('.as>:not(.as-md)',w).forEach(e=>{e.inert=on});   // fokus keyboard tidak keluar dari form
  function closeForm(){md.hidden=true;md.innerHTML='';behind(false);const b=back;back=null;b&&b.isConnected&&b.focus({preventScroll:true})}
  function open(html){back=document.activeElement;md.innerHTML=`<div class="as-sh">${html}</div>`;md.hidden=false;behind(true);const f=$('.as-in:not([disabled])',md);f&&f.focus({preventScroll:true});return $('form',md)}
  const fld=(l,body,c)=>`<label class="as-f${c?' '+c:''}"><span>${l}</span>${body}</label>`;
  const inp=(n,v,ph,x)=>`<input class="as-in" name="${n}" value="${esc(v)}" placeholder="${esc(ph||'')}" autocomplete="off" ${x||''}>`;

  function buyForm(o){
   const e=o.edit,ty0=e?e.ty:(o.ty||'saham');
   const fm=open(`<form class="as-fm" novalidate aria-label="${e?'Ubah pembelian':'Tambah aset'}">
    <h3>${e?'Ubah pembelian':'Tambah aset'}</h3>
    <div class="as-g">
     ${fld('Jenis',`<select name="ty">${TK.map(k=>`<option value="${k}"${k===ty0?' selected':''}>${TY[k].n}</option>`).join('')}</select>`)}
     ${fld('Kode / nama aset',inp('sym',e?e.sym:o.sym||'',TY[ty0].ph,'maxlength="40"'))}
     ${fld('Jumlah <em data-u></em>',inp('q',e?nfi.format(e.q):'','','inputmode="decimal"'))}
     ${fld('<em data-pr></em> (Rp)',inp('p',e?nfq.format(e.p):'','','inputmode="decimal"'))}
     ${fld('Tanggal beli',`<input type="date" name="d" value="${e?e.d:today()}">`)}
     ${fld('Catatan (opsional)',inp('n',e?e.n:'','','maxlength="300"'))}
    </div>
    <div class="as-pv" aria-live="polite"></div><small class="as-er" role="alert"></small>
    <div class="as-fb"><button type="button" class="btn" data-a="x">Batal</button><button type="submit" class="btn pri">${e?'Simpan perubahan':'Simpan'}</button></div></form>`);
   const f=fm.elements,er=$('.as-er',fm),pv=$('.as-pv',fm);
   const calc=()=>{
    const ty=f.ty.value,T=TY[ty],qv=num(f.q.value),pr=num(f.p.value);
    $('[data-u]',fm).textContent='('+T.u+(T.mul>1?', 1 '+T.u+' = '+T.mul+' lembar':'')+')';$('[data-pr]',fm).textContent=T.pr;f.sym.placeholder=T.ph;
    pv.innerHTML=qv>0&&pr>0?`<span>Nilai aset</span><b>${rp(qv*T.mul*pr)}</b><small>${nfq.format(qv)} ${T.u}${T.mul>1?` \u00d7 ${T.mul} lembar`:''} \u00d7 ${rp(pr)}</small>`:'<span>Nilai aset = jumlah \u00d7 harga beli</span>'};
   fm.addEventListener('input',calc);fm.addEventListener('change',calc);calc();
   fm.onsubmit=ev=>{ev.preventDefault();
    const ty=f.ty.value,sym=f.sym.value.trim(),qv=num(f.q.value),pr=num(f.p.value),d=f.d.value;
    const bad=!sym?'Isi kode atau nama aset.':!(qv>0)?'Jumlah harus lebih dari 0.':!(pr>0)?'Harga beli harus lebih dari 0.':!/^\d{4}-\d{2}-\d{2}$/.test(d)?'Pilih tanggal beli.':qv*mulOf(ty)*pr>1e15?'Nilai terlalu besar.':'';
    if(bad){er.textContent=bad;return}
    const now=Date.now(),t=norm({id:e?e.id:uid(),k:'b',ty,sym:nameOf(ty,sym),q:qv,p:pr,d,n:f.n.value.trim(),cre:e?e.cre:now,upd:now});
    commit(e?tx.map(x=>x.id===e.id?t:x):[...tx,t],er,e?`Pembelian ${t.sym} diperbarui`:`${t.sym} ditambahkan: ${rp(U(t)*t.p)}`)}}

  function sellForm(o){
   const e=o.edit,key0=e?e.ty+'|'+e.sym.toLowerCase():o.key;
   // saat mengubah penjualan, jumlah yang dimiliki dihitung tanpa transaksi ini
   const hs=e?ledger(tx.filter(x=>x.id!==e.id)).hold:L.hold,h0=hs.find(h=>h.key===key0)||hs[0];
   if(!h0){say('Tidak ada aset yang bisa dijual',1);return}
   const fm=open(`<form class="as-fm" novalidate aria-label="${e?'Ubah penjualan':'Jual aset'}">
    <h3>${e?'Ubah penjualan':'Jual aset'}</h3>
    <div class="as-g">
     ${fld('Aset yang dijual',e?`<input class="as-in" value="${esc(h0.sym)}" disabled><input type="hidden" name="key" value="${esc(h0.key)}">`:`<select name="key">${hs.map(h=>`<option value="${esc(h.key)}"${h.key===h0.key?' selected':''}>${esc(h.sym)} \u00b7 ${TY[h.ty].n} \u00b7 ${qt(h.ty,h.u)}</option>`).join('')}</select>`,'as-w2')}
     <div class="as-hv as-w2" data-hv></div>
     <label class="as-f"><span>Jumlah dijual <em data-u></em></span><span class="as-ro">${inp('q',e?nfi.format(e.q):'','','inputmode="decimal"')}<button type="button" class="nb" data-a="all">Semua</button></span></label>
     ${fld('<em data-pr></em> (Rp)',inp('p',e?nfq.format(e.p):'','','inputmode="decimal"'))}
     ${fld('Tanggal jual',`<input type="date" name="d" value="${e?e.d:today()}">`)}
     ${fld('Catatan (opsional)',inp('n',e?e.n:'','','maxlength="300"'))}
    </div>
    <div class="as-pv" aria-live="polite"></div><small class="as-er" role="alert"></small>
    <div class="as-fb"><button type="button" class="btn" data-a="x">Batal</button><button type="submit" class="btn pri">${e?'Simpan perubahan':'Catat penjualan'}</button></div></form>`);
   const f=fm.elements,er=$('.as-er',fm),pv=$('.as-pv',fm),H=()=>hs.find(h=>h.key===f.key.value)||h0;
   const calc=()=>{
    const h=H(),T=TY[h.ty],qv=num(f.q.value),pr=num(f.p.value);
    $('[data-u]',fm).textContent='('+T.u+')';$('[data-pr]',fm).textContent=T.pr.replace('Harga','Harga jual');
    $('[data-hv]',fm).innerHTML=`Dimiliki <b>${qt(h.ty,h.u)}</b> \u00b7 harga rata-rata <b>${rp(h.avg)}</b> \u00b7 nilai <b>${rp(h.cost)}</b>`;
    if(qv>0&&pr>0&&qv*T.mul<=h.u+EPS){
     const u=qv*T.mul,val=u*pr,cost=h.cost*u/h.u,pl=val-cost;
     pv.innerHTML=`<span>Hasil jual</span><b>${rp(val)}</b><small>modal ${rp(cost)} \u00b7 <em class="${cl(pl)}">${pl>=0?'untung':'rugi'} ${rp(pl,1)}${cost?' ('+pct(pl/cost*100)+')':''}</em></small><small class="as-dn">Total aset berkurang ${rp(cost)}</small>`}
    else if(qv>0&&qv*T.mul>h.u+EPS)pv.innerHTML=`<span class="dn">Melebihi yang dimiliki (${qt(h.ty,h.u)})</span>`;
    else pv.innerHTML='<span>Aset berkurang sebesar modal yang dijual; selisihnya jadi untung / rugi</span>'};
   fm.addEventListener('input',calc);fm.addEventListener('change',calc);calc();
   fm.onclick=ev=>{if(ev.target.closest('[data-a=all]')){const h=H();f.q.value=nfi.format(r8(h.u/mulOf(h.ty)));calc()}};
   fm.onsubmit=ev=>{ev.preventDefault();
    const h=H(),qv=num(f.q.value),pr=num(f.p.value),d=f.d.value;
    const bad=!(qv>0)?'Jumlah dijual harus lebih dari 0.':qv*mulOf(h.ty)>h.u+EPS?`Jumlah melebihi yang dimiliki (${qt(h.ty,h.u)}).`:!(pr>0)?'Harga jual harus lebih dari 0.':!/^\d{4}-\d{2}-\d{2}$/.test(d)?'Pilih tanggal jual.':'';
    if(bad){er.textContent=bad;return}
    const now=Date.now(),t=norm({id:e?e.id:uid(),k:'s',ty:h.ty,sym:h.sym,q:qv,p:pr,d,n:f.n.value.trim(),cre:e?e.cre:now,upd:now});
    const nx=e?tx.map(x=>x.id===e.id?t:x):[...tx,t],pl=ledger(nx).per[t.id];
    commit(nx,er,`Terjual ${t.sym}: aset berkurang ${rp(pl?pl.cost:0)}, ${pl&&pl.pl<0?'rugi':'untung'} ${rp(pl?pl.pl:0,1)}`)}}

  // Simpan hanya bila urutan tanggal tetap masuk akal (tidak ada penjualan yang melebihi kepemilikan pada tanggalnya)
  function commit(next,er,ok){
   const lg=ledger(next);
   if(lg.bad.some(id=>!L.bad.includes(id))){er.textContent='Pada tanggal itu jumlah yang dimiliki tidak cukup untuk penjualan. Cek tanggal dan jumlahnya.';return}
   const old=tx;tx=next;
   if(!save()){tx=old;er.textContent='Penyimpanan browser penuh, data tidak tersimpan.';return}
   closeForm();render();say(ok)}

  // ---------- interaksi ----------
  w.addEventListener('click',async e=>{
   const b=e.target.closest('button');if(!b)return;const D=b.dataset;
   if(D.t){tab=D.t;render();return}
   const act=D.a;if(!act)return;
   if(act==='add')buyForm({});
   else if(act==='more'){const h=L.hold.find(x=>x.key===D.k);if(h)buyForm({ty:h.ty,sym:h.sym})}
   else if(act==='sell')sellForm({key:D.k});
   else if(act==='x')closeForm();
   else if(act==='edit'){const t=tx.find(x=>x.id===D.id);if(t)(t.k==='s'?sellForm:buyForm)({edit:t})}
   else if(act==='del'){
    const t=tx.find(x=>x.id===D.id);if(!t)return;
    const next=tx.filter(x=>x.id!==t.id);
    if(ledger(next).bad.length){await dlg.alert('Tidak bisa dihapus','Pembelian ini dipakai oleh penjualan sesudahnya. Hapus atau ubah penjualannya dulu.');return}
    if(!await dlg.confirm('Hapus transaksi?',`${t.k==='s'?'Jual':'Beli'} ${t.sym}, ${qt(t.ty,U(t))} \u00d7 ${rp(t.p)} (${fd(t.d)})`,{ok:'Hapus',danger:true}))return;
    tx=next;if(!save())say('Penyimpanan browser penuh',1);else say('Transaksi dihapus');render()}});
  // Esc menutup form saja (bukan window); klik di luar kotak form = batal
  md.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();closeForm()}});
  md.addEventListener('pointerdown',e=>{if(e.target===md)closeForm()});

  // Sesi (core/session.js): ingat tab yang sedang dibuka
  w._ses={get:()=>({tab}),set:s=>{if(s&&(s.tab==='port'||s.tab==='log')){tab=s.tab;render()}}};
  render()}});
})();
