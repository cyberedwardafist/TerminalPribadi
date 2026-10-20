// Setting > Akun: data akun, foto profil (Cropper.pick), Keluar. Logika login/sesi ada di auth/auth.js.
(()=>{
const{row,seg,bindSeg}=Setting;
const dt=t=>t?new Date(t).toLocaleString('id-ID',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-';
const akunHtml=()=>{
 const ss=Auth.session(),u=ss&&ss.user;
 if(!u)return'<div class="empty">Tidak ada sesi aktif.</div><div class="sact" style="margin-top:12px"><button type="button" class="btn" data-logout>Ke halaman login</button></div>';
 const ini=Auth.esc((u.name||u.username||'?').trim().charAt(0).toUpperCase()),av=Auth.avatar(u.id);
 return`<div class="grp"><div class="sr acc">
  <button type="button" class="avb" data-avedit aria-label="Ganti foto profil"><span class="avs" data-avimg>${av?`<img src="${av}" alt="">`:ini}</span><span class="pen" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></span></button>
  <div class="sl"><b>${Auth.esc(u.name)}</b><small>@${Auth.esc(u.username)}</small><small class="avmsg" role="status" aria-live="polite"></small></div>
  <button type="button" class="nb" data-avdel ${av?'':'hidden'}>Hapus foto</button></div></div>
 <div class="grp">
  ${row('Email','',Auth.esc(u.email))}
  ${row('Username','',Auth.esc(u.username))}
  ${row('Terdaftar sejak','',dt(u.created))}
  ${row('Masuk sejak','Sesi di perangkat ini',dt(ss.at))}
  ${row('Sumber akun','',ss.mode==='live'?'Server (live)':'Browser ini (dummy)')}
 </div>
 <div class="grp">${row('Keluar','Kembali ke layar login','<button type="button" class="btn dng" data-logout>Keluar</button>')}</div>`}

Setting.page({id:'akun',title:'Akun',color:'#ff9f0a',icon:"<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7\"/>",css:'apps/setting/pages/akun.css',
 html:akunHtml,
 init:({q,qa})=>{
  const ab=q('[data-avedit]');
  if(ab){const u=Auth.mine(),msg=q('.avmsg'),del=q('[data-avdel]'),ini=(u.name||u.username||'?').trim().charAt(0).toUpperCase();
   const paint=()=>{const a=Auth.avatar(u.id),t=q('[data-avimg]');t.textContent='';if(a){const i=document.createElement('img');i.alt='';i.src=a;t.append(i)}else t.textContent=ini;del.hidden=!a};
   const say=(m,bad)=>{msg.textContent=m;msg.style.color=bad?'var(--dn)':''};
   ab.onclick=async()=>{say('');try{const img=await Cropper.pick(q('.st'));if(!img)return;await Auth.setAvatar(u.id,img);paint();say('Foto profil diperbarui')}catch(e){say(e.message,true)}};
   del.onclick=async()=>{try{await Auth.setAvatar(u.id,null);paint();say('Foto dihapus')}catch(e){say(e.message,true)}}}
  qa('[data-logout]').forEach(b=>b.onclick=()=>{Auth.logout();location.replace('auth/login.html')});
 }});
})();
