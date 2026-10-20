// Setting > Tentang: info aplikasi dan reset semua pengaturan.
(()=>{
const{row,seg,bindSeg}=Setting;
Setting.page({id:'tentang',title:'Tentang',color:'#636366',icon:"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5M12 8h.01\"/>",
 html:()=>`
  <div class="grp">
   ${row('Aplikasi','','Terminal Chart')}
   ${row('Tahap','','Tampilan (data dummy)')}
   ${row('Penyimpanan','Semua pengaturan ada di browser ini','localStorage')}
  </div>
  <div class="grp">${row('Reset semua pengaturan','Kembali ke bawaan, halaman dimuat ulang','<button type="button" class="btn dng" data-reset>Reset…</button>')}</div>
`,
 init:({q})=>{
  const rs=q('[data-reset]');let arm=0;rs.onclick=()=>{if(!arm){arm=1;rs.textContent='Klik lagi untuk yakin';setTimeout(()=>{arm=0;rs.textContent='Reset…'},3500);return}try{localStorage.removeItem(CFG_KEY);localStorage.removeItem('bg')}catch(e){}(window.Live&&Live.resetSettings?Live.resetSettings():Promise.resolve()).finally(()=>location.reload())};
 }});
})();
