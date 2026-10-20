// Setting > Umum: tema, simbol awal, timeframe awal.
(()=>{
const{row,seg,bindSeg}=Setting;
Setting.page({id:'umum',title:'Umum',color:'#8e8e93',icon:"<path d=\"M4 7h10M18 7h2M4 17h2M10 17h10\"/><circle cx=\"16\" cy=\"7\" r=\"2\"/><circle cx=\"8\" cy=\"17\" r=\"2\"/>",
 html:()=>`
  <div class="grp">
   ${row('Tema','Ikuti sistem, atau paksa gelap / terang',seg('theme',[['auto','Otomatis'],['dark','Gelap'],['light','Terang']]))}
   ${row('Simbol awal','Dibuka di Chart saat aplikasi dimulai',`<select class="in" data-k="sym" aria-label="Simbol awal">${WATCH.map(r=>`<option value="${r[0]}">${r[0]} · ${r[1]}</option>`).join('')}</select>`)}
   ${row('Timeframe awal','',seg('tf',['1m','5m','1h','1D'].map(t=>[t,t])))}
  </div>
`,
 init:({q,qa})=>{
  bindSeg(qa,'theme',()=>CFG.theme,v=>{CFG.theme=v;applyTheme()});
  bindSeg(qa,'tf',()=>CFG.tf,v=>{CFG.tf=v});
  const sy=q('[data-k=sym]');sy.value=WATCH.some(r=>r[0]===CFG.sym)?CFG.sym:WATCH[0][0];sy.onchange=()=>{CFG.sym=sy.value;cfgSave()};
 },
 notes:['Tersambung: <code>GET/PUT /api/settings/preferences</code> <code>{theme, defaultSymbol, defaultTf, background, reduceMotion}</code>. Tersimpan di localStorage (<code>tc.cfg</code>, <code>bg</code>) dan disalin ke server (ditunda 1,5 dtk); saat masuk di perangkat lain, nilai server dipakai. Blok <code>api</code> (alamat, key) tidak pernah dikirim.']});
})();
