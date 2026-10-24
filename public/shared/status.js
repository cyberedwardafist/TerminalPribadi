// Status galat/kosong untuk data live: klasifikasi penyebab, diagnosis (internet / server / data pasar), dan panel dengan ilustrasi SVG.
// Pakai: Status.jfetch(path) -> JSON atau melempar Error {kind,status}; Status.mount(el,{err,retry,what}) menggambar panel + diagnosis; Status.loading(el,teks).
// kind: offline | noserver | timeout | server | provider | auth | limit | notfound | nolive | nologin | empty | unknown
(()=>{
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');
const SI=d=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const SV=b=>`<svg viewBox="0 0 120 90" aria-hidden="true">${b}</svg>`;
const RACK='<rect x="26" y="14" width="56" height="22" rx="4"/><rect x="26" y="42" width="56" height="22" rx="4"/><circle class="f" cx="37" cy="25" r="2.5"/><circle class="f" cx="37" cy="53" r="2.5"/><path d="M48 25h24M48 53h24"/>';
const ART={
 offline:SV('<path d="M18 36a60 60 0 0 1 84 0"/><path d="M30 49a42 42 0 0 1 60 0"/><path d="M43 62a24 24 0 0 1 34 0"/><circle class="f" cx="60" cy="74" r="3.4"/><path class="x" d="M24 10l72 72"/>'),
 noserver:SV(RACK+'<circle class="fx" cx="90" cy="62" r="15"/><path d="M84 56l12 12M96 56L84 68" stroke="#fff"/><path d="M54 64v10M44 76h20"/>'),
 timeout:SV('<circle cx="52" cy="46" r="28"/><path d="M52 28v18l12 8"/><path class="x" d="M86 14l14 6M90 30l14 2" /><path d="M52 12v-4M44 8h16"/>'),
 server:SV(RACK+'<path class="x" d="M90 34l16 28H74z"/><path class="x" d="M90 44v8"/><circle class="fx" cx="90" cy="57" r="1.8"/>'),
 provider:SV('<path d="M18 70V54M30 70V40M42 70V48M54 70V30" /><path d="M14 74h48"/><path d="M70 40h14a10 10 0 0 1 0 20H70"/><path class="x" d="M92 36l8-8M98 54l10 4M88 62l6 8"/><path d="M70 50h8"/>'),
 auth:SV('<rect x="32" y="40" width="48" height="34" rx="6"/><path d="M42 40V30a14 14 0 0 1 28 0v10"/><circle class="f" cx="56" cy="55" r="4"/><path d="M56 59v7"/><circle class="fx" cx="86" cy="26" r="14"/><path d="M80 20l12 12M92 20L80 32" stroke="#fff"/>'),
 limit:SV('<path d="M20 66a40 40 0 0 1 80 0"/><path d="M30 66h6M84 66h6M60 26v6M34 38l4 4M86 38l-4 4"/><path class="x" d="M60 66L82 42"/><circle class="f" cx="60" cy="66" r="4"/>'),
 notfound:SV('<path d="M34 12h34l18 18v46H34z"/><path d="M68 12v18h18"/><path d="M52 52a8 8 0 1 1 8 8v4"/><circle class="f" cx="60" cy="72" r="2"/>'),
 nolive:SV('<path d="M44 14v18M76 14v18"/><path d="M34 32h52v12a26 26 0 0 1-52 0z"/><path d="M60 70v12"/><path class="x" d="M20 80l80-60"/>'),
 nologin:SV('<circle cx="60" cy="30" r="14"/><path d="M30 78a30 28 0 0 1 60 0z"/><path class="x" d="M24 10l72 70"/>'),
 empty:SV('<rect x="20" y="24" width="80" height="50" rx="6"/><path d="M20 40h80M44 24v50"/><path d="M58 52h30M58 62h20"/>'),
 unknown:SV('<path d="M60 12l44 70H16z"/><path d="M60 38v20"/><circle class="f" cx="60" cy="68" r="2.6"/>')};
const KIND={
 offline:{t:'Tidak ada koneksi internet',c:'Perangkat ini tidak tersambung ke internet, jadi data tidak bisa diambil. Penyebabnya ada di sisi koneksimu, bukan di server.',s:['Periksa Wi\u2011Fi atau data seluler','Coba buka situs lain untuk memastikan','Data dimuat ulang otomatis begitu tersambung lagi']},
 noserver:{t:'Server tidak dapat dihubungi',c:'Internet tersambung, tetapi server aplikasi tidak menjawab. Server sedang mati atau diperbaiki, atau alamat API di pengaturan salah.',s:['Tunggu beberapa saat lalu tekan Coba lagi','Periksa Setting > API (alamat server)','Jika dijalankan lokal, pastikan "npm run dev" masih berjalan']},
 timeout:{t:'Server terlalu lama menjawab',c:'Server tidak membalas dalam batas waktu. Biasanya server sedang sibuk atau koneksimu sangat lambat.',s:['Coba lagi beberapa saat','Pindah ke jaringan yang lebih stabil']},
 server:{t:'Server mengalami galat',c:'Server tersambung tetapi gagal memproses permintaan (galat di sisi server, mis. database belum siap).',s:['Coba lagi beberapa saat','Jika terus terjadi, cek log server atau /api/health?deep=1']},
 provider:{t:'Sumber data pasar tidak menjawab',c:'Server aplikasi hidup, tetapi penyedia data harga (bursa atau layanan data) sedang gagal atau membatasi permintaan. Bukan masalah internetmu.',s:['Tunggu beberapa menit, data akan dicoba lagi otomatis','Jika berulang, periksa kunci API penyedia data di server']},
 auth:{t:'Sesi login berakhir',c:'Server menolak permintaan karena sesi loginmu sudah tidak berlaku.',s:['Masuk lagi untuk melanjutkan']},
 limit:{t:'Terlalu banyak permintaan',c:'Server membatasi jumlah permintaan sementara waktu.',s:['Tunggu sekitar satu menit lalu coba lagi']},
 notfound:{t:'Backend tidak ditemukan',c:'Alamat ini tidak menjalankan backend aplikasi (HTTP 404).',s:['Jalankan lewat "npm run dev" atau deploy yang menyertakan folder api','Periksa Setting > API']},
 nolive:{t:'Alamat server belum diatur',c:'Aplikasi ini hanya menampilkan data nyata dari server. Halaman dibuka tanpa alamat server (mis. lewat file://), jadi tidak ada data yang bisa ditampilkan.',s:['Jalankan lewat npm run dev atau buka dari alamat deploy','Atau isi Base URL di Setting > API']},
 nologin:{t:'Belum masuk ke akun',c:'Data nyata diambil dengan akunmu. Tidak ada sesi login yang aktif.',s:['Masuk dulu, lalu data akan dimuat']},
 empty:{t:'Tidak ada data',c:'Server menjawab dengan normal, tetapi belum ada data untuk bagian ini.',s:['Coba lagi nanti atau ubah filter']},
 unknown:{t:'Data gagal dimuat',c:'Terjadi masalah yang tidak dikenali saat mengambil data.',s:['Coba lagi','Jika berulang, buka Setting > API dan uji koneksi']}};
function classify(e){
 if(!e)return'unknown';if(e.kind)return e.kind;
 if(typeof navigator!=='undefined'&&navigator.onLine===false)return'offline';
 if(e.name==='AbortError')return'timeout';
 if(e instanceof TypeError)return'noserver';
 const s=e.status;if(s===401||s===403)return'auth';if(s===404)return'notfound';if(s===429)return'limit';if(s===502||s===504)return'provider';if(s>=500)return'server';
 return'unknown'}
const mk=(kind,msg,status)=>{const e=new Error(msg||KIND[kind].t);e.kind=kind;if(status)e.status=status;return e};
// kondisi awal: tanpa mode Live / tanpa login tidak ada data nyata sama sekali
function precheck(){if(!apiOn())return mk('nolive');if(!sessToken())return mk('nologin');return null}
async function jfetch(path,opt){
 const pre=precheck();if(pre)throw pre;
 let r;try{r=await apiFetch(path,opt)}catch(e){const k=classify(e);throw mk(k,e.message)}
 if(!r.ok){let m='';try{const j=await r.json();m=j.message||j.error||''}catch(e){}
  const k=classify({status:r.status});throw mk(k,m||('HTTP '+r.status),r.status)}
 return r}
const jjson=async(p,o)=>(await jfetch(p,o)).json();
// diagnosis: tiga pemeriksaan terpisah supaya jelas penyebabnya
async function probe(url,opt,ms){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...opt,signal:c.signal,cache:'no-store'})}finally{clearTimeout(t)}}
async function diagnose(){const d=await diag0();d.done=true;return d}
async function diag0(){
 const d={net:null,server:null,data:null,status:0};
 if(typeof navigator!=='undefined'&&navigator.onLine===false){d.net=false;return d}
 try{if(/^https?:$/.test(location.protocol)){await probe(location.origin+'/shared/config.js?_='+Date.now(),{method:'HEAD'},4000)}d.net=true}catch(e){d.net=false;return d}
 try{const r=await apiFetch('/api/health');d.status=r.status;d.server=r.ok}catch(e){d.server=false;d.err=e;return d}
 if(!d.server)return d;
 try{const r=await apiFetch('/api/quotes?symbols=BTCUSDT,BBCA');if(!r.ok){d.data=false;d.status=r.status;return d}const j=await r.json();d.data=Array.isArray(j)&&j.some(q=>q.price>0)}catch(e){d.data=false}
 return d}
