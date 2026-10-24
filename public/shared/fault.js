// Penjelasan kegagalan data. Dipakai Watchlist, Maps, News, Home.
// Tidak ada data cadangan: kalau server/internet bermasalah, area data diganti panel yang menunjukkan di mata rantai mana putusnya
// (Perangkat > Internet > Server > Sumber data) lengkap dengan penyebab, saran, dan detail teknis.
// Isi: ApiError, apiReq/apiJson (request yang melempar error terstruktur), Fault.explain/pre/mount/html/strip/loading.
(()=>{
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');

// ---------- error terstruktur ----------
// kind: mode | noauth | net | timeout | http | parse | empty | unknown
class ApiError extends Error{
 constructor(kind,o={}){super(o.message||kind);this.name='ApiError';this.kind=kind;this.status=o.status||0;this.path=o.path||'';this.retryAfter=o.retryAfter||0;this.what=o.what||'';this.ms=o.ms||0;this.srv=o.message||'';this.orig=o.cause||null}}

// Seperti apiFetch, tapi gagal = ApiError (jaringan, timeout, status HTTP bukan 2xx). opt.timeout (ms) boleh memperpanjang batas waktu per panggilan.
async function apiReq(path,opt={}){
 if(!apiOn())throw new ApiError('mode',{path});
 if(!sessToken()&&!CFG.api.key)throw new ApiError('noauth',{path});
 const ms=Math.max(CFG.api.timeout||8000,opt.timeout||0);let r;
 try{r=await apiFetch(path,{...opt,timeout:ms})}catch(e){throw new ApiError(e&&e.name==='AbortError'?'timeout':'net',{path,ms,cause:e})}
 if(!r.ok){let m='';try{const j=await r.clone().json();m=(j&&j.message)||''}catch(e){}
  throw new ApiError('http',{status:r.status,message:m,path,retryAfter:+r.headers.get('retry-after')||0})}
 return r}
async function apiJson(path,opt){const r=await apiReq(path,opt);try{return await r.json()}catch(e){throw new ApiError('parse',{path,status:r.status})}}

// ---------- diagnosis: internet atau server? ----------
const withTimeout=(p,ms)=>Promise.race([p,new Promise((_,no)=>setTimeout(()=>no(new Error('t')),ms))]);
async function probeNet(){
 if(navigator.onLine===false)return false;
 const one=u=>fetch(u,{mode:'no-cors',cache:'no-store'}).then(()=>true);
 try{return await withTimeout(Promise.any([one('https://www.gstatic.com/generate_204'),one('https://cloudflare.com/cdn-cgi/trace')]),4500)}catch(e){return false}}
async function probeSrv(){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),4500);
 try{const r=await fetch(apiUrl('/api/health'),{cache:'no-store',signal:c.signal});return{up:true,status:r.status}}
 catch(e){return{up:false}}finally{clearTimeout(t)}}
let PC=null;   // hasil cek disimpan 20 detik supaya polling tidak menembak probe terus
async function probes(fresh){
 if(!fresh&&PC&&Date.now()-PC.at<20000)return PC;
 const[net,srv]=await Promise.all([probeNet(),probeSrv()]);return PC={at:Date.now(),net,srv}}

