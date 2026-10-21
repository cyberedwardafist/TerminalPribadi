// Setting > API: mode Dummy/Live, Base URL, WebSocket, API key, timeout, tes koneksi. Helper request ada di shared/config.js.
(()=>{
const{row,seg,bindSeg}=Setting;
Setting.page({id:'api',title:'API',color:'#30b158',icon:"<rect x=\"3\" y=\"4\" width=\"18\" height=\"6\" rx=\"2\"/><rect x=\"3\" y=\"14\" width=\"18\" height=\"6\" rx=\"2\"/><path d=\"M7 7h.01M7 17h.01\"/>",
 html:()=>`
  <div class="grp">
   ${row('Sumber data','Dummy = tanpa server (data pasar tidak tersedia). Live = ambil dari backend',seg('mode',[['dummy','Dummy'],['live','Live']]))}
  </div>
  <div class="grp" data-live>
   ${row('Base URL','Alamat server REST, mis. <code>https://api.contoh.id</code>','<input class="in w" data-a="base" type="url" inputmode="url" placeholder="https://" autocomplete="off" spellcheck="false" aria-label="Base URL">')}
   ${row('WebSocket URL','Untuk harga dan candle realtime','<input class="in w" data-a="ws" type="url" inputmode="url" placeholder="wss://" autocomplete="off" spellcheck="false" aria-label="WebSocket URL">')}
   ${row('API key','Dikirim sebagai <code>Authorization: Bearer</code>','<input class="in w k" data-a="key" type="password" autocomplete="off" spellcheck="false" aria-label="API key"><button type="button" class="nb" data-show aria-pressed="false">Tampilkan</button>')}
   ${row('Timeout','Milidetik sebelum request dibatalkan','<input class="in n" data-a="timeout" type="number" min="1000" max="60000" step="500" aria-label="Timeout (ms)">')}
  </div>
  <div class="grp" data-live>
   ${row('Realtime: Binance','Kripto, WebSocket publik, tanpa kunci','<span class="tst" data-rts="binance">aktif otomatis</span>')}
   ${row('Realtime: Finnhub','Token WebSocket forex, komoditas, saham AS (<code>finnhub.io</code>)','<input class="in w k" data-rt="finnhub" type="password" autocomplete="off" spellcheck="false" aria-label="Token Finnhub">')}
   ${row('Realtime: Tiingo','Token WebSocket forex, emas, saham AS (<code>tiingo.com</code>)','<input class="in w k" data-rt="tiingo" type="password" autocomplete="off" spellcheck="false" aria-label="Token Tiingo">')}
   ${row('Realtime: GoAPI + OHLC.dev','Saham IDX lewat server. Kunci diisi di env server (<code>GOAPI_API_KEY</code>, <code>OHLCDEV_API_KEY</code>)','<span class="tst" data-rts="rest">diatur di server</span>')}
  </div>
  <div class="sact"><button type="button" class="btn" data-rtt>Tes realtime (6 dtk)</button><span class="tst" data-rtres role="status" aria-live="polite"></span></div>
  <p class="shint">Semua sumber berjalan paralel; chart memakai yang tercepat dan pindah otomatis bila sumber utama macet. Token Finnhub/Tiingo hanya disimpan di browser ini dan dipakai langsung dari browser ke penyedia (tidak lewat server aplikasi).</p>
  <div class="sact"><button type="button" class="btn" data-test>Tes koneksi</button><button type="button" class="btn" data-apireset>Kosongkan</button><span class="tst" role="status" aria-live="polite"></span></div>
  <p class="shint">Tersimpan otomatis di browser ini (localStorage). Untuk produksi, jangan taruh key rahasia di klien: simpan di server dan beri klien token sesi.</p>
`,
 init:({q,qa})=>{
  const live=()=>{const on=CFG.api.mode==='live';q('[data-live]').classList.toggle('off',!on);qa('[data-live] input,[data-test]').forEach(i=>i.disabled=!on)};
  bindSeg(qa,'mode',()=>CFG.api.mode,v=>{CFG.api.mode=v;live()});
  const tst=q('.tst'),say=(m,c)=>{tst.textContent=m;tst.className='tst '+(c||'')};
  const ok={base:v=>!v||/^https?:\/\/[^\s/]+/i.test(v),ws:v=>!v||/^wss?:\/\/[^\s/]+/i.test(v)};
  const fill=()=>qa('[data-a]').forEach(i=>i.value=CFG.api[i.dataset.a]);
  fill();live();
  qa('[data-a]').forEach(i=>i.oninput=()=>{const k=i.dataset.a;let v=k==='timeout'?Math.max(1000,Math.min(60000,+i.value||8000)):i.value.trim();const bad=ok[k]&&!ok[k](v);i.setAttribute('aria-invalid',bad);if(!bad){CFG.api[k]=v;cfgSave()}say(bad?'Format alamat belum benar':'',bad?'dn':'')});
  const sh=q('[data-show]');sh.onclick=()=>{const k=q('[data-a=key]'),on=k.type==='password';k.type=on?'text':'password';sh.textContent=on?'Sembunyikan':'Tampilkan';sh.setAttribute('aria-pressed',on)};
  q('[data-test]').onclick=async e=>{const b=e.currentTarget;b.disabled=true;say('Menguji…');try{const ms=await apiPing();say('Terhubung · '+ms+' ms','up')}catch(x){say(x.message,'dn')}b.disabled=false};
  const rtv=()=>CFG.api.rt||(CFG.api.rt={finnhub:'',tiingo:''});
  qa('[data-rt]').forEach(i=>{i.value=rtv()[i.dataset.rt]||'';i.oninput=()=>{rtv()[i.dataset.rt]=i.value.trim();cfgSave();clearTimeout(i._t);i._t=setTimeout(()=>window.RT&&RT.refresh(),600)}});
  q('[data-rtt]').onclick=async e=>{const b=e.currentTarget,o=q('[data-rtres]');if(!window.RT){o.textContent='Mesin realtime belum dimuat';return}
   b.disabled=true;o.textContent='Mendengarkan sumber…';o.className='tst';
   const NM={binance:'Binance',finnhub:'Finnhub',tiingo:'Tiingo',yahoo:'Yahoo',goapi:'GoAPI',ohlcdev:'OHLC.dev'};
   try{const g=await RT.probe(6000),k=Object.keys(g);o.textContent=k.length?k.map(x=>(NM[x]||x)+' '+g[x]+' tick').join(' · '):'Tidak ada tick (pasar tutup, token salah, atau sumber tidak terjangkau)';o.className='tst '+(k.length?'up':'dn')}
   catch(x){o.textContent=x.message;o.className='tst dn'}b.disabled=false};
  q('[data-apireset]').onclick=()=>{CFG.api={...CFG_DEF.api,mode:CFG.api.mode,rt:{finnhub:'',tiingo:''}};cfgSave();fill();qa('[data-rt]').forEach(i=>i.value='');if(window.RT)RT.refresh();say('Alamat dan key dikosongkan')};
 }});
})();
