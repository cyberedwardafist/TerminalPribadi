// Config tersimpan (localStorage 'tc.cfg'), tema, dan helper API. Dimuat di SEMUA halaman (juga login) dan sebelum js/core.js.

// ---------- config tersimpan ----------
const CFG_KEY='tc.cfg';
// Selalu Live: base kosong = server yang sama dengan halaman (origin). Dibuka lewat file:// wajib mengisi Setting > API > Base URL.
const CFG_DEF={theme:'auto',sym:'BTCUSDT',tf:'1h',still:null,api:{base:'',ws:'',key:'',timeout:8000,rt:{finnhub:'',tiingo:''}}};
const CFG=(()=>{let s={};try{s=JSON.parse(localStorage.getItem(CFG_KEY)||'{}')||{}}catch(e){}const c={...CFG_DEF,...s,api:{...CFG_DEF.api,...(s.api||{})}};c.api.rt={...CFG_DEF.api.rt,...(c.api.rt||{})};delete c.api.mode;return c})();
const cfgSave=()=>{try{localStorage.setItem(CFG_KEY,JSON.stringify(CFG))}catch(e){}};
const applyTheme=()=>{const r=document.documentElement;CFG.theme==='auto'?r.removeAttribute('data-theme'):r.setAttribute('data-theme',CFG.theme)};
applyTheme();

// ---------- helper API (dipakai app lain saat backend siap) ----------
const apiOn=()=>!!CFG.api.base||/^https?:$/.test(location.protocol);
const apiUrl=p=>(CFG.api.base||location.origin).replace(/\/+$/,'')+p;
// token sesi hasil login (Auth.setSession) dipakai otomatis; API key manual hanya cadangan
const sessToken=()=>{for(const st of[localStorage,sessionStorage]){try{const j=JSON.parse(st.getItem('tc.session')||'null');if(j&&j.token)return j.token}catch(e){}}return''};
async function apiFetch(path,opt={}){
 const{timeout:tmo,...o}=opt,c=new AbortController(),t=setTimeout(()=>c.abort(),tmo||CFG.api.timeout||8000);
 const h={...(opt.headers||{})};const tk=sessToken()||CFG.api.key;if(tk&&!h.Authorization)h.Authorization='Bearer '+tk;
 try{return await fetch(apiUrl(path),{...o,headers:h,signal:c.signal})}finally{clearTimeout(t)}}
// Pesan untuk status HTTP tanpa isi JSON dari backend. 404 di sini berarti alamat ini TIDAK menjalankan backend (server statis / Live Server / deploy tanpa folder api).
const apiHttpMsg=st=>st===404?'Backend tidak ditemukan di alamat ini (HTTP 404). Jalankan lewat "npm run dev" (atau deploy Vercel yang menyertakan folder api),':'Server membalas HTTP '+st;
async function apiPing(){
 if(!apiOn())throw new Error('Alamat server belum diatur');
 const t0=performance.now();
 try{const r=await apiFetch('/api/health');if(!r.ok)throw new Error(apiHttpMsg(r.status));return Math.round(performance.now()-t0)}
 catch(e){if(e.name==='AbortError')throw new Error('Timeout, server tidak menjawab');if(e instanceof TypeError)throw new Error('Tidak terjangkau (cek URL, server, atau CORS)');throw e}}
