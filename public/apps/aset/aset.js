// App "aset" (dock). Catatan aset yang dimiliki, nilai pasarnya, penjualannya, dan grafik nilai aset. Berdiri sendiri; data di localStorage 'tc.aset' {v:1,tx:[...],px:{<kunci aset>:[{d,p}]}}.
// Model buku transaksi:
//   Beli  = posisi bertambah, modal bertambah sebesar jumlah x harga beli. Saham dihitung per lot (1 lot = 100 lembar):
//           1 lot BBCA @6.000 = 1 x 100 x 6.000 = Rp 600.000. Beli lagi aset yang sama = harga rata-rata tertimbang (5.000 lalu 6.000, jumlah sama -> 5.500).
//   Jual  = modal berkurang sebesar MODAL bagian yang dijual (harga rata-rata beli x jumlah), bukan sebesar harga jual.
//           Selisih harga jual dan modal dicatat sebagai untung/rugi terealisasi.
// Model nilai pasar:
//   Nilai aset = jumlah x harga sekarang. Harga sekarang, urutan: live dari server (saham IDX KODE.JK, kripto KODEUSDT x USDIDR) -> penutupan harian terakhir
//   bila quote gagal -> harga manual (tombol Harga; untuk emas, reksadana, lainnya) -> modal bila belum ada apa pun (ditandai "belum ada harga").
//   Untung/rugi belum terealisasi = nilai pasar - modal. Semua aset dijumlah, jadi rugi satu aset ditutup untung aset lain.
//   Grafik nilai aset = deret harian sejak tanggal beli pertama (harga harian dari /api/candles tf 1D, atau titik harga manual), plus garis modal.
// tx: {id, k:'b'|'s', ty, sym, q (jumlah dalam satuan tampil, mis. lot), p (harga per satuan dasar, mis. per lembar), d:'YYYY-MM-DD', n, cre, upd}
// px: harga manual per kunci aset (ty|kode huruf kecil) -> [{d:'YYYY-MM-DD', p (per satuan dasar)}] terurut tanggal
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
// label sumbu: Rp 1,25 jt / Rp 600 rb / Rp 2,3 M (miliar) / Rp 1,1 T (triliun)
const rpc=v=>{const a=Math.abs(v),sg=v<0?'\u2212':'',f=(x,u)=>sg+'Rp\u00a0'+nfp.format(x)+'\u00a0'+u;return a>=1e12?f(a/1e12,'T'):a>=1e9?f(a/1e9,'M'):a>=1e6?f(a/1e6,'jt'):a>=1e3?f(a/1e3,'rb'):sg+'Rp\u00a0'+nf.format(a)};
const fds=(s,y)=>new Date(s+'T00:00').toLocaleDateString('id-ID',y?{day:'numeric',month:'short',year:'2-digit'}:{day:'numeric',month:'short'});
const niceTicks=(lo,hi,c)=>{const raw=(hi-lo)/c,m=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/m,st=(f<1.5?1:f<3?2:f<7?5:10)*m,out=[];for(let v=Math.ceil(lo/st-1e-9)*st;v<=hi+st*1e-9;v+=st)out.push(Math.round(v/st)*st+0);return out};   // +0 mengubah -0 menjadi 0
// tanggal 'YYYY-MM-DD' <-> nomor hari (UTC murni, tidak terpengaruh zona waktu)
const dn=s=>Math.round(Date.parse(s+'T00:00:00Z')/864e5),dOf=n=>new Date(n*864e5).toISOString().slice(0,10);
// elemen terakhir (array terurut menurut .d) yang tanggalnya <= d, atau null
const lastLE=(a,d)=>{let lo=0,hi=a.length-1,r=null;while(lo<=hi){const m=(lo+hi)>>1;if(a[m].d<=d){r=a[m];lo=m+1}else hi=m-1}return r};
// sumber harga live: saham = IDX (KODE.JK, rupiah), kripto = pasangan USDT (dikali kurs USDIDR). Jenis lain hanya manual. null = tidak ada sumber.
const feedOf=h=>{
 if(h.ty==='saham'){const b=String(h.sym).toUpperCase().replace(/\s+/g,'').replace(/\.JK$/,'');return /^[A-Z0-9]{2,6}$/.test(b)?{sym:b+'.JK',usd:false}:null}
 if(h.ty==='kripto'){const b=String(h.sym).toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/USDT$/,'');return b&&b.length<=12?{sym:b+'USDT',usd:true}:null}
 return null};

// ---------- buku transaksi -> posisi ----------
// Urut tanggal lalu waktu input. Jual yang melebihi jumlah yang dimiliki pada saat itu masuk `bad` (tidak dihitung).
function ledger(list){
 const L=[...list].sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:a.cre-b.cre),H=new Map(),per={},bad=[],hist=new Map();let real=0,ns=0;
 const mark=(key,t,h)=>{let a=hist.get(key);if(!a)hist.set(key,a=[]);a.push({d:t.d,u:h.u,cost:h.cost})};   // posisi sesudah tiap transaksi sah, dasar grafik
 for(const t of L){
  const key=t.ty+'|'+t.sym.toLowerCase(),u=U(t),val=u*t.p;let h=H.get(key);
  if(t.k==='b'){if(!h)H.set(key,h={key,sym:t.sym,ty:t.ty,u:0,cost:0});h.u=r8(h.u+u);h.cost+=val;per[t.id]={val};mark(key,t,h)}
  else if(!h||u>h.u+EPS){bad.push(t.id);per[t.id]={val,cost:0,pl:0}}
  else{const cost=h.cost*u/h.u;h.u=r8(h.u-u);h.cost=h.u<=EPS?0:h.cost-cost;per[t.id]={val,cost,pl:val-cost};real+=val-cost;ns++;mark(key,t,h)}}
 const hold=[...H.values()].filter(h=>h.u>EPS).map(h=>({...h,avg:h.cost/h.u})).sort((a,b)=>b.cost-a.cost);
 return{hold,total:hold.reduce((a,h)=>a+h.cost,0),real,ns,per,bad,hist,all:[...H.values()].map(h=>({key:h.key,ty:h.ty,sym:h.sym}))}}
