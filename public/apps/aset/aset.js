// App "aset" (dock). Catatan aset yang dimiliki, penjualannya, dan grafik nilainya. Berdiri sendiri; data di localStorage 'tc.aset' {v:2,tx:[...],px:{kunci:[[tanggal,harga],...]}}.
// Model:
//   Beli  = aset bertambah. Modal = jumlah x harga beli (saham per lot, 1 lot = 100 lembar): 1 lot BBCA @6.000 = 1 x 100 x 6.000 = Rp 600.000.
//           Beli lagi aset yang sama -> harga rata-rata tertimbang.
//   Nilai = jumlah x HARGA SEKARANG. Harga sekarang berurutan dari: harga manual hari ini, harga pasar (mode Live: saham IHSG dalam Rp; saham luar dan kripto dalam USD x kurs USDIDR), harga manual terakhir, lalu harga rata-rata (belum ada harga). Semua harga yang diinput (beli, jual, manual) dalam Rupiah.
//           BBCA beli 6.000 lalu harga 3.000 -> nilai turun 50%. Semua aset dijumlah, jadi rugi di satu aset dan untung di aset lain saling mengurangi.
//   Jual  = aset berkurang sebesar modal bagian yang dijual (harga rata-rata x jumlah); selisih harga jual dan modal = untung/rugi terealisasi.
//   Grafik = nilai per hari: jumlah yang dimiliki pada hari itu x harga terakhir yang diketahui pada hari itu (harga transaksi, harga manual, penutupan harian pasar).
// tx: {id, k:'b'|'s', ty, sym, q (jumlah dalam satuan tampil, mis. lot), p (harga per satuan dasar, mis. per lembar), d:'YYYY-MM-DD', n, cre, upd}
(()=>{
const KEY='tc.aset',EPS=1e-9,DAY=864e5;
const TY={
 saham:{n:'Saham IHSG',u:'lot',mul:100,pr:'Harga per lembar',c:'#5b9bd5',ph:'mis. BBCA',mk:'idx'},
 sahamx:{n:'Saham luar',u:'lembar',mul:1,pr:'Harga per lembar',c:'#d4739a',ph:'mis. AAPL',mk:'us',usd:1},
 kripto:{n:'Kripto',u:'koin',mul:1,pr:'Harga per koin',c:'#e8a33d',ph:'mis. BTC',mk:'cry',usd:1},
 emas:{n:'Emas',u:'gram',mul:1,pr:'Harga per gram',c:'#9b7fd6',ph:'mis. Emas Antam'},
 reksa:{n:'Reksadana',u:'unit',mul:1,pr:'Harga per unit',c:'#4fb3a9',ph:'mis. Reksa Dana Pasar Uang'},
 lain:{n:'Lainnya',u:'unit',mul:1,pr:'Harga per unit',c:'#8b94a3',ph:'mis. Motor, Tanah'}};
const TK=Object.keys(TY);

// ---------- format ----------
const esc=s=>String(s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');
const nf=new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}),nfp=new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}),nfq=new Intl.NumberFormat('id-ID',{maximumFractionDigits:8}),nfi=new Intl.NumberFormat('id-ID',{useGrouping:false,maximumFractionDigits:8});
const rp=(v,sg)=>{v=Math.round(v||0);return(v>0?(sg?'+':''):v<0?'\u2212':'')+'Rp\u00a0'+nf.format(Math.abs(v))};
const pct=v=>(v>0?'+':v<0?'\u2212':'')+nfp.format(Math.abs(v))+'%';
const sh=v=>{const a=Math.abs(v),s=v<0?'\u2212':'',t=n=>String(+n.toFixed(2)).replace('.',',');return a>=1e9?s+t(a/1e9)+' M':a>=1e6?s+t(a/1e6)+' jt':a>=1e3?s+t(a/1e3)+' rb':s+Math.round(a)};
const pad=n=>String(n).padStart(2,'0');
const today=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const toMs=d=>Date.parse(d+'T00:00:00Z'),fromMs=m=>new Date(m).toISOString().slice(0,10);
const fd=s=>new Date(s+'T00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
const fds=s=>new Date(s+'T00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short'});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const cl=v=>v>0?'up':v<0?'dn':'';
const isD=s=>/^\d{4}-\d{2}-\d{2}$/.test(s);
// Format Indonesia: titik = pemisah ribuan ("6.000", "1.250.000"), koma = desimal ("0,5"). "0.005" tetap desimal. NaN bila tidak terbaca.
const num=s=>{s=String(s).replace(/[^\d.,]/g,'');if(!s)return NaN;
 const v=/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(s)?s.replace(/\./g,'').replace(',','.'):s.replace(',','.');
 const n=Number(v);return isFinite(n)?n:NaN};
const r8=x=>Math.round(x*1e8)/1e8;
const mulOf=ty=>TY[ty].mul,U=t=>t.q*mulOf(t.ty);          // U = jumlah dalam satuan dasar (lembar untuk saham)
const qt=(ty,u)=>nfq.format(r8(u/mulOf(ty)))+'\u00a0'+TY[ty].u;
const nameOf=(ty,s)=>TY[ty].mk?s.toUpperCase():s;
const kOf=t=>t.ty+'|'+t.sym.toLowerCase();

// ---------- buku transaksi -> posisi ----------
const order=list=>[...list].sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:a.cre-b.cre);
// Terapkan satu transaksi ke posisi H. null bila jual melebihi jumlah yang dimiliki saat itu.
function apply(H,t){
 const key=kOf(t),u=U(t),val=u*t.p;let h=H.get(key);
 if(t.k==='b'){if(!h)H.set(key,h={key,sym:t.sym,ty:t.ty,u:0,cost:0});h.u=r8(h.u+u);h.cost+=val;return{val}}
 if(!h||u>h.u+EPS)return null;
 const cost=h.cost*u/h.u;h.u=r8(h.u-u);h.cost=h.u<=EPS?0:h.cost-cost;return{val,cost,pl:val-cost}}
function ledger(list){
 const H=new Map(),per={},bad=[];let real=0,ns=0;
 for(const t of order(list)){const r=apply(H,t);
  if(!r){bad.push(t.id);per[t.id]={val:U(t)*t.p,cost:0,pl:0}}else{per[t.id]=r;if(t.k==='s'){real+=r.pl;ns++}}}
 const hold=[...H.values()].filter(h=>h.u>EPS).map(h=>({...h,avg:h.cost/h.u})).sort((a,b)=>b.cost-a.cost);
 return{hold,total:hold.reduce((a,h)=>a+h.cost,0),real,ns,per,bad}}

