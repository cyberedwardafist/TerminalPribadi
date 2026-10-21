// Pustaka Pine: ta.*, math.*, str.*, array.*, map.*, color.*, konversi, waktu. Semua fungsi ta bersifat stateful per titik panggilan (st).
// Entri: L[nama]={p:'param1,param2',s:1 jika stateful,f:(c,st,args)=>nilai}. p='*' berarti variadik.
(function(G){'use strict';
const L={},CONST={};
const isNa=v=>v==null||(typeof v==='number'&&v!==v);
const num=x=>typeof x==='number'?x:typeof x==='boolean'?+x:NaN;
const nz=(x,d)=>isNa(x)?(d===undefined?0:d):x;
const sub=(st,k)=>st[k]||(st[k]={});
function win(st,x,n){n=n|0;if(n<1)n=1;const a=st.w||(st.w=[]);a.push(x);if(a.length>n)a.splice(0,a.length-n);return a.length===n?a:null}
const sum=a=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i];return s};
const R=(name,p,f,s)=>{L[name]={p:p==='*'?null:p?p.split(','):[],v:p==='*',f,s:!!s}};

// ---------- inti ta ----------
const F={};
F.sma=(st,x,n)=>{const w=win(st,x,n);return w?sum(w)/(n|0||1):NaN};
F.ema=(st,x,n,al)=>{n=n|0||1;al=al||2/(n+1);
 if(st.v===undefined){const w=win(st,x,n);if(!w)return NaN;const s=sum(w);if(s!==s)return NaN;st.v=s/n;st.w=null;return st.v}
 if(x!==x)return NaN;st.v=al*x+(1-al)*st.v;return st.v};
F.rma=(st,x,n)=>F.ema(st,x,n,1/(n|0||1));
F.wma=(st,x,n)=>{const w=win(st,x,n);if(!w)return NaN;let s=0,d=0;for(let i=0;i<w.length;i++){s+=w[i]*(i+1);d+=i+1}return s/d};
F.change=(st,x,l)=>{l=l===undefined?1:l|0;const w=win(st,x,l+1);return w?w[l]-w[0]:NaN};
F.rsi=(st,x,n)=>{if(st.p===undefined){st.p=x;return NaN}const d=x-st.p;st.p=x;
 const g=F.rma(sub(st,'g'),d>0?d:d!==d?NaN:0,n),l=F.rma(sub(st,'l'),d<0?-d:d!==d?NaN:0,n);if(g!==g||l!==l)return NaN;return l===0?100:g===0?0:100-100/(1+g/l)};
F.stdev=(st,x,n,biased)=>{const w=win(st,x,n);if(!w)return NaN;const m=sum(w)/w.length;let s=0;for(const v of w)s+=(v-m)*(v-m);return Math.sqrt(s/(biased===false?w.length-1:w.length))};
F.highest=(st,x,n)=>{const w=win(st,x,n);return w?Math.max(...w):NaN};
F.lowest=(st,x,n)=>{const w=win(st,x,n);return w?Math.min(...w):NaN};
const trAt=(c,i)=>{const b=c.bars,h=b.h[i],l=b.l[i];if(i===0)return h-l;const pc=b.c[i-1];return Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc))};
F.atr=(c,st,n)=>F.rma(st,trAt(c,c.i),n);
const srcOf=(c,x)=>x===undefined?c.bars.c[c.i]:x;

R('ta.sma','source,length',(c,st,a)=>F.sma(st,a[0],a[1]),1);
R('ta.ema','source,length',(c,st,a)=>F.ema(st,a[0],a[1]),1);
R('ta.rma','source,length',(c,st,a)=>F.rma(st,a[0],a[1]),1);
R('ta.wma','source,length',(c,st,a)=>F.wma(st,a[0],a[1]),1);
R('ta.vwma','source,length',(c,st,a)=>{const wa=win(sub(st,'a'),a[0]*c.bars.v[c.i],a[1]),wb=win(sub(st,'b'),c.bars.v[c.i],a[1]);return wa?sum(wa)/sum(wb):NaN},1);
R('ta.swma','source',(c,st,a)=>{const w=win(st,a[0],4);return w?(w[0]+2*w[1]+2*w[2]+w[3])/6:NaN},1);
R('ta.hma','source,length',(c,st,a)=>{const n=a[1]|0,h=Math.max(1,Math.floor(n/2)),s=Math.max(1,Math.round(Math.sqrt(n)));
 const x=2*F.wma(sub(st,'a'),a[0],h)-F.wma(sub(st,'b'),a[0],n);return F.wma(sub(st,'c'),x,s)},1);
R('ta.alma','series,length,offset,sigma',(c,st,a)=>{const n=a[1]|0,off=a[2]===undefined?.85:a[2],sg=a[3]===undefined?6:a[3],w=win(st,a[0],n);if(!w)return NaN;
 const m=off*(n-1),s=n/sg;let nm=0,dn=0;for(let i=0;i<n;i++){const k=Math.exp(-((i-m)*(i-m))/(2*s*s));nm+=w[i]*k;dn+=k}return nm/dn},1);
R('ta.linreg','source,length,offset',(c,st,a)=>{const n=a[1]|0,w=win(st,a[0],n);if(!w)return NaN;let sx=0,sy=0,sxy=0,sxx=0;
 for(let i=0;i<n;i++){sx+=i;sy+=w[i];sxy+=i*w[i];sxx+=i*i}const sl=(n*sxy-sx*sy)/(n*sxx-sx*sx),ic=(sy-sl*sx)/n;return ic+sl*(n-1-(a[2]|0))},1);
