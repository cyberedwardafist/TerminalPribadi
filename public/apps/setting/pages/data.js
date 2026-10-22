// Setting > Data: cadangan pengaturan (ekspor / impor JSON) dan pemakaian penyimpanan browser.
// Kunci API dan data pribadi (catatan, watchlist, akun) TIDAK ikut diekspor; hanya pengaturan tampilan.
(()=>{
const{row}=Setting;
const OK_THEME=['auto','dark','light'],OK_TF=['1m','5m','1h','1D'],OK_BG=['angin','hutan','laut','senja','malam','aurora','gunung','gurun','hujan','salju','kota','sakura','galaksi'];
const kb=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1).replace('.',',')+' KB':(n/1048576).toFixed(2).replace('.',',')+' MB';
// ukuran perkiraan (karakter x 2 byte, seperti cara browser menghitung kuota)
const usage=()=>{const o=[];try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o.push([k,(k.length+(localStorage.getItem(k)||'').length)*2])}}catch(e){}return o.sort((a,b)=>b[1]-a[1])};
Setting.page({id:'data',title:'Data',color:'#30b0c7',
 icon:"<ellipse cx=\"12\" cy=\"6\" rx=\"7\" ry=\"3\"/><path d=\"M5 6v6c0 1.700 3.100 3 7 3s7-1.300 7-3V6M5 12v6c0 1.700 3.100 3 7 3s7-1.300 7-3v-6\"/>",
 html:()=>`
  <div class="grp">
   ${row('Ekspor pengaturan','Tema, simbol dan timeframe awal, tampilan, background bawaan. Tanpa kunci API dan data pribadi','<button type="button" class="btn" data-exp>Unduh…</button>')}
   ${row('Impor pengaturan','Pilih berkas hasil ekspor; halaman dimuat ulang setelahnya','<button type="button" class="btn" data-imp>Pilih berkas…</button><input type="file" accept="application/json,.json" data-file hidden>')}
  </div>
  <p class="shint tst" data-st role="status"></p>
  <div class="grp">
   ${row('Terpakai','Perkiraan penyimpanan browser untuk situs ini','<span data-us></span>')}
   ${row('Jumlah entri','','<span data-n></span>')}
   ${row('Terbesar','Tiga entri yang paling banyak memakai ruang','<span data-big style="text-align:right"></span>')}
  </div>
`,
 init:({q})=>{
  const st=q('[data-st]'),say=(t,c)=>{st.textContent=t;st.className='shint tst'+(c?' '+c:'')};
  const fill=()=>{const u=usage(),sum=u.reduce((a,x)=>a+x[1],0);q('[data-us]').textContent=kb(sum)+' dari ±5 MB';q('[data-n]').textContent=String(u.length);q('[data-big]').innerHTML=u.slice(0,3).map(x=>`${x[0].replace(/[<>&]/g,'')} · ${kb(x[1])}`).join('<br>')||'–'};fill();
  q('[data-exp]').onclick=()=>{
   let bg='angin';try{const b=localStorage.getItem('bg');if(OK_BG.includes(b))bg=b}catch(e){}
   const j={app:'TerminalPribadi',v:1,theme:CFG.theme,sym:CFG.sym,tf:CFG.tf,still:typeof CFG.still==='boolean'?CFG.still:null,ui:{...CFG.ui},bg};
   const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(j,null,2)],{type:'application/json'}));a.download='terminal-pribadi-pengaturan.json';document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);say('Pengaturan diunduh.','up')};
  const f=q('[data-file]');q('[data-imp]').onclick=()=>f.click();
  f.onchange=async()=>{const file=f.files[0];f.value='';if(!file)return;
   try{
    if(file.size>100e3)throw new Error('Berkas terlalu besar untuk berkas pengaturan');
    const j=JSON.parse(await file.text());if(!j||typeof j!=='object'||j.app!=='TerminalPribadi')throw new Error('Bukan berkas pengaturan TerminalPribadi');
    if(OK_THEME.includes(j.theme))CFG.theme=j.theme;
    if(WATCH.some(r=>r[0]===j.sym))CFG.sym=j.sym;
    if(OK_TF.includes(j.tf))CFG.tf=j.tf;
    if(j.still===null||typeof j.still==='boolean')CFG.still=j.still;
    const u=j.ui&&typeof j.ui==='object'?j.ui:{},D=UiPref.DEF;
    for(const k of Object.keys(D)){if(!(k in u))continue;const v=u[k];
     if(typeof v!==typeof D[k])continue;
     if(k==='accent'&&!UiPref.ACC.some(a=>a[0]===v))continue;
     if(k==='dock'&&!['s','m','l'].includes(v))continue;
     if(k==='clock'&&!['full','time','sec'].includes(v))continue;
     if(k==='tkSpeed'&&!['l','n','c'].includes(v))continue;
     if(k==='hello'&&!['full','fast','off'].includes(v))continue;
     CFG.ui[k]=v}
    cfgSave();if(OK_BG.includes(j.bg)){try{localStorage.setItem('bg',j.bg)}catch(e){}}
    say('Pengaturan diterapkan. Memuat ulang…','up');setTimeout(()=>location.reload(),700)}
   catch(e){say('Gagal impor: '+e.message,'dn')}};
 }});
})();
