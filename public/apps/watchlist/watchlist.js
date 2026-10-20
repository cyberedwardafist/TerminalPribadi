// App "watchlist" (dock). Tab daftar ala Chart + panel samping (jelajah pasar, pemindai) + pencarian. Berdiri sendiri.
(()=>{
const KEY='tc.watchlist',MK=[['all','Semua pasar'],['idx','IHSG'],['cry','Kripto'],['com','Komoditas'],['fx','Forex'],['us','Saham luar'],['ind','Indeks']];
const SCR=[['up','Top naik','Kenaikan harian terbesar'],['dn','Top turun','Penurunan harian terbesar'],['vol','Volume ramai','Aktivitas jauh di atas rata-rata'],['hi','Dekat high 52M','Mendekati puncak setahun'],['os','RSI jenuh jual','RSI di bawah 35, calon pantulan'],['ob','RSI jenuh beli','RSI di atas 70, rawan koreksi'],['mo','Momentum sehat','Naik dengan RSI 55\u201370']];
const rng=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const hs=s=>[...s].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7),cl=(v,a,b)=>Math.max(a,Math.min(b,v)),esc=s=>String(s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';'),day=Math.floor(Date.now()/864e5);
// ---------- data pasar (dummy, berbenih per hari; bergerak acak saat tick) ----------
const X={};
WATCH.forEach(([s,n,p,c,m])=>{const g=rng(hs(s+day)),op=p/(1+c/100);let a=0;const w=[...Array(30)].map(()=>a+=g()-.5);
 X[s]={s,n,m,p,c,op,ser:w.map((v,i)=>op+(p-op)*i/29+(v-(w[0]+(w[29]-w[0])*i/29))*p*.012),vr:+(.5+g()*2.3).toFixed(1),rsi:cl(50+c*6+(g()-.5)*34,12,88),pos:cl(.5+c*.035+(g()-.5)*.7,.02,.99),f:0}});
const ALL=Object.values(X);
// Mode Live: harga/ubah% dari WATCH (diisi shared/live.js dari /api/quotes), sparkline/RSI/volume/posisi 52 minggu dari server
function applyLive(){for(const r of WATCH){const x=X[r[0]],e=Live.extra[r[0]];if(!x)continue;const p0=x.p;x.p=r[2];x.c=r[3];x.op=x.p/(1+x.c/100);x.f=x.p>p0?1:x.p<p0?-1:0;
 if(e){if(e.vr!=null)x.vr=e.vr;if(e.rsi!=null)x.rsi=e.rsi;if(e.pos!=null)x.pos=e.pos;if(e.spark&&e.spark.length>1){const sp=e.spark.slice(-30);while(sp.length<30)sp.unshift(sp[0]);x.ser=sp}}}}
if(window.Live&&Live.on)applyLive();
// ---------- state tersimpan ----------
let W={lists:[{id:1,name:'Favorit',syms:['BTCUSDT','ETHUSDT','XAUUSD','EURUSD','BBCA','TLKM']},{id:2,name:'Kripto',syms:['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT']},{id:3,name:'Saham IHSG',syms:['BBCA','BBRI','BMRI','TLKM','ASII','AMMN']}],act:1,uid:3,sort:null,side:true,al:{}};
try{const j=JSON.parse(localStorage.getItem(KEY)||'null');if(j&&Array.isArray(j.lists)&&j.lists.length)W={...W,...j}}catch(e){}
W.lists.forEach(l=>l.syms=l.syms.filter(s=>X[s]));if(!W.lists.some(l=>l.id===W.act))W.act=W.lists[0].id;
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(W))}catch(e){}},L=()=>W.lists.find(l=>l.id===W.act);
let V={t:'list'},Q='',SEL=null,TS=0;
const sig=x=>x.rsi>70?['Jenuh beli','w']:x.rsi<30?['Jenuh jual','w']:x.c>1&&x.rsi>=55?['Momentum','up']:x.c<-1&&x.rsi<=45?['Melemah','dn']:['Netral',''];
const spark=x=>{const a=x.ser,mn=Math.min(...a),d=Math.max(...a)-mn||1;return`<svg class="wl-sp ${cls(x.c)}" viewBox="0 0 64 20" aria-hidden="true"><polyline points="${a.map((v,i)=>(i*64/29).toFixed(1)+','+(18-(v-mn)/d*16).toFixed(1)).join(' ')}"/></svg>`};
const SCF={up:x=>x.c>0,dn:x=>x.c<0,vol:x=>x.vr>=1.5,hi:x=>x.pos>=.85,os:x=>x.rsi<35,ob:x=>x.rsi>70,mo:x=>x.c>0&&x.rsi>=55&&x.rsi<=70},SCO={up:x=>-x.c,dn:x=>x.c,vol:x=>-x.vr,hi:x=>-x.pos,os:x=>x.rsi,ob:x=>-x.rsi,mo:x=>-x.c};
function rows(){const q=Q.trim().toUpperCase(),mt=x=>!q||x.s.includes(q)||x.n.toUpperCase().includes(q);let r,ex=[];
 if(V.t==='list'){const ss=L().syms;r=ss.map(s=>X[s]).filter(mt);if(q)ex=ALL.filter(x=>!ss.includes(x.s)&&mt(x)).slice(0,12)}
 else if(V.t==='mk')r=ALL.filter(x=>(V.k==='all'||x.m===V.k)&&mt(x));
 else r=ALL.filter(SCF[V.k]).filter(mt).sort((a,b)=>SCO[V.k](a)-SCO[V.k](b));
 if(W.sort){const k=W.sort.k,d=W.sort.d;r=[...r].sort((a,b)=>(a[k]>b[k]?1:a[k]<b[k]?-1:0)*d)}
 return{r,ex}}