// ---------- kamus penyebab ----------
const SRC={quotes:['Yahoo Finance atau Binance','Sumber data','src'],heatmap:['Yahoo Finance, Binance, atau CoinGecko','Sumber data','src'],summary:['Yahoo Finance atau Binance','Sumber data','src'],candles:['Yahoo Finance atau Binance','Sumber data','src'],news:['sumber berita (RSS atau API berita)','Sumber berita','rss'],'news-detail':['sumber berita','Sumber berita','rss']};
const NAME={quotes:'harga',heatmap:'data peta pasar',summary:'data ringkasan',candles:'data candle',news:'berita','news-detail':'isi berita'};
const isLocal=()=>location.protocol==='file:'||/^(localhost|127\.|\[::1\]|192\.168\.|10\.)/.test(location.hostname);
const A={setting:{label:'Buka Setting > API',run:'setting'},login:{label:'Masuk lagi',run:'login'}};
const make=(kind,st,title,o)=>({kind,st,title,cause:o.cause||'',hint:o.hint||'',tech:o.tech||'',lab4:o.lab4||'Sumber data',ic4:o.ic4||'src',act:o.act||null,at:Date.now()});
const techOf=e=>{const p=(e.path||'').replace(/symbols=[^&]+/,'symbols=\u2026').replace(/cursor=\d+/,'cursor=\u2026').slice(0,80);
 if(e.kind==='timeout')return`GET ${p} \u2192 tidak ada jawaban dalam ${Math.round(e.ms/1000)} dtk`;
 if(e.kind==='net')return`GET ${p} \u2192 ${(e.orig&&e.orig.name)||'Error'}: ${(e.orig&&e.orig.message)||'gagal terhubung'}`;
 if(e.kind==='http')return`GET ${p} \u2192 HTTP ${e.status}${e.srv?' \u00b7 "'+e.srv+'"':''}`;
 if(e.kind==='parse')return`GET ${p} \u2192 respons bukan JSON`;
 if(e.kind==='empty')return`GET ${p} \u2192 HTTP 200, isi kosong`;
 if(e.kind==='mode')return'Setting > API: Base URL belum diisi (halaman dibuka tanpa server)';
 if(e.kind==='noauth')return'Tidak ada token sesi server di browser ini';
 return e.message||String(e)};

function httpInfo(e,S,N,lab){
 const s=e.status,m=e.srv||'';
 if(s===401)return make('auth',['ok','ok','warn','idle'],'Sesi login sudah berakhir',{...lab,cause:'Server hidup, tapi menolak token sesi ini (kedaluwarsa atau dicabut).',hint:'Masuk lagi untuk mendapat sesi baru.',act:A.login});
 if(s===403)return make('forbidden',['ok','ok','warn','idle'],'Akses ditolak server',{...lab,cause:m||'Akun ini tidak diizinkan membuka data tersebut.',hint:'Masuk dengan akun lain atau cek izin di server.',act:A.login});
 if(s===404&&(!m||/Endpoint tidak ditemukan/i.test(m)))return make('nobackend',['ok','ok','fail','idle'],'Backend tidak ditemukan di alamat ini',{...lab,cause:'Alamat membalas HTTP 404 untuk /api. Server ini tidak menjalankan backend Terminal Chart (server statis, Live Server, atau deploy tanpa folder api).',hint:isLocal()?'Jalankan lewat npm run dev.':'Deploy dengan folder api, atau perbaiki Base URL di Setting > API.',act:A.setting});
 if(s===404)return make('missing',['ok','ok','ok','warn'],'Data tidak tersedia di server',{...lab,cause:m,hint:'Sumber untuk data ini belum didukung server.'});
 if(s===429)return make('rate',['ok','ok','warn','idle'],'Terlalu banyak permintaan',{...lab,cause:'Server membatasi jumlah permintaan'+(e.retryAfter?'. Tunggu sekitar '+e.retryAfter+' detik.':'.'),hint:'Aplikasi mencoba lagi sendiri. Hindari membuka terlalu banyak jendela data sekaligus.'});
 if(s===502)return make('upstream',['ok','ok','ok','fail'],S[1]==='Sumber berita'?'Sumber berita tidak menjawab':'Sumber data pasar tidak menjawab',{...lab,cause:'Internet dan server kamu normal. Yang bermasalah penyedia data ('+S[0]+'): tidak bisa dihubungi atau menolak permintaan. Ini di luar aplikasi dan biasanya pulih sendiri.',hint:'Coba lagi dalam beberapa menit.'});
 if(s===503&&/database/i.test(m))return make('db',['ok','ok','ok','fail'],'Database belum siap',{...lab,lab4:'Database',ic4:'db',cause:'Server hidup, tetapi tidak bisa membaca database (Supabase): pengaturan salah, tabel belum dibuat, atau layanan sedang turun.',hint:'Buka /api/health?deep=1 di alamat server untuk rincian, atau jalankan migrasi database.'});
 if(s===503||s===504||s===408)return make('busy',['ok','ok','warn','idle'],s===503?'Server sedang tidak tersedia':'Server terlalu lama menjawab',{...lab,cause:'Server hidup di alamat ini, tetapi '+(s===503?'sedang tidak bisa melayani permintaan (kelebihan beban atau sedang restart).':'melewati batas waktu saat memproses permintaan.'),hint:'Coba lagi sebentar.'});
 if(s>=500)return make('server',['ok','ok','fail','idle'],'Server mengalami error internal',{...lab,cause:'Server hidup dan terjangkau, tetapi kodenya gagal memproses permintaan ini. Bukan masalah internet kamu.',hint:'Lihat log server untuk penyebab pastinya.'});
 return make('rejected',['ok','ok','warn','idle'],'Server menolak permintaan (HTTP '+s+')',{...lab,cause:m||'Permintaan tidak diterima server.',hint:'Coba lagi atau muat ulang halaman.'})}

