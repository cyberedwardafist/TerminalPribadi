// Alat gambar chart: definisi, penggambaran, hit-test, handle. Titik disimpan sebagai {t: detik epoch, p: harga}, jadi gambar tetap di tempat
// yang benar di semua timeframe. Tidak menyentuh DOM; penggambar menerima konteks canvas dan lingkungan E dari render.js:
//   E = {g, X(t)->px, Y(p)->px, T(px)->t, P(px)->harga, w, h (area plot), F(harga)->teks, st (detik/bar), idx(t)->indeks bar pecahan, col:{up,dn,acc,ink,mute,bg}}
const ChartDraw=(()=>{
const COLORS=['#4c9aff','#3ecf8e','#ff6b6b','#e8a33d','#b58cff','#ff7ad9','#e6e8eb','#8a93a0'];
const FIB=[0,.236,.382,.5,.618,.786,1],FIBX=[0,.618,1,1.618,2.618,3.618,4.236],FIBC=['#8a93a0','#ff6b6b','#e8a33d','#3ecf8e','#4dd0e1','#4c9aff','#8a93a0'];
// grp: baris di rail; n: jumlah titik (0 = bebas / brush); ic: path SVG 24x24
const TOOLS=[
 {k:'cur',name:'Kursor',n:0,ic:'M6 3l12 9-6 1.5L9.5 20z',grp:'cur'},
 {k:'trend',name:'Garis tren',n:2,ic:'M4 19L20 5M4 19h.01M20 5h.01',grp:'line'},
 {k:'ray',name:'Ray',n:2,ic:'M4 19L20 7M4 19h.01',grp:'line'},
 {k:'ext',name:'Garis diperpanjang',n:2,ic:'M2 21L22 3M9 15h.01M15 9h.01',grp:'line'},
 {k:'hline',name:'Garis horizontal',n:1,ic:'M3 12h18',grp:'line'},
 {k:'hray',name:'Ray horizontal',n:1,ic:'M5 12h16M5 12h.01',grp:'line'},
 {k:'vline',name:'Garis vertikal',n:1,ic:'M12 3v18',grp:'line'},
 {k:'cross',name:'Garis silang',n:1,ic:'M12 3v18M3 12h18',grp:'line'},
 {k:'channel',name:'Kanal paralel',n:3,ic:'M3 16L21 7M3 21L21 12',grp:'chan'},
 {k:'pitch',name:'Pitchfork Andrews',n:3,ic:'M4 20L20 4M4 14l8-4M10 20l8-4',grp:'chan'},
 {k:'fib',name:'Fibonacci retracement',n:2,ic:'M4 5h16M4 10h16M4 15h16M4 20h16',grp:'fib'},
 {k:'fibx',name:'Fibonacci extension',n:3,ic:'M4 6h16M4 11h16M4 16h16M4 20h6',grp:'fib'},
 {k:'rect',name:'Kotak',n:2,ic:'M5 6h14v12H5z',grp:'shape'},
 {k:'ellipse',name:'Elips',n:2,ic:'M12 5c5 0 9 3 9 7s-4 7-9 7-9-3-9-7 4-7 9-7z',grp:'shape'},
 {k:'tri',name:'Segitiga',n:3,ic:'M12 5l8 14H4z',grp:'shape'},
 {k:'brush',name:'Kuas',n:0,ic:'M4 18c3-6 5 2 8-4s5-6 8-9',grp:'shape'},
 {k:'arrow',name:'Panah',n:2,ic:'M5 19L19 5M10 5h9v9',grp:'note'},
 {k:'text',name:'Teks',n:1,ic:'M6 6h12M12 6v13M9 19h6',grp:'note'},
 {k:'measure',name:'Pengukur',n:2,ic:'M4 16l12-12 4 4L8 20zM8 12l2 2M11 9l2 2',grp:'note'},
 {k:'long',name:'Posisi Long',n:2,ic:'M5 5h14v7H5zM5 12h14v7H5z',grp:'pos'},
 {k:'short',name:'Posisi Short',n:2,ic:'M5 5h14v7H5zM5 12h14v7H5z',grp:'pos'},
];
const BYK=Object.fromEntries(TOOLS.map(t=>[t.k,t]));
const GROUPS=[['cur','Kursor'],['line','Garis'],['chan','Kanal'],['fib','Fibonacci'],['shape','Bentuk'],['note','Anotasi dan ukur'],['pos','Posisi']];
const NOCOLOR={fib:1,fibx:1,measure:1,long:1,short:1};
let UID=0;
const uid=()=>Date.now().toString(36)+(++UID).toString(36)+Math.random().toString(36).slice(2,5);

// ---------- geometri ----------
const segDist=(px,py,ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l)):0;return Math.hypot(px-ax-t*dx,py-ay-t*dy)};
// potong garis a->b (mode seg|ray|ext) ke kotak [0,W]x[0,H] (Liang-Barsky). null bila di luar
function clip(a,b,mode,W,H){
 let dx=b.x-a.x,dy=b.y-a.y;if(!dx&&!dy)return null;
 let t0=mode==='ext'?-1e9:0,t1=mode==='seg'?1:1e9;
 const test=(p,q)=>{if(p===0)return q>=0;const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r}else{if(r<t0)return false;if(r<t1)t1=r}return true};
 if(!test(-dx,a.x)||!test(dx,W-a.x)||!test(-dy,a.y)||!test(dy,H-a.y))return null;
 if(t0>t1)return null;
 return[{x:a.x+t0*dx,y:a.y+t0*dy},{x:a.x+t1*dx,y:a.y+t1*dy}]}
