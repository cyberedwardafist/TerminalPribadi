// Mesin gambar chart (canvas): panel harga + panel indikator terpisah, sumbu (linear/log/persen), crosshair, gambar, alert.
// ChartRender.draw(w,T,deps) menggambar satu frame dan menyimpan geometri di w._g untuk interaksi (chart.js).
// deps: {series(inst)->{p,series,def}|null, drawings()->[...], alerts()->[{id,price}], now()}
const ChartRender=(()=>{
const TFS={'1m':60,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1D':86400,'1W':604800,'1M':2592000};
const MO=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const MONO='ui-monospace,Menlo,Consolas,monospace';
const PR=76,TB=26,MINSUB=64;
const niceStep=r=>{const p=Math.pow(10,Math.floor(Math.log10(r))),m=r/p;return(m<1.5?1:m<3?2:m<7?5:10)*p};
const hex2=c=>c;
function decimals(sym,price,mkt){
 if(mkt==='idx')return 0;
 if(/^[A-Z]{6}$/.test(sym)&&!/XAU|XAG|IDR|USDT/.test(sym))return/JPY/.test(sym)?3:5;
 const p=Math.abs(price)||1;return p<.1?6:p<1?5:p<10?4:2}
// indeks bar pecahan untuk waktu t (bar tidak harus berjarak tetap: akhir pekan, libur) dan sebaliknya
function idxOf(D,st,t){
 const n=D.length;if(t<=D[0].t)return(t-D[0].t)/st;if(t>=D[n-1].t)return n-1+(t-D[n-1].t)/st;
 let lo=0,hi=n-1;while(hi-lo>1){const m=(lo+hi)>>1;D[m].t<=t?lo=m:hi=m}
 return lo+(t-D[lo].t)/(D[hi].t-D[lo].t)}
function timeAt(D,st,j){const n=D.length;if(j<=0)return D[0].t+j*st;if(j>=n-1)return D[n-1].t+(j-(n-1))*st;const a=Math.floor(j),f=j-a;return D[a].t+(D[a+1].t-D[a].t)*f}

// Heikin Ashi
function haBars(D){let po,pc;return D.map((k,i)=>{const c=(k.o+k.h+k.l+k.c)/4,o=i?(po+pc)/2:(k.o+k.c)/2;po=o;pc=c;return{t:k.t,o,c,h:Math.max(k.h,o,c),l:Math.min(k.l,o,c),v:k.v}})}

function draw(w,T,deps){
 const cv=w.querySelector('canvas');if(!T||!cv)return;
 const dp=devicePixelRatio||1,W=cv.clientWidth,H=cv.clientHeight;if(W<160||H<140)return;
 if(cv.width!==Math.round(W*dp)||cv.height!==Math.round(H*dp)){cv.width=Math.round(W*dp);cv.height=Math.round(H*dp)}
 const x=cv.getContext('2d');x.setTransform(dp,0,0,dp,0,0);x.clearRect(0,0,W,H);
 const cs=getComputedStyle(w),gv=n=>cs.getPropertyValue(n).trim();
 const col={up:gv('--up'),dn:gv('--dn'),line:gv('--line'),mute:gv('--mute'),ink:gv('--ink'),bg:gv('--win'),acc:gv('--acc')};
 x.font='11px '+MONO;x.textBaseline='middle';
 const D=T.D;if(!D||!D.length){x.fillStyle=col.mute;x.fillText(T.err||'Memuat data…',16,24);w._g=null;return}
 const st=TFS[T.tf]||3600,mkt=((typeof WATCH!=='undefined'&&WATCH.find(r=>r[0]===T.sym))||[])[4];
 const last=D[D.length-1],dc=decimals(T.sym,last.c,mkt),F=v=>v.toLocaleString('id-ID',{minimumFractionDigits:dc,maximumFractionDigits:dc});
 const pw=W-PR,PH=H-TB,n=D.length;

 // ----- panel -----
 const insts=T.ind.filter(i=>i.on!==false),R=insts.map(i=>({i,r:deps.series(i)})).filter(o=>o.r);
 const subs=R.filter(o=>!o.r.def.overlay),overs=R.filter(o=>o.r.def.overlay);
 const mw=T.mw||4,tot=mw+subs.reduce((a,o)=>a+(o.i.h||1.3),0);
 let mH=Math.round(PH*mw/tot);const minMain=Math.round(PH*.4);
 const panes=[{k:'main',y0:0,h:mH}];
 if(subs.length){let sh=PH-mH;const each=subs.map(o=>Math.max(MINSUB,Math.round(PH*(o.i.h||1.3)/tot)));let sum=each.reduce((a,b)=>a+b,0);
  if(PH-sum<minMain){const k=(PH-minMain)/sum;each.forEach((v,i)=>each[i]=Math.max(40,Math.floor(v*k)));sum=each.reduce((a,b)=>a+b,0)}
  mH=PH-sum;panes[0].h=mH;let y=mH;subs.forEach((o,i)=>{panes.push({k:'sub',o,y0:y,h:each[i]});y+=each[i]})}
 const bw=pw/T.vis,rb=T.rb,X=i=>pw-(rb-i)*bw-bw/2,iX=px=>rb-(pw-bw/2-px)/bw;
 const i0=Math.max(0,Math.floor(iX(0))),i1=Math.min(n-1,Math.ceil(iX(pw)));
 const V=T.type==='ha'?(T._ha&&T._haN===n&&T._haC===last.c?T._ha:(T._haN=n,T._haC=last.c,T._ha=haBars(D))):D;
 const line=T.type==='line'||T.type==='area'||T.type==='base';
 const idx=t=>idxOf(D,st,t),tAt=j=>timeAt(D,st,j);

 // ----- skala harga utama -----
 const mode=T.scale||'lin',base=V[Math.max(0,Math.min(n-1,i0))].c||1;
 const vol=overs.find(o=>o.r.def.kind==='volume');
 let hi=-Infinity,lo=Infinity;
 for(let i=i0;i<=i1;i++){const k=V[i],a=line?k.c:k.h,b=line?k.c:k.l;if(a>hi)hi=a;if(b<lo)lo=b}
 for(const o of overs){if(o.r.def.kind==='volume')continue;for(const p of o.r.def.plots){const s=o.r.series[p.k];if(!s)continue;const sh=shOf(p,o.r.p);for(let i=i0;i<=i1;i++){const v=s[i-sh];if(v!=null&&isFinite(v)){if(v>hi)hi=v;if(v<lo)lo=v}}}for(const q of o.r.def.candles||[])for(let i=i0;i<=i1;i++){if(q.h[i]!=null&&q.h[i]>hi)hi=q.h[i];if(q.l[i]!=null&&q.l[i]<lo)lo=q.l[i]}}
 if(!(hi>lo)){hi=last.c*1.01;lo=last.c*.99}
 const tr=v=>mode==='log'?Math.log(Math.max(v,1e-12)):v;
 let hiT=tr(hi),loT=tr(lo);
 if(T.auto===false&&T.yr){hiT=T.yr[1];loT=T.yr[0]}
 else{const pad=(hiT-loT)*.06;hiT+=pad;loT-=pad;T.yr=[loT,hiT]}
 const span=hiT-loT||1,m0=mH*.02,m1=vol?mH*.84:mH*.98;
 const Y=v=>m0+(hiT-tr(v))/span*(m1-m0);
 const unT=t=>mode==='log'?Math.exp(t):t,P=y=>unT(hiT-(y-m0)/(m1-m0)*span);
 T._yrMain={hiT,loT,m0,m1};
 const pt=P(m0),pb=P(m1);
 const pctOf=v=>(v/base-1)*100,priceTxt=v=>mode==='pct'?(pctOf(v)>=0?'+':'−')+Math.abs(pctOf(v)).toFixed(2)+'%':F(v);

 // grid utama
 const ticksMain=[];
 if(mode==='pct'){const a=pctOf(pb),b=pctOf(pt),stp=niceStep((b-a)/Math.max(2,Math.floor((m1-m0)/56)));for(let q=Math.ceil(a/stp);q*stp<=b;q++)ticksMain.push(base*(1+q*stp/100))}
 else if(mode==='log'){const c=[];for(let e=Math.floor(Math.log10(Math.max(pb,1e-9)))-1;e<=Math.ceil(Math.log10(Math.max(pt,1e-9)));e++)for(const m of[1,2,2.5,5])c.push(m*Math.pow(10,e));let ly=1e9;c.filter(v=>v>=pb&&v<=pt).sort((a,b)=>b-a).forEach(v=>{const y=Y(v);if(Math.abs(y-ly)>=40){ticksMain.push(v);ly=y}})}
 else{const stp=niceStep((pt-pb)/Math.max(2,Math.floor((m1-m0)/56)));for(let q=Math.ceil(pb/stp);q*stp<=pt;q++)ticksMain.push(q*stp)}

 // sumbu waktu: indeks tick
 const ks=[1,2,3,5,10,15,20,30,50,100,200,500],kk=ks.find(k=>k>=110/bw)||500,tks=[];
 for(let i=Math.ceil(i0/kk)*kk;i<=i1;i+=kk)tks.push(i);

 // ----- latar grid semua panel -----
 x.save();x.beginPath();x.rect(0,0,pw,PH);x.clip();
 x.strokeStyle=col.line;x.lineWidth=1;x.globalAlpha=.5;
 for(const v of ticksMain){const y=Math.round(Y(v))+.5;x.beginPath();x.moveTo(0,y);x.lineTo(pw,y);x.stroke()}
 for(const i of tks){const px=Math.round(X(i))+.5;x.beginPath();x.moveTo(px,0);x.lineTo(px,PH);x.stroke()}
 x.globalAlpha=1;x.restore();

 // ----- panel utama: klip -----
 x.save();x.beginPath();x.rect(0,0,pw,mH);x.clip();
 // volume
 if(vol){let vm=1;for(let i=i0;i<=i1;i++)vm=Math.max(vm,D[i].v||0);const cw=Math.max(1,Math.floor(bw*.7));
  x.globalAlpha=.35;for(let i=i0;i<=i1;i++){const k=D[i],h=(k.v||0)/vm*mH*.14;x.fillStyle=k.c>=k.o?col.up:col.dn;x.fillRect(Math.round(X(i)-cw/2),mH*.985-h,cw,h)}x.globalAlpha=1;
  const ma=vol.r.series.ma;if(ma&&vol.r.p.ma){x.beginPath();let on=false;for(let i=i0;i<=i1;i++){const v=ma[i];if(v==null){on=false;continue}const px=X(i),py=mH*.985-v/vm*mH*.14;on?x.lineTo(px,py):x.moveTo(px,py);on=true}x.strokeStyle=vol.i.c&&vol.i.c.ma||vol.r.def.plots[0].c;x.lineWidth=1.2;x.stroke()}}
 // base line (untuk tipe baseline)
 const cw=Math.max(1,Math.floor(bw*.7));
 const BC=new Map();for(const o of overs){const d=o.r.def;drawBg(x,d,i0,i1,X,0,mH,bw);if(d.barcol)for(const q of d.barcol)BC.set(q[0],q[1])}
 if(T.type==='base'){const by=Y(base);x.save();x.beginPath();x.rect(0,0,pw,by);x.clip();x.beginPath();for(let i=i0;i<=i1;i++){const px=X(i),py=Y(V[i].c);i===i0?x.moveTo(px,py):x.lineTo(px,py)}x.lineTo(X(i1),by);x.lineTo(X(i0),by);x.closePath();x.fillStyle=col.up+'33';x.fill();x.restore();
  x.save();x.beginPath();x.rect(0,by,pw,mH);x.clip();x.beginPath();for(let i=i0;i<=i1;i++){const px=X(i),py=Y(V[i].c);i===i0?x.moveTo(px,py):x.lineTo(px,py)}x.lineTo(X(i1),by);x.lineTo(X(i0),by);x.closePath();x.fillStyle=col.dn+'33';x.fill();x.restore();
  x.setLineDash([3,3]);x.strokeStyle=col.mute;x.beginPath();x.moveTo(0,Math.round(by)+.5);x.lineTo(pw,Math.round(by)+.5);x.stroke();x.setLineDash([])}
 // seri harga
 if(line){
  const path=()=>{x.beginPath();for(let i=i0;i<=i1;i++){const px=X(i),py=Y(V[i].c);i===i0?x.moveTo(px,py):x.lineTo(px,py)}};
  if(T.type==='area'){path();const s=x.createLinearGradient(0,m0,0,m1);s.addColorStop(0,'rgba(76,154,255,.35)');s.addColorStop(1,'rgba(76,154,255,0)');x.lineTo(X(i1),m1);x.lineTo(X(i0),m1);x.closePath();x.fillStyle=s;x.fill()}
  path();x.strokeStyle='#4c9aff';x.lineWidth=1.8;x.lineJoin='round';x.stroke();x.lineWidth=1}
 else for(let i=i0;i<=i1;i++){const k=V[i],cx=Math.round(X(i)),u=k.c>=k.o,yh=Math.round(Y(k.h)),yl=Math.round(Y(k.l)),yo=Math.round(Y(k.o)),yc=Math.round(Y(k.c)),c=BC.get(i)||(u?col.up:col.dn);x.fillStyle=c;
  if(T.type==='bar'){const tk=Math.max(2,cw>>1);x.fillRect(cx,yh,1,Math.max(1,yl-yh));x.fillRect(cx-tk,yo,tk,1);x.fillRect(cx+1,yc,tk,1)}
  else if(T.type==='hollow'&&u){x.fillRect(cx,yh,1,Math.max(1,yl-yh));const bt=Math.min(yo,yc),bh=Math.max(1,Math.abs(yo-yc));if(cw>2){x.strokeStyle=c;x.strokeRect(cx-(cw>>1)+.5,bt+.5,cw-1,Math.max(0,bh-1))}else x.fillRect(cx-(cw>>1),bt,cw,bh)}
  else{x.fillRect(cx,yh,1,Math.max(1,yl-yh));x.fillRect(cx-(cw>>1),Math.min(yo,yc),cw,Math.max(1,Math.abs(yo-yc)))}}
 // overlay
 for(const o of overs){if(o.r.def.kind==='volume')continue;drawPlots(x,o,i0,i1,X,Y,col)}
 // custom: plotcandle, penanda, objek Pine
 for(const o of overs){const d=o.r.def;if(d.kind==='volume')continue;drawCan(x,d,i0,i1,X,Y,cw,col);drawMk(x,d,i0,i1,X,Y,V,null,col,mH);drawObjs(x,d,i0,i1,X,Y,V,pw,mH,col)}

 // gambar
 const E={g:x,X:t=>X(idx(t)),Y,T:px=>tAt(iX(px)),P,w:pw,h:mH,F,st,idx,col};
 const DR=deps.drawings();T._E=E;
 for(const d of DR)ChartDraw.render(x,d,E,d===T.sel);
 if(T.draft)ChartDraw.render(x,T.draft,E,true);
 // alert
 const AL=deps.alerts();
 for(const a of AL){const y=Math.round(Y(a.price))+.5;if(y<0||y>mH)continue;x.setLineDash([6,4]);x.strokeStyle='#e8a33d';x.beginPath();x.moveTo(0,y);x.lineTo(pw,y);x.stroke();x.setLineDash([]);
  const t='\u{1F514} '+F(a.price)+'  ×';x.font='11px '+MONO;const tw=x.measureText(t).width+10;x.fillStyle='#e8a33d';x.fillRect(pw-tw-6,y-9,tw,18);x.fillStyle='#1a1405';x.fillText(t,pw-tw-1,y+.5);a._box=[pw-tw-6,y-9,tw,18]}
 // harga terakhir
 const ly=Y(last.c),lu=last.c>=last.o;
 if(ly>0&&ly<mH){x.setLineDash([4,3]);x.strokeStyle=lu?col.up:col.dn;x.beginPath();x.moveTo(0,Math.round(ly)+.5);x.lineTo(pw,Math.round(ly)+.5);x.stroke();x.setLineDash([])}
 x.restore();

 // ----- panel indikator -----
 const subGeom=[];
 for(const pn of panes){if(pn.k!=='sub')continue;const o=pn.o,def=o.r.def,y0=pn.y0,h=pn.h,top=y0+6,hh=h-12;
  x.strokeStyle=col.line;x.lineWidth=1;x.beginPath();x.moveTo(0,y0+.5);x.lineTo(W,y0+.5);x.stroke();
  x.save();x.beginPath();x.rect(0,y0+1,pw,h-1);x.clip();
  let a,b;
  if(def.range){a=def.range[0];b=def.range[1]}
  else{a=Infinity;b=-Infinity;for(const p of def.plots){const s=o.r.series[p.k];if(!s)continue;const sh=shOf(p,o.r.p);for(let i=i0;i<=i1;i++){const v=s[i-sh];if(v!=null&&isFinite(v)){if(v<a)a=v;if(v>b)b=v}}if(p.t==='hist'||p.t==='area'){const z=p.base!=null?p.base:0;if(z<a)a=z;if(z>b)b=z}}
   for(const q of def.candles||[])for(let i=i0;i<=i1;i++){if(q.h[i]!=null&&q.h[i]>b)b=q.h[i];if(q.l[i]!=null&&q.l[i]<a)a=q.l[i]}
   for(const l of def.levels||[]){const lv=l.v??l;if(lv<a)a=lv;if(lv>b)b=lv}
   if(!(b>a)){a=(isFinite(a)?a:0)-1;b=(isFinite(b)?b:0)+1}const pd=(b-a)*.1;a-=pd;b+=pd}
  const SY=v=>top+(b-v)/(b-a)*hh,SP=y=>b-(y-top)/hh*(b-a);
  drawBg(x,def,i0,i1,X,y0+1,h-1,bw);
  if(def.band){x.fillStyle=ChartDraw.rgba('#8a93a0',.08);const y1=SY(def.band[1]),y2=SY(def.band[0]);x.fillRect(0,y1,pw,y2-y1)}
  x.strokeStyle=col.line;x.globalAlpha=.9;x.setLineDash([3,3]);for(const l of def.levels||[]){const lv=l.v??l,y=Math.round(SY(lv))+.5;x.beginPath();x.moveTo(0,y);x.lineTo(pw,y);if(l.c)x.strokeStyle=l.c;x.stroke();x.strokeStyle=col.line}x.setLineDash([]);x.globalAlpha=1;
  // baseline nol untuk histogram
  drawPlots(x,o,i0,i1,X,SY,col,{zero:SY(0),bw});drawCan(x,def,i0,i1,X,SY,cw,col);drawMk(x,def,i0,i1,X,SY,V,pn,col,0);drawObjs(x,def,i0,i1,X,SY,V,pw,h,col);
  x.restore();
  // tick sumbu
  const tk=def.range||def.levels?(def.levels||[]).map(l=>l.v??l):[],tv=tk.length?tk:(()=>{const s=niceStep((b-a)/Math.max(1,Math.floor(hh/34))),r=[];for(let q=Math.ceil(a/s);q*s<=b;q++)r.push(q*s);return r})();
  subGeom.push({pn,SY,SP,a,b,ticks:tv});pn.SY=SY;pn.SP=SP;pn.a=a;pn.b=b}

 // ----- sumbu kanan dan bawah -----
 x.fillStyle=col.bg;x.fillRect(pw,0,PR,H);x.fillRect(0,H-TB,W,TB);x.strokeStyle=col.line;x.beginPath();x.moveTo(pw+.5,0);x.lineTo(pw+.5,H);x.moveTo(0,H-TB+.5);x.lineTo(W,H-TB+.5);x.stroke();
 x.fillStyle=col.mute;
 for(const v of ticksMain){const y=Y(v);if(y>8&&y<mH-6)x.fillText(priceTxt(v),pw+8,y)}
 for(const g of subGeom)for(const v of g.ticks){const y=g.SY(v);if(y>g.pn.y0+6&&y<g.pn.y0+g.pn.h-4)x.fillText(Math.abs(v)>=1e6?(v/1e6).toFixed(1)+'M':Math.abs(v)>=1e4?(v/1e3).toFixed(0)+'K':String(+v.toFixed(2)),pw+8,y)}
 const tl=(t,full)=>{const a=new Date(t*1000),p=q=>String(q).padStart(2,'0'),dm=a.getDate()+' '+MO[a.getMonth()],yy=String(a.getFullYear()).slice(2);
  if(full)return st<86400?`${dm} '${yy} ${p(a.getHours())}:${p(a.getMinutes())}`:`${dm} '${yy}`;
  if(st<86400)return a.getHours()===0&&a.getMinutes()===0?dm:p(a.getHours())+':'+p(a.getMinutes());
  return st===86400?(a.getDate()===1?MO[a.getMonth()]+" '"+yy:dm):MO[a.getMonth()]+" '"+yy};
 x.textAlign='center';for(const i of tks){const px=X(i);if(px>24&&px<pw-24&&D[i])x.fillText(tl(D[i].t),px,H-TB/2)}x.textAlign='left';
 // label sumbu untuk garis horizontal dan posisi
 for(const d of DR){for(const l of ChartDraw.axisLabels(d,E,d===T.sel)){const y=Y(l.p);if(y<0||y>mH)continue;x.fillStyle=l.c;x.fillRect(pw,y-9,PR,18);x.fillStyle='#fff';x.fillText(priceTxt(l.p),pw+8,y)}}
 for(const a of AL){const y=Y(a.price);if(y<0||y>mH)continue;x.fillStyle='#e8a33d';x.fillRect(pw,y-9,PR,18);x.fillStyle='#1a1405';x.fillText(priceTxt(a.price),pw+8,y)}
 if(ly>0&&ly<mH){x.fillStyle=lu?col.up:col.dn;const rem=Math.max(0,last.t+st-deps.now()/1000);const cd=rem>0&&rem<st*1.01?(rem>=3600?Math.floor(rem/3600)+':'+String(Math.floor(rem%3600/60)).padStart(2,'0')+':'+String(Math.floor(rem%60)).padStart(2,'0'):String(Math.floor(rem/60)).padStart(2,'0')+':'+String(Math.floor(rem%60)).padStart(2,'0')):'';
  x.fillRect(pw,ly-(cd?15:9),PR,cd?32:18);x.fillStyle='#fff';x.fillText(priceTxt(last.c),pw+8,ly-(cd?6:0));if(cd){x.font='10px '+MONO;x.fillText(cd,pw+8,ly+8);x.font='11px '+MONO}}

 // ----- crosshair -----
 const m=T.m;let hv=n-1;
 if(m&&m.x>=0&&m.x<=pw&&m.y>=0&&m.y<PH&&!T._hideCross){
  hv=Math.max(0,Math.min(n-1,Math.round(iX(m.x))));const cx=Math.round(X(hv))+.5;
  x.strokeStyle=col.mute;x.setLineDash([3,3]);x.beginPath();x.moveTo(cx,0);x.lineTo(cx,PH);x.moveTo(0,Math.round(m.y)+.5);x.lineTo(pw,Math.round(m.y)+.5);x.stroke();x.setLineDash([]);
  let val=null,txt='';const pn=panes.find(p=>m.y>=p.y0&&m.y<p.y0+p.h);
  if(pn&&pn.k==='main'){val=P(m.y);txt=priceTxt(val)}else if(pn&&pn.SP){val=pn.SP(m.y);txt=Math.abs(val)>=1e4?(val/1e3).toFixed(1)+'K':val.toFixed(2)}
  if(val!=null){x.fillStyle=col.ink;x.fillRect(pw,m.y-9,PR,18);x.fillStyle=col.bg;x.fillText(txt,pw+8,m.y)}
  const lb=tl(D[hv].t,true),tw=x.measureText(lb).width+16,tx=Math.max(0,Math.min(pw-tw,cx-tw/2));x.fillStyle=col.ink;x.fillRect(tx,H-TB+1,tw,TB-2);x.fillStyle=col.bg;x.textAlign='center';x.fillText(lb,tx+tw/2,H-TB/2);x.textAlign='left'}
 // pemisah panel (pegangan seret)
 w._g={X,iX,Y,P,pw,PH,mH,bw,st,D,V,idx,tAt,F,i0,i1,hv,panes,E,col,mode,base,priceTxt,W,H};
 return{hv,R,V,mode,F}}

// gambar semua plot satu indikator pada panel dengan fungsi skala Yf
const shOf=(pl,p)=>(pl.shift?pl.shift(p):0)+(pl.off||0);
function drawPlots(x,o,i0,i1,X,Yf,col,opt={}){
 const def=o.r.def,p=o.r.p,S=o.r.series,cl=k=>o.i.c&&o.i.c[k];
 // isian antar plot (bawaan: a/b = kunci seri; Pine: boleh konstanta va/vb dan warna per bar)
 for(const f of def.fills||[]){const A=f.a?S[f.a]:null,B=f.b?S[f.b]:null;if(!A&&f.va==null||!B&&f.vb==null)continue;const pa=f.a&&def.plots.find(q=>q.k===f.a),sh=pa?shOf(pa,p):0;
  const ga=j=>A?A[j]:f.va,gb=j=>B?B[j]:f.vb;
  for(let i=i0+1;i<=i1;i++){const j=i-sh,a1=ga(j),b1=gb(j),a0=ga(j-1),b0=gb(j-1);if(a1==null||b1==null||a0==null||b0==null)continue;
   const fc=f.cols?f.cols[i]:f.c!==undefined?f.c:(a1>=b1?f.up:f.dn);if(!fc)continue;
   x.fillStyle=fc;x.beginPath();x.moveTo(X(i-1),Yf(a0));x.lineTo(X(i),Yf(a1));x.lineTo(X(i),Yf(b1));x.lineTo(X(i-1),Yf(b0));x.closePath();x.fill()}}
 for(const pl of def.plots){
  const s=S[pl.k];if(!s)continue;const sh=shOf(pl,p),c=cl(pl.k)||pl.c,t=pl.t||'line',cs=pl.cols,cAt=i=>cs?cs[i-(pl.off||0)]:c;
  if(t==='hist'){const z=pl.base!=null?Yf(pl.base):(opt.zero??Yf(0)),bw=Math.max(1,Math.floor((opt.bw||4)*.7));for(let i=i0;i<=i1;i++){const v=s[i-sh];if(v==null)continue;
    if(pl.px||cs){const fc=cs?cs[i-sh]:c;if(!fc)continue;x.globalAlpha=1;x.fillStyle=fc}
    else{const pv=s[i-sh-1];x.globalAlpha=pv!=null&&Math.abs(v)<Math.abs(pv)?.45:.85;x.fillStyle=v>=0?(cl(pl.k)||pl.c):(pl.c2||'#ff6b6b')}
    const y=Yf(v);x.fillRect(Math.round(X(i)-bw/2),Math.min(z,y),bw,Math.max(1,Math.abs(y-z)))}x.globalAlpha=1;continue}
  if(t==='dots'||t==='cross'){for(let i=i0;i<=i1;i++){const v=s[i-sh];if(v==null)continue;const fc=cs?cs[i-sh]:c;if(!fc)continue;const px=X(i),py=Yf(v);
    if(t==='cross'){x.strokeStyle=fc;x.lineWidth=1;x.beginPath();x.moveTo(px-3,py);x.lineTo(px+3,py);x.moveTo(px,py-3);x.lineTo(px,py+3);x.stroke()}else{x.fillStyle=fc;x.beginPath();x.arc(px,py,pl.w>2?2.6:1.8,0,7);x.fill()}}continue}
  if(t==='area'){const z=pl.base!=null?Yf(pl.base):(opt.zero??Yf(0));let on=false,sx=0;x.fillStyle=ChartDraw.rgba(typeof c==='string'&&c[0]==='#'?c:'#4c9aff',.2);
   const close=ex=>{if(on){x.lineTo(ex,z);x.lineTo(sx,z);x.closePath();x.fill()}on=false};x.beginPath();
   for(let i=i0;i<=i1;i++){const v=s[i-sh];if(v==null||!isFinite(v)){close(X(i-1));x.beginPath();continue}const px=X(i),py=Yf(v);if(!on){x.moveTo(px,py);sx=px;on=true}else x.lineTo(px,py)}close(X(i1))}
  if(pl.dirKey){const dir=S[pl.dirKey];let prev=null;x.lineWidth=pl.w||1.6;for(let i=i0;i<=i1;i++){const v=s[i-sh];if(v==null){prev=null;continue}const d=dir&&dir[i-sh];x.strokeStyle=d===-1?pl.c2:pl.c;if(prev!=null&&prev.d===d){x.beginPath();x.moveTo(X(i-1),Yf(prev.v));x.lineTo(X(i),Yf(v));x.stroke()}prev={v,d}}x.lineWidth=1;continue}
  const lw=pl.w||1.5;x.lineWidth=lw;x.lineJoin='round';
  if(cs){let prev=null;for(let i=i0;i<=i1;i++){const v=s[i-sh];if(v==null||!isFinite(v)){prev=null;continue}const px=X(i),py=Yf(v),fc=cs[i-sh];
    if(prev&&fc){x.strokeStyle=fc;x.beginPath();x.moveTo(prev[0],prev[1]);if(t==='step')x.lineTo(px,prev[1]);x.lineTo(px,py);x.stroke()}prev=[px,py]}x.lineWidth=1;continue}
  x.beginPath();let on=false,ly=0;for(let i=i0;i<=i1;i++){const v=s[i-sh];if(v==null||!isFinite(v)){on=t==='linebr'||t==='line'||t==='step'||t==='area'?false:on;continue}const px=X(i),py=Yf(v);if(t==='step'&&on)x.lineTo(px,ly);on?x.lineTo(px,py):x.moveTo(px,py);on=true;ly=py}
  x.strokeStyle=c;x.stroke();x.lineWidth=1}}
// latar per bar (bgcolor)
function drawBg(x,def,i0,i1,X,y0,h,bw){if(!def.bg)return;const m=new Map();for(const q of def.bg){if(q[0]>=i0&&q[0]<=i1)m.set(q[0],q[1])}for(const[i,c]of m){x.fillStyle=c;x.fillRect(Math.round(X(i)-bw/2),y0,Math.max(1,Math.ceil(bw)),h)}}
// plotcandle / plotbar
function drawCan(x,def,i0,i1,X,Yf,bw,col){for(const q of def.candles||[]){for(let i=i0;i<=i1;i++){const o=q.o[i],h=q.h[i],l=q.l[i],c=q.c[i];if(o==null||h==null||l==null||c==null)continue;
  const fc=q.cols[i]||(c>=o?col.up:col.dn),wc=q.wick[i]||fc,bc=q.border[i]||fc,cx=Math.round(X(i)),yo=Math.round(Yf(o)),yc=Math.round(Yf(c)),yh=Math.round(Yf(h)),yl=Math.round(Yf(l));
  if(q.bar){x.fillStyle=fc;const tk=Math.max(2,bw>>1);x.fillRect(cx,yh,1,Math.max(1,yl-yh));x.fillRect(cx-tk,yo,tk,1);x.fillRect(cx+1,yc,tk,1);continue}
  x.fillStyle=wc;x.fillRect(cx,yh,1,Math.max(1,yl-yh));x.fillStyle=fc;const bt=Math.min(yo,yc),bh=Math.max(1,Math.abs(yo-yc)),w=Math.max(1,Math.round(bw*.8));x.fillRect(cx-(w>>1),bt,w,bh);if(w>3&&bc!==fc){x.strokeStyle=bc;x.strokeRect(cx-(w>>1)+.5,bt+.5,w-1,Math.max(0,bh-1))}}}}
// penanda plotshape / plotchar / plotarrow
const MSZ={tiny:3,small:4.5,normal:6.5,large:9,huge:12,auto:5.5};
function drawMk(x,def,i0,i1,X,Yf,V,pane,col,mH){const mk=def.markers;if(!mk||!mk.length)return;const stack=new Map();x.font='10px '+MONO;
 for(const m of mk){if(m.i<i0||m.i>i1||!V[m.i]||m.s==='none')continue;
  const sz=MSZ[m.z]||MSZ.auto,loc=m.l||'abovebar',up=loc==='abovebar'||loc==='top',px=X(m.i),sk=m.i+loc,n0=stack.get(sk)||0;stack.set(sk,n0+1);const gap=n0*(sz*2+4);
  let py;if(pane){const t=pane.y0+6,bt=pane.y0+pane.h-6;py=loc==='absolute'&&isFinite(m.v)?Yf(m.v):up?t+sz+gap+2:bt-sz-gap-2}
  else if(loc==='absolute')py=Yf(m.v);else if(loc==='top')py=sz+8+gap;else if(loc==='bottom')py=mH-sz-8-gap;else py=up?Yf(V[m.i].h)-sz-4-gap:Yf(V[m.i].l)+sz+4+gap;
  const cc=m.c||(up?col.dn:col.up),s=m.s;x.fillStyle=cc;x.strokeStyle=cc;x.lineWidth=1.4;
  const dn=!up||s==='arrowdown'||s==='triangledown'||s==='labeldown';
  x.beginPath();
  switch(s){
   case 'circle':x.arc(px,py,sz*.75,0,7);x.fill();break;
   case 'square':x.fillRect(px-sz*.7,py-sz*.7,sz*1.4,sz*1.4);break;
   case 'diamond':x.moveTo(px,py-sz);x.lineTo(px+sz*.8,py);x.lineTo(px,py+sz);x.lineTo(px-sz*.8,py);x.closePath();x.fill();break;
   case 'cross':x.moveTo(px-sz*.7,py);x.lineTo(px+sz*.7,py);x.moveTo(px,py-sz*.7);x.lineTo(px,py+sz*.7);x.stroke();break;
   case 'xcross':x.moveTo(px-sz*.7,py-sz*.7);x.lineTo(px+sz*.7,py+sz*.7);x.moveTo(px+sz*.7,py-sz*.7);x.lineTo(px-sz*.7,py+sz*.7);x.stroke();break;
   case 'triangleup':x.moveTo(px,py-sz);x.lineTo(px+sz,py+sz*.7);x.lineTo(px-sz,py+sz*.7);x.closePath();x.fill();break;
   case 'triangledown':x.moveTo(px,py+sz);x.lineTo(px+sz,py-sz*.7);x.lineTo(px-sz,py-sz*.7);x.closePath();x.fill();break;
   case 'arrowup':x.moveTo(px,py-sz);x.lineTo(px+sz,py);x.lineTo(px+sz*.4,py);x.lineTo(px+sz*.4,py+sz);x.lineTo(px-sz*.4,py+sz);x.lineTo(px-sz*.4,py);x.lineTo(px-sz,py);x.closePath();x.fill();break;
   case 'arrowdown':x.moveTo(px,py+sz);x.lineTo(px+sz,py);x.lineTo(px+sz*.4,py);x.lineTo(px+sz*.4,py-sz);x.lineTo(px-sz*.4,py-sz);x.lineTo(px-sz*.4,py);x.lineTo(px-sz,py);x.closePath();x.fill();break;
   case 'flag':x.moveTo(px-sz*.6,py+sz);x.lineTo(px-sz*.6,py-sz);x.lineTo(px+sz*.9,py-sz*.4);x.lineTo(px-sz*.6,py+sz*.1);x.stroke();break;
   case 'labelup':case 'labeldown':{const w=Math.max(sz*2.2,(m.x?x.measureText(m.x).width:0)+8),h=sz*2+4,by=s==='labelup'?py+4:py-h-4;x.fillRect(px-w/2,by,w,h);x.beginPath();x.moveTo(px-4,s==='labelup'?by:by+h);x.lineTo(px,s==='labelup'?by-5:by+h+5);x.lineTo(px+4,s==='labelup'?by:by+h);x.closePath();x.fill();
     if(m.x){x.fillStyle=m.tc||'#fff';x.textAlign='center';x.textBaseline='middle';x.fillText(m.x,px,by+h/2+.5);x.textAlign='left'}continue}
   case 'char':break;
   default:x.moveTo(px-sz,py+sz*.7);x.lineTo(px+sz,py+sz*.7);x.lineTo(px,py-sz);x.closePath();x.fill()}
  if(m.x&&s!=='labelup'&&s!=='labeldown'){x.fillStyle=m.tc||cc;x.textAlign='center';x.textBaseline='middle';x.fillText(m.x,px,dn&&s!=='char'?py-sz-7:up?py-(s==='char'?0:sz+7):py+(s==='char'?0:sz+7));x.textAlign='left'}
  x.textBaseline='middle'}
 x.lineWidth=1}
// objek label/line/box dari Pine. x = indeks bar (boleh pecahan / di luar data), y = harga.
function drawObjs(x,def,i0,i1,X,Yf,V,pw,hmax,col){const ob=def.objs;if(!ob||!ob.length)return;x.font='10px '+MONO;
 for(const q of ob){
  if(q.k==='label'){if(q.x<i0-2||q.x>i1+2)continue;const j=Math.round(q.x),b=V[Math.max(0,Math.min(V.length-1,j))];let y=q.y;
   if(q.yloc==='abovebar'&&b)y=Yf(b.h)-10;else if(q.yloc==='belowbar'&&b)y=Yf(b.l)+10;else y=Yf(q.y);if(!isFinite(y))continue;
   const px=X(q.x),st=q.style||'label_down',tx=q.text||'',sz={tiny:8,small:9,normal:11,large:13,huge:16}[q.size]||11;x.font=sz+'px '+MONO;
   if(st==='none'||st==='text_outline'){x.fillStyle=q.tc||col.ink;x.textAlign='center';x.textBaseline='middle';x.fillText(tx,px,y);x.textAlign='left';continue}
   const lines=tx.split('\n'),tw=Math.max(...lines.map(l=>x.measureText(l).width))+10,th=lines.length*(sz+2)+6;
   let bx=px-tw/2,by=y-th-6;if(st==='label_up')by=y+6;else if(st==='label_center'){by=y-th/2}else if(st==='label_left'){bx=px-tw-6;by=y-th/2}else if(st==='label_right'){bx=px+6;by=y-th/2}
   else if(/arrowup/.test(st))by=y+6;
   x.fillStyle=q.c||'#2962FF';if(/square|text_only/.test(st)){if(!/text_only/.test(st))x.fillRect(bx,by,tw,th)}else{x.beginPath();x.roundRect?x.roundRect(bx,by,tw,th,3):x.rect(bx,by,tw,th);x.fill()}
   if(/^label_(down|up|left|right)$/.test(st)){x.beginPath();if(st==='label_down'){x.moveTo(px-4,by+th);x.lineTo(px,y);x.lineTo(px+4,by+th)}else if(st==='label_up'){x.moveTo(px-4,by);x.lineTo(px,y);x.lineTo(px+4,by)}else if(st==='label_left'){x.moveTo(bx+tw,by+th/2-4);x.lineTo(px,y);x.lineTo(bx+tw,by+th/2+4)}else{x.moveTo(bx,by+th/2-4);x.lineTo(px,y);x.lineTo(bx,by+th/2+4)}x.closePath();x.fill()}
   x.fillStyle=q.tc||'#fff';x.textAlign='center';x.textBaseline='middle';lines.forEach((l,k)=>x.fillText(l,bx+tw/2,by+4+(k+.5)*(sz+2)));x.textAlign='left';continue}
  if(q.k==='line'){let x1=X(q.x1),x2=X(q.x2),y1=Yf(q.y1),y2=Yf(q.y2);if(![x1,x2,y1,y2].every(isFinite))continue;
   if(q.ext==='right'||q.ext==='both'||q.ext==='left'){const dx=x2-x1,dy=y2-y1;if(dx!==0){const sl=dy/dx;if(q.ext!=='left'){const X2=pw+10;y2=y1+sl*(X2-x1);x2=X2}if(q.ext!=='right'){const X1=-10;y1=y1+sl*(X1-x1);x1=X1}}}
   x.strokeStyle=q.c;x.lineWidth=q.w||1;x.setLineDash(q.style==='dashed'?[6,4]:q.style==='dotted'?[2,3]:[]);x.beginPath();x.moveTo(x1,y1);x.lineTo(x2,y2);x.stroke();x.setLineDash([]);x.lineWidth=1;continue}
  if(q.k==='box'){const x1=X(Math.min(q.x1,q.x2)),x2=q.ext==='right'||q.ext==='both'?pw+10:X(Math.max(q.x1,q.x2)),ya=Yf(q.y1),yb=Yf(q.y2);if(![x1,x2,ya,yb].every(isFinite))continue;const xl=q.ext==='left'||q.ext==='both'?-10:x1;
   x.fillStyle=q.bg;x.fillRect(xl,Math.min(ya,yb),x2-xl,Math.abs(yb-ya));x.strokeStyle=q.c;x.lineWidth=q.w||1;x.strokeRect(xl+.5,Math.min(ya,yb)+.5,x2-xl,Math.abs(yb-ya));x.lineWidth=1;
   if(q.text){x.font='10px '+MONO;x.fillStyle=q.tc||col.ink;x.textAlign='center';x.textBaseline='middle';x.fillText(q.text,(xl+x2)/2,(ya+yb)/2);x.textAlign='left'}}}}

return{draw,idxOf,timeAt,TFS,decimals,PR,TB,MONO,niceStep};
})();