R('ta.rsi','source,length',(c,st,a)=>F.rsi(st,a[0],a[1]),1);
R('ta.stdev','source,length,biased',(c,st,a)=>F.stdev(st,a[0],a[1],a[2]),1);
R('ta.variance','source,length,biased',(c,st,a)=>{const s=F.stdev(st,a[0],a[1],a[2]);return s*s},1);
R('ta.dev','source,length',(c,st,a)=>{const w=win(st,a[0],a[1]);if(!w)return NaN;const m=sum(w)/w.length;let s=0;for(const v of w)s+=Math.abs(v-m);return s/w.length},1);
const hl=(c,a,which)=>{let x=a[0],n=a[1];if(n===undefined){n=x;x=which==='h'?c.bars.h[c.i]:c.bars.l[c.i]}return[x,n]};
R('ta.highest','source,length',(c,st,a)=>{const[x,n]=hl(c,a,'h');return F.highest(st,x,n)},1);
R('ta.lowest','source,length',(c,st,a)=>{const[x,n]=hl(c,a,'l');return F.lowest(st,x,n)},1);
R('ta.highestbars','source,length',(c,st,a)=>{const[x,n]=hl(c,a,'h'),w=win(st,x,n);if(!w)return NaN;let k=0;for(let i=1;i<w.length;i++)if(w[i]>=w[k])k=i;return k-(w.length-1)},1);
R('ta.lowestbars','source,length',(c,st,a)=>{const[x,n]=hl(c,a,'l'),w=win(st,x,n);if(!w)return NaN;let k=0;for(let i=1;i<w.length;i++)if(w[i]<=w[k])k=i;return k-(w.length-1)},1);
R('ta.change','source,length',(c,st,a)=>F.change(st,a[0],a[1]),1);
R('ta.mom','source,length',(c,st,a)=>F.change(st,a[0],a[1]),1);
R('ta.roc','source,length',(c,st,a)=>{const w=win(st,a[0],(a[1]|0)+1);return w?100*(w[w.length-1]-w[0])/w[0]:NaN},1);
R('ta.cross','source1,source2',(c,st,a)=>{const d=a[0]-a[1],r=st.d!==undefined&&((st.d<=0&&d>0)||(st.d>=0&&d<0));st.d=d;return r},1);
R('ta.crossover','source1,source2',(c,st,a)=>{const d=a[0]-a[1],r=st.d!==undefined&&st.d<=0&&d>0;st.d=d;return r},1);
R('ta.crossunder','source1,source2',(c,st,a)=>{const d=a[0]-a[1],r=st.d!==undefined&&st.d>=0&&d<0;st.d=d;return r},1);
R('ta.tr','handle_na',(c,st,a)=>trAt(c,c.i),0);
R('ta.atr','length',(c,st,a)=>F.atr(c,st,a[0]),1);
R('ta.macd','source,fastlen,slowlen,siglen',(c,st,a)=>{const m=F.ema(sub(st,'f'),a[0],a[1])-F.ema(sub(st,'s'),a[0],a[2]),sg=F.ema(sub(st,'g'),m,a[3]);return[m,sg,m-sg]},1);
R('ta.bb','series,length,mult',(c,st,a)=>{const b=F.sma(sub(st,'m'),a[0],a[1]),d=a[2]*F.stdev(sub(st,'d'),a[0],a[1]);return[b,b+d,b-d]},1);
R('ta.bbw','series,length,mult',(c,st,a)=>{const b=F.sma(sub(st,'m'),a[0],a[1]),d=a[2]*F.stdev(sub(st,'d'),a[0],a[1]);return 2*d/b},1);
R('ta.kc','series,length,mult,useTrueRange',(c,st,a)=>{const m=F.ema(sub(st,'m'),a[0],a[1]),r=a[3]===false?c.bars.h[c.i]-c.bars.l[c.i]:trAt(c,c.i),rg=F.ema(sub(st,'r'),r,a[1]);return[m,m+a[2]*rg,m-a[2]*rg]},1);
R('ta.kcw','series,length,mult,useTrueRange',(c,st,a)=>{const m=F.ema(sub(st,'m'),a[0],a[1]),r=a[3]===false?c.bars.h[c.i]-c.bars.l[c.i]:trAt(c,c.i),rg=F.ema(sub(st,'r'),r,a[1]);return 2*a[2]*rg/m},1);
R('ta.stoch','source,high,low,length',(c,st,a)=>{const hh=F.highest(sub(st,'h'),a[1],a[3]),ll=F.lowest(sub(st,'l'),a[2],a[3]);return hh===ll?0:100*(a[0]-ll)/(hh-ll)},1);
R('ta.cci','source,length',(c,st,a)=>{const w=win(st,a[0],a[1]);if(!w)return NaN;const m=sum(w)/w.length;let d=0;for(const v of w)d+=Math.abs(v-m);d/=w.length;return d===0?0:(a[0]-m)/(0.015*d)},1);
R('ta.mfi','series,length',(c,st,a)=>{const x=a[0],v=c.bars.v[c.i];const pv=st.p;st.p=x;const w=win(sub(st,'w'),[pv===undefined?NaN:x-pv,x*v],a[1]);if(!w)return NaN;
 let up=0,dn=0;for(const q of w){if(q[0]>0)up+=q[1];else if(q[0]<0)dn+=q[1]}return dn===0?100:100-100/(1+up/dn)},1);
