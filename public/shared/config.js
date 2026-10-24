// Config tersimpan (localStorage 'tc.cfg'), tema, dan helper API. Dimuat di SEMUA halaman (juga login) dan sebelum js/core.js.

// ---------- config tersimpan ----------
const CFG_KEY='tc.cfg';
// Selalu Live: base kosong = server yang sama dengan halaman (origin). Dibuka lewat file:// wajib mengisi Setting > API > Base URL.
const CFG_DEF={theme:'auto',sym:'BTCUSDT',tf:'1h',still:null,api:{base:'',ws:'',key:'',timeout:8000,rt:{finnhub:'',tiingo:''}}};
// Token realtime (api.rt) hidup di memori saja: sumbernya akun di server (Live.hydrate), tidak pernah ditulis ke localStorage.
const CFG=(()=>{let s={};try{s=JSON.parse(localStorage.getItem(CFG_KEY)||'{}')||{}}catch(e){}const c={...CFG_DEF,...s,api:{...CFG_DEF.api,...(s.api||{})}};c.api.rt={...CFG_DEF.api.rt};delete c.api.mode;return c})();
const cfgSave=()=>{try{const{rt,...api}=CFG.api;localStorage.setItem(CFG_KEY,JSON.stringify({...CFG,api}))}catch(e){}};
const applyTheme=()=>{const r=document.documentElement;CFG.theme==='auto'?r.removeAttribute('data-theme'):r.setAttribute('data-theme',CFG.theme)};
applyTheme();

// ---------- helper API (dipakai app lain saat backend siap) ----------
// Base URL buatan sendiri hanya dipakai saat dibuka dari file:// atau localhost (pengembangan). Di domain publik diabaikan, supaya token login
// tidak pernah terkirim ke server lain (mis. bila pengguna dibujuk menempelkan alamat milik orang lain).
const baseCustom=()=>{const b=CFG.api.base;if(!b)return'';if(location.protocol==='file:'||/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname))return b;try{return new URL(b).origin===location.origin?b:''}catch(e){return''}};
const apiOn=()=>!!baseCustom()||/^https?:$/.test(location.protocol);
const apiUrl=p=>(baseCustom()||location.origin).replace(/\/+$/,'')+p;
// token sesi hasil login (Auth.setSession) dipakai otomatis; API key manual hanya cadangan
const sessToken=()=>{for(const st of[localStorage,sessionStorage]){try{const j=JSON.parse(st.getItem('tc.session')||'null');if(j&&j.token)return j.token}catch(e){}}return''};
async function apiFetch(path,opt={}){
 const{timeout:tmo,...o}=opt,c=new AbortController(),t=setTimeout(()=>c.abort(),tmo||CFG.api.timeout||8000);
 const h={...(opt.headers||{})};const tk=sessToken()||CFG.api.key;if(tk&&!h.Authorization)h.Authorization='Bearer '+tk;
 try{return await fetch(apiUrl(path),{...o,headers:h,signal:c.signal})}finally{clearTimeout(t)}}
// Pesan untuk status HTTP tanpa isi JSON dari backend. 404 di sini berarti alamat ini TIDAK menjalankan backend (server statis / Live Server / deploy tanpa folder api).
const apiHttpMsg=st=>st===404?'Layanan tidak ditemukan. Muat ulang halaman lalu coba lagi':st>=500?'Layanan sedang bermasalah. Coba lagi sebentar':'Permintaan belum berhasil ('+st+')';
async function apiPing(){
 if(!apiOn())throw new Error('Layanan belum tersedia');
 const t0=performance.now();
 try{const r=await apiFetch('/api/health');if(!r.ok)throw new Error(apiHttpMsg(r.status));return Math.round(performance.now()-t0)}
 catch(e){if(e.name==='AbortError')throw new Error('Server terlalu lama menjawab');if(e instanceof TypeError)throw new Error('Server tidak terjangkau. Periksa koneksi internet');throw e}}
