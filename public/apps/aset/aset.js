// App "aset" (dock). Catatan aset GLOBAL yang dimiliki (saham IHSG per lot/lembar, saham luar per lembar, kripto per koin, emas per gram/troy oz, dst), penjualannya, dan grafik nilainya.
// Berdiri sendiri; data di localStorage 'tc.aset' {v:3,tx:[...],px:{kunci:[[tanggal,harga],...]},fx:kurs terakhir}. Tampilan (tab terbuka, kelompok, rentang) di 'tc.aset.ui' (tidak disinkronkan).
// Model:
//   Jumlah disimpan dalam SATUAN DASAR (saham = lembar, kripto = koin, emas = gram, lainnya = unit), tetapi diinput dalam satuan yang dipilih: 1 lot = 100 lembar, 1 troy oz = 31,1035 gram.
//   Harga disimpan dalam Rupiah per satuan dasar (p). Aset berbasis USD (saham luar, kripto, emas/lain bila dipilih) boleh diinput dalam US$ + kurs: p = US$ x kurs; pu/fx menyimpan aslinya.
//   Beli  = aset bertambah. Modal = jumlah dasar x harga: 1 lot BBCA @6.000/lembar = 100 x 6.000 = Rp 600.000. Beli lagi aset yang sama -> harga rata-rata tertimbang.
//   Nilai = jumlah x HARGA SEKARANG. Harga sekarang berurutan dari: harga manual hari ini, harga pasar (mode Live: saham IHSG dalam Rp; saham luar dan kripto dalam USD x kurs USDIDR), harga manual terakhir, lalu harga rata-rata (belum ada harga).
//           Semua aset dijumlah, jadi rugi di satu aset dan untung di aset lain saling mengurangi.
//   Jual  = aset berkurang sebesar modal bagian yang dijual (harga rata-rata x jumlah); selisih harga jual dan modal = untung/rugi terealisasi.
//   Grafik = nilai per hari: jumlah yang dimiliki pada hari itu x harga terakhir yang diketahui pada hari itu (harga transaksi, harga manual, penutupan harian pasar).
// tx: {id, k:'b'|'s', ty, sym, q (jumlah satuan dasar), u (satuan input: lot/lembar/koin/gram/oz/unit), p (Rp per satuan dasar), cu:'IDR'|'USD', pu (US$ per satuan dasar, hanya cu=USD), fx (kurs saat transaksi), d:'YYYY-MM-DD', n, cre, upd}
// v2 (lama): q dalam satuan tampil (saham = lot), tanpa u/cu. norm() mengubahnya otomatis ke model di atas.
(()=>{
const KEY='tc.aset',UIK='tc.aset.ui',EPS=1e-9,DAY=864e5;
// un: [kode, label, kelipatan terhadap satuan dasar, kelipatan harga]. Kelipatan harga: harga diinput per N satuan dasar (saham per lembar walau jumlahnya lot; troy oz per oz).
const TY={
 saham:{n:'Saham IHSG',b:'lembar',c:'#5b9bd5',ph:'mis. BBCA',mk:'idx',cur:['IDR'],un:[['lot','Lot',100,1],['lembar','Lembar',1,1]],hint:'1 lot = 100 lembar',sg:[]},
 sahamx:{n:'Saham global',b:'lembar',c:'#d4739a',ph:'mis. AAPL',mk:'us',usd:1,cur:['USD','IDR'],un:[['lembar','Lembar',1,1]],hint:'per lembar, boleh pecahan',sg:[]},
 kripto:{n:'Kripto',b:'koin',c:'#e8a33d',ph:'mis. BTC',mk:'cry',usd:1,cur:['USD','IDR'],un:[['koin','Koin',1,1]],hint:'per koin, boleh pecahan',sg:[]},
 emas:{n:'Emas',b:'gram',c:'#9b7fd6',ph:'mis. Emas Antam',cur:['IDR','USD'],un:[['gram','Gram',1,1],['oz','Troy oz',31.1034768,31.1034768]],hint:'gram atau troy oz',sg:['Emas Antam','Emas Digital','Perhiasan']},
 reksa:{n:'Reksadana',b:'unit',c:'#4fb3a9',ph:'mis. Reksa Dana Pasar Uang',cur:['IDR'],un:[['unit','Unit',1,1]],hint:'per unit penyertaan',sg:['Pasar Uang','Pendapatan Tetap','Campuran','Saham']},
 lain:{n:'Lainnya',b:'unit',c:'#8b94a3',ph:'mis. Motor, Tanah',cur:['IDR','USD'],un:[['unit','Unit',1,1]],hint:'aset apa pun',sg:['Tanah','Properti','Kendaraan']}};
const TK=Object.keys(TY);
const unitOf=(ty,u)=>TY[ty].un.find(e=>e[0]===u)||null;
const isU=(ty,u)=>!!unitOf(ty,u);
const mulOf=(ty,u)=>(unitOf(ty,u)||TY[ty].un[0])[2];

// ---------- format ----------
const esc=s=>String(s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');
const nf=new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}),nfp=new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}),nfq=new Intl.NumberFormat('id-ID',{maximumFractionDigits:8}),nfi=new Intl.NumberFormat('id-ID',{useGrouping:false,maximumFractionDigits:8}),nfs=new Intl.NumberFormat('id-ID',{maximumFractionDigits:6});
const rp=(v,sg)=>{v=Math.round(v||0);return(v>0?(sg?'+':''):v<0?'−':'')+'Rp '+nf.format(Math.abs(v))};
const usd=v=>(v<0?'−':'')+'US$ '+(Math.abs(v)>=1?nfp:nfs).format(Math.abs(v));
const pct=v=>(v>0?'+':v<0?'−':'')+nfp.format(Math.abs(v))+'%';
const sh=v=>{const a=Math.abs(v),s=v<0?'−':'',t=n=>String(+n.toFixed(2)).replace('.',',');return a>=1e12?s+t(a/1e12)+' T':a>=1e9?s+t(a/1e9)+' M':a>=1e6?s+t(a/1e6)+' jt':a>=1e3?s+t(a/1e3)+' rb':s+Math.round(a)};
const pad=n=>String(n).padStart(2,'0');
const today=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const toMs=d=>Date.parse(d+'T00:00:00Z'),fromMs=m=>new Date(m).toISOString().slice(0,10);
const fd=s=>new Date(s+'T00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
const fds=s=>new Date(s+'T00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short'});
const fmon=s=>new Date(s+'T00:00').toLocaleDateString('id-ID',{month:'long',year:'numeric'});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const cl=v=>v>0?'up':v<0?'dn':'';
const isD=s=>/^\d{4}-\d{2}-\d{2}$/.test(s);
const hue=s=>Math.abs([...String(s||'?')].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7))%360;
const colOf=sym=>`hsl(${hue(sym)} 55% 48%)`;
// Format Indonesia: titik = pemisah ribuan ("6.000", "1.250.000"), koma = desimal ("0,5"). "0.005" tetap desimal. NaN bila tidak terbaca.
const num=s=>{s=String(s).replace(/[^\d.,]/g,'');if(!s)return NaN;
 const v=/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(s)?s.replace(/\./g,'').replace(',','.'):s.replace(',','.');
 const n=Number(v);return isFinite(n)?n:NaN};
const r8=x=>Math.round(x*1e8)/1e8;
const nameOf=(ty,s)=>TY[ty].mk?s.toUpperCase():s;
const kOf=t=>t.ty+'|'+t.sym.toLowerCase();
// jumlah (satuan dasar) -> teks. Saham: "2 lot" bila genap 100 lembar; both = tambah satuan dasarnya.
function qt(ty,b,both){
 if(ty==='saham'){const lot=r8(b/100);return b%100===0?nfq.format(lot)+' lot'+(both?' · '+nfq.format(b)+' lembar':''):nfq.format(r8(b))+' lembar'}
 return nfq.format(r8(b))+' '+TY[ty].b}
// "= ..." di bawah kolom jumlah: padanan dalam satuan lain
function eqTxt(ty,u,v){
 const b=v*mulOf(ty,u);if(!(b>0))return'';
 if(ty==='saham')return u==='lot'?'= '+nfq.format(r8(b))+' lembar':(b%100===0?'= '+nfq.format(b/100)+' lot':'odd lot (kurang dari kelipatan 100 lembar)');
 if(u==='oz')return'= '+nfq.format(r8(b))+' gram';
 return''}
const priceLbl=(ty,u)=>{const e=unitOf(ty,u)||TY[ty].un[0];return'Harga per '+(e[3]===1?TY[ty].b:e[1].toLowerCase())};

// ---------- buku transaksi -> posisi ----------
const order=list=>[...list].sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:a.cre-b.cre);
// Terapkan satu transaksi ke posisi H. null bila jual melebihi jumlah yang dimiliki saat itu.
// uc/uq: modal dalam US$ dan jumlah yang dibeli dengan US$ (untuk harga rata-rata US$).
function apply(H,t){
 const key=kOf(t),u=t.q,val=u*t.p;let h=H.get(key);
 if(t.k==='b'){
  if(!h)H.set(key,h={key,sym:t.sym,ty:t.ty,u:0,cost:0,uc:0,uq:0});
  h.u=r8(h.u+u);h.cost+=val;if(t.cu==='USD'&&t.pu>0){h.uc+=u*t.pu;h.uq+=u}
  return{val}}
 if(!h||u>h.u+EPS)return null;
 const f=u/h.u,cost=h.cost*f;
 h.uc-=h.uc*f;h.uq-=h.uq*f;h.u=r8(h.u-u);h.cost=h.u<=EPS?0:h.cost-cost;
 return{val,cost,pl:val-cost}}
function ledger(list){
 const H=new Map(),per={},bad=[];let real=0,ns=0;
 for(const t of order(list)){const r=apply(H,t);
  if(!r){bad.push(t.id);per[t.id]={val:t.q*t.p,cost:0,pl:0}}else{per[t.id]=r;if(t.k==='s'){real+=r.pl;ns++}}}
 const hold=[...H.values()].filter(h=>h.u>EPS).map(h=>({...h,avg:h.cost/h.u,uavg:h.uq>0&&Math.abs(h.uq-h.u)<=h.u*1e-6?h.uc/h.uq:null})).sort((a,b)=>b.cost-a.cost);
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

// ---------- penyimpanan ----------
function norm(x){
 if(!x||typeof x!=='object')return null;
 const ty=TY[x.ty]?x.ty:'lain',T=TY[ty],sym=String(x.sym||'').trim().slice(0,40);
 let q=+x.q,u=x.u;const p=+x.p;
 if(!sym||!(q>0)||!(p>=0)||!isFinite(q)||!isFinite(p))return null;
 if(!isU(ty,u)){u=T.un[0][0];q=q*T.un[0][2]}   // v2: jumlah dalam satuan tampil (saham = lot)
 let cu='IDR',pu=0,fx=0;
 if(x.cu==='USD'&&T.cur.includes('USD')&&+x.pu>0&&+x.fx>0&&isFinite(+x.pu)&&isFinite(+x.fx)){cu='USD';pu=+x.pu;fx=+x.fx}
 return{id:String(x.id||uid()).slice(0,40),k:x.k==='s'?'s':'b',ty,sym,q:r8(q),u,p,cu,pu,fx,d:isD(x.d)?x.d:today(),n:String(x.n||'').slice(0,300),cre:+x.cre||Date.now(),upd:+x.upd||Date.now()}}
function normPx(o){
 const r={};if(!o||typeof o!=='object')return r;
 for(const k of Object.keys(o).slice(0,500)){const a=Array.isArray(o[k])?o[k].filter(e=>Array.isArray(e)&&isD(e[0])&&+e[1]>0&&isFinite(+e[1])).map(e=>[e[0],+e[1]]):[];
  if(a.length)r[k]=a.sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:0).slice(-400)}
 return r}
