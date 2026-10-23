// App "news" (dock). Berita pasar (IHSG, saham luar, kripto, komoditas, forex): panel samping, pencarian ticker/kata kunci, urut terbaru/terlama, simpan. Berdiri sendiri.
(()=>{
const KEY='tc.news',CATS=[['all','Semua'],['idx','IHSG'],['us','Saham luar'],['cry','Kripto'],['com','Komoditas'],['fx','Forex']],CL=Object.fromEntries(CATS),SENT=[['all','Semua'],['pos','Positif'],['neg','Negatif'],['neu','Netral']],SL={pos:'Positif',neg:'Negatif',neu:'Netral'},RNG=[['1d','24 jam',864e5],['3d','3 hari',3*864e5],['7d','7 hari',7*864e5]];
const esc=s=>String(s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');
const XS=Object.fromEntries(WATCH.map(r=>[r[0],r])),catOf=r=>r[4]==='ind'?(r[0]==='IHSG'?'idx':'us'):r[4];
// ---------- berita: hanya dari server (/api/news, RSS yang diolah server). Gagal = panel penyebab, tidak ada berita karangan ----------
const mk=a=>(a.h=(a.title+' '+a.body+' '+a.tk.map(s=>s+' '+(XS[s]?XS[s][1]:'')).join(' ')+' '+CL[a.cat]).toLowerCase(),a);
const ART=[],DET=new Set(),DERR=new Map(),NS={state:'idle',info:null,at:0};
const fromApi=a=>mk({id:a.id,t:a.ts,cat:a.category,tk:a.symbols||[],title:a.title,body:a.summary||'',src:a.source,sent:a.sentiment,url:a.url,live:1});
async function loadNews(){
 if(NS.state==='load')return;
 const quiet=ART.length>0;NS.state='load';if(!quiet)window.dispatchEvent(new Event('tc:news'));
 try{const out=[];let cur='0';
  for(let i=0;i<4;i++){const r=await apiReq('/api/news?limit=50&cursor='+cur,{timeout:25000});let j;try{j=await r.json()}catch(e){throw new ApiError('parse',{path:'/api/news',status:r.status})}
   if(!Array.isArray(j))throw new ApiError('parse',{path:'/api/news',status:r.status});
   j.forEach(a=>out.push(fromApi(a)));cur=r.headers.get('x-next-cursor');if(!cur)break}
  if(!out.length)throw new ApiError('empty',{what:'news',path:'/api/news'});
  ART.length=0;ART.push(...out);NS.info=null;NS.at=Date.now();NS.state='ok'}
 catch(e){NS.info=await Fault.explain(e,{what:'news'});NS.state='err'}
 window.dispatchEvent(new Event('tc:news'))}
loadNews();
setInterval(()=>{if(!document.hidden)loadNews()},120000);
// ---------- state ----------
let N={cat:'all',sent:'all',rng:'7d',sort:'new',side:true,saved:[],tabs:[],act:'list'};try{const j=JSON.parse(localStorage.getItem(KEY)||'null');if(j&&typeof j==='object')N={...N,...j,saved:Array.isArray(j.saved)?j.saved.filter(x=>x&&x.id&&x.title&&x.live).map(x=>mk({...x})):[],tabs:Array.isArray(j.tabs)?j.tabs.filter(x=>x&&x.id&&x.title&&x.live&&Array.isArray(x.tk)).map(x=>mk({...x})):[]}}catch(e){}
if(!CATS.some(c=>c[0]===N.cat))N.cat='all';if(N.act!=='list'&&!N.tabs.some(t=>t.id===N.act))N.act='list';if(!RNG.some(r=>r[0]===N.rng))N.rng='7d';
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify({...N,saved:N.saved.map(({h,...r})=>r),tabs:N.tabs.map(({h,...r})=>r)}))}catch(e){}};
let Q='',LIM=20,SV=false;
const ago=t=>{const m=Math.round((Date.now()-t)/6e4);return m<1?'baru saja':m<60?m+' mnt lalu':m<1440?Math.floor(m/60)+' jam lalu':new Date(t).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})};
const terms=()=>Q.toLowerCase().split(/\s+/).filter(Boolean),inR=()=>Date.now()-RNG.find(r=>r[0]===N.rng)[2];
function list(){const T=terms(),lim=inR();let a=SV?N.saved:ART;a=a.filter(x=>(SV||x.t>=lim)&&(N.cat==='all'||x.cat===N.cat)&&(N.sent==='all'||x.sent===N.sent)&&T.every(k=>x.h.includes(k)));return[...a].sort((p,q)=>N.sort==='new'?q.t-p.t:p.t-q.t)}
const hl=s=>{const T=terms();if(!T.length)return esc(s);const re=new RegExp('('+T.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','gi');return s.split(re).map((p,i)=>i%2?'<mark>'+esc(p)+'</mark>':esc(p)).join('')};
const card=x=>{const sv=N.saved.some(s=>s.id===x.id);return`<article class="nw-a" data-id="${x.id}"><div class="nw-m"><span class="nw-cat">${CL[x.cat]}</span><span class="nw-s ${x.sent}">${SL[x.sent]}</span><time title="${new Date(x.t).toLocaleString('id-ID')}">${ago(x.t)}</time><span>${esc(x.src)}</span><button class="nw-sv" data-a="sv" aria-pressed="${sv}" aria-label="${sv?'Hapus dari':'Simpan ke'} tersimpan">${Icon('star',sv?'on':'')}</button></div><h4><button data-a="rd">${hl(x.title)}</button></h4><p>${hl(x.body)}</p><div class="nw-tk">${x.tk.map(s=>XS[s]?`<button data-t="${s}" title="Cari berita ${s}">${s}<small class="${cls(XS[s][3])}">${pc(XS[s][3])}</small></button>`:'').join('')}</div></article>`};
const hue=s=>Math.abs([...String(s||'?')].reduce((a,c)=>a*31+c.charCodeAt(0)|0,7))%360,get=id=>ART.find(z=>z.id===id)||N.saved.find(z=>z.id===id)||N.tabs.find(z=>z.id===id);
const full=x=>({kp:x.kp&&x.kp.length?x.kp:[x.body],ps:x.ps&&x.ps.length?x.ps:[x.body],wt:[]});
registerApp('news',{css:'apps/news/news.css',icon:"<path d=\"M4 5h13v14H6a2 2 0 01-2-2z\"/><path d=\"M17 9h3v8a2 2 0 01-2 2\"/><path d=\"M7.5 9h6M7.5 12.5h6M7.5 15.5h3\"/>",t:'News',w:900,h:560,flush:1,
 html:()=>`<div class="nw"><aside class="nw-sd" aria-label="Filter berita"></aside><section class="nw-mn"><div class="nw-top"><button class="nw-rb" data-a="sd" aria-label="Panel samping"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14"/></svg></button><div class="nw-tl"></div></div><div class="nw-lv"><div class="nw-bar"><input class="nw-q" type="search" placeholder="Cari ticker atau topik, mis. BBCA, bitcoin, emas, suku bunga\u2026" aria-label="Cari berita"><div class="seg nw-seg" role="group" aria-label="Urutan"><button data-o="new">Terbaru</button><button data-o="old">Terlama</button></div></div><div class="nw-if" aria-live="polite"></div><div class="nw-fs"></div><div class="nw-ls"></div></div><div class="nw-av" hidden></div></section></div>`,
 init(w){const q=s=>$(s,w),root=q('.nw'),ls=q('.nw-ls'),sd=q('.nw-sd'),tl=q('.nw-tl'),lv=q('.nw-lv'),av=q('.nw-av'),inp=q('.nw-q'),fs=q('.nw-fs');root.classList.toggle('nosd',!N.side||w.clientWidth<560);
  const popular=()=>[...WATCH].filter(r=>r[2]!=null).sort((a,b)=>Math.abs(b[3])-Math.abs(a[3])).slice(0,9);
  function side(){const lim=inR(),inr=ART.filter(x=>x.t>=lim),b=(on,a,t,c)=>`<button class="${on?'on':''}" ${a}>${t}${c==null?'':`<em>${c}</em>`}</button>`;
   sd.innerHTML=`<h5>Kategori</h5>${CATS.map(c=>b(N.act==='list'&&!SV&&N.cat===c[0],`data-c="${c[0]}"`,c[1],c[0]==='all'?inr.length:inr.filter(x=>x.cat===c[0]).length)).join('')}<h5>Sentimen</h5>${SENT.map(s=>b(N.sent===s[0],`data-n="${s[0]}"`,s[1])).join('')}<h5>Waktu</h5>${RNG.map(r=>b(N.rng===r[0],`data-r="${r[0]}"`,r[1])).join('')}<h5>Koleksi</h5>${b(N.act==='list'&&SV,'data-a="svv"','Tersimpan',N.saved.length)}${popular().length?'<h5>Ticker bergerak</h5>':''}<div class="nw-tp">${popular().map(r=>`<button data-t="${r[0]}">${r[0]} <span class="${cls(r[3])}">${pc(r[3])}</span></button>`).join('')}</div>`}
  function tabs(){tl.innerHTML=`<div class="nw-tab${N.act==='list'?' on':''}" data-id="list"><span>Berita</span></div>`+N.tabs.map(x=>`<div class="nw-tab${N.act===x.id?' on':''}" data-id="${x.id}" title="${esc(x.title)}"><i class="nw-ic" style="background:hsl(${hue(x.tk[0])} 55% 42%)">${esc((x.tk[0]||x.title||'?')[0])}</i><span>${esc(x.title)}</span><button class="nw-x" aria-label="Tutup tab">\u00d7</button></div>`).join('')}
  function paint(){
   if(!ART.length&&!SV){q('.nw-if').innerHTML='';fs.innerHTML='';if(NS.state==='err'&&NS.info)Fault.mount(ls,NS.info,()=>loadNews());else ls.innerHTML=Fault.loading('Memuat berita dari server\u2026');return}
   fs.innerHTML=NS.state==='err'&&NS.info?Fault.strip(NS.info,NS.at):'';
   const a=list(),T=terms(),tk=T.length===1&&XS[Q.trim().toUpperCase()],sh=a.slice(0,LIM);
   $$('[data-o]',w).forEach(b=>b.setAttribute('aria-pressed',b.dataset.o===N.sort));
   q('.nw-if').innerHTML=`<b>${a.length}</b> berita${SV?' tersimpan':''}${Q.trim()?` untuk \u201c<b>${esc(Q.trim())}</b>\u201d`:''} \u00b7 urut ${N.sort==='new'?'terbaru ke terlama':'terlama ke terbaru'}${SV?'':' \u00b7 '+RNG.find(r=>r[0]===N.rng)[1]+' terakhir'} <span class="tag">${NS.at?'Diperbarui '+new Date(NS.at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}):''}</span>`;
   ls.innerHTML=(tk?`<div class="nw-hd"><b>${tk[0]}</b><span>${tk[1]}</span><span class="${cls(tk[3])}">${f(tk[2])} \u00b7 ${pc(tk[3])}</span><i class="sp"></i><button class="btn" data-a="ch" data-s="${tk[0]}">Buka Chart</button></div>`:'')+(sh.length?sh.map(card).join('')+(a.length>LIM?`<button class="btn nw-mo" data-a="mo">Muat lebih banyak (${a.length-LIM})</button>`:''):`<div class="nw-em">${SV?'Belum ada berita tersimpan. Tekan bintang pada berita untuk menyimpannya.':'Tidak ada berita yang cocok. Coba ticker lain, kata kunci lebih umum, atau perluas rentang waktu di panel samping.'}</div>`)}
  function artv(x){if(!DET.has(x.id)&&!DERR.has(x.id)){DET.add(x.id);apiJson('/api/news/'+x.id,{timeout:15000}).then(j=>{x.kp=j.keyPoints;x.ps=j.content;if(N.act===x.id&&!av.hidden)artv(x)}).catch(async e=>{DET.delete(x.id);DERR.set(x.id,await Fault.explain(e,{what:'news-detail'}));if(N.act===x.id&&!av.hidden)artv(x)})}const P=full(x),T=x.tk.filter(s=>XS[s]),sv=N.saved.some(z=>z.id===x.id),rel=ART.filter(z=>z.id!==x.id&&z.tk.some(s=>x.tk.includes(s))).sort((a,b)=>b.t-a.t).slice(0,5);
   av.innerHTML=`<article class="nw-ar" data-id="${x.id}"><div class="nw-m"><span class="nw-cat">${CL[x.cat]}</span><span class="nw-s ${x.sent}">${SL[x.sent]}</span></div><h1>${esc(x.title)}</h1><div class="nw-by">${esc(x.src)} \u00b7 ${new Date(x.t).toLocaleString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})} \u00b7 ${ago(x.t)}</div><div class="nw-act"><button class="btn" data-a="sv" aria-pressed="${sv}">${Icon('star',sv?'on':'')} ${sv?'Tersimpan':'Simpan'}</button>${T.map(s=>`<button class="btn pri" data-a="ch" data-s="${s}">Chart ${s}</button>`).join('')}</div>${DERR.has(x.id)?Fault.strip(DERR.get(x.id),0,'data-a="rdt"'):''}<div class="nw-kp"><h5>Poin penting</h5><ul>${P.kp.map(k=>`<li>${esc(k)}</li>`).join('')}</ul></div>${P.ps.map(p=>`<p>${esc(p)}</p>`).join('')}${P.wt.length?`<h3>Yang perlu dicermati</h3><ul>${P.wt.map(k=>`<li>${esc(k)}</li>`).join('')}</ul>`:''}<h3>Ticker terkait</h3><div class="nw-tk">${T.map(k=>{const r=XS[k];return`<button data-t="${k}" title="Cari semua berita ${k}">${k}<small class="${cls(r[3])}">${f(r[2])} \u00b7 ${pc(r[3])}</small></button>`}).join('')}</div>${rel.length?`<h3>Berita terkait</h3>${rel.map(z=>`<button class="nw-rl" data-a="rd" data-id="${z.id}"><span>${esc(z.title)}</span><time>${ago(z.t)}</time></button>`).join('')}`:''}${x.live?`<p class="nw-ds">Ringkasan dari ${esc(x.src)}${x.url?` \u00b7 <a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Baca selengkapnya di sumber</a>`:''}. Sentimen dihitung otomatis dari kata kunci, bukan rekomendasi investasi.</p>`:''}</article>`;av.scrollTop=0}
  function render(){tabs();side();const L=N.act==='list';lv.hidden=!L;av.hidden=L;if(L)paint();else artv(get(N.act))}
  const rf=()=>{if(!w.isConnected){window.removeEventListener('tc:news',rf);window.removeEventListener('tc:quotes',rq);return}const y=ls.scrollTop;render();ls.scrollTop=y},rq=()=>{if(!w.isConnected){window.removeEventListener('tc:news',rf);window.removeEventListener('tc:quotes',rq);return}side()};
  window.addEventListener('tc:news',rf);window.addEventListener('tc:quotes',rq);
  const toList=()=>{N.act='list';save()},openTab=id=>{const x=get(id);if(!x)return;if(!N.tabs.some(t=>t.id===id)){N.tabs.push(x);if(N.tabs.length>12){const i=N.tabs.findIndex(t=>t.id!==id);N.tabs.splice(i,1)}}N.act=id;save();render()};
  function closeTab(id){const i=N.tabs.findIndex(t=>t.id===id);if(i<0)return;N.tabs.splice(i,1);if(N.act===id)N.act=(N.tabs[i]||N.tabs[i-1]||{id:'list'}).id;save();render()}
  inp.oninput=()=>{Q=inp.value;LIM=20;paint();ls.scrollTop=0};
  inp.onkeydown=e=>{if(e.key==='Escape'&&Q){Q='';inp.value='';LIM=20;paint();e.stopPropagation()}};
  const setQ=s=>{Q=s;inp.value=s;LIM=20;SV=false;N.cat='all';N.sent='all';toList();render();ls.scrollTop=0},closeSd=()=>{if(root.clientWidth<560)root.classList.add('nosd')};
  w.addEventListener('click',e=>{const tb=e.target.closest('.nw-tab'),b=e.target.closest('button');
   if(tb&&!(b&&!b.classList.contains('nw-x'))){const id=tb.dataset.id;if(b)closeTab(id);else{N.act=id;save();render()}return}
   if(!b){const ar=e.target.closest('.nw-a');if(ar&&!window.getSelection().toString())openTab(ar.dataset.id);return}
   const D=b.dataset;if(D.ft==='retry'){loadNews();return}if(D.a==='rdt'){const id=b.closest('[data-id]').dataset.id;DERR.delete(id);artv(get(id));return}
   if(D.a==='sd'){const on=root.classList.toggle('nosd');N.side=!on;save();return}
   if(D.o){N.sort=D.o;save();paint();return}
   if(D.c!=null){N.cat=D.c;SV=false;LIM=20;toList();render();closeSd();return}
   if(D.n){N.sent=D.n;LIM=20;toList();render();return}
   if(D.r){N.rng=D.r;LIM=20;toList();render();return}
   if(D.a==='svv'){SV=!SV;LIM=20;toList();render();closeSd();return}
   if(D.t){setQ(D.t);closeSd();return}
   if(D.a==='mo'){LIM+=20;paint();return}
   if(D.a==='ch'){S.sym=S.go=D.s;open('chart');return}
   if(D.a==='rd'){openTab(D.id||b.closest('.nw-a').dataset.id);return}
   if(D.a==='sv'){const id=b.closest('[data-id]').dataset.id,x=get(id),i=N.saved.findIndex(z=>z.id===id);i<0?N.saved.unshift(x):N.saved.splice(i,1);save();if(N.act==='list'){const y=ls.scrollTop;side();paint();ls.scrollTop=y}else{side();artv(get(N.act))}}});
  render();const iv=setInterval(()=>{if(!w.isConnected){clearInterval(iv);return}$$('.nw-a time',w).forEach(t=>{const a=get(t.closest('.nw-a').dataset.id);if(a)t.textContent=ago(a.t)})},60000)}});
})();