const rgba=(hex,a)=>{const m=/^#?([0-9a-f]{6})$/i.exec(hex||'');if(!m)return hex;const n=parseInt(m[1],16);return`rgba(${n>>16&255},${n>>8&255},${n&255},${a})`};
const pts=(d,E)=>d.pts.map(q=>({x:E.X(q.t),y:E.Y(q.p)}));
const S=(d,E)=>({c:d.s&&d.s.c||E.col.acc,w:d.s&&d.s.w||1.5,dash:d.s&&d.s.dash||0});
const dashOf=n=>n===1?[6,4]:n===2?[2,3]:[];
function stroke(g,s,p){g.strokeStyle=s.c;g.lineWidth=s.w;g.setLineDash(dashOf(s.dash));p?g.stroke(p):g.stroke();g.setLineDash([])}
function tag(g,txt,x,y,fg,bg,align){g.save();g.font='11px ui-monospace,Menlo,Consolas,monospace';const w=g.measureText(txt).width+10,h=17,l=align==='right'?x-w:align==='center'?x-w/2:x;g.fillStyle=bg;g.beginPath();g.roundRect?g.roundRect(l,y-h/2,w,h,4):g.rect(l,y-h/2,w,h);g.fill();g.fillStyle=fg;g.textBaseline='middle';g.textAlign='left';g.fillText(txt,l+5,y+.5);g.restore()}
const lineY=(a,b,x)=>b.x===a.x?a.y:a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x);

// ---------- pembuatan ----------
function create(k,pt){const n=BYK[k].n||1;return{id:uid(),k,pts:Array.from({length:Math.max(1,n)},()=>({...pt})),s:{}}}
// untuk alat yang titik ke-3 diturunkan (long/short): panggil setiap titik ke-2 bergerak
function complete(d){
 if(d.k==='long'||d.k==='short'){const[a,b]=d.pts,up=d.k==='long';
  let tp=b.p;if(up?tp<=a.p:tp>=a.p)tp=a.p*(up?1.0001:.9999);d.pts[1]={t:b.t,p:tp};
  d.pts[2]={t:b.t,p:a.p-(tp-a.p)/2}}
 return d}
const ready=d=>{const n=BYK[d.k].n;return n===0?d.pts.length>1:d.pts.length>=n};