// Deret harian dari `from` sampai `to`: {d, v (nilai pasar semua aset yang dipegang hari itu), c (modalnya)}.
// px(key,d) = harga per satuan dasar pada hari d atau null; null = nilai aset itu dihitung sebesar modalnya (set `fb` = kunci yang begitu pada hari terakhir).
function series(hist,from,to,px){
 const ks=[...hist.keys()],pt=ks.map(()=>-1),a=dn(from),n=dn(to)-a,pts=[];let fb=new Set();
 for(let i=0;i<=n;i++){
  const d=dOf(a+i);let v=0,c=0;fb=new Set();
  for(let j=0;j<ks.length;j++){
   const H=hist.get(ks[j]);while(pt[j]+1<H.length&&H[pt[j]+1].d<=d)pt[j]++;
   const s=pt[j]<0?null:H[pt[j]];if(!s||s.u<=EPS)continue;
   const p=px(ks[j],d);c+=s.cost;if(p==null){v+=s.cost;fb.add(ks[j])}else v+=s.u*p}
  pts.push({d,v,c})}
 return{pts,fb}}
window.AsetCalc={ledger,num,series,lastLE,feedOf,niceTicks};   // hanya untuk tes (tests/aset.test.js); app lain tidak boleh memakainya

// ---------- penyimpanan ----------
function norm(x){
 if(!x||typeof x!=='object')return null;
 const ty=TY[x.ty]?x.ty:'lain',q=+x.q,p=+x.p,sym=String(x.sym||'').trim().slice(0,40);
 if(!sym||!(q>0)||!(p>=0)||!isFinite(q)||!isFinite(p))return null;
 return{id:String(x.id||uid()).slice(0,40),k:x.k==='s'?'s':'b',ty,sym,q,p,d:/^\d{4}-\d{2}-\d{2}$/.test(x.d)?x.d:today(),n:String(x.n||'').slice(0,300),cre:+x.cre||Date.now(),upd:+x.upd||Date.now()}}
function load(){try{const j=JSON.parse(localStorage.getItem(KEY)||'null');return j&&Array.isArray(j.tx)?j.tx.slice(0,5000).map(norm).filter(Boolean):[]}catch(e){return[]}}
// harga manual: satu titik per tanggal, maks 400 titik per aset dan 200 aset
function loadPx(){try{const j=JSON.parse(localStorage.getItem(KEY)||'null'),o=j&&j.px,out={};if(!o||typeof o!=='object')return out;
 for(const k of Object.keys(o).slice(0,200)){const a=o[k];if(!Array.isArray(a)||k.length>90)continue;
  const m=new Map();for(const x of a.slice(-400)){const p=x&&+x.p;if(x&&/^\d{4}-\d{2}-\d{2}$/.test(x.d)&&p>0&&isFinite(p))m.set(x.d,p)}
  if(m.size)out[k]=[...m].sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:0).map(([d,p])=>({d,p}))}
 return out}catch(e){return{}}}
const IC={
 plus:'<path d="M12 5v14M5 12h14"/>',
 edit:'<path d="M5 19l1-4L16 5l3 3L9 18z"/><path d="M14 7l3 3"/>',
 del:'<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>'};
