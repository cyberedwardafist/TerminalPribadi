// Setting > API: token realtime milik pengguna sendiri (Finnhub, Tiingo). Pengaturan teknis server sengaja tidak ditampilkan.
(()=>{
const{row}=Setting;
Setting.page({id:'api',title:'API',color:'#30b158',icon:"<rect x=\"3\" y=\"4\" width=\"18\" height=\"6\" rx=\"2\"/><rect x=\"3\" y=\"14\" width=\"18\" height=\"6\" rx=\"2\"/><path d=\"M7 7h.01M7 17h.01\"/>",
 html:()=>`
  <div class="grp">
   ${row('Kripto','Harga realtime dari Binance, tanpa kunci','<span class="tst" data-rts="binance">aktif otomatis</span>')}
   ${row('Finnhub','Token realtime forex, komoditas, saham AS (<code>finnhub.io</code>)','<input class="in w k" data-rt="finnhub" type="password" autocomplete="off" spellcheck="false" aria-label="Token Finnhub">')}
   ${row('Tiingo','Token realtime forex, emas, saham AS (<code>tiingo.com</code>)','<input class="in w k" data-rt="tiingo" type="password" autocomplete="off" spellcheck="false" aria-label="Token Tiingo">')}
  </div>
  <div class="sact"><button type="button" class="btn" data-rtt>Tes realtime (6 dtk)</button><button type="button" class="btn" data-apireset>Kosongkan token</button><span class="tst" data-rtres role="status" aria-live="polite"></span></div>
  <p class="shint">Token hanya tersimpan di browser ini. Di komputer bersama, kosongkan token sebelum keluar.</p>
`,
 init:({q,qa})=>{
  const rtv=()=>CFG.api.rt||(CFG.api.rt={finnhub:'',tiingo:''});
  qa('[data-rt]').forEach(i=>{i.value=rtv()[i.dataset.rt]||'';i.oninput=()=>{rtv()[i.dataset.rt]=i.value.trim();cfgSave();clearTimeout(i._t);i._t=setTimeout(()=>window.RT&&RT.refresh(),600)}});
  q('[data-rtt]').onclick=async e=>{const b=e.currentTarget,o=q('[data-rtres]');if(!window.RT){o.textContent='Fitur realtime belum siap';return}
   b.disabled=true;o.textContent='Mendengarkan sumber…';o.className='tst';
   const NM={binance:'Binance',finnhub:'Finnhub',tiingo:'Tiingo',yahoo:'Yahoo',goapi:'Saham IDX',ohlcdev:'Saham IDX'};
   try{const g=await RT.probe(6000),k=Object.keys(g);o.textContent=k.length?k.map(x=>(NM[x]||x)+' '+g[x]+' tick').join(' · '):'Tidak ada data masuk (pasar tutup, token salah, atau sumber sedang sibuk)';o.className='tst '+(k.length?'up':'dn')}
   catch(x){o.textContent='Tes belum berhasil, coba lagi';o.className='tst dn'}b.disabled=false};
  q('[data-apireset]').onclick=()=>{CFG.api={...CFG.api,key:'',rt:{finnhub:'',tiingo:''}};cfgSave();qa('[data-rt]').forEach(i=>i.value='');if(window.RT)RT.refresh();const o=q('[data-rtres]');o.className='tst';o.textContent='Token dikosongkan'};
 }});
})();
