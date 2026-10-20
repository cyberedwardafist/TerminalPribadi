// Crop foto profil: geser untuk memposisikan, slider / scroll / tombol +- untuk zoom, hasil lingkaran 256x256.
// Cropper.pick(host) -> Promise<dataURL|null>. Pilih file lalu buka penyuntingan di dalam `host` (elemen position:relative).
// Tidak mendeklarasikan $, $$, S di level atas (dipakai app.js).
loadCss('apps/setting/cropper.css');
const Cropper=(()=>{
 const MAX_MB=10,OUT=256,ZMAX=4;
 const pad=n=>n;

 async function decode(file){
  if(!/^image\/(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.type))throw new Error('Pilih gambar PNG, JPG, WebP, atau GIF');
  if(file.size>MAX_MB*1048576)throw new Error('Ukuran gambar maksimal '+MAX_MB+' MB');
  try{if(window.createImageBitmap)return await createImageBitmap(file,{imageOrientation:'from-image'})}catch(e){}
  return await new Promise((ok,no)=>{const u=URL.createObjectURL(file),i=new Image();i.onload=()=>{URL.revokeObjectURL(u);ok(i)};i.onerror=()=>{URL.revokeObjectURL(u);no(new Error('Gambar tidak bisa dibuka'))};i.src=u})}

 function edit(host,img){
  return new Promise(done=>{
   const W=img.width,H=img.height;if(!W||!H){done(null);return}
   const hw=host.clientWidth,hh=host.clientHeight;
   const S=Math.round(Math.max(170,Math.min(320,hw-32,hh-205))),D=S-28;     // S = kanvas, D = diameter lingkaran
   const base=D/Math.min(W,H);let zoom=1,cx=0,cy=0,grid=true,moving=false;                         // cx, cy = pergeseran pusat gambar dari pusat kanvas
   const ov=document.createElement('div');ov.className='crop';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-label','Potong foto profil');
   ov.innerHTML=`<h3>Potong foto</h3>
    <canvas tabindex="0" width="${S}" height="${S}" aria-label="Area potong. Geser dengan mouse atau tombol panah, zoom dengan tombol plus dan minus"></canvas>
    <label class="zm"><span aria-hidden="true">−</span><input type="range" min="100" max="${ZMAX*100}" value="100" aria-label="Zoom"><span aria-hidden="true">+</span></label>
    <label class="gt"><input type="checkbox" checked data-grid> Tampilkan grid</label>
    <p class="m">Geser gambar, atur zoom, lalu simpan.</p>
    <div class="sact"><button type="button" class="btn" data-x>Batal</button><button type="button" class="btn pri" data-ok>Simpan foto</button></div>`;
   host.append(ov);
   const cv=ov.querySelector('canvas'),rg=ov.querySelector('input'),dpr=Math.min(devicePixelRatio||1,2);
   cv.width=cv.height=S*dpr;cv.style.width=cv.style.height=S+'px';const g=cv.getContext('2d');g.scale(dpr,dpr);
   const sc=()=>base*zoom;
   const clamp=()=>{const s=sc(),mx=Math.max(0,W*s/2-D/2),my=Math.max(0,H*s/2-D/2);cx=Math.max(-mx,Math.min(mx,cx));cy=Math.max(-my,Math.min(my,cy))};
   function draw(){
    const s=sc(),w=W*s,h=H*s;g.clearRect(0,0,S,S);g.fillStyle='#111';g.fillRect(0,0,S,S);
    g.drawImage(img,S/2+cx-w/2,S/2+cy-h/2,w,h);
    g.save();g.fillStyle='rgba(0,0,0,.58)';g.beginPath();g.rect(0,0,S,S);g.arc(S/2,S/2,D/2,0,Math.PI*2,true);g.fill('evenodd');g.restore();
    if(grid){   // grid sepertiga (3x3) di dalam lingkaran; lebih jelas saat digeser
     const a=S/2-D/2,t=D/3;g.save();g.beginPath();g.arc(S/2,S/2,D/2,0,Math.PI*2);g.clip();
     g.strokeStyle=moving?'rgba(255,255,255,.7)':'rgba(255,255,255,.4)';g.lineWidth=1;g.beginPath();
     for(let i=1;i<3;i++){const o=Math.round(a+t*i)+.5;g.moveTo(o,a);g.lineTo(o,a+D);g.moveTo(a,o);g.lineTo(a+D,o)}
     g.stroke();g.restore()}
    g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=2;g.beginPath();g.arc(S/2,S/2,D/2,0,Math.PI*2);g.stroke()}
   const setZoom=z=>{const n=Math.max(1,Math.min(ZMAX,z)),r=n/zoom;zoom=n;cx*=r;cy*=r;clamp();rg.value=Math.round(zoom*100);draw()};
   rg.oninput=()=>setZoom(rg.value/100);
   ov.querySelector('[data-grid]').onchange=e=>{grid=e.target.checked;draw()};
   cv.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom*(e.deltaY<0?1.08:1/1.08))},{passive:false});
   let drag=null;
   cv.onpointerdown=e=>{cv.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY};moving=true;cv.classList.add('grab');draw()};
   cv.onpointermove=e=>{if(!drag)return;cx+=e.clientX-drag.x;cy+=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};clamp();draw()};
   cv.onpointerup=cv.onpointercancel=()=>{drag=null;moving=false;cv.classList.remove('grab');draw()};
   function close(v){ov.remove();done(v)}
   function save(){
    const s=sc(),o=document.createElement('canvas');o.width=o.height=OUT;const x=o.getContext('2d');
    const ix=(S/2-D/2-(S/2+cx-W*s/2))/s,iy=(S/2-D/2-(S/2+cy-H*s/2))/s,len=D/s;   // kotak potong dalam koordinat gambar asli
    x.fillStyle='#fff';x.fillRect(0,0,OUT,OUT);x.imageSmoothingQuality='high';x.drawImage(img,ix,iy,len,len,0,0,OUT,OUT);
    close(o.toDataURL('image/webp',.9))}
   ov.querySelector('[data-x]').onclick=()=>close(null);ov.querySelector('[data-ok]').onclick=save;
   ov.addEventListener('keydown',e=>{e.stopPropagation();   // jangan menutup window Setting
    if(e.key==='Escape'){close(null);return}
    if(e.target===cv){const st=e.shiftKey?30:8,k={ArrowLeft:[st,0],ArrowRight:[-st,0],ArrowUp:[0,st],ArrowDown:[0,-st]}[e.key];
     if(k){e.preventDefault();cx+=k[0];cy+=k[1];clamp();draw()}else if(e.key==='+'||e.key==='='){setZoom(zoom*1.1)}else if(e.key==='-'){setZoom(zoom/1.1)}else if(e.key==='Enter'){save()}}});
   draw();cv.focus({preventScroll:true})})}

 // pilih file lalu crop. Resolve: dataURL, atau null bila dibatalkan. Reject: Error dengan pesan yang bisa ditampilkan
 function pick(host){
  return new Promise((ok,no)=>{
   const f=document.createElement('input');f.type='file';f.accept='image/*';f.hidden=true;host.append(f);
   f.onchange=async()=>{const file=f.files[0];f.remove();if(!file){ok(null);return}
    try{const img=await decode(file);ok(await edit(host,img))}catch(e){no(e)}};
   f.addEventListener('cancel',()=>{f.remove();ok(null)});
   f.click()})}
 // gambar background: perkecil (maks 1920px) lalu kembalikan dataURL
 async function shrink(file){
  const img=await decode(file),k=Math.min(1,1920/Math.max(img.width,img.height)),c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(img.width*k));c.height=Math.max(1,Math.round(img.height*k));
  const x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(img,0,0,c.width,c.height);
  let t='image/webp',q=.85,u=c.toDataURL(t,q);if(!u.startsWith('data:image/webp')){t='image/jpeg';u=c.toDataURL(t,q)}
  while(u.length>1800000&&q>.4){q-=.1;u=c.toDataURL(t,q)}
  if(u.length>2400000)throw new Error('Gambar terlalu besar, pilih gambar lain');
  return u}
 function wide(host){
  return new Promise((ok,no)=>{
   const f=document.createElement('input');f.type='file';f.accept='image/*';f.hidden=true;host.append(f);
   f.onchange=async()=>{const file=f.files[0];f.remove();if(!file){ok(null);return}try{ok(await shrink(file))}catch(e){no(e)}};
   f.addEventListener('cancel',()=>{f.remove();ok(null)});
   f.click()})}
 return{pick,wide,shrink};
})();