const chip=(l,v)=>`<span class="${v===true?'ok':v===false?'no':v==='-'?'sk':'wt'}"><i>${SI(v===true?'M5 12.5l4.5 4.5L19 7':v===false?'M6 6l12 12M18 6L6 18':v==='-'?'M7 12h10':'M6 12h.01M12 12h.01M18 12h.01')}</i>${l}</span>`;
const diagHtml=d=>`<div class="st-dg" role="status" aria-label="Hasil pemeriksaan">${chip('Internet',d.net)}${chip('Server',d.net===false?'-':d.server)}${chip('Data pasar',d.done?(d.server===true?d.data:'-'):null)}</div>`;
const kindFromDiag=(k0,d)=>{if(d.net===false)return'offline';if(d.server===false&&d.status===0)return k0==='timeout'?'timeout':'noserver';if(d.server===false)return d.status===404?'notfound':'server';if(d.data===false)return'provider';return k0};
function html(kind,o={}){const K=KIND[kind]||KIND.unknown;
 const btns=(o.retry?'<button class="pri" data-st="retry">Coba lagi</button>':'')+(kind==='nolive'?'<button data-st="setting">Buka Setting</button>':'')+((kind==='nologin'||kind==='auth')?'<button class="pri" data-st="login">Masuk</button>':'');
 return`<div class="st" data-kind="${kind}" role="alert">${ART[kind]||ART.unknown}<h3>${esc(o.title||K.t)}</h3><p>${esc(o.text||K.c)}</p><ul>${K.s.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="st-diag"></div>${o.detail?`<div class="st-dt">${esc(o.detail)}</div>`:''}<div class="st-ac">${btns}</div></div>`}
