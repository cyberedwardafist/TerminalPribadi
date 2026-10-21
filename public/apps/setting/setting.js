// App "Setting" (dock): kerangka saja (sidebar + pembungkus tab). Isi tiap tab ada di apps/setting/pages/<tab>.js
// Menambah tab: buat pages/baru.js yang memanggil Setting.page({...}) lalu tambah <script>-nya di index.html (urutan = urutan sidebar).
// Kontrak tab: {id, title, color, icon (path SVG), css?, html(), init({w,q,qa})?, notes?[]}
const Setting=(()=>{
 const pages=[];
 const seg=(n,opts)=>`<div class="seg" role="group" data-seg="${n}">${opts.map(o=>`<button type="button" data-v="${o[0]}" aria-pressed="false">${o[1]}</button>`).join('')}</div>`;
 const row=(l,d,c)=>`<div class="sr"><div class="sl">${l}${d?`<small>${d}</small>`:''}</div><div class="sc">${c}</div></div>`;
 // segmented control: get() nilai sekarang, set(v) menyimpan; config otomatis disimpan
 const bindSeg=(qa,n,get,set)=>{const paint=()=>qa(`[data-seg=${n}] button`).forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===get()));paint();qa(`[data-seg=${n}] button`).forEach(b=>b.onclick=()=>{set(b.dataset.v);cfgSave();paint()})};
 const page=p=>{pages.push(p);if(p.css)loadCss(p.css)};
 return{pages,seg,row,bindSeg,page}})();

registerApp('setting',{css:'apps/setting/setting.css',icon:"<path d=\"M4 7h10M18 7h2M4 17h2M10 17h10\"/><circle cx=\"16\" cy=\"7\" r=\"2\"/><circle cx=\"8\" cy=\"17\" r=\"2\"/>",t:'Setting',w:860,h:600,flush:1,
 html:()=>`<div class="st"><div class="sti">
 <nav class="sb" role="tablist" aria-label="Kategori setting" aria-orientation="vertical">${Setting.pages.map(p=>`<button type="button" role="tab" data-p="${p.id}" aria-selected="false" tabindex="-1"><span class="si" style="--c:${p.color}"><svg viewBox="0 0 24 24" aria-hidden="true">${p.icon}</svg></span>${p.title}</button>`).join('')}</nav>
 <div class="sm"><h2 class="sh"></h2>
 ${Setting.pages.map(p=>`<section class="pane" data-p="${p.id}" role="tabpanel">${p.html()}</section>`).join('\n')}
 </div></div></div>`,

 init(w){
  const q=s=>$(s,w),qa=s=>$$(s,w),tabs=qa('.sb [role=tab]'),panes=qa('.pane'),head=q('.sh');
  const go=(p,f)=>{S.setTab=p;tabs.forEach(t=>{const on=t.dataset.p===p;t.setAttribute('aria-selected',on);t.tabIndex=on?0:-1;if(on&&f)t.focus()});panes.forEach(x=>x.hidden=x.dataset.p!==p);head.textContent=Setting.pages.find(x=>x.id===p).title};
  tabs.forEach((t,i)=>{t.onclick=()=>go(t.dataset.p);t.onkeydown=e=>{const d={ArrowDown:1,ArrowRight:1,ArrowUp:-1,ArrowLeft:-1}[e.key];if(d){e.preventDefault();go(tabs[(i+d+tabs.length)%tabs.length].dataset.p,true)}}});
  Setting.pages.forEach(p=>p.init&&p.init({w,q,qa}));
  go(Setting.pages.some(p=>p.id===S.setTab)?S.setTab:Setting.pages[0].id)}});
