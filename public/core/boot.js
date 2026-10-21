// Penyalaan: dock dari app yang sudah mendaftar (urutan dock = urutan <script> di index.html), jam, lalu buka Home.
$('#dock').innerHTML=Object.keys(APPS).map(k=>`<button class="d" data-k="${k}" data-l="${APPS[k].t}" aria-label="${APPS[k].t}"><svg viewBox="0 0 24 24" aria-hidden="true">${typeof APPS[k].icon==='function'?APPS[k].icon():APPS[k].icon}</svg></button>`).join('');
$$('.d').forEach(b=>b.onclick=()=>{const k=b.dataset.k,g=grp(k),vis=g.filter(i=>!S.wins[i].min);if(vis.length&&S.act&&base(S.act)===k){vis.forEach(minimize);return}if(!g.length){b.classList.add('bounce');setTimeout(()=>b.classList.remove('bounce'),1000);open(k);return}g.sort((a,c)=>S.wins[a].el.style.zIndex-S.wins[c].el.style.zIndex).forEach(open)});
// clock
const tick=()=>{$('#clk').textContent=new Date().toLocaleString('id-ID',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})};tick();setInterval(tick,20000);
open('home');