R('ta.obv','',(c,st)=>{const i=c.i,b=c.bars;st.v=(st.v||0)+(i>0?(b.c[i]>b.c[i-1]?b.v[i]:b.c[i]<b.c[i-1]?-b.v[i]:0):0);return st.v},1);
R('ta.cum','source',(c,st,a)=>{st.v=(st.v||0)+(a[0]!==a[0]?0:a[0]);return st.v},1);
R('ta.accdist','',(c,st)=>{const b=c.bars,i=c.i,r=b.h[i]-b.l[i];st.v=(st.v||0)+(r?((b.c[i]-b.l[i])-(b.h[i]-b.c[i]))/r*b.v[i]:0);return st.v},1);
R('ta.vwap','src,anchor,stdev_mult',(c,st,a)=>{const b=c.bars,i=c.i,day=Math.floor(b.t[i]/86400),x=a[0]===undefined?(b.h[i]+b.l[i]+b.c[i])/3:a[0];if(st.d!==day){st.d=day;st.pv=0;st.vv=0}st.pv+=x*b.v[i];st.vv+=b.v[i];const v=st.vv?st.pv/st.vv:x;return a[2]!==undefined?[v,v,v]:v},1);
R('ta.cum','source',(c,st,a)=>{st.v=(st.v||0)+(a[0]!==a[0]?0:a[0]);return st.v},1);
R('ta.max','source',(c,st,a)=>{st.v=st.v===undefined||a[0]>st.v?a[0]:st.v;return st.v},1);
R('ta.min','source',(c,st,a)=>{st.v=st.v===undefined||a[0]<st.v?a[0]:st.v;return st.v},1);
R('ta.range','source,length',(c,st,a)=>F.highest(sub(st,'h'),a[0],a[1])-F.lowest(sub(st,'l'),a[0],a[1]),1);
R('ta.median','source,length',(c,st,a)=>{const w=win(st,a[0],a[1]);if(!w)return NaN;const s=[...w].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2},1);
R('ta.percentrank','source,length',(c,st,a)=>{const w=win(st,a[0],(a[1]|0)+1);if(!w)return NaN;const x=w[w.length-1];let k=0;for(let i=0;i<w.length-1;i++)if(w[i]<=x)k++;return 100*k/a[1]},1);
R('ta.correlation','source1,source2,length',(c,st,a)=>{const wa=win(sub(st,'a'),a[0],a[2]),wb=win(sub(st,'b'),a[1],a[2]);if(!wa)return NaN;const n=wa.length,ma=sum(wa)/n,mb=sum(wb)/n;let sab=0,saa=0,sbb=0;for(let i=0;i<n;i++){sab+=(wa[i]-ma)*(wb[i]-mb);saa+=(wa[i]-ma)**2;sbb+=(wb[i]-mb)**2}return sab/Math.sqrt(saa*sbb)},1);
R('ta.cmo','series,length',(c,st,a)=>{const d=F.change(sub(st,'c'),a[0],1),w=win(sub(st,'w'),d,a[1]);if(!w)return NaN;let u=0,dn=0;for(const v of w){if(v>0)u+=v;else dn-=v}return u+dn===0?0:100*(u-dn)/(u+dn)},1);
R('ta.cog','source,length',(c,st,a)=>{const w=win(st,a[0],a[1]);if(!w)return NaN;let nm=0,dn=0;for(let i=0;i<w.length;i++){nm+=w[w.length-1-i]*(i+1);dn+=w[i]}return dn===0?0:-nm/dn},1);
R('ta.tsi','source,short_length,long_length',(c,st,a)=>{const m=F.change(sub(st,'m'),a[0],1),e1=F.ema(sub(st,'e1'),m,a[2]),e2=F.ema(sub(st,'e2'),e1,a[1]),am=Math.abs(m),f1=F.ema(sub(st,'f1'),am,a[2]),f2=F.ema(sub(st,'f2'),f1,a[1]);return f2?e2/f2:NaN},1);
R('ta.wpr','length',(c,st,a)=>{const hh=F.highest(sub(st,'h'),c.bars.h[c.i],a[0]),ll=F.lowest(sub(st,'l'),c.bars.l[c.i],a[0]);return hh===ll?0:100*(c.bars.c[c.i]-hh)/(hh-ll)},1);
R('ta.rising','source,length',(c,st,a)=>{const w=win(st,a[0],(a[1]|0)+1);if(!w)return false;for(let i=1;i<w.length;i++)if(!(w[i]>w[i-1]))return false;return true},1);
R('ta.falling','source,length',(c,st,a)=>{const w=win(st,a[0],(a[1]|0)+1);if(!w)return false;for(let i=1;i<w.length;i++)if(!(w[i]<w[i-1]))return false;return true},1);
R('ta.barssince','condition',(c,st,a)=>{if(a[0]===true||(typeof a[0]==='number'&&a[0]===a[0]&&a[0]!==0))st.n=0;else if(st.n!==undefined)st.n++;return st.n===undefined?NaN:st.n},1);
R('ta.valuewhen','condition,source,occurrence',(c,st,a)=>{const l=st.l||(st.l=[]);if(a[0]===true||(typeof a[0]==='number'&&a[0]===a[0]&&a[0]!==0)){l.push(a[1]);if(l.length>500)l.shift()}const o=a[2]|0;return l.length>o?l[l.length-1-o]:NaN},1);
R('ta.fixnan','source',(c,st,a)=>{if(!isNa(a[0]))st.v=a[0];return st.v===undefined?NaN:st.v},1);
function pivot(hi){return(c,st,a)=>{let x,l,r;if(a.length>=3){x=a[0];l=a[1];r=a[2]}else{l=a[0];r=a[1];x=hi?c.bars.h[c.i]:c.bars.l[c.i]}l|=0;r|=0;const w=win(st,x,l+r+1);if(!w)return NaN;const m=w[l];
 for(let i=0;i<l;i++)if(hi?!(w[i]<m):!(w[i]>m))return NaN;for(let i=l+1;i<w.length;i++)if(hi?!(w[i]<=m):!(w[i]>=m))return NaN;return m}}
R('ta.pivothigh','source,leftbars,rightbars',pivot(true),1);
R('ta.pivotlow','source,leftbars,rightbars',pivot(false),1);
R('ta.supertrend','factor,atrPeriod',(c,st,a)=>{const b=c.bars,i=c.i,f=a[0],atr=F.atr(c,sub(st,'a'),a[1]),src=(b.h[i]+b.l[i])/2;let up=src+f*atr,lo=src-f*atr;
 const pl=st.lo===undefined?0:st.lo,pu=st.up===undefined?0:st.up,pc=i>0?b.c[i-1]:NaN;
 if(!(lo>pl||pc<pl))lo=pl;if(!(up<pu||pc>pu))up=pu;
 let dir;if(st.atr===undefined||st.atr!==st.atr)dir=1;else if(st.sv===st.up)dir=b.c[i]>up?-1:1;else dir=b.c[i]<lo?1:-1;
 const sv=dir===-1?lo:up;st.lo=lo;st.up=up;st.atr=atr;st.sv=sv;return[sv,dir]},1);