// ---------- penggambaran ----------
function render(g,d,E,sel){
 if(d.hide)return;
 const s=S(d,E),P=pts(d,E),W=E.w,H=E.h,k=d.k;g.save();g.lineJoin='round';g.lineCap='round';
 const seg=(a,b,mode)=>{const c=clip(a,b,mode,W,H);if(!c)return;g.beginPath();g.moveTo(c[0].x,c[0].y);g.lineTo(c[1].x,c[1].y);stroke(g,s)};
 if(k==='trend'||k==='ray'||k==='ext'){seg(P[0],P[P.length-1],k==='trend'?'seg':k)}
 else if(k==='hline'){const y=Math.round(P[0].y)+.5;g.beginPath();g.moveTo(0,y);g.lineTo(W,y);stroke(g,s)}
 else if(k==='hray'){const y=Math.round(P[0].y)+.5;g.beginPath();g.moveTo(Math.max(0,P[0].x),y);g.lineTo(W,y);stroke(g,s)}
 else if(k==='vline'||k==='cross'){const x=Math.round(P[0].x)+.5;g.beginPath();g.moveTo(x,0);g.lineTo(x,H);stroke(g,s);if(k==='cross'){const y=Math.round(P[0].y)+.5;g.beginPath();g.moveTo(0,y);g.lineTo(W,y);stroke(g,s)}}
 else if(k==='channel'){const[a,b,c]=P,off=c.y-lineY(a,b,c.x),a2={x:a.x,y:a.y+off},b2={x:b.x,y:b.y+off};
  g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.lineTo(b2.x,b2.y);g.lineTo(a2.x,a2.y);g.closePath();g.fillStyle=rgba(s.c,.08);g.fill();
  g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);stroke(g,s);g.beginPath();g.moveTo(a2.x,a2.y);g.lineTo(b2.x,b2.y);stroke(g,s);
  g.beginPath();g.moveTo((a.x+a2.x)/2,(a.y+a2.y)/2);g.lineTo((b.x+b2.x)/2,(b.y+b2.y)/2);stroke(g,{...s,w:1,dash:1})}
 else if(k==='pitch'){const[a,b,c]=P,m={x:(b.x+c.x)/2,y:(b.y+c.y)/2},dx=m.x-a.x,dy=m.y-a.y;
  seg(a,m,'ray');seg(b,{x:b.x+dx,y:b.y+dy},'ray');seg(c,{x:c.x+dx,y:c.y+dy},'ray');
  g.beginPath();g.moveTo(b.x,b.y);g.lineTo(c.x,c.y);stroke(g,{...s,w:1,dash:1})}
 else if(k==='fib'||k==='fibx'){
  const lv=k==='fib'?FIB:FIBX,xs=P.map(q=>q.x);let l=Math.min(...xs),r=Math.max(...xs);if(r-l<80)r=l+80;if(d.s&&d.s.ext)r=W;
  const pr=lv.map(f=>k==='fib'?d.pts[1].p+(d.pts[0].p-d.pts[1].p)*f:d.pts[2].p+(d.pts[1].p-d.pts[0].p)*f);
  g.globalAlpha=.07;for(let i=0;i<lv.length-1;i++){g.fillStyle=FIBC[i%7];const y1=E.Y(pr[i]),y2=E.Y(pr[i+1]);g.fillRect(l,Math.min(y1,y2),r-l,Math.abs(y2-y1))}g.globalAlpha=1;
  lv.forEach((f,i)=>{const y=Math.round(E.Y(pr[i]))+.5;g.beginPath();g.moveTo(l,y);g.lineTo(r,y);stroke(g,{c:FIBC[i%7],w:d.s&&d.s.w||1,dash:0});g.fillStyle=FIBC[i%7];g.font='11px ui-monospace,Menlo,Consolas,monospace';g.textBaseline='bottom';g.fillText(f+'  ('+E.F(pr[i])+')',l+4,y-2)});
  g.beginPath();g.moveTo(P[0].x,P[0].y);g.lineTo(P[1].x,P[1].y);if(k==='fibx'){g.lineTo(P[2].x,P[2].y)}stroke(g,{c:'#8a93a0',w:1,dash:1})}
 else if(k==='rect'){const[a,b]=P,x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);g.fillStyle=rgba(s.c,.12);g.fillRect(x,y,w,h);g.beginPath();g.rect(x+.5,y+.5,w,h);stroke(g,s)}
 else if(k==='ellipse'){const[a,b]=P;g.beginPath();g.ellipse((a.x+b.x)/2,(a.y+b.y)/2,Math.max(1,Math.abs(b.x-a.x)/2),Math.max(1,Math.abs(b.y-a.y)/2),0,0,7);g.fillStyle=rgba(s.c,.12);g.fill();stroke(g,s)}
 else if(k==='tri'){g.beginPath();g.moveTo(P[0].x,P[0].y);P.slice(1).forEach(q=>g.lineTo(q.x,q.y));g.closePath();g.fillStyle=rgba(s.c,.12);g.fill();stroke(g,s)}
 else if(k==='brush'){g.beginPath();P.forEach((q,i)=>i?g.lineTo(q.x,q.y):g.moveTo(q.x,q.y));stroke(g,{...s,w:d.s&&d.s.w||2})}
 else if(k==='arrow'){const[a,b]=P,an=Math.atan2(b.y-a.y,b.x-a.x),h=10+s.w*2;g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);stroke(g,s);g.beginPath();g.moveTo(b.x,b.y);g.lineTo(b.x-h*Math.cos(an-.45),b.y-h*Math.sin(an-.45));g.lineTo(b.x-h*Math.cos(an+.45),b.y-h*Math.sin(an+.45));g.closePath();g.fillStyle=s.c;g.fill()}
 else if(k==='text'){const t=d.txt||'Teks';g.font='12px system-ui,sans-serif';const w=g.measureText(t).width+14;g.fillStyle=rgba(s.c,.18);g.beginPath();g.roundRect?g.roundRect(P[0].x,P[0].y-11,w,22,5):g.rect(P[0].x,P[0].y-11,w,22);g.fill();g.strokeStyle=s.c;g.lineWidth=1;g.stroke();g.fillStyle=E.col.ink;g.textBaseline='middle';g.fillText(t,P[0].x+7,P[0].y+.5)}
 else if(k==='measure'){const[a,b]=P,dp=d.pts[1].p-d.pts[0].p,pc=dp/d.pts[0].p*100,bars=Math.round(E.idx(d.pts[1].t)-E.idx(d.pts[0].t)),up=dp>=0,c=up?E.col.acc:E.col.dn;
  const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);g.fillStyle=rgba(up?'#4c9aff':'#ff6b6b',.14);g.fillRect(x,y,w,h);
  g.strokeStyle=up?'#4c9aff':'#ff6b6b';g.lineWidth=1;g.beginPath();g.moveTo((a.x+b.x)/2,a.y);g.lineTo((a.x+b.x)/2,b.y);g.moveTo(a.x,(a.y+b.y)/2);g.lineTo(b.x,(a.y+b.y)/2);g.stroke();
  const secs=Math.abs(d.pts[1].t-d.pts[0].t),dur=secs>=86400?Math.round(secs/86400)+' hari':secs>=3600?Math.round(secs/3600)+' jam':Math.round(secs/60)+' mnt';
  tag(g,`${dp>=0?'+':'−'}${E.F(Math.abs(dp))} (${pc>=0?'+':'−'}${Math.abs(pc).toFixed(2)}%)  ${Math.abs(bars)} bar · ${dur}`,(a.x+b.x)/2,dp>=0?y-14:y+h+14,'#fff',up?'#2f6fd0':'#c94a4a','center')}
 else if(k==='long'||k==='short'){const[e,tp,sl]=P,l=Math.min(e.x,tp.x),w=Math.max(20,Math.abs(tp.x-e.x)),r=l+w,up=k==='long';
  const pe=d.pts[0].p,ptp=d.pts[1].p,psl=d.pts[2].p,rr=Math.abs(ptp-pe)/Math.max(1e-12,Math.abs(pe-psl));
  g.fillStyle='rgba(62,207,142,.2)';g.fillRect(l,Math.min(e.y,tp.y),w,Math.abs(tp.y-e.y));g.fillStyle='rgba(255,107,107,.2)';g.fillRect(l,Math.min(e.y,sl.y),w,Math.abs(sl.y-e.y));
  g.strokeStyle='#8a93a0';g.lineWidth=1;g.beginPath();g.moveTo(l,Math.round(e.y)+.5);g.lineTo(r,Math.round(e.y)+.5);g.stroke();
  const pc=v=>(Math.abs(v-pe)/pe*100).toFixed(2)+'%';
  tag(g,`Target ${E.F(ptp)} (${pc(ptp)})`,l+4,tp.y+(tp.y<e.y?-11:11),'#fff','#1f9e6a');tag(g,`Stop ${E.F(psl)} (${pc(psl)})`,l+4,sl.y+(sl.y<e.y?-11:11),'#fff','#c94a4a');
  tag(g,`${up?'Long':'Short'}  R:R ${rr.toFixed(2)}`,l+4,e.y,E.col.ink,E.col.bg)}
 g.restore()}