const row=x=>{const on=L().syms.includes(x.s),al=W.al[x.s],sg=sig(x);
 return`<tr data-s="${x.s}" tabindex="0" class="${SEL===x.s?'sel':''}"><td class="wl-st"><button data-a="tg" aria-pressed="${on}" aria-label="${on?'Hapus dari':'Tambah ke'} daftar ${esc(L().name)}">${on?'\u2605':'\u2606'}</button></td><td><b>${x.s}</b>${al?`<em title="Alert di ${f(al.t)}"> \u23f0</em>`:''}<small>${x.n}</small></td><td class="n">${f(x.p)}</td><td class="n ${cls(x.c)}">${pc(x.c)}</td><td class="h1">${spark(x)}</td><td class="h2"><span class="wl-rg" title="Posisi di rentang 52 minggu"><i style="left:${(x.pos*100).toFixed(0)}%"></i></span></td><td class="n h2">${x.vr.toFixed(1)}x</td><td class="n h2">${Math.round(x.rsi)}</td><td class="h1"><span class="wl-b ${sg[1]}">${sg[0]}</span></td></tr>`};
const COLS=[['','',0],['s','Simbol',0],['p','Harga','n'],['c','Ubah','n'],['','Grafik','h1'],['pos','52 minggu','h2'],['vr','Volume','n h2'],['rsi','RSI','n h2'],['','Sinyal','h1']];
const ti=()=>V.t==='list'?L().name:V.t==='mk'?'Pasar: '+MK.find(m=>m[0]===V.k)[1]:SCR.find(s=>s[0]===V.k)[1]+' \u00b7 '+SCR.find(s=>s[0]===V.k)[2];
registerApp('watchlist',{css:'apps/watchlist/watchlist.css',icon:"<path d=\"M9 6h11M9 12h11M9 18h11\"/><circle cx=\"4.5\" cy=\"6\" r=\"1.2\"/><circle cx=\"4.5\" cy=\"12\" r=\"1.2\"/><circle cx=\"4.5\" cy=\"18\" r=\"1.2\"/>",t:'Watchlist',w:900,h:540,flush:1,
 html:()=>`<div class="wl"><aside class="wl-sd" aria-label="Jelajah pasar dan pemindai"><h5>Jelajah pasar</h5>${MK.map(m=>`<button data-v="mk:${m[0]}">${m[1]}<em>${m[0]==='all'?ALL.length:ALL.filter(x=>x.m===m[0]).length}</em></button>`).join('')}<h5>Pemindai</h5>${SCR.map(s=>`<button data-v="scr:${s[0]}" title="${s[2]}">${s[1]}</button>`).join('')}<p class="wl-ft">Data dummy yang bergerak acak. Bintang menambah atau menghapus simbol di daftar aktif.</p></aside><section class="wl-mn"><div class="wl-top"><button class="wl-rb" data-a="sd" aria-label="Panel samping"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14"/></svg></button><div class="wl-tl"></div><button class="wl-rb" data-a="new" aria-label="Daftar baru"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button></div><div class="wl-bar"><input class="wl-in wl-q" type="search" placeholder="Cari simbol atau nama\u2026" aria-label="Cari simbol atau nama"><span class="wl-sum" aria-live="polite"></span></div><div class="wl-tb"></div><div class="wl-dt"></div></section><div class="wl-ts" hidden></div></div>`,
 init(w){const q=s=>$(s,w),root=q('.wl'),tl=q('.wl-tl'),tb=q('.wl-tb'),dt=q('.wl-dt'),ts=q('.wl-ts'),sd=q('.wl-sd');
  root.classList.toggle('nosd',!W.side||w.clientWidth<560);
  const toast=m=>{ts.textContent=m;ts.hidden=false;clearTimeout(TS);TS=setTimeout(()=>ts.hidden=true,5000)};
  function sum(){const{r}=rows(),u=r.filter(x=>x.c>=0).length,av=r.length?r.reduce((a,x)=>a+x.c,0)/r.length:0,b=r.length?r.reduce((a,x)=>x.c>a.c?x:a):null;
   q('.wl-sum').innerHTML=`<b>${esc(ti())}</b> \u00b7 ${r.length} simbol \u00b7 <span class="up">${u} naik</span> \u00b7 <span class="dn">${r.length-u} turun</span> \u00b7 rata-rata <span class="${cls(av)}">${pc(av)}</span>${b?` \u00b7 terbaik ${b.s} <span class="up">${pc(b.c)}</span>`:''}`}
  function detail(){const x=SEL&&X[SEL];dt.classList.toggle('on',!!x);if(!x){dt.innerHTML='';return}const al=W.al[x.s],hi=Math.max(...x.ser),lo=Math.min(...x.ser);
   dt.innerHTML=`<b>${x.s}</b><span>${x.n}</span><span>Buka ${f(x.op)} \u00b7 Tinggi ${f(hi)} \u00b7 Rendah ${f(lo)}</span><i class="sp"></i>${al?`<span>Alert ${f(al.t)}</span><button class="btn" data-a="alx">Hapus alert</button>`:`<input class="wl-in" data-i="al" inputmode="decimal" placeholder="Alert harga" aria-label="Harga alert"><button class="btn" data-a="al">Pasang</button>`}<select class="wl-in" data-i="cp" aria-label="Salin ke daftar"><option value="">Salin ke daftar\u2026</option>${W.lists.filter(l=>!l.syms.includes(x.s)).map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select><button class="btn pri" data-a="ch">Buka Chart</button>`}
  function paint(){
   tl.innerHTML=W.lists.map(l=>`<div class="wl-tab${V.t==='list'&&l.id===W.act?' on':''}" data-id="${l.id}" title="Klik dua kali untuk ganti nama"><span>${esc(l.name)}</span><small>${l.syms.length}</small>${W.lists.length>1?'<button class="wl-x" aria-label="Hapus daftar">\u00d7</button>':''}</div>`).join('');
   $$('.wl-sd button',w).forEach(b=>b.classList.toggle('on',V.t!=='list'&&b.dataset.v===V.t+':'+V.k));
   const{r,ex}=rows(),sk=W.sort&&W.sort.k;
   tb.innerHTML=`<table><thead><tr>${COLS.map(c=>`<th class="${c[2]||''}${c[0]&&c[0]===sk?' on':''}"${c[0]===sk?` aria-sort="${W.sort.d>0?'ascending':'descending'}"`:''}>${c[0]?`<button data-k="${c[0]}">${c[1]}${c[0]===sk?(W.sort.d>0?' \u25b2':' \u25bc'):''}</button>`:c[1]}</th>`).join('')}</tr></thead><tbody>${r.map(row).join('')}${ex.length?`<tr class="wl-xh"><td colspan="9">Hasil dari semua pasar</td></tr>${ex.map(row).join('')}`:''}${r.length||ex.length?'':`<tr><td colspan="9" class="wl-em">${V.t==='list'&&!Q?'Daftar masih kosong. Cari simbol di atas atau jelajahi pasar di panel samping.':'Tidak ada simbol yang cocok.'}</td></tr>`}</tbody></table>`;
   sum();detail()}
  function tick(){let hit=0;if(window.Live&&Live.on)applyLive();else ALL.forEach(x=>{x.f=0;if(Math.random()>.4)return;const k=(x.m==='cry'?.0022:x.m==='fx'?.0004:.0012),p0=x.p;x.p*=1+(Math.random()-.5)*2*k;x.c=(x.p/x.op-1)*100;x.f=x.p>p0?1:-1;x.ser.push(x.p);x.ser.shift();x.rsi=cl(x.rsi+(x.f)*Math.random()*.7,8,92);x.pos=cl(x.pos+x.f*.002,.01,1)});
   for(const s in W.al){const a=W.al[s],x=X[s];if(a.d>0?x.p>=a.t:x.p<=a.t){delete W.al[s];hit=1;toast('\u23f0 '+s+' menyentuh '+f(a.t))}}
   if(hit){save();paint();return}
   $$('tbody tr[data-s]',w).forEach(tr=>{const x=X[tr.dataset.s],c=tr.children;c[2].textContent=f(x.p);c[3].textContent=pc(x.c);c[3].className='n '+cls(x.c);c[4].innerHTML=spark(x);c[5].firstChild.firstChild.style.left=(x.pos*100).toFixed(0)+'%';c[6].textContent=x.vr.toFixed(1)+'x';c[7].textContent=Math.round(x.rsi);tr.classList.remove('flu','fld');if(x.f&&!S.still){void tr.offsetWidth;tr.classList.add(x.f>0?'flu':'fld')}});sum()}
  const toggle=s=>{const l=L(),i=l.syms.indexOf(s);i<0?l.syms.push(s):l.syms.splice(i,1);save();paint()};
  const go=s=>{S.sym=s;S.go=s;open('chart')};
  // ----- event -----
  q('.wl-q').oninput=e=>{Q=e.target.value;paint()};
  q('.wl-q').onkeydown=e=>{if(e.key==='Escape'&&Q){Q='';e.target.value='';paint();e.stopPropagation()}};
  w.addEventListener('click',e=>{const b=e.target.closest('button,.wl-tab,tr[data-s]');if(!b)return;
   if(b.dataset.a==='sd'){const on=root.classList.toggle('nosd');W.side=!on;save();return}
   if(b.dataset.a==='new'){dlg.prompt('Daftar baru','Nama daftar','Daftar '+(W.uid+1)).then(v=>{const n=(v||'').trim();if(n){W.lists.push({id:++W.uid,name:n.slice(0,24),syms:[]});W.act=W.uid;V={t:'list'};save();paint()}});return}
   if(b.dataset.v){const[t,k]=b.dataset.v.split(':');V={t,k};if(t==='scr')W.sort=null;if(innerWidth<700||root.clientWidth<560)root.classList.add('nosd');paint();return}
   if(b.dataset.k){const k=b.dataset.k,s=W.sort,d0=k==='s'?1:-1;W.sort=!s||s.k!==k?{k,d:d0}:s.d===d0?{k,d:-d0}:null;save();paint();return}
   if(b.classList.contains('wl-x')){const id=+b.closest('.wl-tab').dataset.id,l=W.lists.find(l=>l.id===id);const del=()=>{W.lists=W.lists.filter(l=>l.id!==id);if(W.act===id)W.act=W.lists[0].id;save();paint()};l.syms.length?dlg.confirm('Hapus daftar "'+l.name+'"?','Daftar ini berisi '+l.syms.length+' simbol dan akan ikut terhapus.',{ok:'Hapus',danger:1}).then(ok=>ok&&del()):del();return}
   if(b.classList.contains('wl-tab')){W.act=+b.dataset.id;V={t:'list'};save();paint();return}
   if(b.dataset.a==='tg'){toggle(b.closest('tr').dataset.s);return}
   if(b.dataset.a==='ch'){go(SEL);return}
   if(b.dataset.a==='alx'){delete W.al[SEL];save();paint();return}
   if(b.dataset.a==='al'){const v=parseFloat(dt.querySelector('[data-i=al]').value.replace(',','.')),x=X[SEL];if(!(v>0)||v===x.p){toast('Isi harga alert yang valid');return}W.al[SEL]={t:v,d:v>x.p?1:-1};save();paint();toast('Alert '+SEL+' dipasang di '+f(v));return}
   if(b.tagName==='TR'){SEL=b.dataset.s;$$('tbody tr',w).forEach(t=>t.classList.toggle('sel',t===b));detail()}});
  w.addEventListener('dblclick',e=>{const t=e.target.closest('.wl-tab'),r=e.target.closest('tr[data-s]');
   if(t&&!e.target.closest('button')){const l=W.lists.find(l=>l.id===+t.dataset.id);dlg.prompt('Ganti nama daftar','Nama daftar',l.name).then(v=>{const n=(v||'').trim();if(n){l.name=n.slice(0,24);save();paint()}})}
   else if(r&&!e.target.closest('button'))go(r.dataset.s)});
  w.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('tr[data-s]'))go(e.target.dataset.s)});
  w.addEventListener('change',e=>{if(e.target.dataset.i==='cp'&&e.target.value){const l=W.lists.find(l=>l.id===+e.target.value);if(l&&!l.syms.includes(SEL))l.syms.push(SEL);save();paint();toast(SEL+' disalin ke '+l.name)}});
  const iv=setInterval(()=>{if(!w.isConnected){clearInterval(iv);return}tick()},S.still?3000:1500);
  paint()},
 notes:['<code>GET /api/watchlists</code> : daftar kelompok milik user <code>[{id,name,symbols[]}]</code>. Sekarang disimpan di localStorage <code>tc.watchlist</code> (tab, isi daftar, urutan, alert, status panel)','<code>POST /api/watchlists</code>, <code>PATCH /api/watchlists/:id</code> (ganti nama), <code>DELETE /api/watchlists/:id</code>, <code>PUT /api/watchlists/:id/symbols</code> : kelola kelompok dan isinya','<code>GET /api/quotes?symbols=A,B</code> : <code>[{sym,name,market,price,changePct,volRatio,rsi14,pos52w,spark[]}]</code>. Harga live: WebSocket channel <code>quotes</code>, subscribe per simbol yang tampil','<code>GET /api/screener?type=up|dn|vol|hi|os|ob|mo</code> : hasil pemindai. Saat ini disaring di klien dari data dummy (RSI, rasio volume, posisi 52 minggu dihitung acak berbenih)','<code>POST /api/alerts {symbol,price}</code> dan <code>DELETE /api/alerts/:symbol</code> : alert harga. Server yang seharusnya memicu (push), klien hanya menampilkan','Klik dua kali baris membuka Chart lewat <code>S.go</code>. Daftar simbol pencarian berasal dari <code>WATCH</code> di <code>shared/data.js</code>']});
})();