// Nilai aset per hari dari tanggal transaksi pertama sampai `end`.
// marks/hist: {kunci:[[tanggal,harga],...]} (harga manual / penutupan harian pasar); now: {kunci:harga sekarang}.
// Pada tanggal yang sama harga lebih diutamakan: sekarang > pasar > manual > harga transaksi. Hari tanpa harga memakai harga terakhir sebelumnya.
function series(list,marks,hist,now,end){
 const L=order(list);if(!L.length)return[];
 const tab={},put=(k,d,p,pr)=>{const m=tab[k]||(tab[k]=new Map()),o=m.get(d);if(!o||pr>=o[1])m.set(d,[p,pr])};
 L.forEach(t=>put(kOf(t),t.d,t.p,0));
 for(const k in marks||{})marks[k].forEach(([d,p])=>put(k,d,p,1));
 for(const k in hist||{})hist[k].forEach(([d,p])=>put(k,d,p,2));
 for(const k in now||{})if(now[k]>0)put(k,end,now[k],3);
 const S={};for(const k in tab)S[k]=[...tab[k].entries()].map(([d,v])=>[d,v[0]]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 const at=(k,d)=>{const a=S[k];let lo=0,hi=a.length-1,r=-1;while(lo<=hi){const m=(lo+hi)>>1;if(a[m][0]<=d){r=m;lo=m+1}else hi=m-1}return a[r<0?0:r][1]};
 const s0=toMs(L[0].d),n=Math.max(0,Math.round((toMs(end)-s0)/DAY))+1,step=Math.max(1,Math.ceil(n/400));
 const offs=[];for(let k=0;k<n;k+=step)offs.push(k);if(offs[offs.length-1]!==n-1)offs.push(n-1);
 const H=new Map(),out=[];let i=0,real=0;
 for(const k of offs){
  const d=fromMs(s0+k*DAY);
  while(i<L.length&&L[i].d<=d){const r=apply(H,L[i++]);if(r&&r.pl!==undefined)real+=r.pl}
  let val=0,cost=0;for(const h of H.values())if(h.u>EPS){val+=h.u*at(h.key,d);cost+=h.cost}
  out.push({d,val,cost,real})}
 return out}
window.AsetCalc={ledger,series,num};   // hanya untuk tes (tests/aset.test.js); app lain tidak boleh memakainya

// ---------- penyimpanan ----------
function norm(x){
 if(!x||typeof x!=='object')return null;
 const ty=TY[x.ty]?x.ty:'lain',q=+x.q,p=+x.p,sym=String(x.sym||'').trim().slice(0,40);
 if(!sym||!(q>0)||!(p>=0)||!isFinite(q)||!isFinite(p))return null;
 return{id:String(x.id||uid()).slice(0,40),k:x.k==='s'?'s':'b',ty,sym,q,p,d:isD(x.d)?x.d:today(),n:String(x.n||'').slice(0,300),cre:+x.cre||Date.now(),upd:+x.upd||Date.now()}}
function normPx(o){
 const r={};if(!o||typeof o!=='object')return r;
 for(const k of Object.keys(o).slice(0,500)){const a=Array.isArray(o[k])?o[k].filter(e=>Array.isArray(e)&&isD(e[0])&&+e[1]>0&&isFinite(+e[1])).map(e=>[e[0],+e[1]]):[];
  if(a.length)r[k]=a.sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:0).slice(-400)}
 return r}
function load(){try{const j=JSON.parse(localStorage.getItem(KEY)||'null');return j&&Array.isArray(j.tx)?{tx:j.tx.slice(0,5000).map(norm).filter(Boolean),px:normPx(j.px)}:{tx:[],px:{}}}catch(e){return{tx:[],px:{}}}}
const IC={
 edit:'<path d="M5 19l1-4L16 5l3 3L9 18z"/><path d="M14 7l3 3"/>',
 del:'<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>'};
const ic=p=>`<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
// Tab ala Chrome: [kode, label, ikon]. Kode (hs/port/cv/log) dipakai sesi & render.
const TABS=[['hs','Hasil','<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'],['port','Portofolio','<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'],['cv','Grafik','<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'],['log','Riwayat','<path d="M12 7v5l3 2"/><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/>']];

registerApp('aset',{css:'apps/aset/aset.css',t:'Aset',w:980,h:720,flush:1,
 icon:'<path d="M4 7a2 2 0 012-2h11v3"/><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M16 13h3"/>',
 html:()=>`<div class="as-w"><div class="as">
 <div class="as-tb">
  <div class="as-tl" role="tablist" aria-label="Tampilan">${TABS.map(([k,l,d],i)=>`<button type="button" role="tab" class="as-tab${i?'':' on'}" data-t="${k}" aria-selected="${!i}" tabindex="${i?-1:0}">${ic(d)}<span>${l}</span></button>`).join('')}</div>
  <div class="as-tr"><small class="as-msg" role="status" aria-live="polite"></small><span class="as-fx" hidden></span><button type="button" class="btn pri" data-a="add">Tambah aset</button><button type="button" class="btn" data-a="sell">Jual aset</button></div>
 </div>
 <div class="as-top"><div class="as-kpi"></div></div>
 <div class="as-alloc"></div>
 <div class="as-body"></div>
 <div class="as-md" hidden></div>
