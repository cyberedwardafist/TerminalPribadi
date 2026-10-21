// Notifikasi (hanya mode Live): lonceng di menubar + panel daftar + toast untuk notifikasi baru (mis. alert harga terpicu).
// Sumber: GET /api/notifications (polling 30 dtk saat tab terlihat; lebih hemat daripada SSE /api/stream yang menahan 1 function terus-menerus).
// Aksi: POST /api/notifications/read {ids|all}, DELETE /api/notifications/:id. Klik notifikasi yang punya data.symbol membuka Chart simbol itu.
(()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const ago=t=>{const s=Math.max(0,(Date.now()-t)/1000);return s<60?'baru saja':s<3600?Math.floor(s/60)+' mnt lalu':s<86400?Math.floor(s/3600)+' jam lalu':new Date(t).toLocaleDateString('id-ID',{day:'numeric',month:'short'})};
const ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';
const call=async(path,opt={})=>{const r=await apiFetch(path,{...opt,headers:{'content-type':'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);return r.status===204?null:r.json()};
let list=[],seen=null,btn,badge,panel,toastBox;
const unread=()=>list.filter(n=>!n.read).length;

function paint(){
 const u=unread();badge.textContent=u>99?'99+':u;badge.hidden=!u;btn.setAttribute('aria-label',u?`Notifikasi, ${u} belum dibaca`:'Notifikasi');
 if(panel.hidden)return;
 panel.querySelector('.nf-l').innerHTML=list.length?list.map(n=>`<div class="nf-i${n.read?'':' un'}" data-id="${esc(n.id)}" tabindex="0" role="button"><i class="nf-d" aria-hidden="true"></i><div class="nf-t"><b>${esc(n.title)}</b>${n.body?`<span>${esc(n.body)}</span>`:''}<small>${ago(n.ts)}</small></div><button class="nf-x" data-del="${esc(n.id)}" aria-label="Hapus notifikasi">\u00d7</button></div>`).join(''):'<div class="nf-em">Belum ada notifikasi.<br>Alert harga yang terpicu akan muncul di sini.</div>';
 panel.querySelector('[data-all]').disabled=!u}

function toast(n){
 if(window.Island&&Island.ok()){const d=n.data||{},up=typeof d.last==='number'&&typeof d.price==='number'?d.last>=d.price:null;
  Island.notify({title:n.title,body:n.body,icon:'bell',tone:up==null?'warn':up?'up':'down',timeout:8000,key:'n'+n.id,onClick:()=>go(n)});return}
 const el=document.createElement('div');el.className='nf-toast';el.setAttribute('role','status');
 el.innerHTML=`<b>${esc(n.title)}</b>${n.body?`<span>${esc(n.body)}</span>`:''}`;
 el.onclick=()=>{el.remove();go(n)};toastBox.append(el);setTimeout(()=>el.remove(),7000);
 while(toastBox.children.length>3)toastBox.firstChild.remove()}

async function pull(first){
 if(document.hidden&&!first)return;
 try{
  list=await call('/api/notifications?limit=30');
  if(seen){for(const n of list)if(!n.read&&!seen.has(n.id))toast(n)}
  seen=new Set(list.map(n=>n.id));paint()}
 catch(e){/* offline/401: coba lagi di putaran berikutnya */}}

function go(n){
 markRead([n.id]);hide();
 const s=n.data&&n.data.symbol;if(s&&typeof S!=='undefined'&&typeof open==='function'&&APPS.chart){S.sym=S.go=String(s);open('chart')}}
async function markRead(ids){
 const hit=list.filter(n=>ids.includes(n.id)&&!n.read);if(!hit.length)return;
 hit.forEach(n=>n.read=true);paint();
 try{await call('/api/notifications/read',{method:'POST',body:JSON.stringify({ids})})}catch(e){hit.forEach(n=>n.read=false);paint()}}
async function markAll(){
 const was=list.filter(n=>!n.read);if(!was.length)return;was.forEach(n=>n.read=true);paint();
 try{await call('/api/notifications/read',{method:'POST',body:JSON.stringify({all:true})})}catch(e){was.forEach(n=>n.read=false);paint()}}
async function remove(id){
 const i=list.findIndex(n=>n.id===id);if(i<0)return;const [n]=list.splice(i,1);paint();
 try{await call('/api/notifications/'+encodeURIComponent(id),{method:'DELETE'});seen&&seen.delete(id)}catch(e){list.splice(i,0,n);paint()}}

const hide=()=>{panel.hidden=true;btn.setAttribute('aria-expanded','false')};
function showPanel(){panel.hidden=false;btn.setAttribute('aria-expanded','true');paint();pull(true)}

function build(){
 loadCss('shared/notif.css');
 btn=document.createElement('button');btn.id='nbell';btn.type='button';btn.setAttribute('aria-haspopup','dialog');btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-label','Notifikasi');
 btn.innerHTML=ICON+'<i id="nbadge" hidden>0</i>';
 const mode=document.getElementById('mbmode');mode.parentNode.insertBefore(btn,mode);badge=btn.querySelector('#nbadge');
 panel=document.createElement('div');panel.id='npanel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Notifikasi');
 panel.innerHTML='<div class="nf-h"><b>Notifikasi</b><button type="button" class="nf-a" data-all>Tandai semua dibaca</button></div><div class="nf-l"></div>';
 toastBox=document.createElement('div');toastBox.id='ntoasts';toastBox.setAttribute('aria-live','polite');
 document.body.append(panel,toastBox);
 btn.onclick=()=>panel.hidden?showPanel():hide();
 panel.addEventListener('click',e=>{
  if(e.target.closest('[data-all]'))return markAll();
  const x=e.target.closest('[data-del]');if(x){e.stopPropagation();return remove(x.dataset.del)}
  const it=e.target.closest('.nf-i');if(it){const n=list.find(v=>v.id===it.dataset.id);if(n)go(n)}});
 panel.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.classList.contains('nf-i')){e.preventDefault();e.target.click()}});
 addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){hide();btn.focus()}});
 addEventListener('pointerdown',e=>{if(!panel.hidden&&!e.target.closest('#npanel,#nbell'))hide()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)pull()});
 setInterval(pull,30000);pull(true)}

(window.Live?Live.ready:Promise.resolve()).then(()=>{if(window.Live&&Live.on)build()},()=>{});
})();