function load(){try{const j=JSON.parse(localStorage.getItem(KEY)||'null');return j&&Array.isArray(j.tx)?{tx:j.tx.slice(0,5000).map(norm).filter(Boolean),px:normPx(j.px),fx:+j.fx>0?+j.fx:0}:{tx:[],px:{},fx:0}}catch(e){return{tx:[],px:{},fx:0}}}
window.AsetCalc={ledger,series,num,norm,qt,eqTxt,priceLbl,TY};   // hanya untuk tes (tests/aset.test.js); app lain tidak boleh memakainya

// ---------- tampilan: ikon ----------
const IC={
 edit:'<path d="M5 19l1-4L16 5l3 3L9 18z"/><path d="M14 7l3 3"/>',
 del:'<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
 side:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 chart:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
 buy:'<path d="M12 19V5M6 11l6-6 6 6"/>',
 sell:'<path d="M12 5v14M6 13l6 6 6-6"/>',
 tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>'};
const ic=(p,c)=>`<svg class="${c||'as-i'}" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
// Tab tetap (seperti tab Chart, tapi tidak bisa ditutup); tab aset dibuka dari daftar dan bisa ditutup/digeser
const TABS=[['sum','Ringkasan','<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'],['port','Portofolio','<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'],['log','Riwayat','<path d="M12 7v5l3 2"/><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/>']];
const FIXED=TABS.map(t=>t[0]);
const RNG=[['30','30 hari'],['90','90 hari'],['365','1 tahun'],['all','Semua']];
const MAXTAB=10;
const UI0={act:'sum',tabs:[],grp:'all',rng:'90',side:true,mode:'val',lf:'all'};
function loadUi(){try{const j=JSON.parse(localStorage.getItem(UIK)||'null');if(j&&typeof j==='object'){const o={...UI0,...j};o.tabs=Array.isArray(j.tabs)?j.tabs.filter(k=>typeof k==='string').slice(0,MAXTAB):[];if(!RNG.some(r=>r[0]===o.rng))o.rng='90';if(o.mode!=='hs')o.mode='val';if(!['all','b','s'].includes(o.lf))o.lf='all';if(o.grp!=='all'&&!TY[o.grp])o.grp='all';o.side=o.side!==false;return o}}catch(e){}return{...UI0,tabs:[]}}

registerApp('aset',{css:'apps/aset/aset.css',t:'Aset',w:1020,h:720,flush:1,
 icon:'<path d="M4 7a2 2 0 012-2h11v3"/><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M16 13h3"/>',
 html:()=>`<div class="as-w"><div class="as">
 <aside class="as-sd" aria-label="Kelompok aset"></aside>
 <section class="as-mn">
  <div class="as-top"><button type="button" class="as-round" data-a="sd" aria-label="Panel samping" aria-expanded="true">${ic(IC.side,'as-i')}</button><div class="as-tl" role="tablist" aria-label="Halaman"></div><button type="button" class="as-round" data-a="newtab" aria-label="Buka aset di tab baru" aria-haspopup="true">${ic(IC.plus,'as-i')}</button></div>
  <div class="as-bar"><div class="as-bt"></div><div class="as-br"><small class="as-msg" role="status" aria-live="polite"></small><span class="as-fx" hidden></span><button type="button" class="btn" data-a="sell">Jual</button><button type="button" class="btn pri" data-a="add">Tambah aset</button></div></div>
  <div class="as-vw"></div>
 </section>
 <div class="as-md" hidden></div>
</div></div>`,

 init(w){
  const q=s=>$(s,w),root=q('.as'),tl=q('.as-tl'),vw=q('.as-vw'),sd=q('.as-sd'),md=q('.as-md');
  const S0=load();
  let tx=S0.tx,px=S0.px,fxLast=S0.fx,ui=loadUi(),L=ledger(tx),V=[],msgT=0,back=null,adir=0,gid=0,G=null,pop=null;
  const HC={};   // penutupan harian pasar per kunci (+ 'fx' = USDIDR): {t:waktu ambil,a:[[tanggal,harga pasar (USD untuk saham luar/kripto)],...]|null}; hanya mode Live
  const save=()=>{try{const keep={};for(const k in px)if(tx.some(t=>kOf(t)===k))keep[k]=px[k];px=keep;localStorage.setItem(KEY,JSON.stringify({v:3,tx,px,fx:fxLast}));return true}catch(e){return false}};
  const saveUi=()=>{try{localStorage.setItem(UIK,JSON.stringify(ui))}catch(e){}};
  const say=(m,bad)=>{const e=q('.as-msg');e.textContent=m;e.style.color=bad?'var(--dn)':'';clearTimeout(msgT);if(m)msgT=setTimeout(()=>{e.textContent=''},5000)};
  root.classList.toggle('nosd',!ui.side||w.clientWidth<720);

  // ---------- harga sekarang ----------
  const msym=(ty,s)=>{s=String(s).toUpperCase();return ty==='kripto'?s.replace(/USDT$/,'')+'USDT':s};   // BTC -> BTCUSDT
  const wr=(sy,mk)=>typeof WATCH==='undefined'?null:WATCH.find(x=>x[0]===sy&&x[4]===mk);
  const wq=(sy,mk)=>{const r=wr(sy,mk);return r&&r[2]>0?r[2]:0};
  const lastC=k=>{const c=HC[k];return c&&c.a&&c.a.length?c.a[c.a.length-1][1]:0};
  const kurs=()=>{const r=typeof WATCH==='undefined'?null:WATCH.find(x=>x[0]==='USDIDR');return r&&r[2]>0?r[2]:lastC('fx')};
  const fxAt=d=>{const a=HC.fx&&HC.fx.a;if(!a||!a.length)return kurs();let lo=0,hi=a.length-1,r=0;while(lo<=hi){const m=(lo+hi)>>1;if(a[m][0]<=d){r=m;lo=m+1}else hi=m-1}return a[r][1]};
  const mq=(ty,sym)=>{const T=TY[ty];return T.mk?(wq(msym(ty,sym),T.mk)||lastC(ty+'|'+String(sym).toLowerCase())):0};   // harga pasar dalam mata uang pasarnya (IDR untuk IHSG, USD untuk saham luar/kripto)
  const dayCh=h=>{const T=TY[h.ty];if(!T.mk)return null;const r=wr(msym(h.ty,h.sym),T.mk);return r&&typeof r[3]==='number'&&isFinite(r[3])?r[3]:null};
  // Label kurs: tampil bila ada aset berbasis USD. Ikut bergerak tiap harga baru masuk (event tc:quotes).
  function fxChip(){
   const e=q('.as-fx'),use=tx.some(t=>TY[t.ty].usd||t.cu==='USD');e.hidden=!use;if(!use)return;
   const r=typeof WATCH==='undefined'?null:WATCH.find(x=>x[0]==='USDIDR'),live=r&&r[2]>0,k=live?r[2]:lastC('fx');
   if(!(k>0)){e.className='as-fx na';e.title='';e.textContent='Kurs USD/IDR belum tersedia · nilai memakai harga manual';return}
   const ch=live&&typeof r[3]==='number'&&isFinite(r[3])?r[3]:null,at=live&&window.Live&&Live.q&&Live.q.at?new Date(Live.q.at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}):'';
   e.className='as-fx'+(live?'':' old');
   e.title=live?'Kurs berjalan'+(at?', diperbarui '+at:''):'Penutupan harian terakhir (kurs berjalan belum tersedia)';
   e.innerHTML=`<i class="as-lv"></i>1 US$ = <b>Rp ${nfp.format(k)}</b>${ch!==null?` <small class="${cl(ch)}">${pct(ch)}</small>`:''}${live?'':' <small>penutupan terakhir</small>'}`}
  function cur(h){
   const m=px[h.key],last=m&&m.length?m[m.length-1]:null,T=TY[h.ty];
   if(last&&last[0]>=today())return{p:last[1],src:'manual',d:last[0]};
   if(T.mk){const mp=mq(h.ty,h.sym);
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
   for(const h of L.hold){const T=TY[h.ty];if(!T.mk)continue;if(T.usd)fx=true;if(await pull(h.key,msym(h.ty,h.sym)))ch=true}
   if(fx&&await pull('fx','USDIDR'))ch=true;
   if(ch&&w.isConnected)render()}

  // ---------- kelompok & turunan ----------
  const gKeys=()=>['all',...TK.filter(k=>tx.some(t=>t.ty===k))];
  const gName=k=>k==='all'?'Semua aset':TY[k].n;
  const dotOf=k=>k==='all'?'<i class="as-dot as-all"></i>':`<i class="as-dot" style="background:${TY[k].c}"></i>`;
  const inG=(ty,k)=>k==='all'||ty===k;
  const symOf=key=>{const t=tx.find(x=>kOf(x)===key);return t?t.sym:''};
  const tyOfKey=key=>{const t=tx.find(x=>kOf(x)===key);return t?t.ty:'lain'};
  const isAssetTab=k=>!FIXED.includes(k);
  function stat(k){
   const sub=tx.filter(t=>inG(t.ty,k)),Vs=V.filter(h=>inG(h.ty,k));
   const val=Vs.reduce((a,h)=>a+h.val,0),cost=Vs.reduce((a,h)=>a+h.cost,0),un=val-cost;
   const real=sub.reduce((a,t)=>t.k==='s'?a+((L.per[t.id]||{}).pl||0):a,0),ns=sub.filter(t=>t.k==='s'&&!L.bad.includes(t.id)).length,bought=sub.reduce((a,t)=>t.k==='b'?a+t.q*t.p:a,0);
   return{sub,Vs,val,cost,un,real,ns,bought,hasil:un+real}}
  const srcTxt=h=>h.src==='pasar'?(h.fx?usd(h.usd)+' × kurs':'harga pasar'):h.src==='manual'?'manual'+(h.sd&&h.sd<today()?' · '+fds(h.sd):''):'belum ada harga';
  const pcOf=(a,b)=>b?a/b*100:null;

  // ---------- grafik ----------
  function pts(sub){
   const hist={},now={};
   V.forEach(h=>{const c=HC[h.key];if(c&&c.a)hist[h.key]=TY[h.ty].usd?c.a.map(([d,v])=>[d,v*fxAt(d)]).filter(e=>e[1]>0):c.a;now[h.key]=h.cp});
   const all=series(sub,px,hist,now,today());
   if(ui.rng==='all')return all;
   const cut=fromMs(toMs(today())-(+ui.rng)*DAY);return all.filter(p=>p.d>=cut)}
  const hs=p=>p.val-p.cost+p.real;
  const tipVal=p=>{const pl=p.val-p.cost;return`<b>${fd(p.d)}</b><span>Nilai <em>${rp(p.val)}</em></span><span>Modal <em>${rp(p.cost)}</em></span><span class="${cl(Math.round(pl))}">${rp(pl,1)}${p.cost?' ('+pct(pl/p.cost*100)+')':''}</span>`};
  const tipHasil=p=>{const h=hs(p);return`<b>${fd(p.d)}</b><span class="${cl(Math.round(h))}">Total hasil <em>${rp(h,1)}</em></span><span>Nilai <em>${rp(p.val)}</em></span><span>Modal <em>${rp(p.cost)}</em></span><span>Terealisasi <em>${rp(p.real,1)}</em></span>`};
  const MODES={
   val:{m:p=>p.val,base:p=>p.cost,tip:tipVal,zero:0,lg:'<i class="a"></i>Nilai aset<i class="b"></i>Modal',aria:(a,b)=>`Grafik nilai: ${rp(a.val)} pada ${fd(a.d)} menjadi ${rp(b.val)} pada ${fd(b.d)}; modal ${rp(b.cost)}`},
   hs:{m:hs,base:()=>0,tip:tipHasil,zero:1,lg:'<i class="a"></i>Total hasil<i class="b"></i>Impas (0)',aria:(a,b)=>`Grafik akumulasi total hasil: ${rp(hs(a),1)} pada ${fd(a.d)} menjadi ${rp(hs(b),1)} pada ${fd(b.d)}`}};
  // Gambar garis P (satu titik per hari) dengan lebar W dan tinggi H (px)
  function plot(P,mode,W,H){
   const o=MODES[mode],m=o.m,base=o.base,pl=60,pr=12,pt=12,pb=24,id='asg'+(++gid);
   const vs=P.flatMap(p=>[m(p),base(p)]),mn=Math.min(...vs),mx=Math.max(...vs);let lo=mn,hi=mx;if(hi-lo<1){hi+=1;lo-=1}
   const gp=(hi-lo)*.12;hi+=gp;lo=mn>=0&&lo-gp<0?0:lo-gp;
   const e10=Math.pow(10,Math.floor(Math.log10((hi-lo)/4))),fr=(hi-lo)/4/e10,st=(fr<=1?1:fr<=2?2:fr<=2.5?2.5:fr<=5?5:10)*e10;   // langkah sumbu Y bulat
   lo=Math.floor(lo/st+1e-9)*st;hi=Math.ceil(hi/st-1e-9)*st;
   const t0=toMs(P[0].d),t1=toMs(P[P.length-1].d),X=p=>pl+(toMs(p.d)-t0)/(t1-t0||1)*(W-pl-pr),Y=v=>pt+(hi-v)/(hi-lo)*(H-pt-pb);
   const line=f=>P.map((p,i)=>(i?'L':'M')+X(p).toFixed(1)+' '+Y(f(p)).toFixed(1)).join('');
   const last=P[P.length-1],up=m(last)>=base(last)-.5,b=Y(o.zero?Math.max(lo,Math.min(hi,0)):lo);
   const tk=[];for(let v=lo;v<=hi+st/2;v+=st)tk.push(v);
   const grid=tk.map(v=>{const y=Y(v).toFixed(1);return`<line class="as-gl" x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}"/><text class="as-tx" x="${pl-8}" y="${(+y+4).toFixed(1)}" text-anchor="end">${sh(v)}</text>`}).join('');
   G.X=X;G.Y=Y;G.W=W;G.m=m;G.tip=o.tip;
   return`<svg class="as-cv ${up?'up':'dn'}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria(P[0],last))}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <path d="${line(m)}L${X(last).toFixed(1)} ${b.toFixed(1)}L${X(P[0]).toFixed(1)} ${b.toFixed(1)}Z" fill="url(#${id})"/>
    <path class="as-cl2" d="${line(base)}"/><path class="as-ln" d="${line(m)}"/>
    <text class="as-tx" x="${pl}" y="${H-6}">${fds(P[0].d)}</text><text class="as-tx" x="${W-pr}" y="${H-6}" text-anchor="end">${fds(last.d)}</text>
    <g class="as-hv2" hidden><line class="as-xl" y1="${pt}" y2="${H-pb}"/><circle r="4.5" class="as-dt"/></g>
   </svg><div class="as-tp" hidden></div>`}
  function paintChart(){
   const box=q('.as-cvw');if(!box||!G||!G.P)return;
   const W=Math.max(240,Math.floor(box.clientWidth||0)||640);box.innerHTML=plot(G.P,ui.mode,W,G.H);bindChart(box)}
  function bindChart(box){
   const svg=$('.as-cv',box),{P,X,Y,W,m,tip}=G,hv=$('.as-hv2',svg),tp=$('.as-tp',box);
   const show=e=>{
    const r=svg.getBoundingClientRect(),x=(e.clientX-r.left)*(W/r.width);
    let bi=0,bd=1e18;P.forEach((p,i)=>{const d=Math.abs(X(p)-x);if(d<bd){bd=d;bi=i}});
    const p=P[bi],px0=X(p),py=Y(m(p));
    hv.hidden=false;$('.as-xl',hv).setAttribute('x1',px0);$('.as-xl',hv).setAttribute('x2',px0);const dt=$('.as-dt',hv);dt.setAttribute('cx',px0);dt.setAttribute('cy',py);
    tp.innerHTML=tip(p);
    tp.hidden=false;const tw=tp.offsetWidth;tp.style.left=Math.max(4,Math.min(W-tw-4,px0+12>W-tw-4?px0-tw-12:px0+12))+'px';tp.style.top='8px'};
   svg.addEventListener('pointermove',show);svg.addEventListener('pointerdown',show);
   svg.addEventListener('pointerleave',()=>{hv.hidden=true;tp.hidden=true})}
  const toolsHtml=()=>`<div class="as-ch"><div class="seg" role="group" aria-label="Isi grafik"><button type="button" data-m="val" aria-pressed="${ui.mode==='val'}">Nilai</button><button type="button" data-m="hs" aria-pressed="${ui.mode==='hs'}">Hasil</button></div><span class="as-lgd">${MODES[ui.mode].lg}</span><div class="seg" role="group" aria-label="Rentang">${RNG.map(([k,l])=>`<button type="button" data-r="${k}" aria-pressed="${ui.rng===k}">${l}</button>`).join('')}</div></div>`;
  const chartBox=(P,H)=>{G={P:P.length>=2?P:null,H};return P.length<2?`<div class="as-cvw as-no" style="min-height:${H}px"><p>Belum cukup data untuk grafik. Grafik butuh minimal dua hari; besok nilainya ikut harga pasar atau harga yang kamu update lewat tombol Harga.</p></div>`:`<div class="as-cvw" style="min-height:${H}px"></div>`};

  // ---------- komponen kecil ----------
  const kpi=(l,v,s,c)=>`<div class="as-k"><span>${l}</span><b${c?` class="${c}"`:''}>${v}</b><small${c?` class="${c}"`:''}>${s||'&nbsp;'}</small></div>`;
  function donut(parts,total,top,bot){
   const R=46,C=2*Math.PI*R,gap=parts.length>1?2.5:0;let off=0;
   const arcs=parts.map(p=>{const len=Math.max(.5,p.v/total*C-gap),s=`<circle cx="60" cy="60" r="${R}" fill="none" stroke="${p.c}" stroke-width="14" stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`;off+=p.v/total*C;return s}).join('');
   return`<svg class="as-dn2" viewBox="0 0 120 120" role="img" aria-label="Komposisi aset"><circle cx="60" cy="60" r="${R}" fill="none" class="as-dtr" stroke-width="14"/><g transform="rotate(-90 60 60)">${arcs}</g><text x="60" y="58" text-anchor="middle" class="as-dc1">${top}</text><text x="60" y="73" text-anchor="middle" class="as-dc2">${bot}</text></svg>`}
  const nm=h=>`<span class="as-ic" style="background:${colOf(h.sym)}">${esc(h.sym[0]||'?')}</span>`;

  // ---------- halaman: Ringkasan ----------
  function welcome(){
   const ex=[['saham','2 lot BBCA','@ Rp 6.000 per lembar','2 × 100 × 6.000 = Rp 1.200.000'],['sahamx','1,5 lembar AAPL','@ US$ 230 · kurs Rp 16.000','US$ 345 ≈ Rp 5.520.000'],['kripto','0,05 koin BTC','@ US$ 65.000 · kurs Rp 16.000','US$ 3.250 ≈ Rp 52.000.000'],['emas','10 gram Emas Antam','@ Rp 1.500.000 per gram','Rp 15.000.000']];
   return`<div class="as-pg"><section class="as-wl"><h2>Catat aset pertamamu</h2><p>Satu tempat untuk semua aset, di mana pun pasarnya: saham IHSG per lot atau lembar, saham global per lembar, kripto per koin, emas per gram, reksadana, sampai aset lain. Harga bisa dalam Rupiah atau US$. Nilai ikut harga pasar dan terlihat di grafik.</p><button type="button" class="btn pri" data-a="add">Tambah aset pertama</button></section>
   <h3 class="as-h3">Contoh pencatatan</h3><div class="as-ex">${ex.map(([k,a,b,c])=>`<button type="button" class="as-exc" data-a="add" data-ty="${k}"><span>${dotOf(k)}${TY[k].n}</span><b>${a}</b><small>${b}</small><em>${c}</em></button>`).join('')}</div></div>`}

  function sumView(){
   if(!tx.length)return welcome();
   const g=stat(ui.grp),P=g.sub.length?pts(g.sub):[],ks=gKeys(),i=Math.max(0,ks.indexOf(ui.grp));
   const dl=P.length>1?hs(P[P.length-1])-hs(P[0]):null,rl=RNG.find(r=>r[0]===ui.rng)[1].toLowerCase();
   const hero=`<section class="as-hero" aria-roledescription="carousel" aria-label="Ringkasan per kelompok aset">
    <header class="as-hh"><div class="as-ht">${dotOf(ui.grp)}<b>${gName(ui.grp)}</b></div><div class="as-hn"><span class="as-cnt">${i+1} / ${ks.length}</span><button type="button" class="as-ib" data-sn="-1" aria-label="Kelompok sebelumnya">${Icon('chevL')}</button><button type="button" class="as-ib" data-sn="1" aria-label="Kelompok berikutnya">${Icon('chevR')}</button></div></header>
    <div class="as-sv${adir?' as-mv':''}" style="--dx:${adir*32}px">
     <div class="as-hv"><div><span>Nilai aset</span><b class="as-big">${rp(g.val)}</b></div>
      <div class="as-hc ${cl(Math.round(g.hasil))}"><span>Total hasil</span><b>${rp(g.hasil,1)}</b><small>${g.bought?pct(g.hasil/g.bought*100)+' dari pembelian '+rp(g.bought):'&nbsp;'}</small></div></div>
     ${toolsHtml()}${chartBox(P,230)}
    </div>
    <div class="as-dots" role="tablist" aria-label="Pilih kelompok">${ks.map(k=>`<button type="button" role="tab" data-g="${k}" aria-selected="${k===ui.grp}" aria-label="${gName(k)}"><i></i></button>`).join('')}</div></section>`;
   const kp=`<section class="as-kp">${kpi('Modal',rp(g.cost),g.Vs.length+' aset dipegang')}${kpi('Belum terealisasi',rp(g.un,1),g.cost?pct(g.un/g.cost*100):'–',cl(Math.round(g.un)))}${kpi('Terealisasi',rp(g.real,1),g.ns?`dari ${g.ns} penjualan`:'belum ada penjualan',cl(Math.round(g.real)))}${kpi('Perubahan '+rl,dl===null?'–':rp(dl,1),'total hasil',dl===null?'':cl(Math.round(dl)))}</section>`;
   // komposisi + aset terbesar
   const parts=ui.grp==='all'?TK.map(k=>({k,n:TY[k].n,c:TY[k].c,v:V.filter(h=>h.ty===k).reduce((a,h)=>a+h.val,0)})).filter(p=>p.v>0):g.Vs.map(h=>({k:h.key,n:h.sym,c:colOf(h.sym),v:h.val})).filter(p=>p.v>0);
   const tot=parts.reduce((a,p)=>a+p.v,0),top=[...g.Vs].sort((a,b)=>b.val-a.val).slice(0,6);
   const comp=`<section class="as-card as-comp"><h3 class="as-h3">Komposisi</h3>${tot>0?`<div class="as-cmp">${donut(parts,tot,g.Vs.length,'aset')}<ul class="as-lg">${parts.slice(0,8).map(p=>`<li><i style="background:${p.c}"></i><span>${esc(p.n)}</span><b>${nfp.format(p.v/tot*100)}%</b></li>`).join('')}</ul></div>`:'<p class="as-mt">Belum ada aset yang dipegang di kelompok ini.</p>'}</section>`;
   const tops=`<section class="as-card"><h3 class="as-h3">Aset terbesar</h3>${top.length?`<div class="as-tops">${top.map(h=>`<button type="button" class="as-trw" data-open="${esc(h.key)}">${nm(h)}<span class="as-tn"><b>${esc(h.sym)}</b><small>${qt(h.ty,h.u)}</small></span><span class="as-tv"><b>${rp(h.val)}</b><small class="${cl(Math.round(h.pl))}">${pct(h.plp)}</small></span></button>`).join('')}</div>`:'<p class="as-mt">Belum ada aset yang dipegang di kelompok ini.</p>'}</section>`;
   let rows='';
   if(ui.grp==='all'&&ks.length>2){
    const R=TK.filter(k=>tx.some(t=>t.ty===k)).map(k=>{const s=stat(k);return{k,v:s.val,c:s.cost,u:s.un,r:s.real,h:s.hasil}}),mxa=Math.max(1,...R.map(r=>Math.abs(r.h))),all=stat('all');
    rows=`<h3 class="as-h3">Hasil per kelompok</h3><div class="as-t" role="table" aria-label="Hasil per kelompok aset">
     <div class="as-r as-h as-hd" role="row"><span role="columnheader">Kelompok</span><span role="columnheader" class="n">Nilai</span><span role="columnheader" class="n x">Modal</span><span role="columnheader" class="n x">Belum terealisasi</span><span role="columnheader" class="n x">Terealisasi</span><span role="columnheader" class="n">Total hasil</span></div>
     ${R.map(r=>`<button type="button" class="as-r as-h as-rb" role="row" data-g="${r.k}"><span role="cell" class="as-nm"><b>${dotOf(r.k)}${TY[r.k].n}</b></span><span role="cell" class="n">${rp(r.v)}</span><span role="cell" class="n x">${rp(r.c)}</span><span role="cell" class="n x"><span class="${cl(Math.round(r.u))}">${rp(r.u,1)}</span></span><span role="cell" class="n x"><span class="${cl(Math.round(r.r))}">${rp(r.r,1)}</span></span><span role="cell" class="n"><b class="${cl(Math.round(r.h))}">${rp(r.h,1)}</b><span class="as-cbw"><i class="${cl(Math.round(r.h))}" style="width:${Math.abs(r.h)/mxa*100}%"></i></span></span></button>`).join('')}
     <div class="as-r as-h as-ft" role="row"><span role="cell">Total</span><span role="cell" class="n">${rp(all.val)}</span><span class="n x">${rp(all.cost)}</span><span role="cell" class="n x"><span class="${cl(Math.round(all.un))}">${rp(all.un,1)}</span></span><span role="cell" class="n x"><span class="${cl(Math.round(all.real))}">${rp(all.real,1)}</span></span><span role="cell" class="n"><b class="${cl(Math.round(all.hasil))}">${rp(all.hasil,1)}</b></span></div></div>`}
   return`<div class="as-pg">${hero}${kp}<div class="as-2">${comp}${tops}</div>${rows}</div>`}

  // ---------- halaman: Portofolio ----------
  const ctxLine=n=>ui.grp==='all'?'':`<div class="as-ctx">${dotOf(ui.grp)}Menampilkan <b>${gName(ui.grp)}</b> · ${n} aset <button type="button" class="nb" data-g="all">Tampilkan semua</button></div>`;
  function portView(){
   if(!tx.length)return welcome();
   const Vs=V.filter(h=>inG(h.ty,ui.grp)),val=Vs.reduce((a,h)=>a+h.val,0),cost=Vs.reduce((a,h)=>a+h.cost,0),un=val-cost;
   if(!Vs.length)return`<div class="as-pg">${ctxLine(0)}<div class="as-em"><div class="empty"><b>Tidak ada aset yang dipegang</b><p>Semua aset di kelompok ini sudah terjual. Lihat riwayatnya di tab Riwayat atau tambahkan pembelian baru.</p><button type="button" class="btn pri" data-a="add" data-ty="${ui.grp==='all'?'saham':ui.grp}">Tambah aset</button></div></div></div>`;
   return`<div class="as-pg">${ctxLine(Vs.length)}<div class="as-t" role="table" aria-label="Aset yang dimiliki">
    <div class="as-r as-p as-hd" role="row"><span role="columnheader">Aset</span><span role="columnheader" class="n x">Jumlah</span><span role="columnheader" class="n x">Rata-rata</span><span role="columnheader" class="n x">Harga sekarang</span><span role="columnheader" class="n">Nilai</span><span role="columnheader" class="n x">Untung / rugi</span><span role="columnheader"><span class="sr">Aksi</span></span></div>
    ${Vs.map(h=>`<div class="as-r as-p as-rw" role="row" data-open="${esc(h.key)}">
     <span role="cell" class="as-nm as-nmi">${nm(h)}<span><button type="button" class="as-nl" data-open="${esc(h.key)}">${esc(h.sym)}</button><small><i class="as-dot" style="background:${TY[h.ty].c}"></i>${TY[h.ty].n}<span class="as-nr"> · ${qt(h.ty,h.u)}</span></small></span></span>
     <span role="cell" class="n x">${qt(h.ty,h.u)}</span>
     <span role="cell" class="n x">${rp(h.avg)}${h.uavg?`<small class="as-pc">${usd(h.uavg)}</small>`:''}</span>
     <span role="cell" class="n x">${rp(h.cp)}<small class="as-pc as-src${h.src==='modal'?' wn':''}">${srcTxt(h)}</small></span>
     <span role="cell" class="n"><b>${rp(h.val)}</b><small class="as-nr2 ${cl(Math.round(h.pl))}">${rp(h.pl,1)} (${pct(h.plp)})</small></span>
     <span role="cell" class="n x"><b class="${cl(Math.round(h.pl))}">${rp(h.pl,1)}</b><small class="as-pc ${cl(Math.round(h.pl))}">${pct(h.plp)}</small></span>
     <span role="cell" class="as-ac"><button type="button" class="nb" data-a="more" data-k="${esc(h.key)}" aria-label="Beli lagi ${esc(h.sym)}">Beli</button><button type="button" class="nb" data-a="sell" data-k="${esc(h.key)}" aria-label="Jual ${esc(h.sym)}">Jual</button><button type="button" class="nb" data-a="price" data-k="${esc(h.key)}" aria-label="Update harga ${esc(h.sym)}">Harga</button></span>
    </div>`).join('')}
    <div class="as-r as-p as-ft" role="row"><span role="cell">Total</span><span class="x"></span><span class="x"></span><span class="x"></span><span role="cell" class="n"><b>${rp(val)}</b><small class="as-nr2 ${cl(Math.round(un))}">${rp(un,1)}</small></span><span role="cell" class="n x"><b class="${cl(Math.round(un))}">${rp(un,1)}</b></span><span></span></div>
   </div></div>`}

  // ---------- halaman: Riwayat ----------
  const priceCell=t=>t.cu==='USD'?`${usd(t.pu*(unitOf(t.ty,t.u)||TY[t.ty].un[0])[3])}<small class="as-pc">kurs ${nfp.format(t.fx)}</small>`:rp(t.p*(unitOf(t.ty,t.u)||TY[t.ty].un[0])[3]);
  const priceLine=t=>{const e=unitOf(t.ty,t.u)||TY[t.ty].un[0];return t.cu==='USD'?usd(t.pu*e[3]):rp(t.p*e[3])};
  function txRow(t,sym){
   const e=L.per[t.id]||{val:t.q*t.p},bad=L.bad.includes(t.id),s=t.k==='s',T=TY[t.ty];
   return`<div class="as-r as-l${bad?' as-bad':''}" role="row">
    <span role="cell" class="as-nm"><b><em class="as-bj ${s?'s':'b'}">${s?'Jual':'Beli'}</em>${sym?`<button type="button" class="as-nl" data-open="${esc(kOf(t))}">${esc(t.sym)}</button>`:esc(fd(t.d))}</b><small>${sym?fd(t.d)+' · ':''}${T.n}<span class="as-nr"> · ${qt(t.ty,t.q)} × ${priceLine(t)}</span>${t.n?` · ${esc(t.n)}`:''}${bad?' · melebihi jumlah yang dimiliki':''}</small></span>
    <span role="cell" class="n x">${qt(t.ty,t.q,1)}</span>
    <span role="cell" class="n x">${priceCell(t)}</span>
    <span role="cell" class="n">${rp(e.val)}</span>
    <span role="cell" class="n">${s&&!bad?`<b class="${cl(Math.round(e.pl))}">${rp(e.pl,1)}</b><small class="as-pc ${cl(Math.round(e.pl))}">${e.cost?pct(e.pl/e.cost*100):''}</small>`:'–'}</span>
    <span role="cell" class="as-ac"><button type="button" class="as-ib" data-a="edit" data-id="${esc(t.id)}" aria-label="Ubah transaksi ${esc(t.sym)}">${ic(IC.edit)}</button><button type="button" class="as-ib dn" data-a="del" data-id="${esc(t.id)}" aria-label="Hapus transaksi ${esc(t.sym)}">${ic(IC.del)}</button></span></div>`}
  const txHead=()=>`<div class="as-r as-l as-hd" role="row"><span role="columnheader">Transaksi</span><span role="columnheader" class="n x">Jumlah</span><span role="columnheader" class="n x">Harga</span><span role="columnheader" class="n">Nilai</span><span role="columnheader" class="n">Untung / rugi</span><span role="columnheader"><span class="sr">Aksi</span></span></div>`;
  function logView(){
   if(!tx.length)return welcome();
   const all=tx.filter(t=>inG(t.ty,ui.grp)),rows=all.filter(t=>ui.lf==='all'||t.k===ui.lf).sort((a,b)=>a.d<b.d?1:a.d>b.d?-1:b.cre-a.cre);
   let h='',m='';
   rows.forEach(t=>{const mo=t.d.slice(0,7);if(mo!==m){m=mo;h+=`<div class="as-mh" role="row"><b>${fmon(t.d)}</b><span>${rows.filter(x=>x.d.slice(0,7)===mo).length} transaksi</span></div>`}h+=txRow(t,1)});
   return`<div class="as-pg">${ctxLine(V.filter(x=>inG(x.ty,ui.grp)).length)}<div class="as-lf"><div class="seg" role="group" aria-label="Jenis transaksi">${[['all','Semua'],['b','Beli'],['s','Jual']].map(([k,l])=>`<button type="button" data-lf="${k}" aria-pressed="${ui.lf===k}">${l}</button>`).join('')}</div><span>${rows.length} dari ${all.length} transaksi</span></div>
    ${rows.length?`<div class="as-t" role="table" aria-label="Riwayat transaksi">${txHead()}${h}</div>`:'<div class="as-em"><div class="empty">Tidak ada transaksi yang cocok.</div></div>'}</div>`}

  // ---------- halaman: satu aset (tab) ----------
  function assetView(key){
   const sub=tx.filter(t=>kOf(t)===key);if(!sub.length)return'';
   const h=V.find(x=>x.key===key),ty=sub[0].ty,sym=sub[0].sym,T=TY[ty];
   const real=sub.reduce((a,t)=>t.k==='s'?a+((L.per[t.id]||{}).pl||0):a,0),ns=sub.filter(t=>t.k==='s'&&!L.bad.includes(t.id)).length,bought=sub.reduce((a,t)=>t.k==='b'?a+t.q*t.p:a,0);
   const un=h?h.pl:0,hasil=un+real,P=pts(sub);
   const prc=h?`<div class="as-pr"><span>Harga sekarang</span><b>${rp(h.cp)}</b><small class="${h.src==='modal'?'wn':''}">${h.fx?usd(h.usd)+' × kurs · ':''}${srcTxt(h)}</small></div>`:'';
   const kp=h?`<section class="as-kp">${kpi('Nilai sekarang',rp(h.val),`${qt(ty,h.u,1)}`)}${kpi('Modal',rp(h.cost),'rata-rata '+rp(h.avg)+(h.uavg?' · '+usd(h.uavg):''))}${kpi('Belum terealisasi',rp(un,1),pct(h.plp),cl(Math.round(un)))}${kpi('Terealisasi',rp(real,1),ns?`dari ${ns} penjualan`:'belum ada penjualan',cl(Math.round(real)))}</section>`
    :`<div class="as-so"><b>Sudah terjual semua</b><span>Total hasil dari aset ini ${rp(real,1)} dari ${ns} penjualan.</span><button type="button" class="btn pri" data-a="more" data-k="${esc(key)}">Beli lagi</button></div>`;
   return`<div class="as-pg"><header class="as-ah">${nm({sym})}<div class="as-an"><h2>${esc(sym)}</h2><span><i class="as-dot" style="background:${T.c}"></i>${T.n}${h?' · '+qt(ty,h.u):''}</span></div>${prc}
    <div class="as-aa">${h?`<button type="button" class="btn pri" data-a="more" data-k="${esc(key)}">Beli lagi</button><button type="button" class="btn" data-a="sell" data-k="${esc(key)}">Jual</button><button type="button" class="btn" data-a="price" data-k="${esc(key)}">Update harga</button>`:''}${T.mk?`<button type="button" class="btn" data-a="chart" data-s="${esc(msym(ty,sym))}">Buka Chart</button>`:''}</div></header>
    ${kp}
    <section class="as-card as-cc"><div class="as-ch0"><h3 class="as-h3">Total hasil ${rp(hasil,1)}${bought?' ('+pct(hasil/bought*100)+')':''}</h3></div>${toolsHtml()}${chartBox(P,220)}</section>
    <h3 class="as-h3">Transaksi ${esc(sym)}</h3><div class="as-t" role="table" aria-label="Transaksi ${esc(sym)}">${txHead()}${order(sub).reverse().map(t=>txRow(t,0)).join('')}</div></div>`}

  // ---------- kerangka: tab, panel samping, bar ----------
  function renderTabs(){
   tl.innerHTML=TABS.map(([k,l,d])=>`<div class="as-tab${ui.act===k?' on':''}" role="tab" data-id="${k}" aria-selected="${ui.act===k}" tabindex="${ui.act===k?0:-1}">${ic(d)}<span>${l}</span></div>`).join('')
    +ui.tabs.map(k=>{const s=symOf(k);return`<div class="as-tab as-dy${ui.act===k?' on':''}" role="tab" data-id="${esc(k)}" aria-selected="${ui.act===k}" tabindex="${ui.act===k?0:-1}" draggable="true" title="${esc(s)} · ${TY[tyOfKey(k)].n}"><i class="as-ic" style="background:${colOf(s)}">${esc(s[0]||'?')}</i><span>${esc(s)}</span><button type="button" class="as-x" tabindex="-1" aria-label="Tutup tab ${esc(s)}">×</button></div>`}).join('')}
  function renderSide(){
   const ks=gKeys(),mv=V.filter(h=>h.dc!==null).sort((a,b)=>Math.abs(b.dc)-Math.abs(a.dc)).slice(0,8);
   sd.innerHTML=tx.length?`<h5>Kelompok</h5>${ks.map(k=>{const vs=V.filter(h=>inG(h.ty,k));return`<button type="button" class="${ui.grp===k&&!isAssetTab(ui.act)?'on':''}" data-g="${k}">${dotOf(k)}<span>${gName(k)}</span><em>${sh(vs.reduce((a,h)=>a+h.val,0))}</em></button>`}).join('')}
    ${mv.length?`<h5>Bergerak hari ini</h5><div class="as-tp2">${mv.map(h=>`<button type="button" data-open="${esc(h.key)}">${esc(h.sym)} <span class="${cl(h.dc)}">${pct(h.dc)}</span></button>`).join('')}</div>`:''}
    <h5>Pintasan</h5><button type="button" data-a="add">${ic(IC.buy)}<span>Tambah aset</span></button><button type="button" data-a="sell"${V.length?'':' disabled'}>${ic(IC.sell)}<span>Jual aset</span></button><button type="button" data-a="price"${V.length?'':' disabled'}>${ic(IC.tag)}<span>Update harga</span></button>`
    :`<h5>Kelompok</h5><p class="as-mt">Kelompok aset muncul setelah kamu mencatat aset pertama.</p>`}
  function renderBar(){
   const nA=V.filter(h=>inG(h.ty,ui.grp)).length;
   q('.as-bt').innerHTML=ui.act==='sum'||ui.act==='port'?(tx.length?`${dotOf(ui.grp)}<b>${gName(ui.grp)}</b><span>${nA} aset</span>`:'<span>Belum ada aset</span>'):ui.act==='log'?`<b>Riwayat</b><span>${tx.filter(t=>inG(t.ty,ui.grp)).length} transaksi</span>`:`<b>${esc(symOf(ui.act))}</b><span>${TY[tyOfKey(ui.act)].n}</span>`;
   q('[data-a=sell]',q('.as-br')).disabled=!V.length;fxChip()}
  const VIEW={sum:sumView,port:portView,log:logView};

  function render(){
   const fa=document.activeElement,fk=fa&&fa!==document.body&&w.contains(fa)&&fa.closest&&fa.closest('.as-tl,.as-dots,.as-sd,.as-hn')?['data-id','data-g','data-sn'].find(a=>fa.hasAttribute(a)):null,fv=fk?fa.getAttribute(fk):null,fcl=fk?'.'+fa.closest('.as-tl,.as-dots,.as-sd,.as-hn').className.split(' ')[0]:'';
   L=ledger(tx);
   V=L.hold.map(h=>{const c=cur(h),val=h.u*c.p;return{...h,cp:c.p,src:c.src,sd:c.d,fx:c.fx,usd:c.usd,val,pl:val-h.cost,plp:h.cost?(val-h.cost)/h.cost*100:0,dc:dayCh(h)}}).sort((a,b)=>b.val-a.val);
   // rapikan state: kelompok / tab yang sudah tidak ada
   if(!gKeys().includes(ui.grp))ui.grp='all';
   ui.tabs=ui.tabs.filter(k=>tx.some(t=>kOf(t)===k));
   if(isAssetTab(ui.act)&&!ui.tabs.includes(ui.act))ui.act='sum';
   const y=vw.scrollTop;G=null;
   vw.innerHTML=isAssetTab(ui.act)?assetView(ui.act):VIEW[ui.act]();
   vw.scrollTop=y;adir=0;
   renderTabs();renderSide();renderBar();paintChart();
   if(fk&&(!document.activeElement||document.activeElement===document.body)){const f=w.querySelector(fcl+' ['+fk+'="'+(window.CSS&&CSS.escape?CSS.escape(fv):fv)+'"]');if(f)f.focus({preventScroll:true})}}

  // ---------- navigasi ----------
  const setAct=k=>{if(k===ui.act)return;ui.act=k;saveUi();vw.scrollTop=0;render();ensureHist()};
  function openAsset(key){
   if(!tx.some(t=>kOf(t)===key))return;
   if(!ui.tabs.includes(key)){ui.tabs.push(key);if(ui.tabs.length>MAXTAB){const i=ui.tabs.findIndex(k=>k!==key);ui.tabs.splice(i,1)}}
   ui.act=key;saveUi();vw.scrollTop=0;render();ensureHist();closeSd()}
  function closeTab(k){const i=ui.tabs.indexOf(k);if(i<0)return;ui.tabs.splice(i,1);if(ui.act===k)ui.act=ui.tabs[i]||ui.tabs[i-1]||'sum';saveUi();render()}
  const setGrp=(k,d)=>{ui.grp=k;if(isAssetTab(ui.act))ui.act='sum';adir=d||0;saveUi();render();closeSd()};
  const step=d=>{const ks=gKeys(),i=Math.max(0,ks.indexOf(ui.grp));setGrp(ks[(i+d+ks.length)%ks.length],d)};
  const closeSd=()=>{if(root.clientWidth<720)root.classList.add('nosd');q('[data-a=sd]').setAttribute('aria-expanded',String(!root.classList.contains('nosd')))};
  // drag tab aset untuk menyusun ulang
  let dragK=null;
  tl.addEventListener('dragstart',e=>{const t=e.target.closest&&e.target.closest('.as-dy');if(!t)return;dragK=t.dataset.id;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',dragK)}catch(x){}});
  tl.addEventListener('dragover',e=>{if(dragK&&e.target.closest('.as-dy'))e.preventDefault()});
  tl.addEventListener('drop',e=>{const t=e.target.closest('.as-dy');if(!dragK||!t)return;e.preventDefault();const to=t.dataset.id;
   if(to!==dragK){const a=ui.tabs.filter(k=>k!==dragK),i=a.indexOf(to);a.splice(ui.tabs.indexOf(dragK)<ui.tabs.indexOf(to)?i+1:i,0,dragK);ui.tabs=a;saveUi();renderTabs()}dragK=null});
  tl.addEventListener('dragend',()=>{dragK=null});
  tl.addEventListener('auxclick',e=>{const t=e.target.closest('.as-dy');if(t&&e.button===1){e.preventDefault();closeTab(t.dataset.id)}});
  // keyboard: panah kiri/kanan = tab (di strip) atau kelompok (di panel/titik); Delete menutup tab aset
  w.addEventListener('keydown',e=>{
   const el=e.target.closest?e.target:null;if(!el)return;
   const tb=el.closest('.as-tab');
   if(tb&&(e.key==='Delete'||e.key==='Backspace')&&tb.classList.contains('as-dy')){e.preventDefault();closeTab(tb.dataset.id);const f=q('.as-tab.on');f&&f.focus();return}
   if(tb&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setAct(tb.dataset.id);const f=q('.as-tab.on');f&&f.focus();return}
   if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;const d=e.key==='ArrowRight'?1:-1;
   if(tb){const bs=Array.from(w.querySelectorAll('.as-tab')),n=bs[(bs.indexOf(tb)+d+bs.length)%bs.length];e.preventDefault();setAct(n.dataset.id);const f=q('.as-tab.on');f&&f.focus();return}
   if(ui.act==='sum'&&el.closest('.as-hero')&&!el.closest('input,select,textarea')){e.preventDefault();step(d)}});
  // geser di layar sentuh = pindah kelompok
  let sx=null;
  w.addEventListener('pointerdown',e=>{sx=e.pointerType==='touch'&&e.target.closest&&e.target.closest('.as-hero')&&!e.target.closest('.as-cvw')?[e.clientX,e.clientY]:null});
  w.addEventListener('pointerup',e=>{if(!sx)return;const dx=e.clientX-sx[0],dy=e.clientY-sx[1];sx=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)step(dx<0?1:-1)});

  // ---------- popover tab baru (+) ----------
  function closePop(){if(pop){pop.remove();pop=null;removeEventListener('pointerdown',popOut,true)}}
  const popOut=e=>{if(pop&&!pop.contains(e.target)&&!e.target.closest('[data-a=newtab]'))closePop()};
  function tabPop(btn){
   if(pop){closePop();return}
   const mn=q('.as-mn'),p=document.createElement('div');p.className='as-pop';
   p.innerHTML=`<input class="as-pin" type="search" placeholder="Cari aset yang dimiliki…" aria-label="Cari aset"><div class="as-pl"></div><button type="button" class="as-pitem as-pn" data-a="add">${ic(IC.plus)}Tambah aset baru</button>`;
   mn.append(p);pop=p;
   const r=btn.getBoundingClientRect(),b=mn.getBoundingClientRect();p.style.left=Math.max(4,Math.min(r.left-b.left,b.width-p.offsetWidth-4))+'px';p.style.top=(r.bottom-b.top+4)+'px';
   const inp=$('.as-pin',p),ls=$('.as-pl',p);
   const fill=()=>{const k=inp.value.trim().toLowerCase(),m=V.filter(h=>!k||h.sym.toLowerCase().includes(k)||TY[h.ty].n.toLowerCase().includes(k));
    ls.innerHTML=m.length?m.map(h=>`<button type="button" class="as-pitem${ui.act===h.key?' on':''}" data-open="${esc(h.key)}">${nm(h)}<b>${esc(h.sym)}</b><span>${TY[h.ty].n}</span><em>${sh(h.val)}</em></button>`).join(''):`<p class="as-mt">${V.length?'Tidak ada hasil':'Belum ada aset yang dipegang'}</p>`};
   fill();inp.oninput=fill;inp.onkeydown=e=>{if(e.key==='Enter'){const f=$('[data-open]',ls);if(f)f.click()}else if(e.key==='Escape'){e.stopPropagation();closePop();btn.focus()}};
   inp.focus();addEventListener('pointerdown',popOut,true)}

  // ---------- form ----------
  const behind=on=>$$('.as>:not(.as-md)',w).forEach(e=>{e.inert=on});   // fokus keyboard tidak keluar dari form
  function closeForm(){md.hidden=true;md.innerHTML='';behind(false);const b=back;back=null;b&&b.isConnected&&b.focus({preventScroll:true})}
  function openForm(html){if(md.hidden)back=document.activeElement;md.innerHTML=`<div class="as-sh" role="dialog" aria-modal="true">${html}</div>`;md.hidden=false;behind(true);const f=$('.as-in:not([disabled]),select',md);f&&f.focus({preventScroll:true});return $('form',md)}
  const segBtns=(items,cur,attr)=>items.map(([k,l])=>`<button type="button" ${attr}="${k}" aria-pressed="${k===cur}">${l}</button>`).join('');

  // Satu form untuk beli & jual (juga ubah). o: {mode:'b'|'s', edit, ty, sym, key}
  function txForm(o){
   const sell=o.mode==='s',e=o.edit;
   let hsel=[],h0=null;
   if(sell){hsel=e?ledger(tx.filter(x=>x.id!==e.id)).hold:L.hold;h0=hsel.find(h=>h.key===(e?kOf(e):o.key))||hsel[0];if(!h0){say('Tidak ada aset yang bisa dijual',1);return}}
   let ty=sell?h0.ty:(e?e.ty:(o.ty||'saham')),uk=e&&isU(ty,e.u)?e.u:TY[ty].un[0][0],cu=e?e.cu:TY[ty].cur[0],fxTouched=!!e;
   const defUnit=h=>sell&&ty==='saham'?(h.u%100===0?'lot':'lembar'):TY[ty].un[0][0];   // jual saham: lot bila genap 100 lembar
   if(!e&&sell)uk=defUnit(h0);
   const title=sell?(e?'Ubah penjualan':'Jual aset'):(e?'Ubah pembelian':'Tambah aset');
   const fm=openForm(`<form class="as-fm" novalidate aria-label="${title}">
    <header class="as-fh"><h3>${title}</h3><button type="button" class="as-ib" data-a="x" aria-label="Tutup">${Icon('x')}</button></header>
    ${sell?`<div class="as-f"><label class="as-fl" for="as-key">Aset yang dijual</label>${e?`<input class="as-in" id="as-key" value="${esc(h0.sym)}" disabled><input type="hidden" name="key" value="${esc(h0.key)}">`:`<select class="as-in" id="as-key" name="key">${hsel.map(h=>`<option value="${esc(h.key)}"${h.key===h0.key?' selected':''}>${esc(h.sym)} · ${TY[h.ty].n} · ${qt(h.ty,h.u)}</option>`).join('')}</select>`}</div><div class="as-hvb" data-hv></div>`
     :`<div class="as-f"><span class="as-fl" id="as-tyl">Jenis aset</span><div class="as-ty" role="radiogroup" aria-labelledby="as-tyl">${TK.map(k=>`<button type="button" role="radio" class="as-tc" data-ty="${k}" aria-checked="${k===ty}"><span>${dotOf(k)}${TY[k].n}</span><small>${TY[k].hint}</small></button>`).join('')}</div></div>
      <div class="as-f"><label class="as-fl" for="as-sym">Kode / nama aset</label><input class="as-in" id="as-sym" name="sym" value="${esc(e?e.sym:o.sym||'')}" autocomplete="off" maxlength="40"><div class="as-sg" data-sg></div></div>`}
    <div class="as-row2">
     <div class="as-f"><label class="as-fl" for="as-q">${sell?'Jumlah dijual':'Jumlah'}</label><div class="as-in2"><input id="as-q" name="q" inputmode="decimal" autocomplete="off" value="${e?esc(nfi.format(r8(e.q/mulOf(e.ty,e.u)))):''}"><span class="as-un" data-un></span></div><small class="as-hn2" data-eq></small>${sell?'<div class="as-qk" data-qk></div>':''}</div>
     <div class="as-f"><label class="as-fl" for="as-p" data-pl></label><div class="as-in2"><input id="as-p" name="p" inputmode="decimal" autocomplete="off"><span class="as-un" data-cu></span></div><small class="as-hn2" data-mk></small></div>
    </div>
    <div class="as-f as-fxr" data-fxr hidden><label class="as-fl" for="as-fx">Kurs saat transaksi</label><div class="as-in2"><span class="as-pre">1 US$ = Rp</span><input id="as-fx" name="fx" inputmode="decimal" autocomplete="off"></div></div>
    <div class="as-row2">
     <div class="as-f"><label class="as-fl" for="as-d">${sell?'Tanggal jual':'Tanggal beli'}</label><input class="as-in" id="as-d" type="date" name="d" value="${e?e.d:today()}"></div>
     <div class="as-f"><label class="as-fl" for="as-n">Catatan (opsional)</label><input class="as-in" id="as-n" name="n" value="${e?esc(e.n):''}" maxlength="300" autocomplete="off"></div>
    </div>
    <div class="as-pv" aria-live="polite"></div><small class="as-er" role="alert"></small>
    <footer class="as-fb"><button type="button" class="btn" data-a="x">Batal</button><button type="submit" class="btn pri">${e?'Simpan perubahan':sell?'Catat penjualan':'Simpan'}</button></footer></form>`);
   const f=fm.elements,er=$('.as-er',fm),pv=$('.as-pv',fm);
   const curH=()=>sell?(hsel.find(h=>h.key===f.key.value)||h0):null;
   const symNow=()=>sell?curH().sym:f.sym.value.trim();
   const T0=()=>TY[ty];
   const fxNow=()=>num(f.fx.value);
   const ptoIdr=(pvv,u)=>{const pm=(unitOf(ty,u)||T0().un[0])[3];return cu==='USD'?pvv/pm*fxNow():pvv/pm};
   // isi ulang bagian yang bergantung pada jenis / satuan / mata uang
   function fillUnits(){
    const T=T0(),un=T.un.map(e2=>[e2[0],e2[1]]);
    $('[data-un]',fm).innerHTML=un.length>1?`<span class="seg" role="group" aria-label="Satuan jumlah">${segBtns(un,uk,'data-u')}</span>`:`<span class="as-suf">${un[0][1]}</span>`;
    const cus=T.cur.map(c=>[c,c==='USD'?'US$':'Rp']);
    $('[data-cu]',fm).innerHTML=cus.length>1?`<span class="seg" role="group" aria-label="Mata uang harga">${segBtns(cus,cu,'data-c')}</span>`:`<span class="as-suf">${cus[0][1]}</span>`;
    $('[data-pl]',fm).textContent=priceLbl(ty,uk)+(sell?' (jual)':'');
    f.sym&&(f.sym.placeholder=T.ph);
    const k=$('[data-qk]',fm);if(k)k.innerHTML=[25,50,75,100].map(v=>`<button type="button" class="nb" data-qp="${v}">${v===100?'Semua':v+'%'}</button>`).join('');
    $$('[data-ty]',fm).forEach(b=>b.setAttribute('aria-checked',String(b.dataset.ty===ty)))}
   function fillSg(){
    const sg=$('[data-sg]',fm);if(!sg)return;const T=T0(),k=f.sym.value.trim().toLowerCase();
    let L2=[];
    if(T.mk){const mkt=T.mk;L2=(typeof WATCH==='undefined'?[]:WATCH.filter(r=>r[4]===mkt)).map(r=>[ty==='kripto'?r[0].replace(/USDT$/,''):r[0],r[1]])}
    else L2=T.sg.map(s=>[s,'']);
    tx.filter(t=>t.ty===ty).forEach(t=>{if(!L2.some(r=>r[0].toLowerCase()===t.sym.toLowerCase()))L2.unshift([t.sym,'dimiliki'])});
    const m=L2.filter(r=>!k||r[0].toLowerCase().includes(k)||String(r[1]).toLowerCase().includes(k)).filter(r=>r[0].toLowerCase()!==k).slice(0,7);
    sg.innerHTML=m.map(r=>`<button type="button" class="nb" data-sym="${esc(r[0])}" title="${esc(r[1])}">${esc(r[0])}</button>`).join('')}
   // padanan jumlah, harga pasar, kurs, ringkasan
   function calc(){
    const T=T0(),u=unitOf(ty,uk)||T.un[0],qv=num(f.q.value),pvv=num(f.p.value),usdc=cu==='USD',fxv=usdc?fxNow():1;
    $('[data-fxr]',fm).hidden=!usdc;
    $('[data-eq]',fm).textContent=qv>0?eqTxt(ty,uk,qv):'';
    const base=qv>0?qv*u[2]:0,pIdr=pvv>0&&(!usdc||fxv>0)?ptoIdr(pvv,uk):0,sym=symNow();
    const mp=sym?mq(ty,sym):0,mkc=T.usd?'USD':'IDR';
    $('[data-mk]',fm).innerHTML=mp>0?`Harga pasar ${mkc==='USD'?usd(mp):rp(mp)} <button type="button" class="nb" data-a="usemk">Pakai</button>`:'';
    if(sell){const h=curH();
     $('[data-hv]',fm).innerHTML=`Dimiliki <b>${qt(h.ty,h.u,1)}</b> · harga rata-rata <b>${rp(h.avg)}</b> · modal <b>${rp(h.cost)}</b>`;
     if(base>0&&base>h.u+EPS){pv.innerHTML=`<span class="dn">Melebihi yang dimiliki (${qt(h.ty,h.u)})</span>`;return}
     if(base>0&&pIdr>0){const val=base*pIdr,cost=h.cost*base/h.u,pl=val-cost;
      pv.innerHTML=`<span>Hasil jual</span><b>${rp(val)}</b><small>${usdc?`${usd(pvv/u[3]*base)} · kurs ${nfp.format(fxv)} · `:''}modal ${rp(cost)} · <em class="${cl(Math.round(pl))}">${pl>=0?'untung':'rugi'} ${rp(pl,1)}${cost?' ('+pct(pl/cost*100)+')':''}</em></small>`;return}
     pv.innerHTML='<span>Aset berkurang sebesar modal yang dijual; selisihnya jadi untung / rugi</span>';return}
    if(base>0&&pIdr>0){
     const pm=u[3],puUsd=usdc?pvv/pm:0,totUsd=usdc?puUsd*base:0,pl2=priceLbl(ty,uk).replace('Harga ','');
     pv.innerHTML=`<span>Modal / nilai beli</span><b>${rp(base*pIdr)}</b><small>${nfq.format(qv)} ${u[1].toLowerCase()}${u[2]>1?` = ${nfq.format(r8(base))} ${T.b}`:''} × ${usdc?usd(pvv):rp(pvv)} ${pl2}${usdc?` = ${usd(totUsd)} · kurs Rp ${nfp.format(fxv)}`:''}</small>`}
    else pv.innerHTML='<span>Modal = jumlah × harga beli</span>'}
   // nilai awal harga & kurs
   const initPrice=()=>{
    if(e){const u=unitOf(e.ty,e.u)||TY[e.ty].un[0];f.p.value=nfq.format(r8((e.cu==='USD'?e.pu:e.p)*u[3]));if(e.cu==='USD')f.fx.value=nfq.format(e.fx);return}
    if(sell){const h=curH(),c=cur(h),u=unitOf(h.ty,uk)||TY[h.ty].un[0];
     if(c.src!=='modal'){
      if(cu==='USD'&&c.usd)f.p.value=nfq.format(r8(c.usd*u[3]));
      else if(cu==='USD'){const k=kurs()||fxLast;if(k>0)f.p.value=nfq.format(r8(c.p/k*u[3]));else{cu='IDR';f.p.value=nfq.format(r8(c.p*u[3]));fillUnits()}}   // harga manual dalam Rp: tampilkan dalam US$ bila ada kurs
      else f.p.value=nfq.format(r8(c.p*u[3]))}}
    const k=kurs()||fxLast;if(k>0)f.fx.value=nfq.format(r8(k))};
   fillUnits();fillSg();initPrice();calc();
   const setFxFromDate=()=>{if(fxTouched||cu!=='USD'||!isD(f.d.value))return;const k=f.d.value>=today()?kurs():fxAt(f.d.value);if(k>0)f.fx.value=nfq.format(r8(k))};
   // ganti satuan: nilai yang sudah diketik ikut dikonversi supaya jumlah dasarnya tetap
   function setUnit(nu){
    if(nu===uk)return;const qv=num(f.q.value),pvv=num(f.p.value),o1=unitOf(ty,uk)||T0().un[0],o2=unitOf(ty,nu)||T0().un[0];
    if(qv>0)f.q.value=nfi.format(r8(qv*o1[2]/o2[2]));if(pvv>0&&o1[3]!==o2[3])f.p.value=nfq.format(r8(pvv/o1[3]*o2[3]));
    uk=nu;fillUnits();calc()}
   function setCur(nc){
    if(nc===cu)return;const pvv=num(f.p.value),k=fxNow()||kurs()||fxLast;
    if(pvv>0)f.p.value=k>0?nfq.format(r8(nc==='USD'?pvv/k:pvv*k)):'';   // tanpa kurs harga tidak bisa dikonversi: kosongkan agar tidak salah mata uang
    cu=nc;if(nc==='USD'&&!(fxNow()>0)&&k>0)f.fx.value=nfq.format(r8(k));fillUnits();calc()}
   function setType(nt){
    if(nt===ty)return;const T=TY[nt];ty=nt;
    uk=T.un[0][0];cu=T.cur[0];f.q.value='';f.p.value='';fillUnits();fillSg();
    if(T.cur.includes('USD')&&cu==='USD'){const k=kurs()||fxLast;if(k>0)f.fx.value=nfq.format(r8(k))}
    calc()}
   fm.addEventListener('input',ev=>{if(ev.target===f.fx)fxTouched=true;if(ev.target===f.sym)fillSg();calc()});
   fm.addEventListener('change',ev=>{if(ev.target===f.d)setFxFromDate();if(sell&&ev.target===f.key){const h=curH();ty=h.ty;uk=defUnit(h);cu=TY[ty].cur[0];f.q.value='';f.p.value='';fillUnits();initPrice();}calc()});
   fm.onclick=ev=>{
    const b=ev.target.closest('button');if(!b)return;
    if(b.dataset.ty){setType(b.dataset.ty);f.sym.focus();return}
    if(b.dataset.u){setUnit(b.dataset.u);return}
    if(b.dataset.c){setCur(b.dataset.c);return}
    if(b.dataset.sym){f.sym.value=b.dataset.sym;fillSg();calc();f.q.focus();return}
    if(b.dataset.qp){const h=curH(),frac=+b.dataset.qp/100,u=unitOf(h.ty,uk)||TY[h.ty].un[0];f.q.value=nfi.format(r8(h.u*frac/u[2]));calc();return}
    if(b.dataset.a==='usemk'){const sym=symNow(),mp=mq(ty,sym),T=T0(),u=unitOf(ty,uk)||T.un[0];if(!(mp>0))return;
     if(T.usd&&T.cur.includes('USD')){cu='USD';if(!(fxNow()>0)){const k=kurs()||fxLast;if(k>0)f.fx.value=nfq.format(r8(k))}f.p.value=nfq.format(r8(mp*u[3]))}
     else{cu='IDR';f.p.value=nfq.format(r8(mp*u[3]))}
     fillUnits();calc()}};
   fm.onsubmit=ev=>{ev.preventDefault();
    const T=T0(),u=unitOf(ty,uk)||T.un[0],sym=symNow(),qv=num(f.q.value),pvv=num(f.p.value),d=f.d.value,usdc=cu==='USD',fxv=usdc?fxNow():0;
    const base=qv>0?r8(qv*u[2]):0,h=sell?curH():null;
    const bad=!sym?'Isi kode atau nama aset.':!(qv>0)?'Jumlah harus lebih dari 0.':sell&&base>h.u+EPS?`Jumlah melebihi yang dimiliki (${qt(h.ty,h.u)}).`:!(pvv>0)?(sell?'Harga jual harus lebih dari 0.':'Harga beli harus lebih dari 0.'):usdc&&!(fxv>0)?'Isi kurs USD/IDR saat transaksi.':!isD(d)?(sell?'Pilih tanggal jual.':'Pilih tanggal beli.'):base*ptoIdr(pvv,uk)>1e15?'Nilai terlalu besar.':'';
    if(bad){er.textContent=bad;return}
    const now=Date.now(),t=norm({id:e?e.id:uid(),k:sell?'s':'b',ty,sym:sell?sym:nameOf(ty,sym),q:base,u:uk,p:ptoIdr(pvv,uk),cu,pu:usdc?pvv/u[3]:0,fx:fxv,d,n:f.n.value.trim(),cre:e?e.cre:now,upd:now});
    if(!t){er.textContent='Data belum lengkap.';return}
    if(usdc)fxLast=fxv;
    if(!sell)return commit(e?tx.map(x=>x.id===e.id?t:x):[...tx,t],er,e?`Pembelian ${t.sym} diperbarui`:`${t.sym} ditambahkan: ${rp(t.q*t.p)}`,t);
    const nx=e?tx.map(x=>x.id===e.id?t:x):[...tx,t],pl=ledger(nx).per[t.id];
    commit(nx,er,`Terjual ${t.sym}: aset berkurang ${rp(pl?pl.cost:0)}, ${pl&&pl.pl<0?'rugi':'untung'} ${rp(pl?pl.pl:0,1)}`,t)}}

  // Update harga manual (emas, kripto, reksadana, aset lain, atau saham bila harga pasar tidak ada). Disimpan dalam Rupiah per satuan dasar.
  function priceForm(key){
   const h0=V.find(h=>h.key===key)||V[0];if(!h0){say('Belum ada aset',1);return}
   let cu='IDR',key0=h0.key;
   const marks=h=>(px[h.key]||[]).slice(-6).reverse();
   const fm=openForm(`<form class="as-fm" novalidate aria-label="Update harga">
    <header class="as-fh"><h3>Update harga</h3><button type="button" class="as-ib" data-a="x" aria-label="Tutup">${Icon('x')}</button></header>
    <div class="as-f"><label class="as-fl" for="as-key">Aset</label><select class="as-in" id="as-key" name="key">${V.map(h=>`<option value="${esc(h.key)}"${h.key===h0.key?' selected':''}>${esc(h.sym)} · ${TY[h.ty].n}</option>`).join('')}</select></div><div class="as-hvb" data-hv></div>
    <div class="as-row2">
     <div class="as-f"><label class="as-fl" for="as-p" data-pl></label><div class="as-in2"><input id="as-p" name="p" inputmode="decimal" autocomplete="off"><span class="as-un" data-cu></span></div></div>
     <div class="as-f"><label class="as-fl" for="as-d">Tanggal</label><input class="as-in" id="as-d" type="date" name="d" value="${today()}"></div>
    </div>
    <div class="as-f as-fxr" data-fxr hidden><label class="as-fl" for="as-fx">Kurs</label><div class="as-in2"><span class="as-pre">1 US$ = Rp</span><input id="as-fx" name="fx" inputmode="decimal" autocomplete="off"></div></div>
    <div class="as-pv" aria-live="polite"></div><small class="as-er" role="alert"></small>
    <div class="as-mk" data-mkl></div>
    <footer class="as-fb"><button type="button" class="btn" data-a="x">Tutup</button><button type="submit" class="btn pri">Simpan harga</button></footer></form>`);
   const f=fm.elements,er=$('.as-er',fm),pv=$('.as-pv',fm),H=()=>V.find(h=>h.key===f.key.value)||h0;
   const toIdr=pvv=>cu==='USD'?pvv*num(f.fx.value):pvv;
   function fill(){const h=H(),T=TY[h.ty],cus=T.cur.map(c=>[c,c==='USD'?'US$':'Rp']);if(!T.cur.includes(cu))cu=T.cur[0];
    $('[data-cu]',fm).innerHTML=cus.length>1?`<span class="seg" role="group" aria-label="Mata uang">${segBtns(cus,cu,'data-c')}</span>`:`<span class="as-suf">${cus[0][1]}</span>`;
    $('[data-pl]',fm).textContent='Harga sekarang per '+T.b}
   const initP=()=>{const h=H();f.p.value=h.src==='modal'?'':nfq.format(r8(cu==='USD'&&h.usd?h.usd:h.cp));const k=kurs()||fxLast;if(k>0&&!(num(f.fx.value)>0))f.fx.value=nfq.format(r8(k))};
   const calc=()=>{
    const h=H(),T=TY[h.ty],pvv=num(f.p.value);$('[data-fxr]',fm).hidden=cu!=='USD';
    $('[data-hv]',fm).innerHTML=`Dimiliki <b>${qt(h.ty,h.u,1)}</b> · rata-rata <b>${rp(h.avg)}</b> · harga saat ini <b>${rp(h.cp)}</b> (${srcTxt(h)})`;
    const idr=pvv>0?toIdr(pvv):0;
    if(idr>0){const val=h.u*idr,pl=val-h.cost;pv.innerHTML=`<span>Nilai jadi</span><b>${rp(val)}</b><small>modal ${rp(h.cost)} · <em class="${cl(Math.round(pl))}">${rp(pl,1)}${h.cost?' ('+pct(pl/h.cost*100)+')':''}</em></small>`}
    else pv.innerHTML='<span>Nilai = jumlah dimiliki × harga sekarang</span>';
    const m=marks(h);$('[data-mkl]',fm).innerHTML=m.length?`<small>Harga manual tersimpan (per ${T.b})</small><ul>${m.map(([d,p])=>`<li><span>${fd(d)} · ${rp(p)}</span><button type="button" class="as-ib dn" data-a="dm" data-k="${esc(h.key)}" data-d="${d}" aria-label="Hapus harga ${fd(d)}">${ic(IC.del)}</button></li>`).join('')}</ul>`:''};
   fill();initP();calc();
   fm.addEventListener('input',calc);
   fm.addEventListener('change',ev=>{if(ev.target===f.key){cu='IDR';fill();initP()}calc()});
   fm.addEventListener('click',ev=>{const b=ev.target.closest('[data-c]');if(!b||b.dataset.c===cu)return;const pvv=num(f.p.value),k=num(f.fx.value)||kurs()||fxLast;if(pvv>0)f.p.value=k>0?nfq.format(r8(b.dataset.c==='USD'?pvv/k:pvv*k)):'';cu=b.dataset.c;if(cu==='USD'&&!(num(f.fx.value)>0)&&k>0)f.fx.value=nfq.format(r8(k));fill();calc()});
   fm.onsubmit=ev=>{ev.preventDefault();
    const h=H(),pvv=num(f.p.value),d=f.d.value,idr=pvv>0?toIdr(pvv):0;
    const bad=!(pvv>0)?'Harga harus lebih dari 0.':cu==='USD'&&!(num(f.fx.value)>0)?'Isi kurs USD/IDR.':!isD(d)?'Pilih tanggal.':d>today()?'Tanggal tidak boleh di masa depan.':idr*h.u>1e15?'Nilai terlalu besar.':'';
    if(bad){er.textContent=bad;return}
    if(cu==='USD')fxLast=num(f.fx.value);
    const a=(px[h.key]||[]).filter(x=>x[0]!==d);a.push([d,idr]);a.sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:0);
    const old=px;px={...px,[h.key]:a.slice(-400)};
    if(!save()){px=old;er.textContent='Penyimpanan browser penuh, data tidak tersimpan.';return}
    closeForm();render();say(`Harga ${h.sym} diperbarui: ${rp(idr)}`)}}

  // Simpan hanya bila urutan tanggal tetap masuk akal (tidak ada penjualan baru yang melebihi kepemilikan pada tanggalnya)
  function commit(next,er,ok,t){
   const lg=ledger(next);
   if(lg.bad.some(id=>!L.bad.includes(id))){er.textContent='Pada tanggal itu jumlah yang dimiliki tidak cukup untuk penjualan. Cek tanggal dan jumlahnya.';return}
   const old=tx;tx=next;
   if(!save()){tx=old;er.textContent='Penyimpanan browser penuh, data tidak tersimpan.';return}
   closeForm();
   if(t&&ui.grp!=='all'&&t.ty!==ui.grp)ui.grp='all';
   render();say(ok);ensureHist()}

  // ---------- klik ----------
  w.addEventListener('click',async e=>{
   const b=e.target.closest('button');
   if(!b){
    const tb=e.target.closest('.as-tab');if(tb){setAct(tb.dataset.id);return}
    const rw=e.target.closest('.as-rw[data-open]');if(rw&&!window.getSelection().toString())openAsset(rw.dataset.open);return}
   const D=b.dataset;
   if(b.classList.contains('as-x')){const tb=b.closest('.as-tab');if(tb)closeTab(tb.dataset.id);return}
   if(b.closest('.as-tab')){setAct(b.closest('.as-tab').dataset.id);return}
   if(D.open){closePop();openAsset(D.open);return}
   if(D.g){setGrp(D.g,Math.sign(gKeys().indexOf(D.g)-gKeys().indexOf(ui.grp)));return}
   if(D.sn){step(+D.sn);return}
   if(D.m){ui.mode=D.m;saveUi();render();return}
   if(D.r){ui.rng=D.r;saveUi();render();return}
   if(D.lf){ui.lf=D.lf;saveUi();render();return}
   const act=D.a;if(!act)return;
   if(act==='sd'){const on=root.classList.toggle('nosd');ui.side=!on;saveUi();b.setAttribute('aria-expanded',String(!on));return}
   if(act==='newtab'){tabPop(b);return}
   closePop();
   if(act==='add')txForm({mode:'b',ty:D.ty||(ui.grp!=='all'?ui.grp:undefined)});
   else if(act==='more'){const h=L.hold.find(x=>x.key===D.k)||(()=>{const t=tx.find(x=>kOf(x)===D.k);return t&&{ty:t.ty,sym:t.sym}})();if(h)txForm({mode:'b',ty:h.ty,sym:h.sym})}
   else if(act==='sell')txForm({mode:'s',key:D.k||(isAssetTab(ui.act)?ui.act:undefined)});
   else if(act==='price')priceForm(D.k||(isAssetTab(ui.act)?ui.act:undefined));
   else if(act==='chart'){S.sym=S.go=D.s;open('chart')}
   else if(act==='dm'){
    const a=(px[D.k]||[]).filter(x=>x[0]!==D.d),old=px;px={...px};if(a.length)px[D.k]=a;else delete px[D.k];
    if(!save()){px=old;say('Penyimpanan browser penuh',1);return}
    render();priceForm(D.k);say('Harga manual dihapus')}
   else if(act==='x')closeForm();
   else if(act==='edit'){const t=tx.find(x=>x.id===D.id);if(t)txForm({mode:t.k,edit:t})}
   else if(act==='del'){
    const t=tx.find(x=>x.id===D.id);if(!t)return;
    const next=tx.filter(x=>x.id!==t.id);
    if(ledger(next).bad.length){await dlg.alert('Tidak bisa dihapus','Pembelian ini dipakai oleh penjualan sesudahnya. Hapus atau ubah penjualannya dulu.');return}
    if(!await dlg.confirm('Hapus transaksi?',`${t.k==='s'?'Jual':'Beli'} ${t.sym}, ${qt(t.ty,t.q)} × ${priceLine(t)} (${fd(t.d)})`,{ok:'Hapus',danger:true}))return;
    tx=next;if(!save())say('Penyimpanan browser penuh',1);else say('Transaksi dihapus');render()}});
  // Esc menutup form saja (bukan window); klik di luar kotak form = batal
  md.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();closeForm()}});
  md.addEventListener('pointerdown',e=>{if(e.target===md)closeForm()});
  // Harga pasar baru dari live.js -> segarkan; lepas pendengar saat window ditutup
  const onQ=()=>{if(!w.isConnected){removeEventListener('tc:quotes',onQ);return}render()};
  addEventListener('tc:quotes',onQ);
  let rw0=0,rz=0;
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>{const x=vw.clientWidth;if(!x||Math.abs(x-rw0)<6)return;rw0=x;cancelAnimationFrame(rz);rz=requestAnimationFrame(()=>{if(w.isConnected)paintChart()})}).observe(vw);
  render();ensureHist()}});
})();
