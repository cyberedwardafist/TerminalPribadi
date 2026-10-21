// Worker sandbox indikator custom. Dimuat sebagai berkas terpisah supaya vercel.json bisa memberinya CSP sendiri
// (connect-src 'none' = tidak ada jaringan sama sekali; 'unsafe-eval' hanya berlaku di berkas ini, tidak di halaman utama).
// Pelindung lapis kedua: fetch/XMLHttpRequest/WebSocket dst. dimatikan di bawah. Dipanggil dari custom.js lewat new Worker('apps/chart/worker.js').
'use strict';
(function(){
 try{importScripts('pine/parser.js','pine/lib.js','pine/strategy.js','pine/runtime.js')}catch(e){self._pineErr=String(e)}
 for(const k of['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','indexedDB','caches','BroadcastChannel','SharedWorker','Worker','postMessage_'])try{self[k]=undefined}catch(e){}
 const post=self.postMessage.bind(self);
 const COLORS={red:'#ff6b6b',green:'#3ecf8e',blue:'#4c9aff',orange:'#e8a33d',purple:'#b58cff',yellow:'#c0ca33',white:'#e6e8eb',gray:'#8a93a0',aqua:'#4dd0e1',teal:'#26a69a',lime:'#8bc34a',maroon:'#a33',navy:'#2a4',fuchsia:'#ff7ad9',silver:'#b0b6bf',black:'#222',olive:'#808000'};
 // ----- ta stateful per bar -----
 function makeT(B){let cur=0;const S={},st=id=>S[id]||(S[id]={});
  const win=(id,x,n)=>{const s=st(id),a=s.a||(s.a=[]);a.push(x);if(a.length>n)a.shift();return a.length===n?a:null};
  const T={at:i=>{cur=i},
   sma:(id,x,n)=>{const a=win(id,x,n);return a?a.reduce((p,c)=>p+c,0)/n:NaN},
   wma:(id,x,n)=>{const a=win(id,x,n);if(!a)return NaN;let s=0,w=0;for(let i=0;i<n;i++){s+=a[i]*(i+1);w+=i+1}return s/w},
   ema:(id,x,n,al)=>{const s=st(id),k=al||2/(n+1);if(s.v==null){s.c=(s.c||0)+1;s.s=(s.s||0)+x;if(s.c<n)return NaN;s.v=s.s/n;return s.v}s.v=x*k+s.v*(1-k);return s.v},
   rma:(id,x,n)=>T.ema(id,x,n,1/n),
   rsi:(id,x,n)=>{const s=st(id);if(s.p==null){s.p=x;return NaN}const d=x-s.p;s.p=x;const g=T.rma(id+'g',Math.max(d,0),n),l=T.rma(id+'l',Math.max(-d,0),n);if(isNaN(g))return NaN;return l===0?100:100-100/(1+g/l)},
   stdev:(id,x,n)=>{const a=win(id,x,n);if(!a)return NaN;const m=a.reduce((p,c)=>p+c,0)/n;return Math.sqrt(a.reduce((p,c)=>p+(c-m)*(c-m),0)/n)},
   highest:(id,x,n)=>{const a=win(id,x,n);return a?Math.max(...a):NaN},
   lowest:(id,x,n)=>{const a=win(id,x,n);return a?Math.min(...a):NaN},
   change:(id,x,l)=>{l=l||1;const a=win(id,x,l+1);return a?a[l]-a[0]:NaN},
   crossover:(id,a,b)=>{const s=st(id),r=s.d!=null&&s.d<=0&&a-b>0;s.d=a-b;return r},
   crossunder:(id,a,b)=>{const s=st(id),r=s.d!=null&&s.d>=0&&a-b<0;s.d=a-b;return r},
   tr:id=>{const h=B.h[cur],l=B.l[cur],pc=cur?B.c[cur-1]:null;return pc==null?h-l:Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc))},
   atr:(id,n)=>T.rma(id+'t',T.tr(id),n),
   macd:(id,x,f,s,g)=>{const m=T.ema(id+'f',x,f)-T.ema(id+'s',x,s),sg=T.ema(id+'g',isNaN(m)?0:m,g);return[m,isNaN(m)?NaN:sg,isNaN(m)?NaN:m-sg]},
   bb:(id,x,n,m)=>{const b=T.sma(id+'m',x,n),d=T.stdev(id+'d',x,n);return[b,b+m*d,b-m*d]}};
  return T}
 const vec=(B,name)=>(arr,...a)=>{const T=makeT(B);return arr.map((x,i)=>{T.at(i);return T[name]('v',x,...a)})};
 const nz=(x,d)=>x==null||isNaN(x)?(d==null?0:d):x;
 function arrays(b){const n=b.t.length,o={open:b.o,high:b.h,low:b.l,close:b.c,volume:b.v,time:b.t};o.hl2=b.h.map((v,i)=>(v+b.l[i])/2);o.hlc3=b.h.map((v,i)=>(v+b.l[i]+b.c[i])/3);o.ohlc4=b.o.map((v,i)=>(v+b.h[i]+b.l[i]+b.c[i])/4);o.bar_index=b.t.map((_,i)=>i);return o}
 function out(R,n){const lim=a=>a.slice(0,n).map(v=>typeof v==='number'&&isFinite(v)?v:null);return{overlay:R.overlay,plots:R.plots.map(p=>({k:p.k,c:p.c,t:p.t,w:p.w,data:lim(p.data)})),levels:R.levels,markers:R.markers.slice(-1500)}}
 const mkR=()=>({overlay:null,plots:[],levels:[],markers:[]});
 function runJs(src,p,bars){const A=arrays(bars),B={h:bars.h,l:bars.l,c:bars.c},R=mkR();
  const ta={};for(const k of['sma','wma','ema','rma','rsi','stdev','highest','lowest','change','atr'])ta[k]=k==='atr'?n=>{const T=makeT(B);return bars.t.map((_,i)=>{T.at(i);return T.atr('v',n)})}:vec(B,k);
  ta.tr=()=>{const T=makeT(B);return bars.t.map((_,i)=>{T.at(i);return T.tr('v')})};
  ta.crossover=(a,b)=>{const T=makeT(B);return a.map((x,i)=>{T.at(i);return T.crossover('v',x,b[i]??b)})};ta.crossunder=(a,b)=>{const T=makeT(B);return a.map((x,i)=>{T.at(i);return T.crossunder('v',x,b[i]??b)})};
  ta.macd=(a,f,s,g)=>{const T=makeT(B),r=a.map((x,i)=>{T.at(i);return T.macd('v',x,f,s,g)});return{macd:r.map(q=>q[0]),signal:r.map(q=>q[1]),hist:r.map(q=>q[2])}};
  ta.bb=(a,n,m)=>{const T=makeT(B),r=a.map((x,i)=>{T.at(i);return T.bb('v',x,n,m)});return{mid:r.map(q=>q[0]),upper:r.map(q=>q[1]),lower:r.map(q=>q[2])}};
  const plot=(name,data,o)=>{o=o||{};if(!Array.isArray(data))throw new Error('plot() butuh array');R.plots.push({k:String(name).slice(0,24),data,c:COLORS[o.color]||o.color,t:o.type==='hist'||o.type==='histogram'?'hist':o.type==='dots'?'dots':'line',w:o.width})};
  const hline=(v,c)=>R.levels.push({v:+v,c:COLORS[c]||c}),marker=(i,side,o)=>{o=o||{};R.markers.push({i:i|0,s:side==='down'?'down':'up',c:COLORS[o.color]||o.color,txt:o.text})},overlay=v=>{R.overlay=!!v};
  const fn=new Function('open','high','low','close','volume','time','hl2','hlc3','ohlc4','p','ta','plot','hline','marker','overlay','nz','Math',`"use strict";\n${src}`);
  fn(A.open,A.high,A.low,A.close,A.volume,A.time,A.hl2,A.hlc3,A.ohlc4,p,ta,plot,hline,marker,overlay,nz,Math);return R}
 const jsOut=(R,n)=>{const o=out(R,n);o.markers=o.markers.map(m=>({i:m.i,s:m.s==='down'?'triangledown':'triangleup',l:m.s==='down'?'abovebar':'belowbar',c:m.c||null,tc:null,x:m.txt||'',z:'auto'}));o.kind='indicator';o.fills=[];o.bg=[];o.barcol=[];o.candles=[];o.objs=[];o.alerts=[];o.events=[];o.title=null;o.short=null;return o};
 self.onmessage=e=>{const{id,lang,src,p,bars,sec,opts}=e.data;try{
  if(lang==='pine'){if(!self.PineRun)throw new Error('Interpreter Pine gagal dimuat');
   let r;try{r=self.PineRun.run(src,p||{},bars,Object.assign({},opts,{sec:sec||{}}))}catch(err){if(err instanceof self.PineRun.NeedData){post({id,need:err.need});return}throw err}
   post({id,ok:r,inputs:r.inputs});return}
  const R=runJs(src,p,bars);post({id,ok:jsOut(R,bars.t.length),inputs:R.inputs})}catch(err){post({id,err:String(err&&err.message||err).slice(0,400)})}}
})();
