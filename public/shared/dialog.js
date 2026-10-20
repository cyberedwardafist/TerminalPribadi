// Dialog buatan sendiri (pengganti prompt/confirm/alert bawaan browser). Dipakai app mana pun:
//   dlg.prompt('Judul','Label',nilaiAwal) -> Promise<string|null>
//   dlg.confirm('Judul','Pesan',{ok:'Hapus',danger:true}) -> Promise<boolean>
//   dlg.alert('Judul','Pesan') -> Promise<void>
const dlg=(()=>{
const esc=s=>String(s).replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');
function show({title,msg,input,ok='OK',cancel='Batal',danger,one}){return new Promise(res=>{
 const prev=document.activeElement,bd=document.createElement('div');bd.className='dlg-bd';
 bd.innerHTML=`<form class="dlg" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${msg?`<p>${esc(msg)}</p>`:''}${input!=null?`<input class="dlg-in" maxlength="40" value="${esc(input.value||'')}" placeholder="${esc(input.label||'')}" aria-label="${esc(input.label||title)}">`:''}<div class="dlg-ft">${one?'':`<button type="button" class="btn" data-c="0">${esc(cancel)}</button>`}<button type="submit" class="btn pri${danger?' dng':''}">${esc(ok)}</button></div></form>`;
 const fm=bd.firstChild,inp=fm.querySelector('input'),done=v=>{bd.remove();removeEventListener('keydown',kd,true);prev&&prev.focus&&prev.focus({preventScroll:true});res(v)};
 const kd=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done(input!=null?null:one?undefined:false)}else if(e.key==='Tab'){const f=[...fm.querySelectorAll('input,button')],i=f.indexOf(document.activeElement);e.preventDefault();f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus()}};
 fm.onsubmit=e=>{e.preventDefault();done(input!=null?inp.value:one?undefined:true)};
 fm.onclick=e=>{if(e.target.dataset.c==='0')done(input!=null?null:false)};
 bd.onpointerdown=e=>{if(e.target===bd)done(input!=null?null:one?undefined:false)};
 addEventListener('keydown',kd,true);document.body.append(bd);(inp||fm.querySelector('[type=submit]')).focus();inp&&inp.select()})}
return{prompt:(title,label,value)=>show({title,input:{label,value},ok:'Simpan'}),confirm:(title,msg,o={})=>show({title,msg,ok:o.ok||'Ya',danger:o.danger}),alert:(title,msg)=>show({title,msg,one:1})}})();