R('ta.dmi','diLength,adxSmoothing',(c,st,a)=>{const b=c.bars,i=c.i,n=a[0];let pdm=0,mdm=0;if(i>0){const u=b.h[i]-b.h[i-1],d=b.l[i-1]-b.l[i];pdm=u>d&&u>0?u:0;mdm=d>u&&d>0?d:0}
 const tr=F.rma(sub(st,'t'),trAt(c,i),n),p=100*F.rma(sub(st,'p'),pdm,n)/tr,m=100*F.rma(sub(st,'m'),mdm,n)/tr,s=p+m,adx=100*F.rma(sub(st,'x'),Math.abs(p-m)/(s===0?1:s),a[1]);return[p,m,adx]},1);
R('ta.sar','start,inc,max',(c,st,a)=>{const b=c.bars,i=c.i,step=a[0],mx=a[2];if(i===0)return NaN;
 if(st.init===undefined){st.up=b.c[1]>=b.c[0]||true;st.up=b.c[i]>=b.c[i-1];st.af=step;st.ep=st.up?b.h[i-1]:b.l[i-1];st.s=st.up?b.l[i-1]:b.h[i-1];st.init=1}
 let s=st.s+st.af*(st.ep-st.s);
 if(st.up){s=Math.min(s,b.l[i-1],i>1?b.l[i-2]:b.l[i-1]);if(b.l[i]<s){st.up=false;s=st.ep;st.ep=b.l[i];st.af=step}else if(b.h[i]>st.ep){st.ep=b.h[i];st.af=Math.min(mx,st.af+a[1])}}
 else{s=Math.max(s,b.h[i-1],i>1?b.h[i-2]:b.h[i-1]);if(b.h[i]>s){st.up=true;s=st.ep;st.ep=b.h[i];st.af=step}else if(b.l[i]<st.ep){st.ep=b.l[i];st.af=Math.min(mx,st.af+a[1])}}
 st.s=s;return s},1);
// ---------- math ----------
const M1=(n,f)=>R('math.'+n,'x',(c,st,a)=>f(num(a[0])));
M1('abs',Math.abs);M1('sqrt',Math.sqrt);M1('log',Math.log);M1('log10',Math.log10);M1('exp',Math.exp);M1('floor',Math.floor);M1('ceil',Math.ceil);M1('sign',Math.sign);
M1('sin',Math.sin);M1('cos',Math.cos);M1('tan',Math.tan);M1('asin',Math.asin);M1('acos',Math.acos);M1('atan',Math.atan);M1('todegrees',x=>x*180/Math.PI);M1('toradians',x=>x*Math.PI/180);
R('math.pow','base,exponent',(c,st,a)=>Math.pow(a[0],a[1]));
R('math.round','x,precision',(c,st,a)=>{const p=a[1]|0;if(!p)return Math.round(a[0]);const k=Math.pow(10,p);return Math.round(a[0]*k)/k});
R('math.round_to_mintick','x',(c,st,a)=>{const m=c.mintick||.01;return Math.round(a[0]/m)*m});
R('math.max','*',(c,st,a)=>a.some(isNa)?NaN:Math.max(...a));
R('math.min','*',(c,st,a)=>a.some(isNa)?NaN:Math.min(...a));
R('math.avg','*',(c,st,a)=>a.some(isNa)?NaN:sum(a)/a.length);
R('math.sum','source,length',(c,st,a)=>{const w=win(st,a[0],a[1]);return w?sum(w):NaN},1);
R('math.random','min,max,seed',(c,st,a)=>{const lo=a[0]===undefined?0:a[0],hi=a[1]===undefined?1:a[1];if(st.s===undefined)st.s=(a[2]===undefined?12345:a[2])>>>0||1;st.s=(st.s*1664525+1013904223)>>>0;return lo+(hi-lo)*st.s/4294967296},1);
Object.assign(CONST,{'math.pi':Math.PI,'math.e':Math.E,'math.phi':(1+Math.sqrt(5))/2,'math.rphi':(Math.sqrt(5)-1)/2});
// ---------- umum ----------
R('nz','source,replacement',(c,st,a)=>nz(a[0],a[1]));
R('na','x',(c,st,a)=>isNa(a[0]));
R('fixnan','source',L['ta.fixnan'].f,1);
R('int','x',(c,st,a)=>isNa(a[0])?NaN:Math.trunc(num(a[0])));
R('float','x',(c,st,a)=>isNa(a[0])?NaN:num(a[0]));
R('bool','x',(c,st,a)=>!!(a[0]&&a[0]===a[0]));
R('string','x',(c,st,a)=>a[0]);
R('color','x',(c,st,a)=>a[0]);
R('iff','cond,a,b',(c,st,a)=>a[0]?a[1]:a[2]);
// ---------- str ----------
function fmtNum(x,f){if(isNa(x))return 'NaN';if(typeof x!=='number')return String(x);
 if(typeof f==='string'&&/^[#0,]*\.?[#0]*%?$/.test(f)&&/[#0]/.test(f)){const pct=f.endsWith('%'),m=/\.([#0]*)/.exec(f),dec=m?m[1].length:0,req=m?(m[1].match(/0/g)||[]).length:0;let v=pct?x*100:x;let s=v.toFixed(dec);if(dec>req&&s.includes('.')){s=s.replace(/0+$/,'');const need=req;const d=s.split('.')[1]||'';if(d.length<need)s=s+'0'.repeat(need-d.length);s=s.replace(/\.$/,'')}return s+(pct?'%':'')}
 if(f==='format.percent')return (x*100).toFixed(2)+'%';
 if(f==='format.volume'){const a=Math.abs(x);return a>=1e9?(x/1e9).toFixed(2)+'B':a>=1e6?(x/1e6).toFixed(2)+'M':a>=1e3?(x/1e3).toFixed(2)+'K':String(+x.toFixed(2))}
 if(f==='format.mintick'||f==='format.price')return String(+x.toFixed(8));
 return String(+x.toPrecision(10))}
const tostr=(x,f)=>typeof x==='string'?x:typeof x==='number'?fmtNum(x,f):typeof x==='boolean'?String(x):x==null?'NaN':Array.isArray(x)?'['+x.map(v=>tostr(v,f)).join(', ')+']':String(x);
R('str.tostring','value,format',(c,st,a)=>tostr(a[0],a[1]));
R('str.tonumber','string',(c,st,a)=>{const v=parseFloat(a[0]);return v})
R('str.length','string',(c,st,a)=>String(a[0]).length);
R('str.contains','source,str',(c,st,a)=>String(a[0]).includes(a[1]));
R('str.startswith','source,str',(c,st,a)=>String(a[0]).startsWith(a[1]));
R('str.endswith','source,str',(c,st,a)=>String(a[0]).endsWith(a[1]));
R('str.upper','string',(c,st,a)=>String(a[0]).toUpperCase());
R('str.lower','string',(c,st,a)=>String(a[0]).toLowerCase());
R('str.trim','string',(c,st,a)=>String(a[0]).trim());
R('str.substring','source,begin_pos,end_pos',(c,st,a)=>String(a[0]).substring(a[1],a[2]));
R('str.replace','source,target,replacement,occurrence',(c,st,a)=>{let s=String(a[0]),k=a[3]|0,idx=-1;for(let j=0;j<=k;j++){idx=s.indexOf(a[1],idx+1);if(idx<0)return s}return s.slice(0,idx)+a[2]+s.slice(idx+String(a[1]).length)});
R('str.replace_all','source,target,replacement',(c,st,a)=>String(a[0]).split(a[1]).join(a[2]));
R('str.split','string,separator',(c,st,a)=>String(a[0]).split(a[1]));
R('str.repeat','source,repeat,separator',(c,st,a)=>Array(Math.max(0,a[1]|0)).fill(String(a[0])).join(a[2]||''));
R('str.pos','source,str',(c,st,a)=>String(a[0]).indexOf(a[1]));
R('str.format','formatString,*',(c,st,a)=>String(a[0]).replace(/\{(\d+)(?:,\s*number\s*,\s*([^}]*))?\}/g,(m,i,f)=>tostr(a[+i+1],f)));
L['str.format'].p=null;L['str.format'].v=true;
// ---------- color ----------
const NAMED={red:'#F23645',orange:'#FF9800',yellow:'#FDD835',green:'#089981',lime:'#00E676',teal:'#26A69A',aqua:'#00BCD4',blue:'#2962FF',navy:'#311B92',purple:'#9C27B0',fuchsia:'#E040FB',maroon:'#880E4F',olive:'#808000',silver:'#B2B5BE',gray:'#787B86',white:'#FFFFFF',black:'#363A45'};
for(const k in NAMED)CONST['color.'+k]=NAMED[k];
function parseColor(c){if(typeof c!=='string')return null;let m=/^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);if(m){const n=parseInt(m[1],16);return[n>>16&255,n>>8&255,n&255,m[2]?parseInt(m[2],16)/255:1]}
 m=/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(c);return m?[+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]]:null}