// gambar panel ke el. o: {err, kind, retry:async fn, what:'berita'}; diagnosis berjalan otomatis untuk galat jaringan/server
function mount(el,o={}){
 const err=o.err||null;let kind=o.kind||classify(err);
 const detail=o.detail||(err&&(err.status?'HTTP '+err.status+(err.message&&!/^HTTP/.test(err.message)?' \u00b7 '+err.message:''):(err.message&&!KIND[kind]?err.message:'')))||'';
 const draw=k=>{el.innerHTML=html(k,{retry:!!o.retry&&!['nolive','nologin','auth'].includes(k),detail,text:o.text,title:o.title});kind=k;wire()};
 const wire=()=>{const root=el.querySelector('.st');if(!root)return;
  root.onclick=async e=>{const b=e.target.closest('[data-st]');if(!b)return;const a=b.dataset.st;
   if(a==='setting'){if(typeof open==='function'&&typeof APPS!=='undefined'&&APPS.setting)open('setting');return}
   if(a==='login'){location.href='auth/login.html';return}
   if(a==='retry'&&o.retry){b.disabled=true;b.textContent='Memeriksa\u2026';try{await o.retry()}catch(x){}if(el.isConnected&&el.querySelector('.st'))mount(el,{...o,err:o.errFn?o.errFn():o.err})}}};
 draw(kind);
 if(['offline','noserver','timeout','server','provider','unknown','notfound'].includes(kind)||o.diag){
  const dg=()=>el.querySelector('.st-diag');if(dg())dg().innerHTML=diagHtml({net:null,server:null,data:null});
  diagnose().then(d=>{if(!el.isConnected||!el.querySelector('.st'))return;
   const k=kindFromDiag(kind,d);if(k!==kind){draw(k);if(dg())dg().innerHTML=diagHtml(d)}else if(dg())dg().innerHTML=diagHtml(d)})}
 return kind}
const loading=(el,t)=>{el.innerHTML=`<div class="st-ld" role="status">${esc(t||'Memuat data\u2026')}</div>`};
// baris peringatan ringkas di atas konten (data lama masih tampil)
const STRIP='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18.2v.1"/></svg>';
function strip(err,when){const k=classify(err),K=KIND[k]||KIND.unknown;return`<div class="st-strip" role="status">${STRIP}<span><b>${esc(K.t)}.</b> ${when?'Menampilkan data terakhir yang berhasil dimuat. ':''}${esc(K.c.split('. ')[0])}.</span><button data-st="retry">Coba lagi</button></div>`}
window.Status={classify,jfetch,jjson,mount,loading,strip,diagnose,precheck,KIND,mk};
})();