function info(e,o,pr){
 const what=o.what||e.what||'quotes',S=SRC[what]||SRC.quotes,N=NAME[what]||'data',lab={lab4:S[1],ic4:S[2],tech:techOf(e)};
 switch(e.kind){
 case'mode':return make('mode',['warn','idle','idle','idle'],'Alamat server belum diatur',{...lab,cause:'Aplikasi dibuka tanpa alamat server (mis. lewat file://), jadi tidak ada permintaan yang dikirim. Tidak ada data cadangan: '+N+' hanya datang dari server.',hint:'Jalankan lewat npm run dev atau buka dari alamat deploy; atau isi Base URL di Setting > API.',act:A.setting});
 case'noauth':return make('noauth',['ok','ok','warn','idle'],'Belum masuk dengan akun server',{...lab,cause:'Sesi ini tidak punya token server (mis. sesi lama dari versi sebelumnya). Server menolak data pasar tanpa token.',hint:'Keluar lalu masuk lagi memakai akun server.',act:A.login});
 case'net':case'timeout':{
  const off=navigator.onLine===false;
  if(!pr.net)return make('offline',['ok','fail','idle','idle'],off?'Tidak ada koneksi internet':'Internet bermasalah',{...lab,cause:off?'Perangkat ini sedang offline, jadi permintaan ke server tidak pernah keluar.':'Perangkat terhubung ke jaringan, tetapi situs lain pun tidak bisa dijangkau. Biasanya Wi-Fi tanpa internet, DNS, atau VPN.',hint:'Periksa Wi-Fi atau data seluler. Data muncul sendiri begitu internet kembali.'});
  if(!pr.srv.up)return make('down',['ok','ok','fail','idle'],'Server tidak bisa dihubungi',{...lab,cause:(e.kind==='timeout'?'Internet normal, tapi server tidak menjawab dalam '+Math.round(e.ms/1000)+' detik. ':'Internet normal, tapi tidak ada server yang menjawab di alamat ini. ')+'Penyebab umum: server mati atau belum dijalankan, alamat di Setting > API salah, atau CORS memblokir (kalau server beda domain).',hint:isLocal()?'Jalankan npm run dev di folder proyek, lalu coba lagi.':'Cek status deployment di dashboard Vercel dan variabel lingkungan server.',act:A.setting});
  return e.kind==='timeout'
   ?make('slow',['ok','ok','warn','idle'],'Server menjawab terlalu lambat',{...lab,cause:'Permintaan melewati batas '+Math.round(e.ms/1000)+' detik, padahal server hidup. Biasanya cold start atau server sibuk mengambil data dari sumbernya.',hint:'Coba lagi. Kalau sering terjadi, naikkan Timeout di Setting > API.',act:A.setting})
   :make('flaky',['ok','ok','warn','idle'],'Permintaan terputus di tengah jalan',{...lab,cause:'Server hidup, tapi permintaan ini gagal sebelum selesai. Koneksi kemungkinan sempat putus.',hint:'Coba lagi.'})}
 case'parse':return make('nobackend',['ok','ok','fail','idle'],'Alamat ini bukan backend Terminal Chart',{...lab,cause:'Server membalas, tetapi isinya bukan JSON dari API (mis. halaman HTML). Biasanya aplikasi dibuka lewat server statis, atau Base URL salah.',hint:isLocal()?'Jalankan lewat npm run dev supaya halaman dan /api satu server.':'Pastikan deployment menyertakan folder api, atau perbaiki Base URL di Setting > API.',act:A.setting});
 case'empty':return make('empty',['ok','ok','ok','warn'],'Server membalas, tapi datanya kosong',{...lab,cause:'Server hidup dan terhubung, tetapi tidak ada satu pun '+N+' yang dikembalikan. Kemungkinan besar '+S[0]+' sedang gagal diambil server.',hint:'Coba lagi beberapa saat. Kalau tetap kosong, lihat log server.'});
 case'http':return httpInfo(e,S,N,lab)}
 return make('unknown',['ok','ok','warn','idle'],'Terjadi kesalahan yang tidak dikenal',{...lab,cause:'Penyebabnya belum bisa dipastikan dari sisi aplikasi.',hint:'Coba lagi. Detail teknis di bawah bisa dipakai untuk melacak.'})}

