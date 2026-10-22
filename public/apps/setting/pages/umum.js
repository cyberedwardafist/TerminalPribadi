// Setting > Umum: tema, simbol awal, timeframe awal; lalu layar sambutan, pemulihan tampilan, kurangi gerakan.
(()=>{
const{row,seg,bindSeg}=Setting;
const sw=(k,l)=>`<label class="sw"><input type="checkbox" data-u="${k}" aria-label="${l}"><i></i></label>`;
Setting.page({id:'umum',title:'Umum',color:'#8e8e93',icon:"<path d=\"M4 7h10M18 7h2M4 17h2M10 17h10\"/><circle cx=\"16\" cy=\"7\" r=\"2\"/><circle cx=\"8\" cy=\"17\" r=\"2\"/>",
 html:()=>`
  <div class="grp">
   ${row('Tema','Ikuti sistem, atau paksa gelap / terang',seg('theme',[['auto','Otomatis'],['dark','Gelap'],['light','Terang']]))}
   ${row('Simbol awal','Dibuka di Chart saat aplikasi dimulai',`<select class="in" data-k="sym" aria-label="Simbol awal">${WATCH.map(r=>`<option value="${r[0]}">${r[0]} · ${r[1]}</option>`).join('')}</select>`)}
   ${row('Timeframe awal','',seg('tf',['1m','5m','1h','1D'].map(t=>[t,t])))}
  </div>
  <div class="grp">
   ${row('Layar sambutan','Animasi TerminalPribadi saat aplikasi dibuka',seg('hello',[['full','Penuh'],['fast','Cepat'],['off','Mati']]))}
   ${row('Pulihkan tampilan terakhir','Buka lagi jendela dan isiannya seperti saat terakhir ditutup',sw('restore','Pulihkan tampilan terakhir'))}
   ${row('Kurangi gerakan','Mengurangi animasi background, dock, dan running text',seg('still',[['auto','Otomatis'],['yes','Ya'],['no','Tidak']]))}
  </div>
`,
 init:({q,qa})=>{
  bindSeg(qa,'theme',()=>CFG.theme,v=>{CFG.theme=v;applyTheme()});
  bindSeg(qa,'tf',()=>CFG.tf,v=>{CFG.tf=v});
  // tambahan: layar sambutan, pemulihan tampilan, kurangi gerakan (preferensi tampilan ada di UiPref; 'still' memakai CFG.still yang sudah ada)
  bindSeg(qa,'hello',()=>UiPref.get('hello'),v=>UiPref.set('hello',v));
  const rs=q('[data-u=restore]');rs.checked=UiPref.get('restore')!==false;rs.onchange=()=>UiPref.set('restore',rs.checked);
  bindSeg(qa,'still',()=>CFG.still===true?'yes':CFG.still===false?'no':'auto',v=>{CFG.still=v==='yes'?true:v==='no'?false:null;S.still=CFG.still===null?matchMedia('(prefers-reduced-motion: reduce)').matches:CFG.still});
  const sy=q('[data-k=sym]');sy.value=WATCH.some(r=>r[0]===CFG.sym)?CFG.sym:WATCH[0][0];sy.onchange=()=>{CFG.sym=sy.value;cfgSave()};
 }});
})();