const rgba=(r,g,b,al)=>al>=1?'#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join(''):`rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+al.toFixed(3)})`;
R('color.new','color,transp',(c,st,a)=>{const p=parseColor(a[0]);if(!p||isNa(a[1]))return a[0];return rgba(p[0],p[1],p[2],p[3]*(1-Math.max(0,Math.min(100,a[1]))/100))});
R('color.rgb','red,green,blue,transp',(c,st,a)=>rgba(a[0],a[1],a[2],1-(a[3]||0)/100));
R('color.r','color',(c,st,a)=>(parseColor(a[0])||[NaN])[0]);R('color.g','color',(c,st,a)=>(parseColor(a[0])||[0,NaN])[1]);R('color.b','color',(c,st,a)=>(parseColor(a[0])||[0,0,NaN])[2]);
R('color.t','color',(c,st,a)=>{const p=parseColor(a[0]);return p?100*(1-p[3]):NaN});
R('color.from_gradient','value,bottom_value,top_value,bottom_color,top_color',(c,st,a)=>{const x=a[0],lo=a[1],hi=a[2],p=parseColor(a[3]),q=parseColor(a[4]);if(!p||!q||x!==x)return a[3];const t=hi===lo?0:Math.max(0,Math.min(1,(x-lo)/(hi-lo)));return rgba(p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,p[2]+(q[2]-p[2])*t,p[3]+(q[3]-p[3])*t)});
// ---------- array ----------
const AR=(n,p,f)=>R('array.'+n,p,f);
const mkArr=(c,st,a)=>{const n=a[0]|0,v=a.length>1?a[1]:NaN;return Array(Math.max(0,n)).fill(v)};
for(const t of['float','int','bool','string','color','line','label','box'])R('array.new_'+t,'size,initial_value',(c,st,a)=>Array(Math.max(0,a[0]|0)).fill(a.length>1?a[1]:(t==='bool'?false:t==='string'?null:NaN)));
R('array.new','size,initial_value',mkArr);
R('array.from','*',(c,st,a)=>a.slice());
AR('push','id,value',(c,st,a)=>{a[0].push(a[1])});AR('pop','id',(c,st,a)=>a[0].pop());AR('shift','id',(c,st,a)=>a[0].shift());AR('unshift','id,value',(c,st,a)=>{a[0].unshift(a[1])});
AR('get','id,index',(c,st,a)=>{const i=a[1]|0,l=a[0].length;if(i<-l||i>=l)throw new Error('array.get: indeks '+i+' di luar batas (ukuran '+l+')');return a[0][i<0?l+i:i]});
AR('set','id,index,value',(c,st,a)=>{const i=a[1]|0,l=a[0].length;if(i<-l||i>=l)throw new Error('array.set: indeks '+i+' di luar batas (ukuran '+l+')');a[0][i<0?l+i:i]=a[2]});
AR('size','id',(c,st,a)=>a[0].length);AR('clear','id',(c,st,a)=>{a[0].length=0});AR('insert','id,index,value',(c,st,a)=>{a[0].splice(a[1]|0,0,a[2])});
AR('remove','id,index',(c,st,a)=>a[0].splice(a[1]|0,1)[0]);AR('reverse','id',(c,st,a)=>{a[0].reverse()});AR('includes','id,value',(c,st,a)=>a[0].includes(a[1]));
AR('indexof','id,value',(c,st,a)=>a[0].indexOf(a[1]));AR('lastindexof','id,value',(c,st,a)=>a[0].lastIndexOf(a[1]));
AR('first','id',(c,st,a)=>a[0][0]);AR('last','id',(c,st,a)=>a[0][a[0].length-1]);AR('copy','id',(c,st,a)=>a[0].slice());
AR('slice','id,index_from,index_to',(c,st,a)=>a[0].slice(a[1],a[2]));AR('concat','id1,id2',(c,st,a)=>{a[0].push(...a[1]);return a[0]});
AR('join','id,separator',(c,st,a)=>a[0].map(v=>tostr(v)).join(a[1]===undefined?',':a[1]));
AR('fill','id,value,index_from,index_to',(c,st,a)=>{a[0].fill(a[1],a[2],a[3])});
AR('sum','id',(c,st,a)=>sum(a[0]));AR('avg','id',(c,st,a)=>a[0].length?sum(a[0])/a[0].length:NaN);
AR('min','id,nth',(c,st,a)=>{const s=[...a[0]].filter(v=>v===v).sort((x,y)=>x-y);return s.length?s[a[1]|0]:NaN});AR('max','id,nth',(c,st,a)=>{const s=[...a[0]].filter(v=>v===v).sort((x,y)=>y-x);return s.length?s[a[1]|0]:NaN});
AR('median','id',(c,st,a)=>{const s=[...a[0]].sort((x,y)=>x-y),m=s.length>>1;return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):NaN});
AR('stdev','id,biased',(c,st,a)=>{const x=a[0],n=x.length;if(!n)return NaN;const m=sum(x)/n;let s=0;for(const v of x)s+=(v-m)*(v-m);return Math.sqrt(s/(a[1]===false?n-1:n))});
AR('sort','id,order',(c,st,a)=>{const d=String(a[1]||'').includes('descending');a[0].sort((x,y)=>typeof x==='string'?(d?(y<x?-1:1):(x<y?-1:1)):d?y-x:x-y)});
AR('abs','id',(c,st,a)=>a[0].map(Math.abs));
// ---------- map ----------
for(const[n,p,f]of[['new','',()=>new Map()],['put','id,key,value',(c,st,a)=>{a[0].set(a[1],a[2])}],['get','id,key',(c,st,a)=>a[0].has(a[1])?a[0].get(a[1]):NaN],['contains','id,key',(c,st,a)=>a[0].has(a[1])],['remove','id,key',(c,st,a)=>{const v=a[0].get(a[1]);a[0].delete(a[1]);return v}],['size','id',(c,st,a)=>a[0].size],['clear','id',(c,st,a)=>{a[0].clear()}],['keys','id',(c,st,a)=>[...a[0].keys()]],['values','id',(c,st,a)=>[...a[0].values()]]])R('map.'+n,p,f);
// ---------- waktu dan timeframe ----------
const TFSEC={'1':60,'3':180,'5':300,'15':900,'30':1800,'45':2700,'60':3600,'120':7200,'180':10800,'240':14400};
function tfSeconds(s){if(s==null||s==='')return 0;s=String(s).trim();let m=/^(\d*)([SDWM]?)$/.exec(s);if(!m)return NaN;const n=m[1]===''?1:+m[1];switch(m[2]){case '':return n*60;case 'S':return n;case 'D':return n*86400;case 'W':return n*604800;case 'M':return n*2592000}return NaN}
function tfString(sec){if(sec>=2592000)return sec/2592000===1?'M':sec/2592000+'M';if(sec>=604800)return sec/604800===1?'W':sec/604800+'W';if(sec>=86400)return sec/86400===1?'D':sec/86400+'D';if(sec>=60)return String(sec/60);return sec+'S'}
R('timeframe.in_seconds','timeframe',(c,st,a)=>a[0]===undefined?c.tfSec:tfSeconds(a[0]));
R('timeframe.from_seconds','seconds',(c,st,a)=>tfString(a[0]));
R('timeframe.change','timeframe',(c,st,a)=>{const s=tfSeconds(a[0])||c.tfSec,b=c.bars.t[c.i];let k;if(s>=2592000){const d=new Date(b*1000);k=d.getUTCFullYear()*12+d.getUTCMonth()}else if(s>=604800){k=Math.floor((b/86400+3)/7)}else k=Math.floor(b/s);const r=st.k!==undefined&&st.k!==k;st.k=k;return c.i===0?false:r},1);
R('timestamp','*',(c,st,a)=>{let y,mo,d,h=0,mi=0,s=0;if(typeof a[0]==='string')return Date.parse(a[0]);if(a.length>=6||typeof a[1]==='number'&&a.length>=3&&typeof a[0]==='number'){[y,mo,d,h,mi,s]=a.length>=7?a.slice(1):a;h=h||0;mi=mi||0;s=s||0}else return NaN;return Date.UTC(y,mo-1,d,h,mi,s)});
const dt=(c,f)=>f(new Date(c.bars.t[c.i]*1000));

