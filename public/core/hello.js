// Layar sambutan "TerminalPribadi": tulisan sambung yang ditulis goresan demi goresan (gaya "hello" Mac saat pertama menyala).
// Tampil paling awal (script ini dimuat di awal <body>), menutup tampilan setengah jadi saat refresh / Ctrl+Shift+R.
// - Animasi dimainkan penuh minimal sekali.
// - Selama desktop belum siap (boot.js belum selesai / dock masih kosong), animasi DIULANG, bukan dibiarkan kosong.
// - Bila tetap macet beberapa putaran, halaman dimuat ulang satu kali (penjaga lewat sessionStorage) supaya tidak menggantung.
// Kontrak: boot.js memanggil Hello.done() di akhir penyalaan. Tidak bergantung pada core.js.
const Hello=(()=>{
 // Huruf sambung buatan sendiri (bukan font sistem). Tiap huruf: path mulai (0,100) -> berakhir (adv,100); garis dasar y=100, tinggi x y=62, huruf tinggi y=14, turun y=142.
 const G={
  e:[40,'C6 90 14 70 26 64 C36 59 40 70 30 77 C22 82 10 81 10 90 C10 100 26 104 40 100'],
  r:[40,'C4 86 8 72 10 62 C10 76 14 86 22 78 C28 70 34 62 42 64 C38 76 34 92 44 100'],
  m:[84,'C4 84 8 70 10 62 C10 78 12 92 14 100 C14 86 18 66 30 64 C40 63 38 86 38 100 C38 86 44 66 54 64 C64 63 62 88 66 100 C70 104 78 102 84 100'],
  i:[30,'C4 90 8 76 10 66 C12 82 14 96 20 100 C24 102 28 100 30 100'],
  n:[54,'C4 84 8 70 10 62 C10 78 12 92 14 100 C14 86 18 66 30 64 C40 63 38 86 38 100 C42 104 48 102 54 100'],
  a:[46,'C10 88 20 68 32 64 C22 62 10 72 10 88 C10 100 22 102 34 90 C36 80 38 72 38 64 C38 84 38 94 46 100'],
  l:[40,'C6 80 20 30 28 18 C34 10 34 24 26 50 C20 70 18 90 26 98 C32 104 38 100 40 100'],
  b:[46,'C6 76 16 30 24 16 C30 10 32 24 26 56 C24 80 22 92 24 100 C30 70 48 56 48 80 C48 98 30 106 20 94 C34 100 44 100 46 100'],
  d:[48,'C10 88 20 68 32 64 C22 62 10 72 10 88 C10 100 22 102 34 90 C40 60 44 30 48 14 C50 8 46 20 42 44 C38 70 36 94 40 100 C44 104 48 100 48 100']
 };
 const sh=(d,dx)=>{let k=0;return d.replace(/-?\d+(\.\d+)?/g,n=>(k++%2===0?+n+dx:+n))};
 // Satu kata: huruf-huruf disambung jadi satu goresan panjang
 const word=(s,x0)=>{let x=x0,d='M'+x0+' 100';for(const c of s){const g=G[c];d+=' '+sh(g[1],x);x+=g[0]}return{d,end:x}};
 const build=()=>{
  const P=[];
  // "Terminal": batang T disambung ke erminal, lalu palang T dan titik i (pena diangkat)
  const T0=8,a=word('erminal',T0+58);
  P.push('M'+(T0+36)+' 16 C'+(T0+30)+' 44 '+(T0+28)+' 78 '+(T0+38)+' 96 C'+(T0+43)+' 104 '+(T0+52)+' 100 '+(T0+58)+' 100 '+a.d.replace(/^M\S+ \S+/,''));
  P.push('M'+(T0)+' 28 C'+(T0+22)+' 16 '+(T0+48)+' 14 '+(T0+76)+' 20');
  // titik i: i adalah huruf ke-4 dari "erminal" (e,r,m,i)
  const ix=T0+58+G.e[0]+G.r[0]+G.m[0]+10;P.push('M'+ix+' 44 L'+(ix+1)+' 45');
  // "Pribadi"
  const Px=a.end+36;
  P.push('M'+(Px+16)+' 18 C'+(Px+12)+' 60 '+(Px+8)+' 104 '+(Px+4)+' 140 C'+(Px+3)+' 146 '+(Px-2)+' 146 '+(Px-4)+' 142');
  P.push('M'+(Px+14)+' 20 C'+(Px+42)+' 8 '+(Px+68)+' 16 '+(Px+62)+' 40 C'+(Px+58)+' 60 '+(Px+30)+' 62 '+(Px+10)+' 56');
  const b=word('ribadi',Px+70);P.push(b.d);
  const i1=Px+70+G.r[0]+10,i2=Px+70+G.r[0]+G.i[0]+G.b[0]+G.a[0]+G.d[0]+10;
  P.push('M'+i1+' 44 L'+(i1+1)+' 45');P.push('M'+i2+' 44 L'+(i2+1)+' 45');
  return{p:P,w:b.end+10}};

 let el=null,svg=null,paths=[],sub=null,booted=false,gone=false,plays=0,alive=0,tm=0;
 const still=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}};
 const ready=()=>{const d=document.getElementById('dock');return booted&&!!d&&d.children.length>0};
 const NS='http://www.w3.org/2000/svg';
 const mk=()=>{
  const B=build();
  el=document.createElement('div');el.id='hello';el.setAttribute('role','status');el.setAttribute('aria-label','Memuat TerminalPribadi');
  el.innerHTML='<svg viewBox="-20 -6 '+(B.w+40)+' 164" aria-hidden="true"><defs><linearGradient id="hg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="'+B.w+'" y2="0"><stop offset="0" stop-color="#ffb25e"/><stop offset=".35" stop-color="#ff7a8a"/><stop offset=".7" stop-color="#b58cff"/><stop offset="1" stop-color="#6fb2ff"/></linearGradient></defs><g transform="translate(14 0) skewX(-9)">'+B.p.map(d=>'<path class="ink" d="'+d+'"/>').join('')+'</g></svg><div class="sub">Memuat desktop</div>';
  document.body.prepend(el);svg=el.firstChild;paths=[...el.querySelectorAll('.ink')];sub=el.querySelector('.sub');
  paths.forEach(p=>{p._l=p.getTotalLength();p.style.strokeDasharray=p._l;p.style.strokeDashoffset=p._l})};
 const wait=ms=>new Promise(r=>{tm=setTimeout(r,ms)});
 const draw=async()=>{
  const SPEED=330,PAUSE=90;   // px (satuan viewBox) per detik; jeda antar goresan
  for(const p of paths){const d=Math.max(110,p._l/SPEED*1000);
   if(still()){p.style.strokeDashoffset=0;continue}
   const a=p.animate([{strokeDashoffset:p._l},{strokeDashoffset:0}],{duration:d,easing:p._l<30?'linear':'cubic-bezier(.45,.05,.4,1)',fill:'forwards'});
   await a.finished.catch(()=>{});if(gone)return;await wait(PAUSE)}};
 const erase=async()=>{
  if(still()){paths.forEach(p=>p.style.strokeDashoffset=p._l);return}
  await Promise.all(paths.map(p=>p.animate([{opacity:1},{opacity:0}],{duration:450,fill:'forwards'}).finished.catch(()=>{})));
  paths.forEach(p=>{p.getAnimations().forEach(a=>a.cancel());p.style.strokeDashoffset=p._l;p.style.opacity=''})};
 const leave=()=>{if(gone)return;gone=true;clearTimeout(tm);el.classList.add('out');setTimeout(()=>{try{el.remove()}catch(e){}},900)};
 const run=async()=>{
  for(;;){plays++;
   await draw();if(gone)return;
   await wait(700);if(gone)return;
   if(ready()){leave();return}
   // Desktop belum siap: tampilan masih seperti layar kosong -> ulangi animasi
   sub.classList.add('on');
   if(plays>=3&&!ready()){try{if(!sessionStorage.getItem('tc.hello.rl')){sessionStorage.setItem('tc.hello.rl','1');location.reload();return}}catch(e){}}
   await erase();if(gone)return;await wait(250);if(gone)return}};
 const start=()=>{if(el||!document.body)return;try{mk();run()}catch(e){try{el&&el.remove()}catch(_){}}};
 // boot.js memanggil ini setelah dock, jam dan sesi terpasang; sesudahnya pengaman reload dilepas
 const done=()=>{booted=true;try{sessionStorage.removeItem('tc.hello.rl')}catch(e){}};
 if(document.body)start();else document.addEventListener('DOMContentLoaded',start);
 return{done,replay:()=>{plays=0},ready}})();
