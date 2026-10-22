// Jam & tanggal layar kunci (dipakai semua halaman auth bergaya Mac). Diam saja bila elemennya tidak ada.
(()=>{const ld=document.getElementById('ld'),lc=document.getElementById('lc');if(!ld||!lc)return;
 const t=()=>{const d=new Date();ld.textContent=d.toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long'});lc.textContent=d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false}).replace('.',':')};
 t();setInterval(t,5000)})();