async function explain(err,o={}){
 if(!(err instanceof ApiError))err=new ApiError('unknown',{message:err&&err.message});
 const pr=err.kind==='net'||err.kind==='timeout'?await probes(!!o.fresh):null;
 return info(err,o,pr)}
// Pemeriksaan sinkron sebelum meminta apa pun: null kalau siap, selain itu info (tanpa alamat server / belum punya token server)
function pre(o={}){
 if(!apiOn())return info(new ApiError('mode'),o);
 if(!sessToken()&&!(CFG.api&&CFG.api.key))return info(new ApiError('noauth'),o);
 return null}

// ---------- tampilan ----------
const IC={
 dev:'<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M9 20h6M12 16v4"/>',
 net:'<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.4 2.2 3.6 4.9 3.6 8s-1.2 5.8-3.6 8c-2.4-2.2-3.6-4.9-3.6-8s1.2-5.8 3.6-8z"/>',
 srv:'<rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/><path d="M8 7h.01M8 17h.01"/>',
 src:'<path d="M7 3v18M17 5v15"/><rect x="4.5" y="8" width="5" height="7" rx="1"/><rect x="14.5" y="9" width="5" height="6" rx="1"/>',
 rss:'<path d="M5 5a14 14 0 0114 14M5 11a8 8 0 018 8"/><circle cx="6" cy="18" r="1.2"/>',
 db:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>'};
const BG={ok:'M-3.2 .2l2.1 2.2 4.3-4.6',fail:'M-3-3l6 6M3-3l-6 6',warn:'M0-4v4.5M0 3.6h.01',idle:'M-3 0h6'};
const ST={ok:'Normal',fail:'Gagal',warn:'Bermasalah',idle:'Tidak diperiksa'};
function chain(i){
 const X=[60,180,300,420],nm=['Perangkat','Internet','Server',i.lab4],ic=['dev','net','srv',i.ic4],Y=34;let l='',n='';
 for(let k=0;k<3;k++){
  const a=i.st[k],b=i.st[k+1],x1=X[k]+26,x2=X[k+1]-26,mid=(x1+x2)/2,live=s=>s==='ok'||s==='warn';
  if(live(a)&&live(b))l+=`<path class="ft-l ${b==='warn'?'warn':'ok'}" d="M${x1} ${Y}H${x2}"/>`;
  else if(live(a)&&b==='fail')l+=`<path class="ft-l ok" d="M${x1} ${Y}H${mid-7}"/><path class="ft-x" d="M${mid-4} ${Y+8}L${mid+4} ${Y-8}"/><path class="ft-l idle" d="M${mid+8} ${Y}H${x2}"/>`;
  else l+=`<path class="ft-l idle" d="M${x1} ${Y}H${x2}"/>`}
 for(let k=0;k<4;k++){const s=i.st[k],x=X[k];
  n+=`<g class="ft-n ${s}"><rect class="bx" x="${x-26}" y="12" width="52" height="44" rx="10"/><g class="ic" transform="translate(${x-13} 21) scale(1.08)">${IC[ic[k]]}</g><g transform="translate(${x+26} 12)"><circle class="bd" r="9"/><path class="bg" d="${BG[s]}"/></g><text class="lb" x="${x}" y="78" text-anchor="middle">${esc(nm[k])}</text><text class="st" x="${x}" y="94" text-anchor="middle">${ST[s]}</text></g>`}
 const al=i.st.map((s,k)=>nm[k]+': '+ST[s].toLowerCase()).join('. ');
 return`<svg class="ft-chain" viewBox="0 0 480 104" role="img" aria-label="${esc(al)}"><title>${esc(al)}</title>${l}${n}</svg>`}

const t2=d=>new Date(d).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
function html(i){
 return`<div class="ft" role="status">${chain(i)}<div class="ft-tx"><h3>${esc(i.title)}</h3><p>${esc(i.cause)}</p>${i.hint?`<p class="h">${esc(i.hint)}</p>`:''}</div>${i.tech?`<p class="ft-te"><code>${esc(i.tech)}</code></p>`:''}<div class="ft-ac"><button type="button" class="btn pri" data-ft="retry">Coba lagi</button>${i.act?`<button type="button" class="btn" data-ft="run" data-run="${i.act.run}">${esc(i.act.label)}</button>`:''}<small>Dicek ${t2(i.at)}</small></div></div>`}
// Panel penuh ke dalam el. retry dipanggil saat tombol "Coba lagi" ditekan (biasanya menggambar ulang el)
function mount(el,i,retry){
 el.innerHTML=html(i);
 const b=el.querySelector('[data-ft=retry]');
 if(b)b.onclick=e=>{e.stopPropagation();b.disabled=true;b.textContent='Memeriksa\u2026';if(retry)retry()}}
const WARN='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>';
// Pita ringkas di atas data lama yang masih ditampilkan. since = waktu data terakhir yang berhasil; attr = atribut tombol coba lagi (bawaan data-ft="retry")
function strip(i,since,attr){
 const btn=i.act&&!attr?`<button type="button" data-ft="run" data-run="${i.act.run}">${esc(i.act.label)}</button>`:`<button type="button" ${attr||'data-ft="retry"'}>Coba lagi</button>`;
 return`<div class="ft-strip" role="status">${WARN}<span title="${esc(i.cause)}"><b>${esc(i.title)}.</b>${since?' Menampilkan data dari '+t2(since).slice(0,5)+'.':''}</span>${btn}</div>`}
const loading=m=>`<div class="ft-ld" role="status"><i aria-hidden="true"></i><span>${esc(m)}</span></div>`;

const RUN={setting:()=>{if(typeof open==='function')open('setting')},login:()=>{try{Auth.logout()}catch(e){}location.href='auth/login.html'}};
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-ft=run]');if(b&&RUN[b.dataset.run])RUN[b.dataset.run]()});

window.ApiError=ApiError;window.apiReq=apiReq;window.apiJson=apiJson;
window.Fault={explain,pre,mount,html,strip,loading};
})();