// ---- tambahan Pine v6 / v5 lanjut ----
const nums=a=>a.filter(v=>typeof v==='number'&&v===v);
const pctNear=(a,p)=>{const s=nums(a).sort((x,y)=>x-y);if(!s.length)return NaN;return s[Math.max(0,Math.min(s.length-1,Math.ceil(p/100*s.length)-1))]};
const pctLin=(a,p)=>{const s=nums(a).sort((x,y)=>x-y);if(!s.length)return NaN;const k=(s.length-1)*p/100,f=Math.floor(k),c=Math.ceil(k);return s[f]+(s[c]-s[f])*(k-f)};
R('array.percentile_nearest_rank','id,percentage',(c,st,a)=>pctNear(a[0],a[1]));
R('array.percentile_linear_interpolation','id,percentage',(c,st,a)=>pctLin(a[0],a[1]));
R('ta.percentile_nearest_rank','source,length,percentage',(c,st,a)=>{const w=win(st,a[0],a[1]);return w?pctNear(w,a[2]):NaN},1);
R('ta.percentile_linear_interpolation','source,length,percentage',(c,st,a)=>{const w=win(st,a[0],a[1]);return w?pctLin(w,a[2]):NaN},1);
const modeOf=a=>{const m=new Map();for(const v of nums(a))m.set(v,(m.get(v)||0)+1);let b=NaN,n=0;for(const[v,k]of m)if(k>n||(k===n&&v<b)){b=v;n=k}return b};
R('array.mode','id',(c,st,a)=>modeOf(a[0]));
R('ta.mode','source,length',(c,st,a)=>{const w=win(st,a[0],a[1]);return w?modeOf(w):NaN},1);
R('array.range','id',(c,st,a)=>{const n=nums(a[0]);return n.length?Math.max(...n)-Math.min(...n):NaN});
R('array.variance','id,biased',(c,st,a)=>{const n=nums(a[0]),m=n.reduce((x,y)=>x+y,0)/(n.length||1),b=a[1]===false?n.length-1:n.length;return n.length>1||a[1]!==false?n.reduce((x,y)=>x+(y-m)*(y-m),0)/b:NaN});
R('array.standardize','id',(c,st,a)=>{const n=nums(a[0]),m=n.reduce((x,y)=>x+y,0)/(n.length||1),sd=Math.sqrt(n.reduce((x,y)=>x+(y-m)*(y-m),0)/(n.length||1));return a[0].map(v=>sd?(v-m)/sd:0)});
R('array.sort_indices','id,order',(c,st,a)=>{const d=String(a[1]||'').includes('descending');return a[0].map((v,i)=>i).sort((i,j)=>d?a[0][j]-a[0][i]:a[0][i]-a[0][j])});
const bsearch=(arr,v,mode)=>{let lo=0,hi=arr.length-1;while(lo<=hi){const m=(lo+hi)>>1;if(arr[m]<v)lo=m+1;else if(arr[m]>v)hi=m-1;else{if(mode==='left'){while(m>0&&arr[m-1]===v)return bsearchEdge(arr,v,-1);return m}if(mode==='right')return bsearchEdge(arr,v,1);return m}}return mode==='left'?lo:mode==='right'?hi:-1};
const bsearchEdge=(arr,v,d)=>{let i=arr.indexOf(v);if(d<0)return i;while(i+1<arr.length&&arr[i+1]===v)i++;return i};
R('array.binary_search','id,val',(c,st,a)=>bsearch(a[0],a[1]));R('array.binary_search_leftmost','id,val',(c,st,a)=>bsearch(a[0],a[1],'left'));R('array.binary_search_rightmost','id,val',(c,st,a)=>bsearch(a[0],a[1],'right'));
R('array.percentrank','id,index',(c,st,a)=>{const n=nums(a[0]),v=a[0][a[1]];return n.length>1?n.filter(x=>x<=v).length-1>=0?(n.filter(x=>x<v).length)/(n.length-1)*100:0:NaN});
R('array.covariance','id1,id2,biased',(c,st,a)=>{const x=a[0],y=a[1],n=Math.min(x.length,y.length),mx=x.slice(0,n).reduce((p,q)=>p+q,0)/n,my=y.slice(0,n).reduce((p,q)=>p+q,0)/n;let s=0;for(let i=0;i<n;i++)s+=(x[i]-mx)*(y[i]-my);return s/(a[2]===false?n-1:n)});
R('array.every','id',(c,st,a)=>a[0].every(v=>v===true||(typeof v==='number'&&v!==0&&v===v)));R('array.some','id',(c,st,a)=>a[0].some(v=>v===true||(typeof v==='number'&&v!==0&&v===v)));
R('map.copy','id',(c,st,a)=>new Map(a[0]));R('map.put_all','id,id2',(c,st,a)=>{for(const[k,v]of a[1])a[0].set(k,v)});
R('str.match','source,regex',(c,st,a)=>{try{const m=new RegExp(String(a[1])).exec(String(a[0]));return m?m[0]:''}catch(e){return ''}});
R('str.format_time','time,format,timezone',(c,st,a)=>{const d=new Date(a[0]),p=(n,l=2)=>String(n).padStart(l,'0');return String(a[1]||'yyyy-MM-dd\'T\'HH:mm:ssZ').replace(/yyyy|yy|MM|dd|HH|hh|mm|ss|'T'|Z/g,k=>({yyyy:d.getUTCFullYear(),yy:p(d.getUTCFullYear()%100),MM:p(d.getUTCMonth()+1),dd:p(d.getUTCDate()),HH:p(d.getUTCHours()),hh:p(d.getUTCHours()%12||12),mm:p(d.getUTCMinutes()),ss:p(d.getUTCSeconds()),"'T'":'T',Z:'+0000'})[k])});
// indikator volume bawaan lainnya (variabel tanpa tanda kurung: ta.iii, ta.nvi, ta.pvi, ta.pvt, ta.wad, ta.wvad)
R('ta.iii','',(c,st)=>{const b=c.bars,i=c.i,r=b.h[i]-b.l[i];st.v=(st.v||0)+(r&&b.v[i]?(2*b.c[i]-b.h[i]-b.l[i])/(r*b.v[i]):0);return st.v},1);
R('ta.pvt','',(c,st)=>{const b=c.bars,i=c.i;st.v=(st.v||0)+(i>0&&b.c[i-1]?(b.c[i]-b.c[i-1])/b.c[i-1]*b.v[i]:0);return st.v},1);
R('ta.nvi','',(c,st)=>{const b=c.bars,i=c.i;if(st.v==null)st.v=1000;else if(i>0&&b.v[i]<b.v[i-1]&&b.c[i-1])st.v+=st.v*(b.c[i]-b.c[i-1])/b.c[i-1];return st.v},1);
R('ta.pvi','',(c,st)=>{const b=c.bars,i=c.i;if(st.v==null)st.v=1000;else if(i>0&&b.v[i]>b.v[i-1]&&b.c[i-1])st.v+=st.v*(b.c[i]-b.c[i-1])/b.c[i-1];return st.v},1);
R('ta.wad','',(c,st)=>{const b=c.bars,i=c.i;if(i===0)return st.v=0;const th=Math.max(b.h[i],b.c[i-1]),tl=Math.min(b.l[i],b.c[i-1]);st.v=(st.v||0)+(b.c[i]>b.c[i-1]?b.c[i]-tl:b.c[i]<b.c[i-1]?b.c[i]-th:0);return st.v},1);
R('ta.wvad','',(c,st)=>{const b=c.bars,i=c.i,r=b.h[i]-b.l[i];return r?(b.c[i]-b.o[i])/r*b.v[i]:0});
R('request.seed','source,symbol,expression',()=>NaN);
R('request.security_lower_tf','symbol,timeframe,expression,ignore_invalid_symbol,currency,ignore_invalid_timeframe,calc_bars_count',()=>{throw new Error('request.security_lower_tf belum didukung')});

