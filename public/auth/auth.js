// Autentikasi (tahap tampilan). Dua mode, mengikuti Setting > API:
//  - Dummy : akun disimpan di localStorage browser ini (hash PBKDF2, tanpa server)
//  - Live  : memanggil backend lewat apiFetch() (lihat endpoint di bawah)
// Dimuat SETELAH settings.js. Tidak boleh mendeklarasikan $, $$, S di level atas (dipakai app.js).
//
// Endpoint backend (mode Live), semua JSON:
//  POST /api/auth/register   {name,username,email,password}   -> 200, akun status belum terverifikasi, server mengirim OTP ke email
//  POST /api/auth/otp/send   {purpose:'register'|'reset',email} -> 200 (selalu, tanpa membocorkan email terdaftar); kirim ulang OTP
//  POST /api/auth/otp/verify {purpose,email,code}             -> register: {user} (akun aktif); reset: {ticket}
//  POST /api/auth/reset      {email,ticket,password}          -> 200
//  POST /api/auth/avatar     {image: dataURL webp|png|jpeg 256x256 | null} -> 200 (null = hapus foto)
//  POST /api/auth/login      {username,password}              -> {user,token}; bila belum verifikasi balas 403 {unverified:true,email}
//  OTP: 6 digit, berlaku 10 menit, maks 5 salah per kode, kirim ulang tiap 30 detik (batasi juga di server)
//  GET  /api/auth/me       (Authorization: Bearer token)         -> {user}
const Auth=(()=>{
 const UK='tc.users',SK='tc.session',RK='tc.reset',FK='tc.fail';
 const rd=(k,s)=>{try{return JSON.parse((s?sessionStorage:localStorage).getItem(k))}catch(e){return null}};
 const wr=(k,v,s)=>{try{(s?sessionStorage:localStorage).setItem(k,JSON.stringify(v));return true}catch(e){return false}};
 const rm=(k)=>{try{localStorage.removeItem(k);sessionStorage.removeItem(k)}catch(e){}};
 const users=()=>rd(UK)||[];
 const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const rnd=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
 const enc=s=>new TextEncoder().encode(s);
 async function hash(pw,salt){
  if(window.crypto&&crypto.subtle){const k=await crypto.subtle.importKey('raw',enc(pw),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc(salt),iterations:100000,hash:'SHA-256'},k,256))}
  let h=5381;for(const c of salt+pw)h=((h*33)^c.charCodeAt(0))>>>0;return'x'+h}   // cadangan jika bukan secure context
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pub=u=>({id:u.id,name:u.name,username:u.username,email:u.email,created:u.created});

 const V={
  name:v=>v.length>=2&&v.length<=40?'':'Nama 2 sampai 40 karakter',
  username:v=>/^[a-z0-9_.]{3,20}$/.test(v)?'':'Username 3 sampai 20 karakter: huruf kecil, angka, titik, garis bawah',
  email:v=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)?'':'Format email belum benar',
  password:v=>v.length>=8?'':'Password minimal 8 karakter',
  strength(v){let s=0;if(v.length>=8)s++;if(v.length>=12)s++;if(/[a-z]/.test(v)&&/[A-Z]/.test(v))s++;if(/\d/.test(v))s++;if(/[^A-Za-z0-9]/.test(v))s++;return v?(s<=1?['Lemah','dn']:s<=3?['Sedang','']:['Kuat','up']):['','']}
 };

 const live=()=>apiOn();
 async function remote(path,body){
  let r;try{r=await apiFetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}
  catch(e){throw new Error(e.name==='AbortError'?'Timeout, server tidak menjawab':'Server tidak terjangkau (cek Base URL atau CORS)')}
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok)throw Object.assign(new Error(j.message||apiHttpMsg(r.status)),{unverified:!!j.unverified,email:j.email});return j}

 const session=()=>rd(SK)||rd(SK,true);
 const setSession=(user,remember,token)=>{rm(SK);wr(SK,{user,token:token||null,mode:token?'live':'dummy',at:Date.now()},!remember)};
 const logout=()=>{rm(SK)};

 // batas percobaan login: 5 gagal -> kunci 30 detik
 const lock=()=>{const f=rd(FK)||{n:0,until:0};return Math.max(0,Math.ceil((f.until-Date.now())/1000))};
 const failed=()=>{const f=rd(FK)||{n:0,until:0};f.n++;if(f.n>=5){f.n=0;f.until=Date.now()+30000}wr(FK,f)};

 // ---- OTP: satu catatan aktif di 'tc.otp'. Mode Live: server yang membuat/memeriksa kode, klien hanya menyimpan waktu kirim
 const OK='tc.otp',TK='tc.rtk',OTP_MIN=10,COOL=30;
 const mkCode=()=>String(100000+crypto.getRandomValues(new Uint32Array(1))[0]%900000);
 const mark=(purpose,email,code)=>wr(OK,{purpose,email,code:code||null,exp:Date.now()+OTP_MIN*60000,tries:0,sent:Date.now()});
 const same=(o,purpose,email)=>o&&o.purpose===purpose&&o.email===email;
 const otpState=(purpose,email)=>{const o=rd(OK);if(!same(o,purpose,email))return{left:0,cool:0,code:null};
  return{left:Math.max(0,Math.ceil((o.exp-Date.now())/1000)),cool:Math.max(0,Math.ceil((o.sent+COOL*1000-Date.now())/1000)),code:live()?null:o.code}};

 // kirim (atau kirim ulang) OTP. purpose: 'register' | 'reset'
 async function sendOtp(purpose,email){
  const st=otpState(purpose,email);if(st.cool)throw new Error(`Tunggu ${st.cool} detik sebelum kirim ulang`);
  if(live()){await remote('/api/auth/otp/send',{purpose,email});mark(purpose,email);return}
  const us=users(),u=us.find(x=>x.email===email);
  const ok=purpose==='register'?u&&u.verified===false:!!u;
  if(purpose==='register'&&!ok)throw new Error('Tidak ada pendaftaran yang menunggu verifikasi untuk email ini. Jika akun sudah pernah diverifikasi, langsung login')
  mark(purpose,email,ok?mkCode():null)}   // email tak dikenal: tetap "terkirim" (tanpa kode) agar email terdaftar tidak bocor

 async function register(d){
  const e=V.name(d.name)||V.username(d.username)||V.email(d.email)||V.password(d.password);if(e)throw new Error(e);
  if(live()){await remote('/api/auth/register',d);mark('register',d.email);return}
  let us=users();const taken=us.some(u=>u.verified!==false&&(u.username===d.username||u.email===d.email));
  if(taken)throw new Error('Username atau email sudah dipakai');
  us=us.filter(u=>u.verified!==false||(u.username!==d.username&&u.email!==d.email));   // pendaftaran belum terverifikasi digantikan
  const salt=rnd(16);us.push({id:rnd(8),name:d.name,username:d.username,email:d.email,salt,hash:await hash(d.password,salt),created:Date.now(),verified:false});
  if(!wr(UK,us))throw new Error('Penyimpanan browser tidak tersedia');
  mark('register',d.email,mkCode())}

 async function verifyOtp(purpose,email,code){
  if(!/^\d{6}$/.test(code))throw new Error('Kode terdiri dari 6 digit');
  if(live()){const j=await remote('/api/auth/otp/verify',{purpose,email,code});rm(OK);
   if(purpose==='reset'){wr(TK,{email,ticket:j.ticket,exp:Date.now()+OTP_MIN*60000},true);return{}}return{user:j.user}}
  const o=rd(OK),bad='Kode salah atau sudah kedaluwarsa';
  if(!same(o,purpose,email)||!o.code||Date.now()>o.exp)throw new Error(bad);
  if(o.tries>=5)throw new Error('Terlalu banyak percobaan. Kirim ulang kode baru');
  if(o.code!==code){o.tries++;wr(OK,o);throw new Error(bad)}
  rm(OK);
  if(purpose==='register'){const us=users(),u=us.find(x=>x.email===email&&x.verified===false);if(!u)throw new Error(bad);u.verified=true;wr(UK,us);return{user:pub(u)}}
  wr(TK,{email,ticket:rnd(16),exp:Date.now()+OTP_MIN*60000},true);return{}}

 const pending=email=>users().some(u=>u.email===email&&u.verified===false);
 const canReset=email=>{const t=rd(TK,true);return!!t&&t.email===email&&Date.now()<t.exp};
 async function reset(email,pw){
  const e=V.password(pw);if(e)throw new Error(e);
  const t=rd(TK,true),bad='Verifikasi OTP sudah kedaluwarsa. Ulangi dari awal';
  if(!t||t.email!==email||Date.now()>t.exp)throw new Error(bad);
  if(live())await remote('/api/auth/reset',{email,ticket:t.ticket,password:pw});
  else{const us=users(),u=us.find(x=>x.email===email);if(!u)throw new Error(bad);u.salt=rnd(16);u.hash=await hash(pw,u.salt);wr(UK,us)}
  rm(TK)}

 async function login(id,pw,remember){
  const w=lock();if(w)throw new Error(`Terlalu banyak percobaan. Coba lagi ${w} detik lagi`);
  if(live()){try{const j=await remote('/api/auth/login',{username:id,password:pw});setSession(j.user,remember,j.token);return j.user}catch(e){if(!e.unverified)failed();throw e}}
  const k=id.toLowerCase(),u=users().find(x=>x.username===k||x.email===k);
  if(!u||await hash(pw,u.salt)!==u.hash){failed();throw new Error('Username atau password salah')}
  if(u.verified===false)throw Object.assign(new Error('Akun belum diverifikasi'),{unverified:true,email:u.email});
  wr(FK,{n:0,until:0});setSession(pub(u),remember);return pub(u)}

 // email: bila hanya mengetik nama (tanpa @), otomatis jadi nama@gmail.com
 const mail=v=>{v=String(v||'').trim().toLowerCase();return v?(v.includes('@')?v:v+'@gmail.com'):''};
 const suffix=inp=>{const s=inp.parentNode.querySelector('.sfx'),auto=window.CSS&&CSS.supports&&CSS.supports('field-sizing','content');
  const t=()=>{s.hidden=inp.value.includes('@');if(!auto){const c=suffix.c||(suffix.c=document.createElement('canvas').getContext('2d'));c.font=getComputedStyle(inp).font;inp.style.width=Math.ceil(c.measureText(inp.value||inp.placeholder).width)+6+'px'}};
  inp.addEventListener('input',t);t()};

 // foto profil (dataURL 256x256). Disimpan per akun di 'tc.av.<id>'; mode Live ikut dikirim ke server
 const AVK=id=>'tc.av.'+id;
 const avatar=id=>{try{return localStorage.getItem(AVK(id))}catch(e){return null}};
 async function setAvatar(id,img){
  if(img&&(!/^data:image\/(webp|png|jpeg);base64,/.test(img)||img.length>400000))throw new Error('Foto tidak valid');
  if(live())await remote('/api/auth/avatar',{image:img});
  try{img?localStorage.setItem(AVK(id),img):localStorage.removeItem(AVK(id))}catch(e){throw new Error('Penyimpanan browser penuh, foto tidak tersimpan')}}

 // indikator kekuatan password: 3 bar (lemah, sedang, kuat)
 const meter=(inp,el)=>{const l=el.querySelector('.lbl'),t=()=>{const[n]=V.strength(inp.value);const k={Lemah:1,Sedang:2,Kuat:3}[n]||0;el.dataset.l=k;l.textContent=n?'Kekuatan: '+n:''};inp.addEventListener('input',t);t()};

 // jam di bar atas halaman auth
 const clock=id=>{const el=document.getElementById(id);if(!el)return;const t=()=>el.textContent=new Date().toLocaleString('id-ID',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});t();setInterval(t,20000)};
 const scene=()=>{let b='angin',u=null;try{b=localStorage.getItem('bg')||b;if(b==='custom'){u=localStorage.getItem('bg.img');if(!u)b='angin'}}catch(e){}document.body.dataset.bg=b;if(u)document.body.style.setProperty('--bg','center/cover no-repeat url("'+u+'")')};

 return{V,mail,suffix,meter,avatar,setAvatar,esc,session,logout,register,login,sendOtp,verifyOtp,otpState,pending,canReset,reset,live,clock,scene,mine:()=>(session()||{}).user||null};
})();