</div></div>`,

 init(w){
  const q=s=>$(s,w);
  const S0=load();
  let tx=S0.tx,px=S0.px,tab='hs',sl='all',rng='90',adir=0,L=ledger(tx),V=[],msgT=0,back=null,ck='';
  const HC={};   // penutupan harian pasar per kunci (+ 'fx' = USDIDR): {t:waktu ambil,a:[[tanggal,harga pasar (USD untuk saham luar/kripto)],...]|null}; hanya mode Live
  const save=()=>{try{const keep={};for(const k in px)if(tx.some(t=>kOf(t)===k))keep[k]=px[k];px=keep;localStorage.setItem(KEY,JSON.stringify({v:2,tx,px}));return true}catch(e){return false}};
  const say=(m,bad)=>{const e=q('.as-msg');e.textContent=m;e.style.color=bad?'var(--dn)':'';clearTimeout(msgT);if(m)msgT=setTimeout(()=>{e.textContent=''},5000)};

  // ---------- harga sekarang ----------
  const msym=h=>{const s=h.sym.toUpperCase();return h.ty==='kripto'?s.replace(/USDT$/,'')+'USDT':s};   // BTC -> BTCUSDT
  const wq=(sy,mk)=>{if(typeof WATCH==='undefined')return 0;const r=WATCH.find(x=>x[0]===sy&&x[4]===mk);return r&&r[2]>0?r[2]:0};
  const lastC=k=>{const c=HC[k];return c&&c.a&&c.a.length?c.a[c.a.length-1][1]:0};
  const kurs=()=>{const r=typeof WATCH==='undefined'?null:WATCH.find(x=>x[0]==='USDIDR');return r&&r[2]>0?r[2]:lastC('fx')};
  const fxAt=d=>{const a=HC.fx&&HC.fx.a;if(!a||!a.length)return kurs();let lo=0,hi=a.length-1,r=0;while(lo<=hi){const m=(lo+hi)>>1;if(a[m][0]<=d){r=m;lo=m+1}else hi=m-1}return a[r][1]};
  // Label kurs: tampil bila ada aset berbasis USD (saham luar, kripto). Ikut bergerak tiap harga baru masuk (event tc:quotes).
  function fxChip(){
   const e=q('.as-fx'),use=tx.some(t=>TY[t.ty].usd);e.hidden=!use;if(!use)return;
   const r=typeof WATCH==='undefined'?null:WATCH.find(x=>x[0]==='USDIDR'),live=r&&r[2]>0,k=live?r[2]:lastC('fx');
   if(!(k>0)){e.className='as-fx na';e.title='';e.textContent='Kurs USD/IDR belum tersedia \u00b7 nilai memakai harga manual';return}
   const ch=live&&typeof r[3]==='number'&&isFinite(r[3])?r[3]:null,at=live&&window.Live&&Live.q&&Live.q.at?new Date(Live.q.at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}):'';
   e.className='as-fx'+(live?'':' old');
   e.title=live?'Kurs berjalan'+(at?', diperbarui '+at:''):'Penutupan harian terakhir (kurs berjalan belum tersedia)';
   e.innerHTML=`<i class="as-lv"></i>1 USD = <b>Rp\u00a0${nfp.format(k)}</b>${ch!==null?` <small class="${cl(ch)}">${pct(ch)}</small>`:''}${live?'':' <small>penutupan terakhir</small>'}`}
  function cur(h){
   const m=px[h.key],last=m&&m.length?m[m.length-1]:null,T=TY[h.ty];
   if(last&&last[0]>=today())return{p:last[1],src:'manual',d:last[0]};
   if(T.mk){const mp=wq(msym(h),T.mk)||lastC(h.key);
    if(mp>0){if(!T.usd)return{p:mp,src:'pasar'};const k=kurs();if(k>0)return{p:mp*k,src:'pasar',fx:1,usd:mp}}}
   if(last)return{p:last[1],src:'manual',d:last[0]};
   return{p:h.avg,src:'modal'}}
  async function pull(key,sym){
   const c=HC[key];if(c&&Date.now()-c.t<6e5)return false;
   HC[key]={t:Date.now(),a:c?c.a:null};
   try{const r=await apiFetch('/api/candles?symbol='+encodeURIComponent(sym)+'&tf=1D&limit=500');if(!r.ok)return false;const j=await r.json();
    HC[key]={t:Date.now(),a:(Array.isArray(j)?j:[]).filter(b=>b&&b.t>0&&b.c>0).map(b=>[fromMs(b.t*1000),b.c])};return true}catch(e){return false}}
  async function ensureHist(){
   if(!(window.Live&&Live.on)||typeof apiFetch!=='function')return;
   let ch=false,fx=false;
   for(const h of L.hold){const T=TY[h.ty];if(!T.mk)continue;if(T.usd)fx=true;if(await pull(h.key,msym(h)))ch=true}
   if(fx&&await pull('fx','USDIDR'))ch=true;
   if(ch&&w.isConnected)render()}

  // ---------- tampilan ----------
  function render(){
   const fa=document.activeElement,fc=fa&&fa!==document.body&&w.contains(fa)&&fa.closest?fa.closest('.as-tl,.as-rail,.as-dots,.as-sp-n,.as-rg'):null,fk=fc?['data-t','data-s','data-sn','data-r'].find(a=>fa.hasAttribute(a)):null,fv=fk?fa.getAttribute(fk):null,fcl=fc?'.'+fc.className.split(' ')[0]:'';
   L=ledger(tx);
   V=L.hold.map(h=>{const c=cur(h),val=h.u*c.p;return{...h,cp:c.p,src:c.src,sd:c.d,fx:c.fx,usd:c.usd,val,pl:val-h.cost,plp:h.cost?(val-h.cost)/h.cost*100:0}}).sort((a,b)=>b.val-a.val);
   const val=V.reduce((a,h)=>a+h.val,0),cost=L.total,un=val-cost;
   q('.as-kpi').innerHTML=`
    <div class="as-k"><span>Total aset</span><b>${rp(val)}</b><small>modal ${rp(cost)} \u00b7 ${V.length} aset</small></div>
    <div class="as-k"><span>Untung / rugi belum terealisasi</span><b class="${cl(Math.round(un))}">${rp(un,1)}</b><small class="${cl(Math.round(un))}">${cost?pct(un/cost*100):'\u2013'}</small></div>
    <div class="as-k"><span>Untung / rugi terealisasi</span><b class="${cl(Math.round(L.real))}">${rp(L.real,1)}</b><small>${L.ns?`dari ${L.ns} penjualan`:'belum ada penjualan'}</small></div>`;
   q('[data-a=sell]').disabled=!V.length;fxChip();
   const by={};V.forEach(h=>by[h.ty]=(by[h.ty]||0)+h.val);
   const ks=TK.filter(k=>by[k]>0);
   q('.as-alloc').hidden=!ks.length;
   q('.as-alloc').innerHTML=ks.length?`<div class="as-ab" role="img" aria-label="Komposisi aset">${ks.map(k=>`<i style="flex:${by[k]};background:${TY[k].c}"></i>`).join('')}</div><ul class="as-lg">${ks.map(k=>`<li><i style="background:${TY[k].c}"></i>${TY[k].n} <b>${nfp.format(by[k]/val*100)}%</b></li>`).join('')}</ul>`:'';
   $$('[data-t]',w).forEach(b=>{const on=b.dataset.t===tab;b.classList.toggle('on',on);b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1});
   q('.as-body').innerHTML=tab==='hs'?hasilHtml(val,un):tab==='port'?portHtml(val,un):tab==='cv'?chartHtml():logHtml();
   adir=0;if(tab==='cv'||tab==='hs')bindChart();
   if(fk&&(!document.activeElement||document.activeElement===document.body)){const f=w.querySelector(fcl+' ['+fk+'="'+fv+'"]');if(f)f.focus({preventScroll:true})}}

  const srcTxt=h=>h.src==='pasar'?(h.fx?'US$\u00a0'+nfp.format(h.usd)+' \u00d7 kurs':'harga pasar'):h.src==='manual'?'manual'+(h.sd&&h.sd<today()?' \u00b7 '+fds(h.sd):''):'belum ada harga';
  function portHtml(val,un){
   if(!V.length)return`<div class="as-em"><div class="empty"><b>Belum ada aset</b><p>Catat aset yang kamu miliki. Contoh: saham BBCA 1 lot di harga 6.000 per lembar berarti modal Rp 600.000 (1 lot = 100 lembar). Kalau harga naik atau turun, nilai asetmu ikut berubah dan terlihat di grafik.</p><button type="button" class="btn pri" data-a="add">Tambah aset pertama</button></div></div>`;
   return`<div class="as-t" role="table" aria-label="Aset yang dimiliki">
    <div class="as-r as-p as-hd" role="row"><span role="columnheader">Aset</span><span role="columnheader" class="n x">Jumlah</span><span role="columnheader" class="n x">Rata-rata</span><span role="columnheader" class="n x">Harga sekarang</span><span role="columnheader" class="n">Nilai</span><span role="columnheader" class="n x">Untung / rugi</span><span role="columnheader"><span class="sr">Aksi</span></span></div>
    ${V.map(h=>`<div class="as-r as-p" role="row">
     <span role="cell" class="as-nm"><b>${esc(h.sym)}</b><small><i class="as-dot" style="background:${TY[h.ty].c}"></i>${TY[h.ty].n}<span class="as-nr"> \u00b7 ${qt(h.ty,h.u)}</span></small></span>
     <span role="cell" class="n x">${qt(h.ty,h.u)}</span>
     <span role="cell" class="n x">${rp(h.avg)}</span>
     <span role="cell" class="n x">${rp(h.cp)}<small class="as-pc as-src${h.src==='modal'?' wn':''}">${srcTxt(h)}</small></span>
     <span role="cell" class="n"><b>${rp(h.val)}</b><small class="as-nr2 ${cl(Math.round(h.pl))}">${rp(h.pl,1)} (${pct(h.plp)})</small></span>
     <span role="cell" class="n x"><b class="${cl(Math.round(h.pl))}">${rp(h.pl,1)}</b><small class="as-pc ${cl(Math.round(h.pl))}">${pct(h.plp)}</small></span>
     <span role="cell" class="as-ac"><button type="button" class="nb" data-a="more" data-k="${esc(h.key)}" aria-label="Beli lagi ${esc(h.sym)}">Beli</button><button type="button" class="nb" data-a="sell" data-k="${esc(h.key)}" aria-label="Jual ${esc(h.sym)}">Jual</button><button type="button" class="nb" data-a="price" data-k="${esc(h.key)}" aria-label="Update harga ${esc(h.sym)}">Harga</button></span>
    </div>`).join('')}
    <div class="as-r as-p as-ft" role="row"><span role="cell">Total</span><span class="x"></span><span class="x"></span><span class="x"></span><span role="cell" class="n"><b>${rp(val)}</b><small class="as-nr2 ${cl(Math.round(un))}">${rp(un,1)}</small></span><span role="cell" class="n x"><b class="${cl(Math.round(un))}">${rp(un,1)}</b></span><span></span></div>
   </div>`}

  // ---------- grafik ----------
  const CH=300,HS_H=200;   // CH: tinggi di luar grafik (KPI + panel slide + rail); HS_H: tinggi grafik tab Hasil
  const csz=fix=>{const b=q('.as-body');return[Math.max(280,(b.clientWidth||720)-34),fix||Math.max(200,Math.min(340,(b.clientHeight||310)-CH))]};
  function pts(sub){
   const hist={},now={};
   V.forEach(h=>{const c=HC[h.key];if(c&&c.a)hist[h.key]=TY[h.ty].usd?c.a.map(([d,v])=>[d,v*fxAt(d)]).filter(e=>e[1]>0):c.a;now[h.key]=h.cp});
   const all=series(sub,px,hist,now,today());
   if(rng==='all')return all;
   const cut=fromMs(toMs(today())-(+rng)*DAY);return all.filter(p=>p.d>=cut)}
  const rgHtml=lg=>`<div class="as-rg"><div class="seg" role="group" aria-label="Rentang">${[['30','30 hari'],['90','90 hari'],['all','Semua']].map(([k,l])=>`<button type="button" data-r="${k}" aria-pressed="${rng===k}">${l}</button>`).join('')}</div><span class="as-lgd">${lg}</span></div>`;
  let G=null;
  // Gambar garis P (titik per hari): o.m = nilai garis utama, o.base = garis pembanding, o.tip = isi tooltip, o.zero = isi area sampai garis 0, o.H = tinggi tetap
  function plot(P,o){
   const m=o.m,base=o.base,[W,H]=csz(o.H),pl=62,pr=14,pt=14,pb=26;ck=W+'x'+H;
   const vs=P.flatMap(p=>[m(p),base(p)]),mn=Math.min(...vs),mx=Math.max(...vs);let lo=mn,hi=mx;if(hi-lo<1){hi+=1;lo-=1}
   const gp=(hi-lo)*.12;hi+=gp;lo=mn>=0&&lo-gp<0?0:lo-gp;
   const e10=Math.pow(10,Math.floor(Math.log10((hi-lo)/4))),fr=(hi-lo)/4/e10,st=(fr<=1?1:fr<=2?2:fr<=2.5?2.5:fr<=5?5:10)*e10;   // langkah sumbu Y bulat
   lo=Math.floor(lo/st+1e-9)*st;hi=Math.ceil(hi/st-1e-9)*st;
   const t0=toMs(P[0].d),t1=toMs(P[P.length-1].d),X=p=>pl+(toMs(p.d)-t0)/(t1-t0)*(W-pl-pr),Y=v=>pt+(hi-v)/(hi-lo)*(H-pt-pb);
   const line=f=>P.map((p,i)=>(i?'L':'M')+X(p).toFixed(1)+' '+Y(f(p)).toFixed(1)).join('');
   const last=P[P.length-1],up=m(last)>=base(last)-.5,b=Y(o.zero?Math.max(lo,Math.min(hi,0)):lo);
   const tk=[];for(let v=lo;v<=hi+st/2;v+=st)tk.push(v);
   const grid=tk.map(v=>{const y=Y(v).toFixed(1);return`<line class="as-gl" x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}"/><text class="as-tx" x="${pl-8}" y="${(+y+4).toFixed(1)}" text-anchor="end">${sh(v)}</text>`}).join('');
   G={P,X,Y,W,H,m,tip:o.tip};
   return`<div class="as-cvw"><svg class="as-cv" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria(P[0],last))}">
    ${grid}
    <g class="as-cg ${up?'up':'dn'}"><path class="as-ar" d="${line(m)}L${X(last).toFixed(1)} ${b.toFixed(1)}L${X(P[0]).toFixed(1)} ${b.toFixed(1)}Z"/><path class="as-cl2" d="${line(base)}"/><path class="as-ln" d="${line(m)}"/></g>
    <text class="as-tx" x="${pl}" y="${H-6}">${fds(P[0].d)}</text><text class="as-tx" x="${W-pr}" y="${H-6}" text-anchor="end">${fds(last.d)}</text>
    <g class="as-hv2" hidden><line class="as-xl" y1="${pt}" y2="${H-pb}"/><circle r="4.5" class="as-dt"/></g>
   </svg><div class="as-tp" hidden></div></div>`}
  const tipVal=p=>{const pl=p.val-p.cost;return`<b>${fd(p.d)}</b><span>Nilai <em>${rp(p.val)}</em></span><span>Modal <em>${rp(p.cost)}</em></span><span class="${cl(Math.round(pl))}">${rp(pl,1)}${p.cost?' ('+pct(pl/p.cost*100)+')':''}</span>`};
  const tipHasil=p=>{const h=p.val-p.cost+p.real;return`<b>${fd(p.d)}</b><span class="${cl(Math.round(h))}">Total hasil <em>${rp(h,1)}</em></span><span>Nilai <em>${rp(p.val)}</em></span><span>Modal <em>${rp(p.cost)}</em></span><span>Terealisasi <em>${rp(p.real,1)}</em></span>`};

  // ---------- slide kelompok aset (dipakai tab Hasil & Grafik) ----------
  const slideKeys=()=>['all',...TK.filter(k=>k==='kripto'||k==='saham'||k==='sahamx'||tx.some(t=>t.ty===k))];
  const sName=k=>k==='all'?'Semua aset':TY[k].n;
  const dotOf=k=>k==='all'?'<i class="as-dot as-all"></i>':`<i class="as-dot" style="background:${TY[k].c}"></i>`;
  function stat(k){
   const sub=k==='all'?tx:tx.filter(t=>t.ty===k),Vs=k==='all'?V:V.filter(h=>h.ty===k);
   const val=Vs.reduce((a,h)=>a+h.val,0),cost=Vs.reduce((a,h)=>a+h.cost,0),un=val-cost;
   const real=sub.reduce((a,t)=>t.k==='s'?a+((L.per[t.id]||{}).pl||0):a,0),bought=sub.reduce((a,t)=>t.k==='b'?a+U(t)*t.p:a,0);
   return{sub,Vs,val,cost,un,real,bought,hasil:un+real}}
  const spark=(P,f,up)=>{
   if(P.length<2)return'<svg class="as-spk" viewBox="0 0 100 30" aria-hidden="true"><path d="M2 15h96"/></svg>';
   const st=Math.max(1,Math.ceil(P.length/60)),A=P.filter((p,i)=>i%st===0||i===P.length-1).map(f),mn=Math.min(...A),d=(Math.max(...A)-mn)||1;
   return`<svg class="as-spk ${up?'up':'dn'}" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${A.map((y,i)=>(2+i/(A.length-1)*96).toFixed(1)+','+(27-(y-mn)/d*24).toFixed(1)).join(' ')}"/></svg>`};
  // rail miniatur: satu kartu per slide (grafik mini + angka), klik = pindah slide
  function rail(kind){
   return`<div class="as-rail" role="tablist" aria-label="Kelompok aset">${slideKeys().map(k=>{
    const s=stat(k),has=s.sub.length>0,P=has?pts(s.sub):[],hs=kind==='hs',f=hs?p=>p.val-p.cost+p.real:p=>p.val;
    const m=hs?s.hasil:s.val,pc=hs?(s.bought?s.hasil/s.bought*100:null):(s.cost?s.un/s.cost*100:null),mv=hs?m:s.un;
    return`<button type="button" role="tab" class="as-th${sl===k?' on':''}" data-s="${k}" aria-selected="${sl===k}"><span class="as-tn">${dotOf(k)}${sName(k)}</span>${has?spark(P,f,mv>=0):'<span class="as-te">belum ada</span>'}<b>${has?rp(m,hs?1:0):'\u2013'}</b>${has&&pc!==null?`<small class="${cl(Math.round(mv))}">${pct(pc)}</small>`:'<small>&nbsp;</small>'}</button>`}).join('')}</div>`}
  const emptyGrp=()=>`<div class="as-em"><div class="empty"><b>Belum ada ${TY[sl].n}</b><p>Tambahkan aset jenis ini untuk melihat grafiknya.</p><button type="button" class="btn pri" data-a="add" data-ty="${sl}">Tambah ${TY[sl].n}</button></div></div>`;
  // panel slide: judul + panah + hitungan, ringkasan, rentang, grafik (animasi geser sesuai arah), titik
  function panel(rg,body,sub){
   const ks=slideKeys(),i=Math.max(0,ks.indexOf(sl));
   return`<section class="as-sp" aria-roledescription="carousel" aria-label="Grafik per kelompok aset"><div class="as-sp-h"><div class="as-sp-t">${dotOf(sl)}<b>${sName(sl)}</b></div><div class="as-sp-n"><span class="as-cnt">${i+1} / ${ks.length}</span><button type="button" class="as-ib" data-sn="-1" aria-label="Slide sebelumnya">${Icon('chevL')}</button><button type="button" class="as-ib" data-sn="1" aria-label="Slide berikutnya">${Icon('chevR')}</button></div></div>${sub||''}${rg}<div class="as-sv${adir?' as-mv':''}" style="--dx:${adir*32}px">${body}</div><div class="as-dots" role="tablist" aria-label="Pilih slide">${ks.map(k=>`<button type="button" role="tab" data-s="${k}" aria-selected="${k===sl}" aria-label="${sName(k)}"><i></i></button>`).join('')}</div></section>`}

  function chartHtml(){
   if(!tx.length)return`<div class="as-em"><div class="empty">Grafik muncul setelah ada aset.</div></div>`;
   if(!slideKeys().includes(sl))sl='all';
   const g=stat(sl),sm=g.Vs.length?`<div class="as-sm"><b>${rp(g.val)}</b><span>modal ${rp(g.cost)}</span><b class="${cl(Math.round(g.un))}">${rp(g.un,1)}${g.cost?' ('+pct(g.un/g.cost*100)+')':''}</b></div>`:(g.sub.length?`<div class="as-sm"><span>${TY[sl].n} sudah terjual semua; grafik menunjukkan riwayatnya.</span></div>`:'');
   const P=g.sub.length?pts(g.sub):[];G=null;
   const body=!g.sub.length?emptyGrp():P.length<2?`<div class="as-em"><div class="empty"><b>Belum cukup data untuk grafik</b><p>Grafik butuh minimal dua hari. Besok nilainya ikut harga pasar atau harga yang kamu update lewat tombol Harga di tab Portofolio.</p></div></div>`
    :plot(P,{m:p=>p.val,base:p=>p.cost,tip:tipVal,aria:(a,b)=>`Grafik nilai ${sName(sl).toLowerCase()}: ${rp(a.val)} pada ${fd(a.d)} menjadi ${rp(b.val)} pada ${fd(b.d)}; modal ${rp(b.cost)}`});
   return panel(rgHtml('<i class="a"></i>Nilai aset<i class="b"></i>Modal'),body,sm)+rail('cv')}

  // Tab Hasil: akumulasi untung/rugi = (nilai - modal yang masih dipegang) + untung/rugi terealisasi; per slide kelompok
  function hasilHtml(val,un){
   if(!tx.length)return`<div class="as-em"><div class="empty"><b>Belum ada hasil</b><p>Tambahkan aset pertama. Di sini kamu melihat akumulasi untung/rugi seluruh asetmu, termasuk yang sudah dijual.</p><button type="button" class="btn pri" data-a="add">Tambah aset pertama</button></div></div>`;
   if(!slideKeys().includes(sl))sl='all';
   const g=stat(sl),hasil=un+L.real,gh=g.hasil,P=g.sub.length?pts(g.sub):[];G=null;
   const dl=P.length>1&&rng!=='all'?(P[P.length-1].val-P[P.length-1].cost+P[P.length-1].real)-(P[0].val-P[0].cost+P[0].real):null;
   const hl=`<div class="as-hl"><div><span>${sl==='all'?'Total hasil sejak awal':'Total hasil '+TY[sl].n}</span><b class="${cl(Math.round(gh))}">${rp(gh,1)}</b><small>${g.bought?`<em class="${cl(Math.round(gh))}">${pct(gh/g.bought*100)}</em> dari total pembelian ${rp(g.bought)}`:''}</small></div>
    ${dl===null?'':`<div><span>${rng} hari terakhir</span><b class="${cl(Math.round(dl))}">${rp(dl,1)}</b><small>perubahan total hasil</small></div>`}</div>`;
   const body=!g.sub.length?emptyGrp():P.length<2?`<div class="as-em"><div class="empty"><b>Belum cukup data untuk grafik</b><p>Grafik akumulasi butuh minimal dua hari.</p></div></div>`
    :plot(P,{m:p=>p.val-p.cost+p.real,base:()=>0,tip:tipHasil,zero:1,H:HS_H,aria:(a,b)=>`Grafik akumulasi total hasil ${sName(sl).toLowerCase()}: ${rp(a.val-a.cost+a.real,1)} pada ${fd(a.d)} menjadi ${rp(b.val-b.cost+b.real,1)} pada ${fd(b.d)}`});
   // per kelompok: siapa yang menggerakkan total
   const rows=TK.filter(k=>tx.some(t=>t.ty===k)).map(k=>{const hs=V.filter(h=>h.ty===k),v=hs.reduce((a,h)=>a+h.val,0),c=hs.reduce((a,h)=>a+h.cost,0),r=tx.reduce((a,t)=>t.k==='s'&&t.ty===k?a+((L.per[t.id]||{}).pl||0):a,0);return{k,v,c,u:v-c,r,h:v-c+r}});
   const mxa=Math.max(1,...rows.map(r=>Math.abs(r.h)));
   const tb=`<div class="as-t" role="table" aria-label="Hasil per kelompok aset">
    <div class="as-r as-h as-hd" role="row"><span role="columnheader">Kelompok</span><span role="columnheader" class="n">Nilai</span><span role="columnheader" class="n x">Modal</span><span role="columnheader" class="n x">Belum terealisasi</span><span role="columnheader" class="n x">Terealisasi</span><span role="columnheader" class="n">Total hasil</span></div>
    ${rows.map(r=>`<div class="as-r as-h" role="row"><span role="cell" class="as-nm"><b><i class="as-dot" style="background:${TY[r.k].c}"></i>${TY[r.k].n}</b></span><span role="cell" class="n">${rp(r.v)}</span><span role="cell" class="n x">${rp(r.c)}</span><span role="cell" class="n x"><span class="${cl(Math.round(r.u))}">${rp(r.u,1)}</span></span><span role="cell" class="n x"><span class="${cl(Math.round(r.r))}">${rp(r.r,1)}</span></span><span role="cell" class="n"><b class="${cl(Math.round(r.h))}">${rp(r.h,1)}</b><span class="as-cbw"><i class="${cl(Math.round(r.h))}" style="width:${Math.abs(r.h)/mxa*100}%"></i></span></span></div>`).join('')}
    <div class="as-r as-h as-ft" role="row"><span role="cell">Total</span><span role="cell" class="n">${rp(val)}</span><span class="n x">${rp(L.total)}</span><span role="cell" class="n x"><span class="${cl(Math.round(un))}">${rp(un,1)}</span></span><span role="cell" class="n x"><span class="${cl(Math.round(L.real))}">${rp(L.real,1)}</span></span><span role="cell" class="n"><b class="${cl(Math.round(hasil))}">${rp(hasil,1)}</b></span></div>
   </div>`;
   return hl+panel(rgHtml('<i class="a"></i>Total hasil<i class="b"></i>Impas (0)'),body)+rail('hs')+`<h3 class="as-h3">Per kelompok aset</h3>`+tb}

  function bindChart(){
   const svg=q('.as-cv');if(!svg||!G)return;const {P,X,Y,W,m,tip}=G,hv=$('.as-hv2',svg),tp=q('.as-tp');
   const show=e=>{
    const r=svg.getBoundingClientRect(),x=(e.clientX-r.left)*(W/r.width);
    let bi=0,bd=1e18;P.forEach((p,i)=>{const d=Math.abs(X(p)-x);if(d<bd){bd=d;bi=i}});
    const p=P[bi],px0=X(p),py=Y(m(p));
    hv.hidden=false;$('.as-xl',hv).setAttribute('x1',px0);$('.as-xl',hv).setAttribute('x2',px0);const dt=$('.as-dt',hv);dt.setAttribute('cx',px0);dt.setAttribute('cy',py);
    tp.innerHTML=tip(p);
    tp.hidden=false;const tw=tp.offsetWidth;tp.style.left=Math.max(4,Math.min(W-tw-4,px0+12>W-tw-4?px0-tw-12:px0+12))+'px';tp.style.top='8px'};
   svg.addEventListener('pointermove',show);svg.addEventListener('pointerdown',show);
   svg.addEventListener('pointerleave',()=>{hv.hidden=true;tp.hidden=true})}

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
      <span role="cell" class="n">${s&&!bad?`<b class="${cl(Math.round(e.pl))}">${rp(e.pl,1)}</b><small class="as-pc ${cl(Math.round(e.pl))}">${e.cost?pct(e.pl/e.cost*100):''}</small>`:'\u2013'}</span>
      <span role="cell" class="as-ac"><button type="button" class="as-ib" data-a="edit" data-id="${esc(t.id)}" aria-label="Ubah transaksi ${esc(t.sym)}">${ic(IC.edit)}</button><button type="button" class="as-ib dn" data-a="del" data-id="${esc(t.id)}" aria-label="Hapus transaksi ${esc(t.sym)}">${ic(IC.del)}</button></span>
     </div>`}).join('')}
   </div>`}

  // ---------- form ----------
  const md=q('.as-md');
  const behind=on=>$$('.as>:not(.as-md)',w).forEach(e=>{e.inert=on});   // fokus keyboard tidak keluar dari form
  function closeForm(){md.hidden=true;md.innerHTML='';behind(false);const b=back;back=null;b&&b.isConnected&&b.focus({preventScroll:true})}
  function open(html){if(md.hidden)back=document.activeElement;md.innerHTML=`<div class="as-sh">${html}</div>`;md.hidden=false;behind(true);const f=$('.as-in:not([disabled])',md);f&&f.focus({preventScroll:true});return $('form',md)}
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
     ${fld('<em data-pr></em>',inp('p',e?nfq.format(e.p):'','','inputmode="decimal"'))}
     ${fld('Tanggal beli',`<input type="date" name="d" value="${e?e.d:today()}">`)}
     ${fld('Catatan (opsional)',inp('n',e?e.n:'','','maxlength="300"'))}
    </div>
    <div class="as-pv" aria-live="polite"></div><small class="as-er" role="alert"></small>
    <div class="as-fb"><button type="button" class="btn" data-a="x">Batal</button><button type="submit" class="btn pri">${e?'Simpan perubahan':'Simpan'}</button></div></form>`);
   const f=fm.elements,er=$('.as-er',fm),pv=$('.as-pv',fm);
   const calc=()=>{
    const ty=f.ty.value,T=TY[ty],qv=num(f.q.value),pr=num(f.p.value);
    $('[data-u]',fm).textContent='('+T.u+(T.mul>1?', 1 '+T.u+' = '+T.mul+' lembar':'')+')';$('[data-pr]',fm).textContent=T.pr+' (Rp)'+(T.usd?', pakai kurs saat beli':'');f.sym.placeholder=T.ph;
    pv.innerHTML=qv>0&&pr>0?`<span>Modal / nilai beli</span><b>${rp(qv*T.mul*pr)}</b><small>${nfq.format(qv)} ${T.u}${T.mul>1?` \u00d7 ${T.mul} lembar`:''} \u00d7 ${rp(pr)}</small>`:'<span>Modal = jumlah \u00d7 harga beli</span>'};
   fm.addEventListener('input',calc);fm.addEventListener('change',calc);calc();
   fm.onsubmit=ev=>{ev.preventDefault();
    const ty=f.ty.value,sym=f.sym.value.trim(),qv=num(f.q.value),pr=num(f.p.value),d=f.d.value;
    const bad=!sym?'Isi kode atau nama aset.':!(qv>0)?'Jumlah harus lebih dari 0.':!(pr>0)?'Harga beli harus lebih dari 0.':!isD(d)?'Pilih tanggal beli.':qv*mulOf(ty)*pr>1e15?'Nilai terlalu besar.':'';
    if(bad){er.textContent=bad;return}
    const now=Date.now(),t=norm({id:e?e.id:uid(),k:'b',ty,sym:nameOf(ty,sym),q:qv,p:pr,d,n:f.n.value.trim(),cre:e?e.cre:now,upd:now});
    commit(e?tx.map(x=>x.id===e.id?t:x):[...tx,t],er,e?`Pembelian ${t.sym} diperbarui`:`${t.sym} ditambahkan: ${rp(U(t)*t.p)}`)}}

  function sellForm(o){
   const e=o.edit,key0=e?kOf(e):o.key;
   // saat mengubah penjualan, jumlah yang dimiliki dihitung tanpa transaksi ini
   const hs=e?ledger(tx.filter(x=>x.id!==e.id)).hold:L.hold,h0=hs.find(h=>h.key===key0)||hs[0];
   if(!h0){say('Tidak ada aset yang bisa dijual',1);return}
   const c0=cur(h0),p0=e?nfq.format(e.p):c0.src==='modal'?'':nfq.format(c0.p);
   const fm=open(`<form class="as-fm" novalidate aria-label="${e?'Ubah penjualan':'Jual aset'}">
    <h3>${e?'Ubah penjualan':'Jual aset'}</h3>
    <div class="as-g">
     ${fld('Aset yang dijual',e?`<input class="as-in" value="${esc(h0.sym)}" disabled><input type="hidden" name="key" value="${esc(h0.key)}">`:`<select name="key">${hs.map(h=>`<option value="${esc(h.key)}"${h.key===h0.key?' selected':''}>${esc(h.sym)} \u00b7 ${TY[h.ty].n} \u00b7 ${qt(h.ty,h.u)}</option>`).join('')}</select>`,'as-w2')}
     <div class="as-hv as-w2" data-hv></div>
     <label class="as-f"><span>Jumlah dijual <em data-u></em></span><span class="as-ro">${inp('q',e?nfi.format(e.q):'','','inputmode="decimal"')}<button type="button" class="nb" data-a="all">Semua</button></span></label>
     ${fld('<em data-pr></em>',inp('p',p0,'','inputmode="decimal"'))}
     ${fld('Tanggal jual',`<input type="date" name="d" value="${e?e.d:today()}">`)}
     ${fld('Catatan (opsional)',inp('n',e?e.n:'','','maxlength="300"'))}
    </div>
    <div class="as-pv" aria-live="polite"></div><small class="as-er" role="alert"></small>
    <div class="as-fb"><button type="button" class="btn" data-a="x">Batal</button><button type="submit" class="btn pri">${e?'Simpan perubahan':'Catat penjualan'}</button></div></form>`);
   const f=fm.elements,er=$('.as-er',fm),pv=$('.as-pv',fm),H=()=>hs.find(h=>h.key===f.key.value)||h0;
   const calc=()=>{
    const h=H(),T=TY[h.ty],qv=num(f.q.value),pr=num(f.p.value);
    $('[data-u]',fm).textContent='('+T.u+')';$('[data-pr]',fm).textContent=T.pr.replace('Harga','Harga jual')+' (Rp)';
    $('[data-hv]',fm).innerHTML=`Dimiliki <b>${qt(h.ty,h.u)}</b> \u00b7 harga rata-rata <b>${rp(h.avg)}</b> \u00b7 modal <b>${rp(h.cost)}</b>`;
    if(qv>0&&pr>0&&qv*T.mul<=h.u+EPS){
     const u=qv*T.mul,val=u*pr,cost=h.cost*u/h.u,pl=val-cost;
     pv.innerHTML=`<span>Hasil jual</span><b>${rp(val)}</b><small>modal ${rp(cost)} \u00b7 <em class="${cl(Math.round(pl))}">${pl>=0?'untung':'rugi'} ${rp(pl,1)}${cost?' ('+pct(pl/cost*100)+')':''}</em></small>`}
    else if(qv>0&&qv*T.mul>h.u+EPS)pv.innerHTML=`<span class="dn">Melebihi yang dimiliki (${qt(h.ty,h.u)})</span>`;
    else pv.innerHTML='<span>Aset berkurang sebesar modal yang dijual; selisihnya jadi untung / rugi</span>'};
   fm.addEventListener('input',calc);fm.addEventListener('change',calc);calc();
   fm.onclick=ev=>{if(ev.target.closest('[data-a=all]')){const h=H();f.q.value=nfi.format(r8(h.u/mulOf(h.ty)));calc()}};
   fm.onsubmit=ev=>{ev.preventDefault();
    const h=H(),qv=num(f.q.value),pr=num(f.p.value),d=f.d.value;
    const bad=!(qv>0)?'Jumlah dijual harus lebih dari 0.':qv*mulOf(h.ty)>h.u+EPS?`Jumlah melebihi yang dimiliki (${qt(h.ty,h.u)}).`:!(pr>0)?'Harga jual harus lebih dari 0.':!isD(d)?'Pilih tanggal jual.':'';
    if(bad){er.textContent=bad;return}
    const now=Date.now(),t=norm({id:e?e.id:uid(),k:'s',ty:h.ty,sym:h.sym,q:qv,p:pr,d,n:f.n.value.trim(),cre:e?e.cre:now,upd:now});
    const nx=e?tx.map(x=>x.id===e.id?t:x):[...tx,t],pl=ledger(nx).per[t.id];
    commit(nx,er,`Terjual ${t.sym}: aset berkurang ${rp(pl?pl.cost:0)}, ${pl&&pl.pl<0?'rugi':'untung'} ${rp(pl?pl.pl:0,1)}`)}}

  // Update harga manual (emas, kripto, reksadana, aset lain, atau saham bila harga pasar tidak ada)
  function priceForm(key){
   const h0=V.find(h=>h.key===key)||V[0];if(!h0){say('Belum ada aset',1);return}
   const marks=h=>(px[h.key]||[]).slice(-6).reverse();
   const fm=open(`<form class="as-fm" novalidate aria-label="Update harga">
    <h3>Update harga</h3>
    <div class="as-g">
     ${fld('Aset',`<select name="key">${V.map(h=>`<option value="${esc(h.key)}"${h.key===h0.key?' selected':''}>${esc(h.sym)} \u00b7 ${TY[h.ty].n}</option>`).join('')}</select>`,'as-w2')}
     <div class="as-hv as-w2" data-hv></div>
     ${fld('<em data-pr></em>',inp('p',h0.src==='modal'?'':nfq.format(h0.cp),'','inputmode="decimal"'))}
     ${fld('Tanggal',`<input type="date" name="d" value="${today()}">`)}
    </div>
    <div class="as-pv" aria-live="polite"></div><small class="as-er" role="alert"></small>
    <div class="as-mk" data-mk></div>
    <div class="as-fb"><button type="button" class="btn" data-a="x">Tutup</button><button type="submit" class="btn pri">Simpan harga</button></div></form>`);
   const f=fm.elements,er=$('.as-er',fm),pv=$('.as-pv',fm),H=()=>V.find(h=>h.key===f.key.value)||h0;
   const calc=()=>{
    const h=H(),T=TY[h.ty],pr=num(f.p.value);
    $('[data-pr]',fm).textContent=T.pr.replace('Harga','Harga sekarang')+' (Rp)';
    $('[data-hv]',fm).innerHTML=`Dimiliki <b>${qt(h.ty,h.u)}</b> \u00b7 rata-rata <b>${rp(h.avg)}</b> \u00b7 harga saat ini <b>${rp(h.cp)}</b> (${srcTxt(h)})`;
    if(pr>0){const val=h.u*pr,pl=val-h.cost;pv.innerHTML=`<span>Nilai jadi</span><b>${rp(val)}</b><small>modal ${rp(h.cost)} \u00b7 <em class="${cl(Math.round(pl))}">${rp(pl,1)}${h.cost?' ('+pct(pl/h.cost*100)+')':''}</em></small>`}
    else pv.innerHTML='<span>Nilai = jumlah dimiliki \u00d7 harga sekarang</span>';
    const m=marks(h);$('[data-mk]',fm).innerHTML=m.length?`<small>Harga manual tersimpan</small><ul>${m.map(([d,p])=>`<li><span>${fd(d)} \u00b7 ${rp(p)}</span><button type="button" class="as-ib dn" data-a="dm" data-k="${esc(h.key)}" data-d="${d}" aria-label="Hapus harga ${fd(d)}">${ic(IC.del)}</button></li>`).join('')}</ul>`:''};
   fm.addEventListener('input',calc);fm.addEventListener('change',calc);calc();
   fm.onsubmit=ev=>{ev.preventDefault();
    const h=H(),pr=num(f.p.value),d=f.d.value;
    const bad=!(pr>0)?'Harga harus lebih dari 0.':!isD(d)?'Pilih tanggal.':d>today()?'Tanggal tidak boleh di masa depan.':pr*h.u>1e15?'Nilai terlalu besar.':'';
    if(bad){er.textContent=bad;return}
    const a=(px[h.key]||[]).filter(e=>e[0]!==d);a.push([d,pr]);a.sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:0);
    const old=px;px={...px,[h.key]:a.slice(-400)};
    if(!save()){px=old;er.textContent='Penyimpanan browser penuh, data tidak tersimpan.';return}
    closeForm();render();say(`Harga ${h.sym} diperbarui: ${rp(pr)}`)}}

  // Simpan hanya bila urutan tanggal tetap masuk akal (tidak ada penjualan baru yang melebihi kepemilikan pada tanggalnya)
  function commit(next,er,ok){
   const lg=ledger(next);
   if(lg.bad.some(id=>!L.bad.includes(id))){er.textContent='Pada tanggal itu jumlah yang dimiliki tidak cukup untuk penjualan. Cek tanggal dan jumlahnya.';return}
   const old=tx;tx=next;
   if(!save()){tx=old;er.textContent='Penyimpanan browser penuh, data tidak tersimpan.';return}
   closeForm();render();say(ok);ensureHist()}

  // ---------- interaksi ----------
  const setTab=k=>{if(k!==tab)q('.as-body').scrollTop=0;tab=k;render();if(tab==='cv'||tab==='hs')ensureHist()};
  const go=(k,d)=>{adir=d;sl=k;render();const a=q('.as-th.on');if(a&&a.scrollIntoView)a.scrollIntoView({block:'nearest',inline:'nearest'})};
  const step=d=>{const ks=slideKeys(),i=Math.max(0,ks.indexOf(sl));go(ks[(i+d+ks.length)%ks.length],d)};
  // keyboard: panah kiri/kanan memilih tab (di strip tab) atau slide (di panel/rail)
  w.addEventListener('keydown',e=>{
   if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;const el=e.target.closest?e.target:null;if(!el)return;const d=e.key==='ArrowRight'?1:-1;
   const tb=el.closest('.as-tab');
   if(tb){const bs=Array.from(w.querySelectorAll('.as-tab')),n=bs[(bs.indexOf(tb)+d+bs.length)%bs.length];e.preventDefault();setTab(n.dataset.t);const f=q('.as-tab.on');f&&f.focus();return}
   if((tab==='hs'||tab==='cv')&&el.closest('.as-sp,.as-rail')){e.preventDefault();step(d);const f=q('.as-th.on');f&&f.focus({preventScroll:true})}});
  // geser di layar sentuh = pindah slide
  let sx=null;
  w.addEventListener('pointerdown',e=>{sx=e.pointerType==='touch'&&e.target.closest&&e.target.closest('.as-sv')?[e.clientX,e.clientY]:null});
  w.addEventListener('pointerup',e=>{if(!sx)return;const dx=e.clientX-sx[0],dy=e.clientY-sx[1];sx=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)step(dx<0?1:-1)});
  w.addEventListener('click',async e=>{
   const b=e.target.closest('button');if(!b)return;const D=b.dataset;
   if(D.t){setTab(D.t);return}
   if(D.r){rng=D.r;render();return}
   if(D.sn){step(+D.sn);return}
   if(D.s){const ks=slideKeys();go(D.s,Math.sign(ks.indexOf(D.s)-ks.indexOf(sl)));return}
   const act=D.a;if(!act)return;
   if(act==='add')buyForm(D.ty?{ty:D.ty}:{});
   else if(act==='more'){const h=L.hold.find(x=>x.key===D.k);if(h)buyForm({ty:h.ty,sym:h.sym})}
   else if(act==='sell')sellForm({key:D.k});
   else if(act==='price')priceForm(D.k);
   else if(act==='dm'){
    const a=(px[D.k]||[]).filter(x=>x[0]!==D.d),old=px;px={...px};if(a.length)px[D.k]=a;else delete px[D.k];
    if(!save()){px=old;say('Penyimpanan browser penuh',1);return}
    render();priceForm(D.k);say('Harga manual dihapus')}
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
  // Harga pasar baru dari live.js -> segarkan; lepas pendengar saat window ditutup
  const onQ=()=>{if(!w.isConnected){removeEventListener('tc:quotes',onQ);return}render()};
  addEventListener('tc:quotes',onQ);
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>{const bw=q('.as-body').clientWidth;if((tab==='cv'||tab==='hs')&&bw&&csz(tab==='hs'?HS_H:0).join('x')!==ck)render()}).observe(q('.as-body'));

  // Sesi (core/session.js): ingat tab yang sedang dibuka
  w._ses={get:()=>({tab,sl}),set:s=>{if(s&&(s.tab==='hs'||s.tab==='port'||s.tab==='cv'||s.tab==='log')){tab=s.tab;if(typeof s.sl==='string'&&(s.sl==='all'||TY[s.sl]))sl=s.sl;render()}}};
  render();ensureHist()}});
})();
