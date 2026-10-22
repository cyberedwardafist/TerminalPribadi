// Background animasi (canvas #bg): 13 pemandangan bawaan + gambar buatan pengguna.
// Diekspor: Bg.load() (muat ulang gambar custom setelah diubah di Setting) dan Bg.list (id, nama, gradien pratinjau) dipakai halaman Setting.
// Menambah pemandangan baru: tambah satu entri di LIST dan satu fungsi di SCENES, lalu daftarkan id-nya di
// lib/routes/user.js (BACKGROUNDS), setting/pages/data.js (OK_BG), dan auth/auth.css.
const Bg=(()=>{
let bgImg=null;
function load(){let u=null;try{u=localStorage.getItem('bg.img')}catch(e){}if(!u){bgImg=null;return}const i=new Image();i.onload=()=>{bgImg=i};i.src=u}
load();if(S.bg==='custom'&&!(()=>{try{return localStorage.getItem('bg.img')}catch(e){}})())S.bg='angin';
const cv=$('#bg'),g=cv.getContext('2d');let W,H,T=0,last=0;
function size(){const d=Math.min(devicePixelRatio||1,1.5);W=cv.width=innerWidth*d;H=cv.height=innerHeight*d}addEventListener('resize',size);size();
const R=()=>Math.random(),many=(n,f)=>[...Array(n)].map(f);
const LIST=[
 ['angin','Angin','linear-gradient(#26384d,#9fb1bd)'],
 ['hutan','Hutan','linear-gradient(#1b3a3a,#5b8466 60%,#1b3528)'],
 ['laut','Laut','linear-gradient(#0e2036,#33627f 55%,#14264a)'],
 ['senja','Senja','linear-gradient(#2b1b4a,#c4486b 55%,#ffb97a)'],
 ['malam','Malam','linear-gradient(#04060d,#1a2444 70%,#0b1020)'],
 ['aurora','Aurora','linear-gradient(#050a14,#0f6b5c 55%,#5b2a86 85%,#050a14)'],
 ['gunung','Gunung','linear-gradient(#243b55,#e7b88f 55%,#2a3340)'],
 ['gurun','Gurun','linear-gradient(#f2a65a,#fbe3b0 55%,#c9803d)'],
 ['hujan','Hujan','linear-gradient(#171d26,#4b5966)'],
 ['salju','Salju','linear-gradient(#2a3b55,#cfdceb 70%,#f4f8fc)'],
 ['kota','Kota','linear-gradient(#0a0f24,#3a2a5c 55%,#c4527a)'],
 ['sakura','Sakura','linear-gradient(#f2b6c6,#fbe3ea 60%,#b97a95)'],
 ['galaksi','Galaksi','linear-gradient(#07040f,#2a1360 55%,#0a1a3a)']
];
// ---------- elemen bersama ----------
const stars=many(110,()=>({x:R(),y:R()*.7,r:.4+R()*1.1,p:R()*6,s:.6+R()*2})),
 leaves=many(26,()=>({x:R(),y:R(),s:.5+R(),p:R()*6})),
 streaks=many(46,()=>({x:R(),y:R(),l:.12+R()*.22,s:.03+R()*.05,a:6+R()*16,p:R()*6})),
 drops=many(150,()=>({x:R(),y:R(),l:.02+R()*.03,s:.9+R()*.8})),
 flakes=many(90,()=>({x:R(),y:R(),r:1+R()*2.6,s:.04+R()*.07,p:R()*6})),
 petals=many(46,()=>({x:R(),y:R(),s:.5+R()*.9,p:R()*6})),
 clouds=many(7,()=>({x:R(),y:.08+R()*.3,w:.14+R()*.2,s:.004+R()*.01})),
 city=[0,1].map(k=>{const a=[];let x=0;while(x<1.4){const w=.025+R()*.045,h=(k?.14:.08)+R()*(k?.2:.16);a.push({x,w,h,win:many(30,()=>R()>.55?R():-1)});x+=w+.002}return a});
const sky=(...c)=>{const q=g.createLinearGradient(0,0,0,H);c.forEach((s,i)=>q.addColorStop(i/(c.length-1),s));g.fillStyle=q;g.fillRect(0,0,W,H)};
const lay=(base,amp,fr,sp,col,ph)=>{g.fillStyle=col;g.beginPath();g.moveTo(0,H);for(let x=0;x<=W;x+=12)g.lineTo(x,H*base+Math.sin(x/W*fr+T*sp+ph)*amp*H+Math.sin(x/W*fr*2.3+ph)*amp*H*.4);g.lineTo(W,H);g.fill()};
const peaks=(base,amp,fr,col,ph,drift)=>{g.fillStyle=col;g.beginPath();g.moveTo(0,H);for(let x=0;x<=W;x+=10){const u=x/W*fr+ph+T*drift;g.lineTo(x,H*base-(Math.abs(Math.sin(u))*.7+Math.abs(Math.sin(u*2.7+1))*.3)*amp*H)}g.lineTo(W,H);g.fill()};
const glow=(x,y,r,c0,c1)=>{const q=g.createRadialGradient(x,y,0,x,y,r);q.addColorStop(0,c0);q.addColorStop(1,c1);g.fillStyle=q;g.fillRect(x-r,y-r,r*2,r*2)};
const stars$=(k=1)=>{stars.forEach(s=>{g.fillStyle='rgba(255,255,255,'+(k*(.35+.55*Math.abs(Math.sin(T*s.s*.5+s.p))))+')';g.beginPath();g.arc(s.x*W,s.y*H,s.r*(H/700+.4),0,7);g.fill()})};
const cloud$=(col,k=1)=>{g.fillStyle=col;clouds.forEach(c=>{const x=((c.x+T*c.s)%1.5-.25)*W,y=c.y*H,w=c.w*W;g.globalAlpha=k;g.beginPath();g.ellipse(x,y,w,w*.1,0,0,7);g.ellipse(x+w*.4,y-w*.05,w*.5,w*.09,0,0,7);g.ellipse(x-w*.45,y+w*.02,w*.5,w*.07,0,0,7);g.fill()});g.globalAlpha=1};
const SCENES={
 angin(){sky('#26384d','#9fb1bd');g.strokeStyle='rgba(255,255,255,.22)';g.lineWidth=1.3;streaks.forEach(s=>{const x=((s.x+T*s.s)%1.3-.15)*W,y=s.y*H*.85;g.beginPath();g.moveTo(x,y);for(let k=1;k<=10;k++)g.lineTo(x+k*s.l*W/10,y+Math.sin(k*.6+T*1.2+s.p)*s.a);g.stroke()});lay(.88,.015,7,.4,'#1a2a2c',1);lay(.94,.012,5,.3,'#101c1e',3)},
 hutan(){sky('#1b3a3a','#c0cfa6');lay(.6,.05,5,.2,'#5b8466',0);lay(.7,.05,6,.25,'#41694f',2);lay(.8,.045,4,.3,'#2c4f3b',4);lay(.9,.04,7,.35,'#1b3528',6);g.fillStyle='rgba(240,230,170,.7)';leaves.forEach(l=>{const x=((l.x+T*.02*l.s)%1.1-.05)*W,y=(l.y+Math.sin(T*.5+l.p)*.03)*H;g.save();g.translate(x,y);g.rotate(T*l.s+l.p);g.beginPath();g.ellipse(0,0,6*l.s,3*l.s,0,0,7);g.fill();g.restore()})},
 laut(){sky('#0e2036','#33627f');[[.62,'rgba(120,170,200,.25)'],[.7,'rgba(70,120,160,.4)'],[.8,'rgba(30,70,110,.6)'],[.9,'rgba(14,38,66,.85)']].forEach((a,i)=>lay(a[0],.02,9-i,.6+i*.15,a[1],i*2))},
 senja(){sky('#2b1b4a','#7a2f6b','#e0566a','#ffb97a','#ffd9a0');const sy=H*(.66+Math.sin(T*.05)*.01);glow(W*.5,sy,H*.55,'rgba(255,214,150,.9)','rgba(255,150,100,0)');g.fillStyle='#fff1c9';g.beginPath();g.arc(W*.5,sy,H*.075,0,7);g.fill();cloud$('rgba(255,170,150,.45)');lay(.74,.02,6,.3,'rgba(120,40,90,.75)',0);lay(.82,.025,5,.35,'#4a1d52',2);lay(.9,.025,7,.4,'#2a1236',4)},
 malam(){sky('#04060d','#0f1730','#1a2444');stars$();const mx=W*.78,my=H*.2;glow(mx,my,H*.22,'rgba(210,225,255,.35)','rgba(210,225,255,0)');g.fillStyle='#eef3ff';g.beginPath();g.arc(mx,my,H*.04,0,7);g.fill();g.fillStyle='#04060d';g.beginPath();g.arc(mx+H*.016,my-H*.008,H*.036,0,7);g.fill();lay(.84,.03,4,.15,'#0a1022',1);lay(.92,.03,6,.2,'#050813',3)},
 aurora(){sky('#030811','#0a1c2c','#0c2a30');stars$(.8);g.globalCompositeOperation='lighter';[['rgba(60,255,170,.5)',.3,.0],['rgba(90,140,255,.38)',.36,2],['rgba(200,90,255,.3)',.26,4]].forEach((b,i)=>{const h=H*.38,q=g.createLinearGradient(0,0,0,h);q.addColorStop(0,'rgba(0,0,0,0)');q.addColorStop(.35,b[0]);q.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=q;for(let x=0;x<W;x+=8){const y=H*b[1]+Math.sin(x/W*5+T*.35+b[2])*H*.06+Math.sin(x/W*11-T*.5+b[2])*H*.02,k=.55+.45*Math.sin(x/W*17+T*.8+i);g.setTransform(1,0,0,1,0,y-h*.5);g.globalAlpha=k;g.fillRect(x,0,8,h)}g.setTransform(1,0,0,1,0,0);g.globalAlpha=1});g.globalCompositeOperation='source-over';peaks(.97,.14,3,'#05090f',1,0);lay(.95,.02,4,.1,'#04070c',2)},
 gunung(){sky('#243b55','#8a7b9b','#e7b88f');glow(W*.7,H*.52,H*.35,'rgba(255,225,170,.55)','rgba(255,200,140,0)');peaks(.78,.34,3.2,'#6b6f8c',.3,.01);peaks(.86,.3,4.1,'#464e68',2.1,.015);peaks(.95,.26,5.3,'#2a3040',4.4,.02);g.fillStyle='rgba(255,255,255,.16)';for(let i=0;i<4;i++){const x=((i*.31+T*.006)%1.4-.2)*W;g.beginPath();g.ellipse(x,H*(.62+i*.06),W*.2,H*.018,0,0,7);g.fill()}},
 gurun(){sky('#f2a65a','#f9cf8a','#fde8b0');const sx=W*.72,sy=H*.3;glow(sx,sy,H*.5,'rgba(255,245,200,.85)','rgba(255,220,150,0)');g.fillStyle='#fffbe6';g.beginPath();g.arc(sx,sy,H*.06,0,7);g.fill();lay(.68,.03,4,.08,'#e3a15a',0);lay(.78,.04,3.4,.1,'#c9803d',2);lay(.88,.04,4.6,.12,'#a5622c',4);lay(.96,.03,3,.14,'#7a4520',6)},
 hujan(){sky('#10151d','#2c3643','#56646f');cloud$('rgba(20,26,34,.65)',1);g.strokeStyle='rgba(190,215,235,.34)';g.lineWidth=1.2;g.beginPath();drops.forEach(d=>{const y=((d.y+T*d.s*.9)%1.1-.05)*H,x=((d.x-T*d.s*.1)%1.1+1.1)%1.1*W-W*.03;g.moveTo(x,y);g.lineTo(x-d.l*W*.12,y+d.l*H*1.4)});g.stroke();lay(.9,.012,6,.5,'rgba(18,24,31,.9)',0);lay(.95,.01,8,.7,'#0c1117',2);g.strokeStyle='rgba(190,215,235,.14)';g.lineWidth=1;for(let i=0;i<7;i++){const p=(T*.7+i*.37)%1,x=((i*.619)%1)*W,y=H*(.93+(i%3)*.02);g.beginPath();g.ellipse(x,y,p*W*.025,p*H*.006,0,0,7);g.stroke()}},
 salju(){sky('#243651','#7f98b6','#d6e2ef');g.fillStyle='rgba(255,255,255,.88)';flakes.forEach(f=>{const x=((f.x+Math.sin(T*.4+f.p)*.02)%1+1)%1*W,y=((f.y+T*f.s)%1.05-.025)*H;g.beginPath();g.arc(x,y,f.r*(H/700+.4),0,7);g.fill()});lay(.82,.025,4,.1,'#dbe6f1',0);lay(.9,.03,5,.12,'#eef4fa',2);lay(.97,.02,3,.14,'#ffffff',4)},
 kota(){sky('#070a1c','#2a2150','#a8467a','#f08a7a');stars$(.5);city.forEach((row,k)=>{const sp=(k?.01:.004),ox=-((T*sp)%.4)*W;g.fillStyle=k?'#10122a':'#1c1a40';row.forEach(b=>{const x=ox+b.x*W,bw=b.w*W,bh=b.h*H;g.fillRect(x,H-bh,bw,bh);b.win.forEach((v,i)=>{if(v<0)return;const cx=x+bw*.15+(i%4)*bw*.22,cy=H-bh+bh*.08+Math.floor(i/4)*bh*.11;if(cy>H-4)return;g.fillStyle='rgba(255,215,130,'+(.25+.6*(.5+.5*Math.sin(T*.3+v*40)))+')';g.fillRect(cx,cy,bw*.1,bh*.05);g.fillStyle=k?'#10122a':'#1c1a40'})})});},
 sakura(){sky('#f2b6c6','#f9d6df','#fdeef2');glow(W*.2,H*.18,H*.5,'rgba(255,255,255,.6)','rgba(255,255,255,0)');lay(.78,.03,4,.15,'rgba(214,150,175,.7)',0);lay(.87,.035,5,.2,'#c58ba6',2);lay(.95,.03,6,.25,'#9b5f7c',4);petals.forEach(p=>{const x=((p.x+T*.018*p.s+Math.sin(T*.4+p.p)*.02)%1.1-.05)*W,y=((p.y+T*.03*p.s)%1.1-.05)*H;g.save();g.translate(x,y);g.rotate(T*.8*p.s+p.p);g.fillStyle='rgba(255,'+(170+p.s*30|0)+',200,.85)';g.beginPath();g.ellipse(0,0,7*p.s,3.6*p.s,0,0,7);g.fill();g.restore()})},
 galaksi(){sky('#05030c','#150a33','#07102a');[[.25,.3,.5,'rgba(150,60,220,.38)'],[.7,.45,.55,'rgba(40,120,230,.32)'],[.5,.72,.45,'rgba(230,70,150,.26)']].forEach((n,i)=>{glow(W*(n[0]+Math.sin(T*.05+i*2)*.04),H*(n[1]+Math.cos(T*.04+i)*.03),H*n[2],n[3],'rgba(0,0,0,0)')});g.save();g.translate(W*.5,H*.5);g.rotate(-.5);g.fillStyle='rgba(220,200,255,.07)';g.beginPath();g.ellipse(0,0,W*.7,H*.09,0,0,7);g.fill();g.restore();stars$()},
 custom(){sky('#10151b','#16202b');if(bgImg){const s=Math.max(W/bgImg.width,H/bgImg.height)*1.06,w=bgImg.width*s,h=bgImg.height*s,dx=(w-W)/2,dy=(h-H)/2;g.drawImage(bgImg,-dx+Math.sin(T*.08)*dx*.8,-dy+Math.cos(T*.06)*dy*.8,w,h);g.fillStyle='rgba(6,10,16,.25)';g.fillRect(0,0,W,H)}}
};
function frame(ts){const dt=(ts-last)/1000||0;last=ts;if(!S.still)T+=Math.min(dt,.1);(SCENES[S.bg]||SCENES.laut)();requestAnimationFrame(frame)}requestAnimationFrame(frame);
return{load,list:LIST}})();
