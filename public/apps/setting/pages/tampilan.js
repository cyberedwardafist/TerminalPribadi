// Setting > Tampilan: warna aksen, jam dan running text di menubar, dock. Semua lewat UiPref (shared/uipref.js).
(()=>{
const{row,seg,bindSeg}=Setting;
const sw=(k,l)=>`<label class="sw"><input type="checkbox" data-u="${k}" aria-label="${l}"><i></i></label>`;
Setting.page({id:'tampilan',title:'Tampilan',color:'#af52de',css:'apps/setting/pages/tampilan.css',icon:"<path d=\"M12 3a9 9 0 100 18c1.4 0 2-.9 2-1.8 0-1.2-1-1.6-1-2.7 0-1 .8-1.5 1.8-1.5H17a4 4 0 004-4c0-4.4-4-8-9-8z\"/><circle cx=\"7.5\" cy=\"11\" r=\"1\"/><circle cx=\"10\" cy=\"7\" r=\"1\"/><circle cx=\"15\" cy=\"7.5\" r=\"1\"/>",
 html:()=>`
  <div class="grp">
   <div class="sr col"><div class="sl">Warna aksen<small>Tombol, pilihan yang aktif, dan penanda di seluruh desktop</small></div>
    <div class="swx" role="radiogroup" aria-label="Warna aksen">${UiPref.ACC.map(a=>`<label class="sx" title="${a[1]}"><input type="radio" name="acc" value="${a[0]}" aria-label="${a[1]}"><i style="background:${a[0]}"></i></label>`).join('')}</div></div>
  </div>
  <div class="grp">
   ${row('Format jam','Jam di pojok kanan menubar',seg('clock',[['full','Tanggal + jam'],['time','Jam'],['sec','Jam + detik']]))}
   ${row('Sistem 12 jam','Tampilkan AM / PM',sw('h12','Sistem 12 jam'))}
   ${row('Running text harga','Teks berjalan di menubar saat ada pergerakan harga',sw('tkr','Running text harga'))}
   ${row('Kecepatan running text','',seg('tks',[['l','Lambat'],['n','Normal'],['c','Cepat']]))}
  </div>
  <div class="grp">
   ${row('Ukuran ikon dock','Berlaku di layar lebar',seg('dock',[['s','Kecil'],['m','Sedang'],['l','Besar']]))}
   ${row('Membesar saat disorot','Ikon dock membesar mengikuti kursor',sw('mag','Membesar saat disorot'))}
  </div>
`,
 init:({q,qa})=>{
  const tc=()=>{if(typeof tick==='function')tick()};
  qa('[name=acc]').forEach(r=>{r.checked=r.value===UiPref.get('accent');r.onchange=()=>{if(r.checked)UiPref.set('accent',r.value)}});
  bindSeg(qa,'clock',()=>UiPref.get('clock'),v=>{UiPref.set('clock',v);tc()});
  bindSeg(qa,'tks',()=>UiPref.get('tkSpeed'),v=>UiPref.set('tkSpeed',v));
  bindSeg(qa,'dock',()=>UiPref.get('dock'),v=>UiPref.set('dock',v));
  const bind=(k,after)=>{const i=q(`[data-u=${k}]`);i.checked=k==='h12'?UiPref.get(k)===true:UiPref.get(k)!==false;i.onchange=()=>{UiPref.set(k,i.checked);after&&after(i.checked)}};
  const spd=on=>{const g=q('[data-seg=tks]').closest('.sr');g.style.opacity=on?'':'.5';qa('[data-seg=tks] button').forEach(b=>b.disabled=!on)};
  bind('h12',tc);bind('tkr',spd);bind('mag');spd(UiPref.get('tkr')!==false);
 }});
})();
