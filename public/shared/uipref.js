// Preferensi tampilan tambahan (diatur di Setting > Umum, Tampilan, Data). Disimpan di CFG.ui (localStorage 'tc.cfg'),
// jadi ikut terhapus oleh "Reset semua pengaturan". Khusus perangkat ini (tidak disinkron ke server).
// Dimuat tepat setelah config.js; tiap pemakai (boot.js, ticker.js, hello.js) tetap jalan dengan nilai bawaan kalau file ini tidak ada.
const UiPref=(()=>{
 const DEF={accent:'#e8a33d',dock:'m',mag:true,clock:'full',h12:false,tkr:true,tkSpeed:'n',hello:'full',restore:true};
 const ACC=[['#e8a33d','Oranye'],['#f2c94c','Kuning'],['#6fd08c','Hijau'],['#6cb4ff','Biru'],['#b99cff','Ungu'],['#ff8fab','Merah muda'],['#ff7b6b','Koral']];
 const DOCK={s:40,m:48,l:58},SPD={l:70,n:110,c:170};
 CFG.ui={...DEF,...(CFG.ui&&typeof CFG.ui==='object'&&!Array.isArray(CFG.ui)?CFG.ui:{})};
 const get=k=>CFG.ui[k];
 const st=document.createElement('style');st.id='uipref';
 const apply=()=>{const u=CFG.ui,acc=ACC.some(a=>a[0]===u.accent)?u.accent:DEF.accent;
  let css=':root{--acc:'+acc+'}';
  if(DOCK[u.dock]&&u.dock!=='m')css+='@media (min-width:481px){#dock{--b:'+DOCK[u.dock]+'px}}';
  if(u.tkr===false)css+='#mb #tkr{display:none!important}#mb #mbmode{margin-left:auto}';
  st.textContent=css};
 const set=(k,v)=>{CFG.ui[k]=v;cfgSave();apply()};
 // teks jam menubar; tanpa pilihan khusus hasilnya sama dengan jam lama
 const clock=()=>{const u=CFG.ui,d=new Date(),h=u.h12===true?{hour12:true}:{};
  return u.clock==='full'?d.toLocaleString('id-ID',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',...h})
   :d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',...(u.clock==='sec'?{second:'2-digit'}:{}),...h})};
 const tkSpeed=()=>SPD[CFG.ui.tkSpeed]||SPD.n;
 document.head.append(st);apply();
 return{DEF,ACC,get,set,apply,clock,tkSpeed}})();