// ---- matrix (v5.1+) ----
const M=(r,c,v)=>({_k:'matrix',r,c,d:Array.from({length:r},()=>new Array(c).fill(v===undefined?NaN:v))});
const flat=m=>[].concat(...m.d);
R('matrix.new','rows,columns,initial_value',(c,st,a)=>M(Math.max(0,a[0]|0),Math.max(0,a[1]|0),a[2]));
R('matrix.rows','id',(c,st,a)=>a[0].r);R('matrix.columns','id',(c,st,a)=>a[0].c);R('matrix.elements_count','id',(c,st,a)=>a[0].r*a[0].c);
R('matrix.get','id,row,column',(c,st,a)=>{const v=a[0].d[a[1]]&&a[0].d[a[1]][a[2]];return v===undefined?NaN:v});
R('matrix.set','id,row,column,value',(c,st,a)=>{if(a[0].d[a[1]])a[0].d[a[1]][a[2]]=a[3]});
R('matrix.fill','id,value,from_row,to_row,from_column,to_column',(c,st,a)=>{const m=a[0];for(let i=a[2]|0;i<(a[3]==null?m.r:a[3]);i++)for(let j=a[4]|0;j<(a[5]==null?m.c:a[5]);j++)m.d[i][j]=a[1]});
R('matrix.copy','id',(c,st,a)=>({_k:'matrix',r:a[0].r,c:a[0].c,d:a[0].d.map(r=>r.slice())}));
R('matrix.add_row','id,row,array_id',(c,st,a)=>{const m=a[0],row=a[2]?a[2].slice():new Array(m.c).fill(NaN),at=a[1]==null?m.r:a[1];if(m.r===0)m.c=row.length;m.d.splice(at,0,row);m.r++});
R('matrix.add_col','id,column,array_id',(c,st,a)=>{const m=a[0],col=a[2]||new Array(m.r).fill(NaN),at=a[1]==null?m.c:a[1];if(m.r===0){m.r=col.length;m.d=col.map(()=>[])}m.d.forEach((r,i)=>r.splice(at,0,col[i]===undefined?NaN:col[i]));m.c++});
R('matrix.remove_row','id,row',(c,st,a)=>{const m=a[0],at=a[1]==null?m.r-1:a[1],r=m.d.splice(at,1)[0];m.r--;return r});
R('matrix.remove_col','id,column',(c,st,a)=>{const m=a[0],at=a[1]==null?m.c-1:a[1],o=m.d.map(r=>r.splice(at,1)[0]);m.c--;return o});
R('matrix.row','id,row',(c,st,a)=>(a[0].d[a[1]]||[]).slice());R('matrix.col','id,column',(c,st,a)=>a[0].d.map(r=>r[a[1]]));
R('matrix.sum','id',(c,st,a)=>flat(a[0]).reduce((x,y)=>x+y,0));R('matrix.avg','id',(c,st,a)=>{const f=flat(a[0]);return f.reduce((x,y)=>x+y,0)/(f.length||1)});
R('matrix.min','id',(c,st,a)=>Math.min(...flat(a[0])));R('matrix.max','id',(c,st,a)=>Math.max(...flat(a[0])));
R('matrix.transpose','id',(c,st,a)=>{const m=a[0],t=M(m.c,m.r);for(let i=0;i<m.r;i++)for(let j=0;j<m.c;j++)t.d[j][i]=m.d[i][j];return t});
R('matrix.mult','id1,id2',(c,st,a)=>{const x=a[0],y=a[1];if(typeof y==='number')return{_k:'matrix',r:x.r,c:x.c,d:x.d.map(r=>r.map(v=>v*y))};if(Array.isArray(y)){return x.d.map(r=>r.reduce((s,v,j)=>s+v*y[j],0))}if(x.c!==y.r)throw new Error('Ukuran matriks tidak cocok untuk mult');const o=M(x.r,y.c,0);for(let i=0;i<x.r;i++)for(let j=0;j<y.c;j++){let s=0;for(let k=0;k<x.c;k++)s+=x.d[i][k]*y.d[k][j];o.d[i][j]=s}return o});
R('matrix.det','id',(c,st,a)=>{const m=a[0];if(m.r!==m.c)throw new Error('det butuh matriks persegi');const n=m.r,A=m.d.map(r=>r.slice());let det=1;for(let i=0;i<n;i++){let p=i;for(let k=i+1;k<n;k++)if(Math.abs(A[k][i])>Math.abs(A[p][i]))p=k;if(Math.abs(A[p][i])<1e-14)return 0;if(p!==i){[A[p],A[i]]=[A[i],A[p]];det=-det}det*=A[i][i];for(let k=i+1;k<n;k++){const f=A[k][i]/A[i][i];for(let j=i;j<n;j++)A[k][j]-=f*A[i][j]}}return det});
R('matrix.is_square','id',(c,st,a)=>a[0].r===a[0].c);
R('matrix.identity','size',(c,st,a)=>{const m=M(a[0],a[0],0);for(let i=0;i<a[0];i++)m.d[i][i]=1;return m});
G.PineLib={L,CONST,F,isNa,num,nz,tostr,tfSeconds,tfString,parseColor,rgba,win,sub,sum,trAt,NAMED,dtFns:{year:d=>d.getUTCFullYear(),month:d=>d.getUTCMonth()+1,dayofmonth:d=>d.getUTCDate(),dayofweek:d=>d.getUTCDay()+1,hour:d=>d.getUTCHours(),minute:d=>d.getUTCMinutes(),second:d=>d.getUTCSeconds(),weekofyear:d=>{const t=new Date(Date.UTC(d.getUTCFullYear(),0,1));return Math.ceil(((d-t)/86400000+t.getUTCDay()+1)/7)}}};
})(typeof self!=='undefined'?self:globalThis);
