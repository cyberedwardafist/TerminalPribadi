// Setting > Background: pilih Angin/Hutan/Laut atau unggah gambar sendiri (Cropper.wide / Cropper.shrink). Animasinya sendiri ada di core/background.js.
(()=>{
const{row,seg,bindSeg}=Setting;
const BGS=[['angin','Angin','linear-gradient(#26384d,#9fb1bd)'],['hutan','Hutan','linear-gradient(#1b3a3a,#5b8466 60%,#1b3528)'],['laut','Laut','linear-gradient(#0e2036,#33627f 55%,#14264a)']];
Setting.page({id:'bg',title:'Background',color:'#0a84ff',css:'apps/setting/pages/background.css',icon:"<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\"/><circle cx=\"9\" cy=\"10\" r=\"1.6\"/><path d=\"M4 18l5-5 4 4 3-3 4 4\"/>",
 html:()=>`
  <div class="bgv" data-bgview><div class="bgw"><i></i><i></i><i></i></div><div class="bgd"><b></b><b></b><b></b><b></b></div><span class="bgn"><span data-bgname></span></span></div>
  <div class="grp"><div class="sr col">
   <div class="bgs" role="radiogroup" aria-label="Background">${BGS.map(b=>`<label class="bgc"><input type="radio" name="bg" value="${b[0]}"><span class="bp" style="background:${b[2]}"><span class="ck"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg></span></span><span class="bl">${b[1]}</span></label>`).join('')}
    <div class="bgc cus" data-drop><label><input type="radio" name="bg" value="custom"><span class="bp empty" data-bgprev><span class="ck"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg></span><span class="upl"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14"/></svg><em>Unggah gambar</em></span></span><span class="bl">Gambar saya</span></label>
     <div class="bga"><button type="button" data-bgup aria-label="Ganti gambar" title="Ganti gambar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M18 3v4h-4M6 21v-4h4"/></svg></button><button type="button" data-bgdel aria-label="Hapus gambar" title="Hapus gambar" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg></button></div></div>
   </div>
   <p class="bgh">Seret gambar ke kotak "Gambar saya", atau klik untuk memilih. PNG, JPG, WebP, atau GIF; disesuaikan otomatis ke layar. Tersimpan di browser ini, dan di akun Anda saat mode Live. <span class="bgmsg" role="status" aria-live="polite"></span></p>
  </div></div>
  <div class="grp">
   ${row('Kurangi gerakan background','Animasi berhenti; berguna untuk hemat baterai',`<label class="sw"><input type="checkbox" role="switch" data-k="still" aria-label="Kurangi gerakan background"><i></i></label>`)}
  </div>
`,
 init:({q,qa})=>{
  const bgp=q('[data-bgprev]'),bgup=q('[data-bgup]'),bgdel=q('[data-bgdel]'),bgm=q('.bgmsg'),bgv=q('[data-bgview]'),bgn=q('[data-bgname]'),drop=q('[data-drop]');
  const bgGet=()=>{try{return localStorage.getItem('bg.img')}catch(e){return null}};
  const bgSay=(m,bad)=>{bgm.textContent=m;bgm.style.color=bad?'var(--dn)':''};
  const bgView=()=>{const u=bgGet(),c=S.bg==='custom'&&u,p=BGS.find(x=>x[0]===S.bg);bgv.style.background=c?'center/cover no-repeat url("'+u+'")':(p?p[2]:BGS[0][2]);bgn.textContent=c?'Gambar saya':(p?p[1]:BGS[0][1])};
  const bgSet=v=>{S.bg=v;try{localStorage.setItem('bg',v)}catch(e){}qa('[name=bg]').forEach(r=>r.checked=r.value===v);bgView()};
  const bgPaint=()=>{const u=bgGet();bgp.style.backgroundImage=u?'url("'+u+'")':'';bgp.classList.toggle('empty',!u);bgdel.hidden=!u;bgup.hidden=!u;bgView()};
  const bgSave=async get=>{bgSay('');try{const u=await get();if(!u)return false;
    try{localStorage.setItem('bg.img',u)}catch(e){throw new Error('Penyimpanan browser penuh, gambar tidak tersimpan')}
    Bg.load();bgSet('custom');bgPaint();bgSay('Background diperbarui.');return true}catch(e){bgSay(e.message,true);return false}};
  const bgUpload=()=>bgSave(()=>Cropper.wide(q('.st')));
  qa('[name=bg]').forEach(r=>{r.checked=r.value===S.bg;r.onchange=async()=>{if(r.value==='custom'&&!bgGet()){if(!await bgUpload())bgSet(S.bg==='custom'?'angin':S.bg);return}bgSet(r.value)}});
  bgup.onclick=bgUpload;
  bgdel.onclick=()=>{try{localStorage.removeItem('bg.img')}catch(e){}Bg.load();if(S.bg==='custom')bgSet('angin');bgPaint();bgSay('Gambar dihapus.')};
  // seret & lepas file ke kotak "Gambar saya"
  ['dragenter','dragover'].forEach(n=>drop.addEventListener(n,e=>{e.preventDefault();drop.classList.add('over')}));
  ['dragleave','drop'].forEach(n=>drop.addEventListener(n,e=>{e.preventDefault();drop.classList.remove('over')}));
  drop.addEventListener('drop',e=>{const f=e.dataTransfer&&e.dataTransfer.files[0];if(f)bgSave(()=>Cropper.shrink(f))});
  bgPaint();
  const st=q('[data-k=still]');st.checked=!!S.still;st.onchange=()=>{S.still=st.checked;CFG.still=st.checked;cfgSave()};
 },
 notes:['Tersambung: pilihan background dan <code>reduceMotion</code> lewat <code>PUT /api/settings/preferences</code>. Gambar sendiri: <code>PUT/GET/DELETE /api/settings/background-image</code> (body mentah PNG/JPEG/WebP, maks 3 MB, satu per akun, bucket privat <code>backgrounds</code>). Perangkat lain mengunduhnya sekali, lalu hanya bila berubah.']});
})();
