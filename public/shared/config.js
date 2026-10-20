// Config tersimpan (localStorage 'tc.cfg'), tema, dan helper API. Dimuat di SEMUA halaman (juga login) dan sebelum js/core.js.

// ---------- config tersimpan ----------
const CFG_KEY='tc.cfg';
// Saat dipasang di domain sungguhan (Vercel dsb.) mode bawaan = live ke server yang sama (base kosong = origin halaman). Lokal/file:// tetap dummy.
const DEPLOYED=/^https?:$/.test(location.protocol)&&!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const CFG_DEF={theme:'auto',sym:'BTCUSDT',tf:'1h',still:null,api:{mode:DEPLOYED?'live':'dummy',base:'',ws:'',key:'',timeout:8000}};
const CFG=(()=>{let s={};try{s=JSON.parse(localStorage.getItem(CFG_KEY)||'{}')||{}}catch(e){}return{...CFG_DEF,...s,api:{...CFG_DEF.api,...(s.api||{})}}})();
const cfgSave=()=>{try{localStorage.setItem(CFG_KEY,JSON.stringify(CFG))}catch(e){}};
const applyTheme=()=>{const r=document.documentElement;CFG.theme==='auto'?r.removeAttribute('data-theme'):r.setAttribute('data-theme',CFG.theme)};
applyTheme();

// ---------- helper API (dipakai app lain saat backend siap) ----------
const apiOn=()=>CFG.api.mode==='live'&&(!!CFG.api.base||/^https?:$/.test(location.protocol));
const apiUrl=p=>(CFG.api.base||location.origin).replace(/\/+$/,'')+p;
// token sesi hasil login (Auth.setSession) dipakai otomatis; API key manual hanya cadangan
const sessToken=()=>{for(const st of[localStorage,sessionStorage]){try{const j=JSON.parse(st.getItem('tc.session')||'null');if(j&&j.token)return j.token}catch(e){}}return''};
async function apiFetch(path,opt={}){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),CFG.api.timeout||8000);
 const h={...(opt.headers||{})};const tk=sessToken()||CFG.api.key;if(tk&&!h.Authorization)h.Authorization='Bearer '+tk;
 try{return await fetch(apiUrl(path),{...opt,headers:h,signal:c.signal})}finally{clearTimeout(t)}}
async function apiPing(){
 if(!apiOn())throw new Error('Mode Live belum aktif');
 const t0=performance.now();
 try{const r=await apiFetch('/api/health');if(!r.ok)throw new Error('Server membalas HTTP '+r.status);return Math.round(performance.now()-t0)}
 catch(e){if(e.name==='AbortError')throw new Error('Timeout, server tidak menjawab');if(e instanceof TypeError)throw new Error('Tidak terjangkau (cek URL, server, atau CORS)');throw e}}