// label pada sumbu harga untuk garis horizontal dll. -> [{p, c}]
function axisLabels(d,E,sel){
 if(d.hide)return[];const s=S(d,E);
 if(d.k==='hline'||d.k==='hray'||d.k==='cross')return[{p:d.pts[0].p,c:s.c}];
 if((d.k==='long'||d.k==='short')&&sel)return[{p:d.pts[0].p,c:'#8a93a0'},{p:d.pts[1].p,c:'#1f9e6a'},{p:d.pts[2].p,c:'#c94a4a'}];
 return[]}

// ---------- handle dan hit-test ----------
function handles(d,E){
 const P=pts(d,E);
 if(d.k==='hline'||d.k==='hray')return[{x:Math.max(30,Math.min(E.w-30,P[0].x)),y:P[0].y,i:0}];
 if(d.k==='vline')return[{x:P[0].x,y:E.h/2,i:0}];
 if(d.k==='brush')return[{x:P[0].x,y:P[0].y,i:0},{x:P[P.length-1].x,y:P[P.length-1].y,i:P.length-1}];
 if(d.k==='long'||d.k==='short'){const[e,tp,sl]=P;return[{x:Math.min(e.x,tp.x),y:e.y,i:0},{x:Math.max(e.x,tp.x),y:tp.y,i:1},{x:Math.max(e.x,tp.x),y:sl.y,i:2}]}
 return P.map((q,i)=>({x:q.x,y:q.y,i}))}
