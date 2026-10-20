// App "home" (dock). Dashboard: sapaan, status pasar, indeks utama, watchlist, pintasan, aktivitas. Berdiri sendiri.
// Membaca (hanya baca) localStorage app lain secara toleran: tc.watchlist, tc.chart.tabs, tc.notes, tc.journal. Rusak/kosong = bagian itu menampilkan empty state.
(()=>{
const esc=s=>String(s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';'),rd=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}};
const X=s=>WATCH.find(r=>r[0]===s),IDX=['IHSG','SPX','BTCUSDT','XAUUSD','USDIDR','EURUSD'];
const SC=[['chart','Chart','<path d="M7 3v18M17 5v15"/><rect x="4.5" y="8" width="5" height="7" rx="1"/><rect x="14.5" y="9" width="5" height="6" rx="1"/>'],['watchlist','Watchlist','<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>'],['maps','Peta pasar','<rect x="3" y="4" width="10" height="9" rx="1"/><rect x="15" y="4" width="6" height="5" rx="1"/><rect x="15" y="11" width="6" height="9" rx="1"/><rect x="3" y="15" width="10" height="5" rx="1"/>'],['news','News','<path d="M4 5h13v14H6a2 2 0 01-2-2z"/><path d="M17 9h3v8a2 2 0 01-2 2"/><path d="M7.5 9h6M7.5 12.5h6M7.5 15.5h3"/>'],['kalender','Kalender','<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],['note','Note','<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>'],['setting','Setting','<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>']];
// status pasar menurut WIB: IHSG Sen-Jum 09:00-15:49, forex Sen-Jum, kripto 24 jam
function wib(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()).map(x=>[x.type,x.value])),m=(+p.hour%24)*60+ +p.minute;return{wd:p.weekday,m,wk:!['Sat','Sun'].includes(p.weekday)}}
const pill=(t,on)=>`<span class="hm-pl${on?' on':''}"><i></i>${t}: ${on?'buka':'tutup'}</span>`;
function status(){const t=wib(),idx=t.wk&&t.m>=540&&t.m<=949;return pill('Bursa IHSG',idx)+pill('Forex',t.wk)+pill('Kripto',true)}
const greet=()=>{const h=+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',hour12:false}).format(new Date())%24;return h<4?'Selamat malam':h<11?'Selamat pagi':h<15?'Selamat siang':h<18?'Selamat sore':'Selamat malam'};
const nm=()=>{try{const u=Auth.mine();return u&&u.name?u.name.split(' ')[0]:''}catch(e){return''}};
const card=s=>{const r=X(s);return r?`<button class="hm-c" data-s="${s}"><b>${s}</b><span>${f(r[2])}</span><small class="${cls(r[3])}">${pc(r[3])}</small></button>`:''};
const row=r=>`<button class="hm-r" data-s="${r[0]}"><b>${r[0]}</b><span>${r[1]}</span><em class="${cls(r[3])}">${pc(r[3])}</em></button>`;
const plain=h=>String(h).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
// Riwayat aksi dari server (hanya mode Live). Di-cache 15 dtk supaya membuka ulang window tidak menembak API terus.
const ACT={auth:'Akun',note:'Catatan',journal:'Jurnal',watchlist:'Watchlist',alert:'Alert'};
const ago=t=>{const s=Math.max(0,(Date.now()-t)/1000);return s<60?'baru saja':s<3600?Math.floor(s/60)+' mnt lalu':s<86400?Math.floor(s/3600)+' jam lalu':new Date(t).toLocaleDateString('id-ID',{day:'numeric',month:'short',timeZone:'Asia/Jakarta'})};
let actAt=0,actRows=null;
function paintAct(w,rows){const b=$('.hm-ac',w);if(!b)return;b.hidden=false;
 b.innerHTML='<h3>Aktivitas terbaru</h3>'+(rows.length?rows.map(r=>`<div class="hm-ar"><em>${esc(ACT[r.type]||r.type)}</em><span>${esc(r.summary)}</span><small>${ago(r.ts)}</small></div>`).join(''):'<div class="hm-em">Belum ada aktivitas.</div>')}
async function acts(w){
 if(!(window.Live&&Live.on))return;
 if(actRows&&Date.now()-actAt<15000)return paintAct(w,actRows);
 try{const r=await apiFetch('/api/activity?limit=10');if(!r.ok)throw 0;actRows=await r.json();actAt=Date.now();if(w.isConnected)paintAct(w,actRows)}
 catch(e){if(actRows&&w.isConnected)paintAct(w,actRows)}}
function fill(w){const q=s=>$(s,w),wl=rd('tc.watchlist'),L=wl&&Array.isArray(wl.lists)&&wl.lists.find(l=>l.id===wl.act)||wl&&wl.lists&&wl.lists[0],
  fav=(L?L.syms.map(X).filter(Boolean):WATCH.slice(0,6)).slice(0,6),srt=[...WATCH].sort((a,b)=>b[3]-a[3]),
  tabs=(rd('tc.chart.tabs')||{}).tabs||[],syms=[...new Set(tabs.map(t=>t.sym).filter(Boolean))].slice(0,8),
  nt=rd('tc.notes'),notes=(nt&&Array.isArray(nt.notes)?nt.notes:[]).sort((a,b)=>(b.upd||0)-(a.upd||0)).slice(0,3),
  jr=rd('tc.journal'),tr=jr&&Array.isArray(jr.trades)?jr.trades:[],wins=tr.filter(t=>t.res==='profit').length,dn=tr.filter(t=>t.res==='profit'||t.res==='loss').length,
  op=Object.keys(S.wins).filter(k=>!S.wins[k].min).map(k=>APPS[base(k)].t);
 q('.hm-gr').textContent=greet()+(nm()?', '+nm():'');
 q('.hm-dt').textContent=new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'});
 q('.hm-st').innerHTML=status();
 q('.hm-ix').innerHTML=IDX.map(card).join('');
 q('.hm-fv').innerHTML=(L?`<h3>Watchlist \u00b7 ${esc(L.name)}</h3>`:'<h3>Watchlist</h3>')+(fav.length?fav.map(row).join(''):'<div class="hm-em">Daftar masih kosong.</div>');
 q('.hm-mv').innerHTML=`<h3>Pergerakan terbesar</h3>${srt.slice(0,3).map(row).join('')}<div style="height:6px"></div>${srt.slice(-3).reverse().map(row).join('')}`;
 q('.hm-rc').innerHTML=`<h3>Terakhir dibuka di Chart</h3>${syms.length?`<div class="hm-tg">${syms.map(s=>`<button class="btn" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>`:'<div class="hm-em">Belum ada tab chart.</div>'}<h3 style="margin-top:14px">Jendela terbuka</h3>${op.length?`<div class="hm-tg">${op.map(t=>`<span class="hm-pl on"><i></i>${esc(t)}</span>`).join('')}</div>`:'<div class="hm-em">Tidak ada.</div>'}`;
 q('.hm-nt').innerHTML=`<h3>Catatan terbaru</h3>${notes.length?notes.map(n=>`<button class="hm-r" data-go="note"><span style="color:var(--ink)">${esc(plain(n.html).slice(0,60)||'(tanpa judul)')}</span></button>`).join(''):'<div class="hm-em">Belum ada catatan.</div>'}<h3 style="margin:14px 0 8px">Jurnal trading</h3>${tr.length?`<div class="hm-kv"><div><small>Total transaksi</small><b>${tr.length}</b></div><div><small>Win rate</small><b>${dn?Math.round(wins/dn*100)+'%':'\u2013'}</b></div></div>`:'<div class="hm-em">Belum ada transaksi.</div>'}`;
 $$('[data-go]',q('.hm')).forEach(b=>b.onclick=()=>open(b.dataset.go));
 const tg=q('.tag');if(tg)tg.textContent=window.Live&&Live.on?'Live':'Data dummy';
 acts(w)}
registerApp('home',{css:'apps/home/home.css',icon:"<path d=\"M4 11l8-7 8 7v9h-5v-6H9v6H4z\"/>",t:'Home',w:760,h:560,
 html:()=>`<div class="hm"><div class="hm-hd"><div><h2 class="hm-gr">Selamat datang</h2><p class="hm-dt"></p></div><div class="hm-st" aria-label="Status pasar"></div></div><div><h3>Pasar utama <span class="tag">Data dummy</span></h3><div class="hm-ix"></div></div><div class="hm-g"><div class="hm-bx hm-fv"></div><div class="hm-bx hm-mv"></div></div><div><h3>Pintasan</h3><div class="hm-sc">${SC.map(a=>`<button class="btn" data-go="${a[0]}"><svg viewBox="0 0 24 24" aria-hidden="true">${a[2]}</svg>${a[0]==='chart'?'Chart '+S.sym:a[1]}</button>`).join('')}</div></div><div class="hm-g"><div class="hm-bx hm-rc"></div><div class="hm-bx hm-nt"></div></div><div class="hm-bx hm-ac" hidden></div></div>`,
 init(w){fill(w);w.addEventListener('click',e=>{const b=e.target.closest('[data-s]');if(b){S.sym=S.go=b.dataset.s;open('chart')}});const iv=setInterval(()=>{if(!w.isConnected){clearInterval(iv);return}$('.hm-st',w).innerHTML=status()},30000)},
 show(w){fill(w)}});
})();