const ic=p=>`<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;

registerApp('aset',{css:'apps/aset/aset.css',t:'Aset',w:940,h:680,flush:1,
 icon:'<path d="M4 7a2 2 0 012-2h11v3"/><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M16 13h3"/>',
 html:()=>`<div class="as-w"><div class="as">
 <div class="as-fs"></div>
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
  let tx=load(),MAN=loadPx(),tab='port',L=ledger(tx),ALL=new Map(),msgT=0,back=null,CR=0,CM='rp',TDAY=today();
  const save=()=>{try{
   const keep=new Set(ledger(tx).all.map(a=>a.key)),px={};for(const k of Object.keys(MAN))if(keep.has(k)&&MAN[k].length)px[k]=MAN[k];
   localStorage.setItem(KEY,JSON.stringify({v:1,tx,px}));MAN=px;return true}catch(e){return false}};
  const say=(m,bad)=>{const e=q('.as-msg');e.textContent=m;e.style.color=bad?'var(--dn)':'';clearTimeout(msgT);if(m)msgT=setTimeout(()=>{e.textContent=''},5000)};

  // ---------- harga ----------
  // PX: harga live per kunci aset (rupiah per satuan dasar), hanya di memori. CH: candle harian per simbol sumber [{d,c}] (+ 'USDIDR'). MAN: harga manual (disimpan).
  const PX=new Map(),CH=new Map(),CHM=new Map();
  let BUSY=false,again=false,STALE=null,LG=0,fx=0,HP=null,HFAULT=null;
  // Harga aset pada tanggal d: {p,src} atau null (null = pakai modal). src: live | hist (penutupan harian) | man (manual).
  function priceAt(key,d){
   const a=ALL.get(key),f=a&&feedOf(a);
   if(f){
    if(d>=TDAY){const lv=PX.get(key);if(lv)return{p:lv.p,src:'live'}}
    const b=CH.get(f.sym),c=b&&lastLE(b,d);
    if(c){if(!f.usd)return{p:c.c,src:'hist'};const r=lastLE(CH.get('USDIDR')||[],d);if(r)return{p:c.c*r.c,src:'hist'}}}
   const m=MAN[key],p=m&&lastLE(m,d);return p?{p:p.p,src:'man'}:null}
  // Nilai pasar tiap aset yang dipegang + total. Aset tanpa harga dihitung sebesar modalnya (src 'cost').
  function val(){
   TDAY=today();
   const rows=L.hold.map(h=>{const c=priceAt(h.key,TDAY),p=c?c.p:h.avg,mv=h.u*p,pl=mv-h.cost;return{h,p,src:c?c.src:'cost',mv,pl,pp:h.cost>0?pl/h.cost*100:0}}).sort((a,b)=>b.mv-a.mv);
   const V=rows.reduce((a,r)=>a+r.mv,0);
   return{rows,V,C:L.total,UP:V-L.total,UPp:L.total>0?(V-L.total)/L.total*100:0,nc:rows.filter(r=>r.src==='cost').length}}

  // Ambil harga terakhir dari server (saham IDX, kripto). Gagal: harga lama tetap dipakai dan pita peringatan menjelaskan penyebabnya (Fault).
  async function sync(manual){
   if(BUSY){again=true;return}
   const hs=L.hold.map(h=>({h,f:feedOf(h)})).filter(x=>x.f);
   if(!hs.length){STALE=null;paintFs();return}
   const pre=Fault.pre({what:'quotes'});if(pre){STALE=pre;paintFs();return}
   BUSY=true;
   try{
    const syms=[...new Set(hs.map(x=>x.f.sym))];if(hs.some(x=>x.f.usd))syms.push('USDIDR');
    const got=new Map();
    for(let i=0;i<syms.length;i+=50){
     const list=await apiJson('/api/quotes?symbols='+syms.slice(i,i+50).join(','));
     if(!Array.isArray(list))throw new ApiError('parse',{path:'/api/quotes'});
     for(const x of list)if(x&&x.price>0)got.set(String(x.sym).toUpperCase(),x.price)}
    if(!got.size)throw new ApiError('empty',{what:'quotes',path:'/api/quotes'});
    if(got.get('USDIDR'))fx=got.get('USDIDR');
    const now=Date.now();
    for(const{h,f}of hs){const p=got.get(f.sym);if(!p||(f.usd&&!fx))continue;PX.set(h.key,{p:f.usd?p*fx:p,ts:now})}
    LG=now;STALE=null}
   catch(e){STALE=await Fault.explain(e,{what:'quotes',fresh:!!manual})}
   BUSY=false;
   if(!w.isConnected)return;
   paintFs();paint();
   if(again){again=false;sync()}}
  const paintFs=()=>{q('.as-fs').innerHTML=STALE&&L.hold.some(h=>feedOf(h))?Fault.strip(STALE,LG,'data-as-retry'):''};

  // Candle harian sejak tanggal beli pertama tiap aset (untuk grafik). Disimpan di memori 6 jam; gagal dicoba lagi sekitar 1 menit.
  function needs(){
   const m=new Map();let ufr=null;
   for(const a of L.all){const f=feedOf(a),H=L.hist.get(a.key);if(!f||!H||!H.length)continue;
    const fr=H[0].d;if(!m.has(f.sym)||fr<m.get(f.sym))m.set(f.sym,fr);if(f.usd&&(!ufr||fr<ufr))ufr=fr}
   if(ufr)m.set('USDIDR',ufr);return m}
  function loadHist(){
   if(HP)return HP;
   if(Fault.pre({what:'quotes'}))return Promise.resolve();
   const now=Date.now(),jobs=[...needs()].filter(([s,fr])=>{const c=CHM.get(s);return!c||fr<c.from||now-c.at>216e5});
   if(!jobs.length)return Promise.resolve();
   HP=(async()=>{
    let err=null;
    for(let i=0;i<jobs.length;i+=3)await Promise.all(jobs.slice(i,i+3).map(async([s,fr])=>{
     const n=Math.min(5000,dn(today())-dn(fr)+15);
     try{
      const j=await apiJson('/api/candles?symbol='+encodeURIComponent(s)+'&tf=1D&limit='+n,{timeout:20000});
      if(!Array.isArray(j))throw new ApiError('parse',{path:'/api/candles'});
      const m=new Map();for(const b of j)if(b&&b.c>0&&b.t>0)m.set(dOf(Math.floor(b.t/86400)),b.c);
      CH.set(s,[...m].sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:0).map(([d,c])=>({d,c})));CHM.set(s,{from:fr,at:now})}
     catch(e){err=err||e;CHM.set(s,{from:fr,at:now-216e5+6e4})}}));
    HFAULT=err?await Fault.explain(err,{what:'quotes'}):null})().finally(()=>{HP=null;const e=q('.as-cv');if(e)e.classList.remove('ld')});
   return HP}
  const histKick=()=>{const p=loadHist();if(HP){const e=q('.as-cv');if(e)e.classList.add('ld')}p.then(()=>{if(w.isConnected&&tab==='port')drawChart()}).catch(()=>{})};

  // ---------- tampilan ----------
  function recalc(){L=ledger(tx);ALL=new Map(L.all.map(a=>[a.key,a]))}
  function kpi(T){
   q('.as-kpi').innerHTML=`
    <div class="as-k"><span>Nilai aset</span><b>${rp(T.V)}</b><small>Modal ${rp(T.C)} \u00b7 ${L.hold.length} aset dipegang</small></div>
    <div class="as-k"><span>Untung / rugi belum terealisasi</span><b class="${cl(T.UP)}">${rp(T.UP,1)}</b><small>${T.C>0?pct(T.UPp):'\u2013'}${T.nc?` \u00b7 ${T.nc} aset belum ada harga`:''}</small></div>
    <div class="as-k"><span>Untung / rugi terealisasi</span><b class="${cl(L.real)}">${rp(L.real,1)}</b><small>${L.ns?`dari ${L.ns} penjualan`:'belum ada penjualan'}</small></div>`}
  function alloc(T){
   const by={};T.rows.forEach(r=>by[r.h.ty]=(by[r.h.ty]||0)+r.mv);
   const ks=TK.filter(k=>by[k]>0);
   q('.as-alloc').hidden=!ks.length;
   q('.as-alloc').innerHTML=ks.length?`<div class="as-ab" role="img" aria-label="Komposisi aset">${ks.map(k=>`<i style="flex:${by[k]};background:${TY[k].c}"></i>`).join('')}</div><ul class="as-lg">${ks.map(k=>`<li><i style="background:${TY[k].c}"></i>${TY[k].n} <b>${nfp.format(by[k]/T.V*100)}%</b></li>`).join('')}</ul>`:''}
  function render(){
   recalc();const T=val();
   kpi(T);alloc(T);
   q('[data-a=sell]').disabled=!L.hold.length;
   $$('[data-t]',w).forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===tab));
   q('.as-body').innerHTML=tab==='port'?portHtml(T):logHtml();
   paintFs();
   if(tab==='port'&&L.hold.length){drawChart();histKick()}}
  // pembaruan harga: KPI, komposisi, tabel, dan grafik tanpa membangun ulang seluruh tab
  function paint(){
   const T=val();kpi(T);alloc(T);
   const e=q('.as-pt');if(e&&tab==='port'){e.innerHTML=tableHtml(T);drawChart()}}

  function tableHtml(T){
   const lab={live:'live',hist:'penutupan terakhir',man:'manual',cost:'belum ada harga'};
   return`<div class="as-t" role="table" aria-label="Aset yang dimiliki">
    <div class="as-r as-p as-hd" role="row"><span role="columnheader">Aset</span><span role="columnheader" class="n x">Jumlah</span><span role="columnheader" class="n x">Harga rata-rata</span><span role="columnheader" class="n x">Harga sekarang</span><span role="columnheader" class="n">Nilai</span><span role="columnheader" class="n">Untung / rugi</span><span role="columnheader"><span class="sr">Aksi</span></span></div>
    ${T.rows.map(r=>{const h=r.h,no=r.src==='cost';return`<div class="as-r as-p" role="row">
     <span role="cell" class="as-nm"><b>${esc(h.sym)}</b><small><i class="as-dot" style="background:${TY[h.ty].c}"></i>${TY[h.ty].n}<span class="as-nr"> \u00b7 ${qt(h.ty,h.u)} \u00b7 rata-rata ${rp(h.avg)} \u00b7 sekarang ${no?'\u2013':rp(r.p)}</span></small></span>
     <span role="cell" class="n x">${qt(h.ty,h.u)}</span>
     <span role="cell" class="n x">${rp(h.avg)}</span>
     <span role="cell" class="n x">${no?'\u2013':rp(r.p)}<small class="as-sr ${r.src}">${lab[r.src]}</small></span>
     <span role="cell" class="n"><b>${rp(r.mv)}</b><small class="as-pc">${nfp.format(T.V>0?r.mv/T.V*100:0)}%</small></span>
     <span role="cell" class="n">${no?'\u2013':`<b class="${cl(r.pl)}">${rp(r.pl,1)}</b><small class="as-pc ${cl(r.pl)}">${pct(r.pp)}</small>`}</span>
     <span role="cell" class="as-ac"><button type="button" class="nb" data-a="more" data-k="${esc(h.key)}" aria-label="Beli lagi ${esc(h.sym)}">Beli</button><button type="button" class="nb" data-a="sell" data-k="${esc(h.key)}" aria-label="Jual ${esc(h.sym)}">Jual</button>${r.src==='live'?'':`<button type="button" class="nb" data-a="price" data-k="${esc(h.key)}" aria-label="Isi harga sekarang ${esc(h.sym)}">Harga</button>`}</span>
    </div>`}).join('')}
    <div class="as-r as-p as-ft" role="row"><span role="cell">Total</span><span class="x"></span><span class="x"></span><span class="x"></span><span role="cell" class="n"><b>${rp(T.V)}</b></span><span role="cell" class="n"><b class="${cl(T.UP)}">${rp(T.UP,1)}</b><small class="as-pc ${cl(T.UP)}">${T.C>0?pct(T.UPp):''}</small></span><span></span></div>
   </div>`}

  function portHtml(T){
   if(!L.hold.length)return`<div class="as-em"><div class="empty"><b>Belum ada aset</b><p>Catat aset yang kamu miliki. Contoh: saham BBCA 1 lot di harga 6.000 per lembar berarti modalmu Rp 600.000 (1 lot = 100 lembar). Nilai aset lalu mengikuti harga pasar: kalau BBCA turun ke 3.000, nilainya turun 50%. Semua aset dijumlah jadi satu total dan grafik.</p><button type="button" class="btn pri" data-a="add">Tambah aset pertama</button></div></div>`;
   const rg=[[30,'1 bln'],[90,'3 bln'],[180,'6 bln'],[365,'1 thn'],[0,'Semua']];
   return`<div class="as-ch">
    <div class="as-chh"><h3>Grafik nilai aset</h3><div class="as-cc">
     <div class="seg" role="group" aria-label="Rentang waktu">${rg.map(([v,l])=>`<button type="button" data-rg="${v}" aria-pressed="${CR===v}">${l}</button>`).join('')}</div>
     <div class="seg" role="group" aria-label="Satuan grafik"><button type="button" data-md="rp" aria-pressed="${CM==='rp'}">Rp</button><button type="button" data-md="pc" aria-pressed="${CM==='pc'}" title="Persen terhadap modal">%</button></div>
    </div></div>
    <div class="as-cv"></div><div class="as-cn"></div>
   </div><div class="as-pt">${tableHtml(T)}</div>`}

  // ---------- grafik nilai aset ----------
  function drawChart(){
   const box=q('.as-cv');if(!box)return;
   TDAY=today();
   let first=null;for(const H of L.hist.values())if(H.length&&(!first||H[0].d<first))first=H[0].d;
   const foot=fb=>{
    const names=[...(fb||[])].map(k=>ALL.get(k)).filter(Boolean).map(a=>esc(a.sym));
    q('.as-cn').innerHTML=`<span class="as-lgd"><i class="ln"></i>${CM==='pc'?'Untung / rugi terhadap modal':'Nilai pasar'}</span>${CM==='rp'?'<span class="as-lgd"><i class="cl"></i>Modal</span>':''}`
     +(names.length?`<span class="as-w2n">${names.join(', ')} dihitung sebesar modal karena belum ada harga pasar. Isi lewat tombol Harga.</span>`:'')
     +(HFAULT?`<span class="as-w2n">Harga historis belum bisa diambil: ${esc(HFAULT.title)}.</span>`:'')};
   const msg=t=>{box.innerHTML=`<p class="as-cm">${t}</p>`};
   if(!first||first>TDAY){msg('Belum ada data untuk digambar.');foot();return}
   const{pts:all,fb}=series(L.hist,first,TDAY,(k,d)=>{const r=priceAt(k,d);return r?r.p:null});
   const pts=CR>0?all.slice(-(CR+1)):all,n=pts.length;
   foot(fb);
   if(n<2){msg('Grafik mulai tampil setelah ada data lebih dari satu hari. Aset pertama dicatat hari ini.');return}
   const pc=CM==='pc',ys=pts.map(p=>pc?(p.c>EPS?(p.v/p.c-1)*100:null):p.v),cs=pc?null:pts.map(p=>p.c);
   const vals=ys.filter(v=>v!=null).concat(cs||[]);if(pc)vals.push(0);
   if(!vals.length||ys.every(v=>v==null)){msg('Tidak ada aset yang dipegang pada rentang ini.');return}
   let lo=Math.min(...vals),hi=Math.max(...vals);const min0=lo;
   if(hi-lo<1e-9){const e=Math.abs(hi)*.05||1;lo-=e;hi+=e}
   const pad=(hi-lo)*.08;lo-=pad;hi+=pad;if(!pc&&min0>=0&&lo<0)lo=0;
   const W=Math.max(280,box.clientWidth||w.clientWidth||600),Ht=190,ML=pc?48:66,MR=10,MT=10,MB=22,pw=W-ML-MR,ph=Ht-MT-MB;
   const X=i=>ML+i/(n-1)*pw,Y=v=>MT+(hi-v)/(hi-lo)*ph,f1=x=>x.toFixed(1);
   const segs=[];let st=-1;ys.forEach((v,i)=>{if(v!=null&&st<0)st=i;if((v==null||i===n-1)&&st>=0){segs.push([st,v==null?i-1:i]);st=-1}});
   const pr=(a,b)=>{let s='';for(let i=a;i<=b;i++)s+=(i===a?'M':'L')+f1(X(i))+' '+f1(Y(ys[i]));return s};
   const yb=f1(pc?Y(0):MT+ph),line=segs.map(([a,b])=>pr(a,b)).join(''),area=segs.map(([a,b])=>pr(a,b)+`L${f1(X(b))} ${yb}L${f1(X(a))} ${yb}Z`).join('');
   let cp='';if(cs)cs.forEach((c,i)=>{cp+=i?`L${f1(X(i))} ${f1(Y(cs[i-1]))}`+(c!==cs[i-1]?`L${f1(X(i))} ${f1(Y(c))}`:''):`M${f1(X(0))} ${f1(Y(c))}`});
   const grid=niceTicks(lo,hi,4).map(t=>`<path class="gl" d="M${ML} ${f1(Y(t))}H${W-MR}"/><text x="${ML-6}" y="${f1(Y(t)+3.5)}" text-anchor="end">${pc?(t>0?'+':t<0?'\u2212':'')+nfp.format(Math.abs(t))+'%':rpc(t)}</text>`).join('');
   const long=n>330,xi=[...new Set([0,Math.round((n-1)/3),Math.round((n-1)*2/3),n-1])],
    xl=xi.map((i,k)=>`<text x="${f1(X(i))}" y="${Ht-5}" text-anchor="${k===0?'start':i===n-1?'end':'middle'}">${fds(pts[i].d,long)}</text>`).join('');
   const last=pts[n-1],tone=last.v>=last.c?'up':'dn';
   box.innerHTML=`<svg class="as-sv ${tone}" viewBox="0 0 ${W} ${Ht}" role="img" tabindex="0" aria-label="Grafik nilai aset ${fd(pts[0].d)} sampai ${fd(last.d)}. Nilai sekarang ${rp(last.v)}, modal ${rp(last.c)}. Gunakan panah kiri dan kanan untuk membaca nilai per hari.">
    ${grid}${pc?`<path class="zl" d="M${ML} ${f1(Y(0))}H${W-MR}"/>`:''}
    <path class="ar" d="${area}"/><path class="ln" d="${line}"/>${cp?`<path class="cl" d="${cp}"/>`:''}${xl}
    <g class="hv" style="display:none"><path class="vl" d="M0 ${MT}V${MT+ph}"/><circle class="dt" r="4" cx="0" cy="0"/></g>
    <rect class="ov" x="${ML}" y="${MT}" width="${pw}" height="${ph}" fill="transparent"/>
   </svg><div class="as-tt" hidden></div>`;
   const sv=$('.as-sv',box),hv=$('.hv',sv),tt=$('.as-tt',box);let at=-1;
   const hide=()=>{at=-1;hv.style.display='none';tt.hidden=true};
   const show=i=>{
    i=Math.max(0,Math.min(n-1,i));at=i;const p=pts[i],y=ys[i],x=X(i),pl=p.v-p.c;
    hv.style.display='';$('.vl',hv).setAttribute('d',`M${f1(x)} ${MT}V${MT+ph}`);const dt=$('.dt',hv);dt.setAttribute('cx',f1(x));dt.setAttribute('cy',y==null?-20:f1(Y(y)));
    tt.innerHTML=`<b>${fd(p.d)}</b><span>Nilai pasar <em>${rp(p.v)}</em></span><span>Modal <em>${rp(p.c)}</em></span><span>Untung / rugi <em class="${cl(pl)}">${rp(pl,1)}${p.c>EPS?' ('+pct(pl/p.c*100)+')':''}</em></span>`;
    tt.hidden=false;const sc=(sv.clientWidth||W)/W;let lx=x*sc+12;if(lx+tt.offsetWidth>box.clientWidth-4)lx=x*sc-tt.offsetWidth-12;tt.style.left=Math.max(4,lx)+'px'};
   $('.ov',sv).addEventListener('pointermove',e=>{const r=sv.getBoundingClientRect();show(Math.round(((e.clientX-r.left)*(W/(r.width||W))-ML)/pw*(n-1)))});
   $('.ov',sv).addEventListener('pointerleave',hide);
   sv.addEventListener('keydown',e=>{const k=e.key;if(k==='ArrowLeft'||k==='ArrowRight'||k==='Home'||k==='End'){e.preventDefault();show(k==='Home'?0:k==='End'?n-1:(at<0?n-1:at)+(k==='ArrowLeft'?-1:1))}else if(k==='Escape'&&at>=0){e.stopPropagation();hide()}});
   sv.addEventListener('blur',hide)}

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
    // beli lagi aset yang sudah dipegang: tunjukkan harga rata-rata baru
    const h=L.hold.find(x=>x.key===ty+'|'+f.sym.value.trim().toLowerCase()),ex=e&&e.k==='b'?e:null;
    let av='';if(h&&!ex&&qv>0&&pr>0){const u=qv*T.mul,na=(h.cost+u*pr)/(h.u+u);av=`<small class="as-dn">Harga rata-rata ${rp(h.avg)} menjadi ${rp(na)} (dimiliki ${qt(ty,h.u+u)})</small>`}
    pv.innerHTML=qv>0&&pr>0?`<span>Modal</span><b>${rp(qv*T.mul*pr)}</b><small>${nfq.format(qv)} ${T.u}${T.mul>1?` \u00d7 ${T.mul} lembar`:''} \u00d7 ${rp(pr)}</small>${av}`:'<span>Modal = jumlah \u00d7 harga beli</span>'};
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
   // harga jual awal = harga sekarang aset itu (bila ada), supaya tinggal ubah bila berbeda
   const cp=h=>{TDAY=today();const r=priceAt(h.key,TDAY);return r?nfq.format(r.p):''};
   let auto=e?'':cp(h0);
   const fm=open(`<form class="as-fm" novalidate aria-label="${e?'Ubah penjualan':'Jual aset'}">
    <h3>${e?'Ubah penjualan':'Jual aset'}</h3>
    <div class="as-g">
     ${fld('Aset yang dijual',e?`<input class="as-in" value="${esc(h0.sym)}" disabled><input type="hidden" name="key" value="${esc(h0.key)}">`:`<select name="key">${hs.map(h=>`<option value="${esc(h.key)}"${h.key===h0.key?' selected':''}>${esc(h.sym)} \u00b7 ${TY[h.ty].n} \u00b7 ${qt(h.ty,h.u)}</option>`).join('')}</select>`,'as-w2')}
     <div class="as-hv as-w2" data-hv></div>
     <label class="as-f"><span>Jumlah dijual <em data-u></em></span><span class="as-ro">${inp('q',e?nfi.format(e.q):'','','inputmode="decimal"')}<button type="button" class="nb" data-a="all">Semua</button></span></label>
     ${fld('<em data-pr></em> (Rp)',inp('p',e?nfq.format(e.p):auto,'','inputmode="decimal"'))}
     ${fld('Tanggal jual',`<input type="date" name="d" value="${e?e.d:today()}">`)}
     ${fld('Catatan (opsional)',inp('n',e?e.n:'','','maxlength="300"'))}
    </div>
    <div class="as-pv" aria-live="polite"></div><small class="as-er" role="alert"></small>
    <div class="as-fb"><button type="button" class="btn" data-a="x">Batal</button><button type="submit" class="btn pri">${e?'Simpan perubahan':'Catat penjualan'}</button></div></form>`);
   const f=fm.elements,er=$('.as-er',fm),pv=$('.as-pv',fm),H=()=>hs.find(h=>h.key===f.key.value)||h0;
   const calc=()=>{
    const h=H(),T=TY[h.ty],qv=num(f.q.value),pr=num(f.p.value);
    $('[data-u]',fm).textContent='('+T.u+')';$('[data-pr]',fm).textContent=T.pr.replace('Harga','Harga jual');
    $('[data-hv]',fm).innerHTML=`Dimiliki <b>${qt(h.ty,h.u)}</b> \u00b7 harga rata-rata <b>${rp(h.avg)}</b> \u00b7 modal <b>${rp(h.cost)}</b>`;
    if(qv>0&&pr>0&&qv*T.mul<=h.u+EPS){
     const u=qv*T.mul,val=u*pr,cost=h.cost*u/h.u,pl=val-cost;
     pv.innerHTML=`<span>Hasil jual</span><b>${rp(val)}</b><small>modal ${rp(cost)} \u00b7 <em class="${cl(pl)}">${pl>=0?'untung':'rugi'} ${rp(pl,1)}${cost?' ('+pct(pl/cost*100)+')':''}</em></small><small class="as-dn">Modal berkurang ${rp(cost)}</small>`}
    else if(qv>0&&qv*T.mul>h.u+EPS)pv.innerHTML=`<span class="dn">Melebihi yang dimiliki (${qt(h.ty,h.u)})</span>`;
    else pv.innerHTML='<span>Modal berkurang sebesar modal yang dijual; selisihnya jadi untung / rugi</span>'};
   fm.addEventListener('input',calc);
   fm.addEventListener('change',ev=>{   // ganti aset: harga jual ikut harga sekarang aset itu, kecuali sudah diketik sendiri
    if(!e&&ev.target===f.key&&(!f.p.value||f.p.value===auto)){auto=cp(H());f.p.value=auto}calc()});calc();
   fm.onclick=ev=>{if(ev.target.closest('[data-a=all]')){const h=H();f.q.value=nfi.format(r8(h.u/mulOf(h.ty)));calc()}};
   fm.onsubmit=ev=>{ev.preventDefault();
    const h=H(),qv=num(f.q.value),pr=num(f.p.value),d=f.d.value;
    const bad=!(qv>0)?'Jumlah dijual harus lebih dari 0.':qv*mulOf(h.ty)>h.u+EPS?`Jumlah melebihi yang dimiliki (${qt(h.ty,h.u)}).`:!(pr>0)?'Harga jual harus lebih dari 0.':!/^\d{4}-\d{2}-\d{2}$/.test(d)?'Pilih tanggal jual.':'';
    if(bad){er.textContent=bad;return}
    const now=Date.now(),t=norm({id:e?e.id:uid(),k:'s',ty:h.ty,sym:h.sym,q:qv,p:pr,d,n:f.n.value.trim(),cre:e?e.cre:now,upd:now});
    const nx=e?tx.map(x=>x.id===e.id?t:x):[...tx,t],pl=ledger(nx).per[t.id];
    commit(nx,er,`Terjual ${t.sym}: modal berkurang ${rp(pl?pl.cost:0)}, ${pl&&pl.pl<0?'rugi':'untung'} ${rp(pl?pl.pl:0,1)}`)}}

  // Harga sekarang manual (emas, reksadana, lainnya, atau saham/kripto yang tidak ada di sumber data). Satu titik per tanggal; titik lama ikut membentuk grafik.
  function priceForm(key){
   const h=L.hold.find(x=>x.key===key);if(!h)return;
   const T=TY[h.ty],last=(MAN[key]||[]).slice(-1)[0];
   const fm=open(`<form class="as-fm" novalidate aria-label="Harga sekarang ${esc(h.sym)}">
    <h3>Harga sekarang \u00b7 ${esc(h.sym)}</h3>
    <div class="as-hv" data-hv>Dimiliki <b>${qt(h.ty,h.u)}</b> \u00b7 harga rata-rata <b>${rp(h.avg)}</b> \u00b7 modal <b>${rp(h.cost)}</b></div>
    <div class="as-g" style="margin-top:12px">
     ${fld(T.pr.replace('Harga','Harga sekarang')+' (Rp)',inp('p',last?nfq.format(last.p):'','','inputmode="decimal"'))}
     ${fld('Tanggal',`<input type="date" name="d" value="${today()}" max="${today()}">`)}
    </div>
    <div class="as-pts" aria-label="Harga yang sudah dicatat"></div>
    <div class="as-pv" aria-live="polite"></div><small class="as-er" role="alert"></small>
    <div class="as-fb"><button type="button" class="btn" data-a="x">Batal</button><button type="submit" class="btn pri">Simpan harga</button></div></form>`);
   const f=fm.elements,er=$('.as-er',fm),pv=$('.as-pv',fm),pts=$('.as-pts',fm);
   const chips=()=>{pts.innerHTML=(MAN[key]||[]).slice(-6).reverse().map(x=>`<span class="as-chp">${fd(x.d)} \u00b7 ${rp(x.p)}<button type="button" class="as-x" data-d="${esc(x.d)}" aria-label="Hapus harga ${fd(x.d)}">\u00d7</button></span>`).join('')};
   const calc=()=>{
    const pr=num(f.p.value),mv=h.u*pr,pl=mv-h.cost;
    pv.innerHTML=pr>0?`<span>Nilai aset</span><b>${rp(mv)}</b><small>${qt(h.ty,h.u)} \u00d7 ${rp(pr)} \u00b7 <em class="${cl(pl)}">${pl>=0?'untung':'rugi'} ${rp(pl,1)}${h.cost?' ('+pct(pl/h.cost*100)+')':''}</em></small>`:'<span>Nilai aset = jumlah \u00d7 harga sekarang</span>'};
   fm.addEventListener('input',calc);calc();chips();
   fm.onclick=ev=>{const x=ev.target.closest('.as-x');if(!x)return;
    const old=MAN[key];MAN[key]=old.filter(p=>p.d!==x.dataset.d);
    if(!save()){MAN[key]=old;er.textContent='Penyimpanan browser penuh, data tidak tersimpan.';return}
    chips();render();say('Harga dihapus')};
   fm.onsubmit=ev=>{ev.preventDefault();
    const pr=num(f.p.value),d=f.d.value;
    const bad=!(pr>0)?'Harga harus lebih dari 0.':!/^\d{4}-\d{2}-\d{2}$/.test(d)?'Pilih tanggal.':d>today()?'Tanggal tidak boleh di masa depan.':h.u*pr>1e15?'Nilai terlalu besar.':'';
    if(bad){er.textContent=bad;return}
    const old=MAN[key]||[];
    MAN[key]=[...old.filter(p=>p.d!==d),{d,p:pr}].sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:0).slice(-400);
    if(!save()){MAN[key]=old;er.textContent='Penyimpanan browser penuh, data tidak tersimpan.';return}
    closeForm();render();say(`Harga ${h.sym} diperbarui: ${rp(pr)}`)}}

  // Simpan hanya bila urutan tanggal tetap masuk akal (tidak ada penjualan yang melebihi kepemilikan pada tanggalnya)
  function commit(next,er,ok){
   const lg=ledger(next);
   if(lg.bad.some(id=>!L.bad.includes(id))){er.textContent='Pada tanggal itu jumlah yang dimiliki tidak cukup untuk penjualan. Cek tanggal dan jumlahnya.';return}
   const old=tx;tx=next;
   if(!save()){tx=old;er.textContent='Penyimpanan browser penuh, data tidak tersimpan.';return}
   closeForm();render();say(ok);sync()}

  // ---------- interaksi ----------
  w.addEventListener('click',async e=>{
   const b=e.target.closest('button');if(!b)return;const D=b.dataset;
   if(b.hasAttribute('data-as-retry')){sync(true);return}
   if(D.t){tab=D.t;render();return}
   if(D.rg!==undefined){CR=+D.rg;$$('[data-rg]',w).forEach(x=>x.setAttribute('aria-pressed',x===b));drawChart();return}
   if(D.md){CM=D.md;$$('[data-md]',w).forEach(x=>x.setAttribute('aria-pressed',x===b));drawChart();return}
   const act=D.a;if(!act)return;
   if(act==='add')buyForm({});
   else if(act==='more'){const h=L.hold.find(x=>x.key===D.k);if(h)buyForm({ty:h.ty,sym:h.sym})}
   else if(act==='sell')sellForm({key:D.k});
   else if(act==='price')priceForm(D.k);
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

  // Sesi (core/session.js): ingat tab, rentang, dan satuan grafik yang sedang dibuka
  w._ses={get:()=>({tab,rg:CR,md:CM}),set:s=>{if(!s)return;
   if(s.tab==='port'||s.tab==='log')tab=s.tab;if([0,30,90,180,365].includes(s.rg))CR=s.rg;if(s.md==='rp'||s.md==='pc')CM=s.md;render()}};

  // grafik digambar ulang saat lebar window berubah; harga diperbarui tiap 30 dtk selama window terbuka dan tab terlihat
  let rf=0;const ro=typeof ResizeObserver==='function'?new ResizeObserver(()=>{cancelAnimationFrame(rf);rf=requestAnimationFrame(()=>{if(w.isConnected&&tab==='port'&&q('.as-cv'))drawChart()})}):null;
  ro&&ro.observe(q('.as-w'));
  const iv=setInterval(()=>{if(!w.isConnected){clearInterval(iv);ro&&ro.disconnect();return}if(!document.hidden)sync()},30000);
  render();sync()}});
})();
