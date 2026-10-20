// Background animasi (canvas #bg): Angin, Hutan, Laut, dan gambar buatan pengguna.
// Satu-satunya yang diekspor: Bg.load() (muat ulang gambar custom setelah diubah di Setting).
const Bg=(()=>{
let bgImg=null;
function load(){let u=null;try{u=localStorage.getItem('bg.img')}catch(e){}if(!u){bgImg=null;return}const i=new Image();i.onload=()=>{bgImg=i};i.src=u}
load();if(S.bg==='custom'&&!(()=>{try{return localStorage.getItem('bg.img')}catch(e){}})())S.bg='angin';
const cv=$('#bg'),g=cv.getContext('2d');let W,H,T=0,last=0;
function size(){const d=Math.min(devicePixelRatio||1,1.5);W=cv.width=innerWidth*d;H=cv.height=innerHeight*d}addEventListener('resize',size);size();
const R=()=>Math.random(),leaves=[...Array(26)].map(()=>({x:R(),y:R(),s:.5+R(),p:R()*6})),streaks=[...Array(46)].map(()=>({x:R(),y:R(),l:.12+R()*.22,s:.03+R()*.05,a:6+R()*16,p:R()*6}));
const sky=(a,b)=>{const q=g.createLinearGradient(0,0,0,H);q.addColorStop(0,a);q.addColorStop(1,b);g.fillStyle=q;g.fillRect(0,0,W,H)};
const lay=(base,amp,fr,sp,col,ph)=>{g.fillStyle=col;g.beginPath();g.moveTo(0,H);for(let x=0;x<=W;x+=12)g.lineTo(x,H*base+Math.sin(x/W*fr+T*sp+ph)*amp*H+Math.sin(x/W*fr*2.3+ph)*amp*H*.4);g.lineTo(W,H);g.fill()};
function paint(){const m=S.bg;
 if(m==='angin'){sky('#26384d','#9fb1bd');g.strokeStyle='rgba(255,255,255,.22)';g.lineWidth=1.3;streaks.forEach(s=>{const x=((s.x+T*s.s)%1.3-.15)*W,y=s.y*H*.85;g.beginPath();g.moveTo(x,y);for(let k=1;k<=10;k++)g.lineTo(x+k*s.l*W/10,y+Math.sin(k*.6+T*1.2+s.p)*s.a);g.stroke()});lay(.88,.015,7,.4,'#1a2a2c',1);lay(.94,.012,5,.3,'#101c1e',3)}
 else if(m==='hutan'){sky('#1b3a3a','#c0cfa6');lay(.6,.05,5,.2,'#5b8466',0);lay(.7,.05,6,.25,'#41694f',2);lay(.8,.045,4,.3,'#2c4f3b',4);lay(.9,.04,7,.35,'#1b3528',6);g.fillStyle='rgba(240,230,170,.7)';leaves.forEach(l=>{const x=((l.x+T*.02*l.s)%1.1-.05)*W,y=(l.y+Math.sin(T*.5+l.p)*.03)*H;g.save();g.translate(x,y);g.rotate(T*l.s+l.p);g.beginPath();g.ellipse(0,0,6*l.s,3*l.s,0,0,7);g.fill();g.restore()})}
 else if(m==='custom'){sky('#10151b','#16202b');if(bgImg){const s=Math.max(W/bgImg.width,H/bgImg.height)*1.06,w=bgImg.width*s,h=bgImg.height*s,dx=(w-W)/2,dy=(h-H)/2;g.drawImage(bgImg,-dx+Math.sin(T*.08)*dx*.8,-dy+Math.cos(T*.06)*dy*.8,w,h);g.fillStyle='rgba(6,10,16,.25)';g.fillRect(0,0,W,H)}}
 else{sky('#0e2036','#33627f');[[.62,'rgba(120,170,200,.25)'],[.7,'rgba(70,120,160,.4)'],[.8,'rgba(30,70,110,.6)'],[.9,'rgba(14,38,66,.85)']].forEach((a,i)=>lay(a[0],.02,9-i,.6+i*.15,a[1],i*2))}}
function frame(ts){const dt=(ts-last)/1000||0;last=ts;if(!S.still)T+=Math.min(dt,.1);paint();requestAnimationFrame(frame)}requestAnimationFrame(frame);
return{load}})();