// kembalikan {h:indeks handle} | {body:true} | null
// o={t,hr}: toleransi garis dan jari-jari handle (piksel). Bawaan 8/10 (mouse); layar sentuh memakai nilai lebih besar dari pemanggil.
function hit(d,E,mx,my,o){
 if(d.hide)return null;const HR=o&&o.hr||10;
 for(const h of handles(d,E))if(Math.hypot(h.x-mx,h.y-my)<=HR)return{h:h.i};
 const P=pts(d,E),k=d.k,W=E.w,H=E.h,T=o&&o.t||8;
 const onSeg=(a,b,mode)=>{const c=clip(a,b,mode,W,H);return!!c&&segDist(mx,my,c[0].x,c[0].y,c[1].x,c[1].y)<T};
 const inBox=(a,b,m=0)=>mx>=Math.min(a.x,b.x)-m&&mx<=Math.max(a.x,b.x)+m&&my>=Math.min(a.y,b.y)-m&&my<=Math.max(a.y,b.y)+m;
 let ok=false;
 if(k==='trend'||k==='ray'||k==='ext')ok=onSeg(P[0],P[1],k==='trend'?'seg':k);
 else if(k==='hline')ok=Math.abs(P[0].y-my)<T;
 else if(k==='hray')ok=Math.abs(P[0].y-my)<T&&mx>=P[0].x-T;
 else if(k==='vline')ok=Math.abs(P[0].x-mx)<T;
 else if(k==='cross')ok=Math.abs(P[0].x-mx)<T||Math.abs(P[0].y-my)<T;
 else if(k==='channel'){const[a,b,c]=P,off=c.y-lineY(a,b,c.x);ok=segDist(mx,my,a.x,a.y,b.x,b.y)<T||segDist(mx,my,a.x,a.y+off,b.x,b.y+off)<T}
 else if(k==='pitch'){const[a,b,c]=P,m={x:(b.x+c.x)/2,y:(b.y+c.y)/2},dx=m.x-a.x,dy=m.y-a.y;ok=onSeg(a,m,'ray')||onSeg(b,{x:b.x+dx,y:b.y+dy},'ray')||onSeg(c,{x:c.x+dx,y:c.y+dy},'ray')}
 else if(k==='fib'||k==='fibx'){const xs=P.map(q=>q.x);let l=Math.min(...xs),r=Math.max(...xs);if(r-l<80)r=l+80;if(d.s&&d.s.ext)r=W;
  const lv=k==='fib'?FIB:FIBX;ok=mx>=l&&mx<=r&&lv.some(f=>Math.abs(E.Y(k==='fib'?d.pts[1].p+(d.pts[0].p-d.pts[1].p)*f:d.pts[2].p+(d.pts[1].p-d.pts[0].p)*f)-my)<T)}
 else if(k==='rect'||k==='ellipse'||k==='measure'||k==='long'||k==='short'){
  if(k==='long'||k==='short'){const l=Math.min(P[0].x,P[1].x),r=l+Math.max(20,Math.abs(P[1].x-P[0].x));ok=mx>=l&&mx<=r&&my>=Math.min(P[1].y,P[2].y)-2&&my<=Math.max(P[1].y,P[2].y)+2}
  else ok=inBox(P[0],P[1],3)}
 else if(k==='tri'){const[a,b,c]=P;ok=[[a,b],[b,c],[c,a]].some(([p,q])=>segDist(mx,my,p.x,p.y,q.x,q.y)<T)||pointInTri(mx,my,a,b,c)}
 else if(k==='brush'){for(let i=1;i<P.length;i++)if(segDist(mx,my,P[i-1].x,P[i-1].y,P[i].x,P[i].y)<T){ok=true;break}}
 else if(k==='arrow')ok=segDist(mx,my,P[0].x,P[0].y,P[1].x,P[1].y)<T;
 else if(k==='text')ok=mx>=P[0].x-3&&mx<=P[0].x+(d.txt||'Teks').length*7+18&&Math.abs(my-P[0].y)<13;
 return ok?{body:true}:null}
