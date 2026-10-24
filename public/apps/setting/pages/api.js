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
  <div class="sact"><button type="button" class="btn" data-rtt>Cek token</button><button type="button" class="btn" data-apireset>Kosongkan token</button><span class="tst" data-rtres role="status" aria-live="polite"></span></div>
  <p class="shint">Token disimpan di akunmu secara terenkripsi, jadi otomatis ikut saat kamu masuk dari perangkat mana pun.</p>
`,
 init:({q,qa})=>{
  const rtv=()=>CFG.api.rt||(CFG.api.rt={finnhub:'',tiingo:''});
  const o0=()=>q('[data-rtres]'),say=(m,c)=>{const o=o0();o.textContent=m;o.className='tst '+(c||'')};
  const saveSrv=async body=>{try{const r=await apiFetch('/api/settings/rt-tokens',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok){let m='';try{m=(await r.json()).message}catch(e){}throw new Error(m||'Gagal menyimpan')}say('Tersimpan','up')}catch(e){say(e.message||'Gagal menyimpan','dn')}};
  qa('[data-rt]').forEach(i=>{i.value=rtv()[i.dataset.rt]||'';i.oninput=()=>{rtv()[i.dataset.rt]=i.value.trim();clearTimeout(i._t);i._t=setTimeout(async()=>{await saveSrv({[i.dataset.rt]:rtv()[i.dataset.rt]});if(window.RT)RT.refresh()},700)}});
  q('[data-rtt]').onclick=async e=>{const b=e.currentTarget,o=q('[data-rtres]');if(!window.RT){o.textContent='Belum siap, coba lagi sebentar';return}
   b.disabled=true;o.textContent='Memeriksa…';o.className='tst';
   const NM={binance:'Binance',finnhub:'Finnhub',tiingo:'Tiingo',yahoo:'Yahoo',goapi:'Saham IDX',ohlcdev:'Saham IDX'};
   try{const g=await RT.probe(6000),k=Object.keys(g);o.textContent=k.length?k.map(x=>(NM[x]||x)+' '+g[x]+' tick').join(' · '):'Tidak ada data masuk (pasar tutup, token salah, atau sumber sedang sibuk)';o.className='tst '+(k.length?'up':'dn')}
   catch(x){o.textContent='Belum berhasil, coba lagi';o.className='tst dn'}b.disabled=false};
  q('[data-apireset]').onclick=async()=>{CFG.api.rt={finnhub:'',tiingo:''};qa('[data-rt]').forEach(i=>i.value='');try{await apiFetch('/api/settings/rt-tokens',{method:'DELETE'});say('Token dikosongkan','up')}catch(e){say('Gagal mengosongkan','dn')}if(window.RT)RT.refresh()};
 }});
})();
