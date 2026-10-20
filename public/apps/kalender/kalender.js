// App "kalender" (dock). Berdiri sendiri: ubah file ini tidak memengaruhi app lain.
// Kiri: kalender bulanan dengan penanda per kelompok. Kanan: agenda dan berita untuk tanggal terpilih,
// dipisah per kelompok (IHSG, Komoditas, Forex) dengan filter kelompok, jenis, dampak, dan kata kunci.
// State bersama ada di S.cal. S.day ikut diperbarui supaya app lain tetap bisa membaca tanggal terpilih.
(()=>{
const CATS=[
 {id:'idx',t:'IHSG',types:[['rups','RUPS'],['div','Dividen'],['lap','Laporan keuangan'],['aksi','Aksi korporasi']]},
 {id:'kom',t:'Komoditas',types:[['emas','Emas (XAU)'],['perak','Perak (XAG)'],['minyak','Minyak']]},
 {id:'fx',t:'Forex',types:[['USD','USD'],['EUR','EUR'],['GBP','GBP'],['JPY','JPY'],['IDR','IDR']]}
];
const TL={};CATS.forEach(c=>c.types.forEach(t=>{TL[c.id+':'+t[0]]=t[1]}));
const IMP=['','Rendah','Sedang','Tinggi'],WD=['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
const pad=n=>String(n).padStart(2,'0'),ymd=(y,m,d)=>y+'-'+pad(m+1)+'-'+pad(d);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fdl=(y,m,d)=>new Date(y,m,d).toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const tyl=e=>TL[e.cat+':'+e.type]||e.type;

// ---------- data dummy ----------
// Bentuk sama dengan respons API, jadi tampilan tidak berubah saat backend menggantikannya.
// Entri: [hari/tanggal, kelompok, jenis, judul, kode, jam, dampak 1-3, keterangan, [sebelumnya, perkiraan, aktual]?, berpengaruh ke?]
const FIX=[
 [2,'idx','div','Cum dividen BBCA','BBCA',null,2,'Dividen contoh Rp 120 per saham. Pembeli sampai akhir hari ini masih berhak menerima.'],
 [5,'idx','div','Ex dividen BBCA','BBCA',null,2,'Saham mulai diperdagangkan tanpa hak dividen.'],
 [6,'idx','rups','RUPS Tahunan BBRI','BBRI','10:00',3,'Agenda: laporan tahunan, penetapan dividen, pengangkatan komisaris.'],
 [7,'idx','div','Cum dividen BBRI','BBRI',null,2,'Dividen contoh Rp 90 per saham. Pembeli sampai akhir hari ini masih berhak menerima.'],
 [8,'idx','div','Ex dividen BBRI','BBRI',null,2,'Saham mulai diperdagangkan tanpa hak dividen.'],
 [9,'idx','rups','RUPSLB TLKM','TLKM','14:00',2,'Agenda: perubahan susunan direksi dan komisaris.'],
 [13,'idx','lap','Laporan keuangan kuartal III BBCA','BBCA','16:00',3,'Laba bersih, pertumbuhan kredit, dan rasio kredit bermasalah jadi sorotan.'],
 [14,'idx','div','Cum dividen ICBP','ICBP',null,1,'Dividen contoh Rp 60 per saham.'],
 [15,'idx','rups','RUPS Tahunan ASII','ASII','09:30',3,'Agenda: laporan tahunan dan penggunaan laba bersih.'],
 [16,'idx','aksi','Buyback saham ANTM','ANTM',null,1,'Pembelian kembali saham sesuai persetujuan RUPS.'],
 [19,'idx','div','Pembayaran dividen BBCA','BBCA',null,1,'Dividen dibayarkan ke pemegang saham yang tercatat.'],
 [20,'idx','lap','Laporan keuangan kuartal III ASII','ASII','16:00',2,'Kinerja segmen otomotif dan alat berat jadi sorotan.'],
 [22,'idx','rups','RUPS Tahunan BMRI','BMRI','10:00',3,'Agenda: laporan tahunan, dividen, dan susunan pengurus.'],
 [23,'idx','div','Pembayaran dividen TLKM','TLKM',null,1,'Dividen dibayarkan ke pemegang saham yang tercatat.'],
 [24,'idx','aksi','Right issue ADRO','ADRO',null,2,'Periode perdagangan hak memesan efek terlebih dahulu.'],
 [26,'idx','div','Cum dividen UNVR','UNVR',null,2,'Dividen contoh Rp 80 per saham.'],
 [27,'idx','div','Ex dividen UNVR','UNVR',null,2,'Saham mulai diperdagangkan tanpa hak dividen.'],
 [28,'idx','rups','RUPSLB ADRO','ADRO','13:00',2,'Agenda: persetujuan aksi korporasi.'],
 [29,'idx','lap','Laporan keuangan kuartal III TLKM','TLKM','16:00',2,'Pendapatan seluler dan EBITDA jadi sorotan.'],
 [4,'kom','emas','Laporan cadangan emas bank sentral (WGC)','XAU','15:00',2,'Pembelian emas bank sentral memengaruhi permintaan fisik.'],
 [11,'kom','perak','Laporan pasokan dan permintaan perak','XAG','16:00',1,'Neraca pasokan industri dan perhiasan.'],
 [12,'kom','minyak','Pertemuan OPEC+','WTI','19:00',3,'Keputusan kuota produksi menggerakkan harga minyak.'],
 [25,'kom','emas','Laporan permintaan emas fisik','XAU','15:00',1,'Permintaan perhiasan dan batangan ritel.'],
 [2,'fx','USD','Data tenaga kerja non-pertanian (NFP)','','19:30',3,'Penciptaan lapangan kerja AS di luar sektor pertanian.',['187 rb','175 rb','192 rb'],'XAU'],
 [3,'fx','IDR','Rilis data inflasi (BPS)','','07:00',2,'Inflasi bulanan dan tahunan Indonesia.',['2,1%','2,2%','2,1%']],
 [8,'fx','IDR','Rapat Dewan Gubernur BI (BI-Rate)','','14:30',3,'Keputusan suku bunga acuan Bank Indonesia.',['5,75%','5,75%','5,75%']],
 [9,'fx','JPY','Neraca perdagangan Jepang','','06:50',1,'Selisih ekspor dan impor Jepang.',['0,3 trn','0,2 trn','0,4 trn']],
 [10,'fx','USD','Inflasi konsumen AS (CPI)','','19:30',3,'Perubahan harga konsumen tahunan di AS.',['2,9%','2,8%','2,9%'],'XAU'],
 [12,'fx','EUR','Inflasi zona euro (HICP)','','16:00',2,'Perkiraan awal inflasi zona euro.',['2,2%','2,1%','2,2%']],
 [14,'fx','GBP','PDB Inggris (bulanan)','','13:00',2,'Pertumbuhan ekonomi bulanan Inggris.',['0,1%','0,2%','0,1%']],
 [15,'fx','IDR','Neraca perdagangan (BPS)','','11:00',2,'Surplus atau defisit perdagangan Indonesia.',['3,3 mlr','3,0 mlr','3,5 mlr']],
 [17,'fx','EUR','Keputusan suku bunga ECB','','19:15',3,'Suku bunga acuan Bank Sentral Eropa.',['3,40%','3,40%','3,40%']],
 [20,'fx','JPY','Keputusan suku bunga BoJ','','10:00',3,'Suku bunga acuan Bank of Japan.',['0,50%','0,50%','0,50%']],
 [21,'fx','IDR','Rilis data PDB (BPS)','','11:00',3,'Pertumbuhan ekonomi Indonesia kuartalan.',['5,1%','5,0%','5,1%']],
 [23,'fx','GBP','Keputusan suku bunga BoE','','18:00',3,'Suku bunga acuan Bank of England.',['4,75%','4,75%','4,75%']],
 [26,'fx','USD','Notulen rapat FOMC','','01:00',2,'Catatan pembahasan rapat suku bunga The Fed.',null,'XAU'],
 [27,'fx','IDR','Lelang obligasi negara','','10:00',1,'Lelang SBN: imbal hasil dan permintaan investor.'],
 [28,'fx','USD','Keputusan suku bunga FOMC','','01:00',3,'Suku bunga acuan The Fed.',['4,50%','4,50%','4,25%'],'XAU'],
 [30,'fx','IDR','Cadangan devisa BI','','10:00',1,'Posisi cadangan devisa akhir bulan.',['148 mlr','149 mlr','150 mlr']]
];
// Berulang tiap pekan. Angka pertama = hari (1 Sen sampai 5 Jum)
const WEEK=[
 [3,'kom','minyak','Persediaan minyak mentah AS (EIA)','WTI','21:30',2,'Perubahan stok mingguan memengaruhi arah harga WTI.',['-2,1 jt','-1,0 jt','+0,4 jt']],
 [4,'fx','USD','Klaim pengangguran mingguan AS','','19:30',2,'Indikator pasar tenaga kerja mingguan.',['219 rb','222 rb','216 rb'],'XAU'],
 [5,'kom','emas','Posisi spekulan emas (CFTC)','XAU','20:30',1,'Posisi beli dan jual spekulan di kontrak emas.',['141 rb','','138 rb']]
];
const HL={
 rups:e=>'Jelang RUPS '+e.sym+': dividen dan susunan pengurus jadi sorotan',
 div:e=>'Jadwal dividen '+e.sym+': catat tanggal pentingnya sebelum cum date',
 lap:e=>'Analis menanti laporan keuangan '+e.sym+', fokus ke pertumbuhan laba',
 aksi:e=>e.sym+' umumkan aksi korporasi, ini yang perlu dicek pemegang saham'
};
const headline=e=>HL[e.type]?HL[e.type](e):'Pasar menunggu: '+e.title;

function dummy(y,m){
 const nd=new Date(y,m+1,0).getDate(),sh=(y*12+m)%5,n=new Date(),tk=ymd(n.getFullYear(),n.getMonth(),n.getDate()),ev=[];
 // akhir pekan digeser ke hari bursa terdekat
 const wk=d=>{const w=new Date(y,m,d).getDay();return w===6?d-1:w===0?(d+1<=nd?d+1:d-2):d};
 const add=(d,t)=>{const date=ymd(y,m,d),v=t[8];ev.push({id:'d'+ev.length,date,time:t[5],cat:t[1],type:t[2],title:t[3],sym:t[4],imp:t[6],detail:t[7],prev:v?v[0]:null,fc:v&&v[1]?v[1]:null,act:v&&date<=tk?v[2]:null,aff:t[9]||''})};
 FIX.forEach(t=>add(wk((t[0]-1+sh)%nd+1),t));
 for(let d=1;d<=nd;d++){const w=new Date(y,m,d).getDay();WEEK.forEach(t=>{if(t[0]===w)add(d,t)})}
 ev.sort(byTime);
 const news=[];
 ev.forEach((e,i)=>{if((e.cat==='idx'||e.imp>=2)&&(i%2===0||e.imp===3))news.push({id:'n'+i,date:e.date,time:e.time||'08:00',cat:e.cat,type:e.type,imp:e.imp,h:headline(e),src:'Contoh',sum:e.detail})});
 return{ev,news}
}
const byTime=(a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.time||'')<(b.time||'')?-1:(a.time||'')>(b.time||'')?1:0;

// Respons API dirapikan: baris yang rusak dibuang supaya satu data jelek tidak merusak seluruh bulan
function norm(j){
 const ids=CATS.map(c=>c.id),ok=x=>x&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&ids.includes(x.cat);
 const ev=(Array.isArray(j&&j.events)?j.events:[]).filter(e=>ok(e)&&e.title).map((e,i)=>({id:String(e.id==null?i:e.id),date:e.date,time:/^\d{2}:\d{2}$/.test(e.time)?e.time:null,cat:e.cat,type:String(e.type||''),title:String(e.title),sym:String(e.sym||''),imp:[1,2,3].includes(+e.imp)?+e.imp:1,detail:String(e.detail||''),prev:e.prev==null?null:String(e.prev),fc:e.fc==null?null:String(e.fc),act:e.act==null?null:String(e.act),aff:String(e.aff||'')})).sort(byTime);
 const news=(Array.isArray(j&&j.news)?j.news:[]).filter(n=>ok(n)&&n.h).map((n,i)=>({id:String(n.id==null?i:n.id),date:n.date,time:/^\d{2}:\d{2}$/.test(n.time)?n.time:'',cat:n.cat,type:String(n.type||''),imp:[1,2,3].includes(+n.imp)?+n.imp:0,h:String(n.h),src:String(n.src||''),sum:String(n.sum||'')}));
 return{ev,news}
}
const CACHE={};
const ckey=(y,m)=>(apiOn()?'live:':'dummy:')+y+'-'+pad(m+1);
async function fetchMonth(y,m){
 const k=ckey(y,m);if(CACHE[k])return CACHE[k];
 let d;
 if(apiOn()){
  let r;
  try{r=await apiFetch('/api/calendar?month='+y+'-'+pad(m+1))}
  catch(e){throw new Error(e.name==='AbortError'?'Timeout, server tidak menjawab':'Tidak terjangkau (cek URL, server, atau CORS)')}
  if(!r.ok)throw new Error('Server membalas HTTP '+r.status);
  try{d=norm(await r.json())}catch(e){throw new Error('Respons server bukan JSON yang valid')}
 }else d=dummy(y,m);
 return CACHE[k]=d
}

// ---------- state ----------
const now0=new Date();
S.cal=S.cal||{y:now0.getFullYear(),m:now0.getMonth(),cat:'all',types:[],imp:0,q:''};
const arrow=d=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+d+'"/></svg>';

registerApp('kalender',{css:'apps/kalender/kalender.css',icon:()=>"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"M3 10h18M8 3v4M16 3v4\"/><text x=\"12\" y=\"18.2\" text-anchor=\"middle\" font-size=\"8\" fill=\"currentColor\" stroke=\"none\" font-weight=\"700\">"+new Date().getDate()+"</text>",t:'Kalender',w:980,h:620,flush:true,
html:()=>`<div class="kl-w"><div class="kl">
 <section class="kl-c" aria-label="Kalender">
  <div class="kl-h"><h2 class="kl-mon" aria-live="polite"></h2><span class="tag">Data dummy</span>
   <div class="kl-nav"><button type="button" class="kl-ib" data-mv="-1" aria-label="Bulan sebelumnya" title="Bulan sebelumnya">${arrow('M15 6l-6 6 6 6')}</button><button type="button" class="btn kl-td" data-today>Hari ini</button><button type="button" class="kl-ib" data-mv="1" aria-label="Bulan berikutnya" title="Bulan berikutnya">${arrow('M9 6l6 6-6 6')}</button></div></div>
  <div class="kl-wd" aria-hidden="true">${WD.map(x=>`<span>${x}</span>`).join('')}</div>
  <div class="kl-cal" role="group" aria-label="Pilih tanggal"></div>
  <ul class="kl-lg" aria-label="Arti penanda">${CATS.map(c=>`<li><i class="kl-mk m-${c.id}"></i>${c.t}</li>`).join('')}<li><i class="kl-bx"></i>Ada dampak tinggi</li></ul>
  <div class="kl-hi"></div>
 </section>
 <section class="kl-p" aria-label="Agenda tanggal terpilih">
  <header class="kl-f">
   <div class="kl-d"><h3 class="kl-dt"></h3><p class="kl-ds"></p></div>
   <div class="seg kl-cats" role="group" aria-label="Kelompok"></div>
   <div class="kl-chips" role="group" aria-label="Jenis"></div>
   <div class="kl-r2">
    <div class="seg kl-imp" role="group" aria-label="Dampak"><button type="button" data-imp="0">Semua dampak</button><button type="button" data-imp="2">Sedang ke atas</button><button type="button" data-imp="3">Tinggi</button></div>
    <input class="kl-q" type="search" placeholder="Cari kode atau kata kunci" aria-label="Cari agenda dan berita" autocomplete="off" maxlength="40">
    <button type="button" class="btn kl-rs" data-reset hidden>Reset filter</button>
   </div>
  </header>
  <div class="kl-b" aria-live="polite"></div>
 </section></div></div>`,

init(w){
 const c=S.cal,q=s=>$(s,w),root=q('.kl'),grid=q('.kl-cal');
 let data=null,status='load',errMsg='',token=0;
 const isTd=(y,m,d)=>{const n=new Date();return y===n.getFullYear()&&m===n.getMonth()&&d===n.getDate()};
 const nd=()=>new Date(c.y,c.m+1,0).getDate(),sel=()=>ymd(c.y,c.m,S.day);
 const active=()=>c.cat!=='all'||c.types.length>0||c.imp>0||c.q!=='';

 // satu predikat dipakai kalender, hitungan, dan daftar supaya hasilnya selalu sama
 function pass(x,skip={}){
  if(!skip.cat&&c.cat!=='all'&&x.cat!==c.cat)return false;
  if(!skip.cat&&c.types.length&&!c.types.includes(x.type))return false;
  if(!skip.imp&&c.imp&&x.imp>0&&x.imp<c.imp)return false;
  if(c.q){const h=(x.title||x.h||'')+' '+(x.sym||'')+' '+(x.detail||x.sum||'')+' '+(x.aff||'')+' '+tyl(x);if(!h.toLowerCase().includes(c.q.toLowerCase()))return false}
  return true
 }

 // ---------- kalender ----------
 function buildGrid(){
  const off=(new Date(c.y,c.m,1).getDay()+6)%7,n=nd();
  q('.kl-mon').textContent=new Date(c.y,c.m,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'});
  grid.innerHTML='<i></i>'.repeat(off)+[...Array(n)].map((_,i)=>`<button type="button" class="kl-dy" data-d="${i+1}"><span class="kl-dn">${i+1}</span><span class="kl-ms"></span></button>`).join('');
  paintCal()
 }
 function paintCal(){
  const by={};
  if(status==='ok')data.ev.forEach(e=>{if(!pass(e))return;const a=by[e.date]||(by[e.date]={idx:0,kom:0,fx:0,n:0,hi:false});a[e.cat]++;a.n++;if(e.imp===3)a.hi=true});
  $$('.kl-dy',grid).forEach(b=>{
   const d=+b.dataset.d,k=ymd(c.y,c.m,d),a=by[k],on=d===S.day;
   b.setAttribute('aria-pressed',on);b.tabIndex=on?0:-1;
   if(isTd(c.y,c.m,d))b.setAttribute('aria-current','date');else b.removeAttribute('aria-current');
   b.dataset.hi=a&&a.hi?'1':'';
   b.setAttribute('aria-label',fdl(c.y,c.m,d)+(status!=='ok'?'':a?', '+a.n+' agenda':', tidak ada agenda'));
   $('.kl-ms',b).innerHTML=a?CATS.filter(x=>a[x.id]).map(x=>`<i class="kl-mk m-${x.id}"></i>`).join(''):''
  })
 }

 // ---------- filter ----------
 function paintFilters(){
  const cnt={all:0};CATS.forEach(x=>cnt[x.id]=0);
  if(status==='ok')data.ev.forEach(e=>{if(e.date===sel()&&pass(e,{cat:true})){cnt[e.cat]++;cnt.all++}});
  const num=k=>status==='ok'?`<small>${cnt[k]}</small>`:'';
  q('.kl-cats').innerHTML=[{id:'all',t:'Semua'},...CATS].map(x=>`<button type="button" data-cat="${x.id}" aria-pressed="${c.cat===x.id}">${x.t}${num(x.id)}</button>`).join('');
  const cat=CATS.find(x=>x.id===c.cat);
  q('.kl-chips').innerHTML=cat?cat.types.map(t=>`<button type="button" class="kl-ch" data-ty="${t[0]}" aria-pressed="${c.types.includes(t[0])}">${t[1]}</button>`).join(''):'<span class="kl-hint">Pilih satu kelompok untuk menyaring jenis.</span>';
  $$('[data-imp]',w).forEach(b=>b.setAttribute('aria-pressed',+b.dataset.imp===c.imp));
  q('.kl-rs').hidden=!active();
  const qi=q('.kl-q');if(qi.value!==c.q)qi.value=c.q
 }

 // ---------- panel agenda ----------
 const imp=n=>`<span class="kl-im" data-n="${n}" role="img" aria-label="Dampak ${IMP[n].toLowerCase()}"><i></i><i></i><i></i></span><span class="kl-il">${IMP[n]}</span>`;
 const val=(l,v)=>`<div><dt>${l}</dt><dd>${v==null||v===''?'-':esc(v)}</dd></div>`;
 const evHtml=e=>`<li class="kl-e" data-imp="${e.imp}">
  <div class="kl-t">${e.time?`<b>${e.time}</b><small>WIB</small>`:'<b class="kl-ad">Seharian</b>'}</div>
  <div class="kl-m"><div class="kl-ti">${esc(e.title)}</div>
   <div class="kl-su">${imp(e.imp)}<span class="kl-ty">${esc(tyl(e))}</span>${e.sym?`<span>${esc(e.sym)}</span>`:''}${e.aff?`<span>Berpengaruh ke ${esc(e.aff)}</span>`:''}</div>
   ${e.detail?`<p class="kl-de">${esc(e.detail)}</p>`:''}</div>
  ${e.prev!=null||e.fc!=null||e.act!=null?`<dl class="kl-v">${val('Aktual',e.act)}${val('Perkiraan',e.fc)}${val('Sebelumnya',e.prev)}</dl>`:''}</li>`;
 const nwHtml=n=>`<details class="kl-n"><summary><span class="kl-nt">${n.time||''}</span><span class="kl-nh">${esc(n.h)}</span><span class="kl-ty">${esc(tyl(n))}</span></summary>${n.sum?`<p>${esc(n.sum)}</p>`:''}<small>${n.src?'Sumber: '+esc(n.src):''}</small></details>`;

 function paintList(){
  const box=q('.kl-b'),k=sel(),td=isTd(c.y,c.m,S.day);
  q('.kl-dt').textContent=fdl(c.y,c.m,S.day);
  if(status==='load'){q('.kl-ds').textContent='';box.innerHTML='<div class="kl-st" role="status">Memuat agenda...</div>';return}
  if(status==='err'){q('.kl-ds').textContent='';box.innerHTML=`<div class="kl-st err" role="alert"><b>Agenda tidak bisa dimuat.</b><span>${esc(errMsg)}</span><button type="button" class="btn" data-retry>Coba lagi</button></div>`;return}
  const dayEv=data.ev.filter(e=>e.date===k),dayNw=data.news.filter(n=>n.date===k);
  const ev=dayEv.filter(e=>pass(e)),nw=dayNw.filter(n=>pass(n));
  q('.kl-ds').textContent=(td?'Hari ini. ':'')+(ev.length||nw.length?ev.length+' agenda, '+nw.length+' berita':'Tidak ada hasil');
  if(!dayEv.length&&!dayNw.length){box.innerHTML='<div class="empty">Tidak ada agenda di tanggal ini.</div>';return}
  if(!ev.length&&!nw.length){box.innerHTML='<div class="empty">Tidak ada agenda atau berita yang cocok dengan filter.<br><button type="button" class="btn" data-reset style="margin:10px 0 0">Reset filter</button></div>';return}
  box.innerHTML=CATS.map(x=>{
   const e=ev.filter(r=>r.cat===x.id),n=nw.filter(r=>r.cat===x.id);
   if(!e.length&&!n.length)return'';
   return`<section class="kl-g" aria-label="${x.t}"><h4 class="kl-gh"><i class="kl-mk m-${x.id}"></i>${x.t}<small>${e.length} agenda${n.length?', '+n.length+' berita':''}</small></h4>
    ${e.length?`<ul class="kl-ev">${e.map(evHtml).join('')}</ul>`:''}
    ${n.length?`<div class="kl-nw"><h5>Berita terkait</h5>${n.map(nwHtml).join('')}</div>`:''}</section>`}).join('')+(apiOn()?'':'<p class="kl-ft">Data contoh untuk tampilan, bukan jadwal resmi.</p>')
 }

 // ---------- loncat cepat: agenda berdampak tinggi bulan ini ----------
 function paintHigh(){
  const el=q('.kl-hi');
  if(status!=='ok'){el.innerHTML='';return}
  const L=data.ev.filter(e=>e.imp===3&&pass(e,{imp:true})).slice(0,6);
  el.innerHTML=`<h3>Dampak tinggi bulan ini</h3>`+(L.length?`<ul>${L.map(e=>`<li><button type="button" data-jump="${e.date}"><b>${+e.date.slice(8)} ${new Date(c.y,c.m,1).toLocaleDateString('id-ID',{month:'short'})}</b><span>${esc(e.title)}</span><i class="kl-mk m-${e.cat}" title="${CATS.find(x=>x.id===e.cat).t}"></i></button></li>`).join('')}</ul>`:'<p class="kl-none">Tidak ada yang cocok dengan filter.</p>')
 }

 function paintAll(){paintCal();paintFilters();paintList();paintHigh()}
 function paintSel(){paintCal();paintFilters();paintList()}

 async function load(force){
  const my=++token,k=ckey(c.y,c.m);
  if(force)delete CACHE[k];
  if(CACHE[k]){data=CACHE[k];status='ok';paintAll();return}
  status='load';data=null;paintAll();
  try{const d=await fetchMonth(c.y,c.m);if(my!==token)return;data=d;status='ok'}
  catch(e){if(my!==token)return;status='err';errMsg=e.message||'Terjadi kesalahan'}
  paintAll()
 }

 // ---------- navigasi tanggal ----------
 function setDate(dt,focus){
  const moved=dt.getFullYear()!==c.y||dt.getMonth()!==c.m;
  c.y=dt.getFullYear();c.m=dt.getMonth();S.day=dt.getDate();
  if(moved){buildGrid();load()}else paintSel();
  if(focus){const b=$('.kl-dy[data-d="'+S.day+'"]',grid);if(b)b.focus()}
 }
 const move=n=>{const t=new Date(c.y,c.m+n,1);t.setDate(Math.min(S.day,new Date(t.getFullYear(),t.getMonth()+1,0).getDate()));setDate(t)};

 root.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||!root.contains(b))return;
  const d=b.dataset;
  if(d.d)setDate(new Date(c.y,c.m,+d.d));
  else if(d.mv)move(+d.mv);
  else if('today' in d)setDate(new Date());
  else if(d.jump){const[y,m,dd]=d.jump.split('-').map(Number);setDate(new Date(y,m-1,dd))}
  else if(d.cat!=null){c.cat=d.cat;c.types=[];paintAll()}
  else if(d.ty){c.types=c.types.includes(d.ty)?c.types.filter(x=>x!==d.ty):[...c.types,d.ty];paintAll()}
  else if(d.imp!=null){c.imp=+d.imp;paintAll()}
  else if('reset' in d){c.cat='all';c.types=[];c.imp=0;c.q='';paintAll()}
  else if('retry' in d)load(true)
 });
 q('.kl-q').addEventListener('input',e=>{c.q=e.target.value.trim();paintCal();paintFilters();paintList();paintHigh()});
 // Escape di kolom cari menghapus teks dulu, bukan menutup window
 q('.kl-q').addEventListener('keydown',e=>{if(e.key==='Escape'&&e.target.value){e.target.value='';c.q='';e.stopPropagation();paintAll()}});
 grid.addEventListener('keydown',e=>{
  const k=e.key,dm={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[k];
  if(dm!=null){e.preventDefault();setDate(new Date(c.y,c.m,S.day+dm),true)}
  else if(k==='PageUp'||k==='PageDown'){e.preventDefault();move(k==='PageUp'?-1:1);const b=$('.kl-dy[data-d="'+S.day+'"]',grid);if(b)b.focus()}
  else if(k==='Home'||k==='End'){e.preventDefault();setDate(new Date(c.y,c.m,k==='Home'?1:nd()),true)}
 });

 // dipanggil show() saat window dibuka lagi dari app lain
 w._kl={sync(){if(S.day>nd())S.day=nd();buildGrid();paintFilters();load()}};
 S.day=Math.min(S.day,nd());
 buildGrid();paintFilters();load()
},
show(w){w._kl&&w._kl.sync()},
notes:['<code>GET /api/calendar?month=YYYY-MM</code> : <code>{events:[{id,date,time,cat,type,title,sym,imp,detail,prev,fc,act,aff}],news:[{id,date,time,cat,type,imp,h,src,sum}]}</code>','<code>cat</code>: <code>idx</code> (IHSG), <code>kom</code> (komoditas), <code>fx</code> (forex dan makro). <code>type</code> idx: rups, div, lap, aksi. kom: emas, perak, minyak. fx: kode mata uang. <code>imp</code>: 1 rendah, 2 sedang, 3 tinggi','Satu request per bulan, di-cache per bulan di klien. Filter kelompok, jenis, dampak, dan kata kunci dikerjakan di klien. <code>time</code> dalam WIB (HH:mm), kosong berarti seharian','Sumber yang direncanakan: jadwal RUPS dan dividen dari IDX/KSEI, kalender ekonomi dan komoditas ala Forex Factory. Respons gagal memunculkan state error dengan tombol Coba lagi','Mode Dummy memakai data contoh yang dibuat di <code>kalender.js</code> (bentuknya sama dengan respons API)']});
})();