function pointInTri(px,py,a,b,c){const s=(p,q,r)=>(p.x-r.x)*(q.y-r.y)-(q.x-r.x)*(p.y-r.y),p={x:px,y:py},d1=s(p,a,b),d2=s(p,b,c),d3=s(p,c,a);return!((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0))}

// ---------- tampilan seleksi ----------
// Titik pegangan yang TERLIHAT: tanpa ini pengguna tidak tahu di mana harus menarik untuk mengubah gambar.
// sel=true: gambar terpilih (lingkaran putih besar; hot = handle yang sedang disorot membesar). sel=false: petunjuk ringan saat kursor melintas. n: hanya handle ke-0..n-1 (titik yang sudah ditaruh saat menggambar).
function drawHandles(g,d,E,hot,sel,n){
 if(d.hide)return;g.save();
 for(const h of handles(d,E)){if(n!=null&&h.i>=n)continue;const on=hot===h.i,r=sel?(on?7:5.5):3.5;
  if(sel&&on){g.beginPath();g.arc(h.x,h.y,12,0,7);g.fillStyle=rgba(E.col.acc,.22);g.fill()}
  g.beginPath();g.arc(h.x,h.y,r,0,7);g.globalAlpha=sel?1:.75;g.fillStyle=sel?'#fff':E.col.acc;g.fill();g.globalAlpha=1;g.lineWidth=2;g.strokeStyle=E.col.acc;g.stroke()}
 g.restore()}
// bentuk kursor yang memberi tahu apa yang akan terjadi bila ditekan: handle = ubah bentuk, badan = pindah
function cursorOf(d,h){
 if(h.h!=null||d.lock)return'pointer';
 if(d.k==='hline'||d.k==='hray')return'ns-resize';if(d.k==='vline')return'ew-resize';return'move'}

// ---------- ubah ----------
// geser handle i ke titik pt (aturan khusus long/short: target dan stop berbagi waktu; stop harus di sisi berlawanan)
function moveHandle(d,i,pt){
 if(d.k==='long'||d.k==='short'){const up=d.k==='long',e=d.pts[0];
  if(i===0){const dt=pt.t-e.t,dp=pt.p-e.p;d.pts.forEach(q=>{q.t+=dt;q.p+=dp})}
  else if(i===1){let p=pt.p;if(up?p<=e.p:p>=e.p)p=d.pts[1].p;const t=pt.t;d.pts[1]={t,p};d.pts[2]={t,p:d.pts[2].p}}
  else{let p=pt.p;if(up?p>=e.p:p<=e.p)p=d.pts[2].p;d.pts[2]={t:d.pts[2].t,p}}
  return}
 d.pts[i]={t:pt.t,p:pt.p}}
const translate=(d,dt,dp)=>d.pts.forEach(q=>{q.t+=dt;q.p+=dp});
const clone=d=>({...JSON.parse(JSON.stringify(d)),id:uid()});
const needsText=k=>k==='text';

return{TOOLS,BY:BYK,GROUPS,COLORS,NOCOLOR,create,complete,ready,render,axisLabels,handles,hit,drawHandles,cursorOf,moveHandle,translate,clone,needsText,uid,clip,segDist,rgba};
})();
