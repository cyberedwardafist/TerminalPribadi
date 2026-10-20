// Worker sandbox indikator custom. Dimuat sebagai berkas terpisah supaya vercel.json bisa memberinya CSP sendiri
// (connect-src 'none' = tidak ada jaringan sama sekali; 'unsafe-eval' hanya berlaku di berkas ini, tidak di halaman utama).
// Pelindung lapis kedua: fetch/XMLHttpRequest/WebSocket dst. dimatikan di bawah. Dipanggil dari custom.js lewat new Worker('apps/chart/worker.js').
'use strict';
(function(){
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
 // ----- Pine -> JS per bar -----
 function splitTop(s){const r=[];let d=0,q=null,cur='';for(const ch of s){if(q){cur+=ch;if(ch===q)q=null;continue}if(ch==='"'||ch==="'"){q=ch;cur+=ch;continue}if('([{'.includes(ch))d++;if(')]}'.includes(ch))d--;if(ch===','&&d===0){r.push(cur.trim());cur=''}else cur+=ch}if(cur.trim())r.push(cur.trim());return r}
 const FN={abs:'Math.abs',max:'Math.max',min:'Math.min',sqrt:'Math.sqrt',log:'Math.log',exp:'Math.exp',pow:'Math.pow',floor:'Math.floor',ceil:'Math.ceil',round:'Math.round',sign:'Math.sign',nz:'nz'};
 function pine(src,p,bars){const A=arrays(bars),B={h:bars.h,l:bars.l,c:bars.c},n=bars.t.length,R=mkR(),V={...A},T=makeT(B);const consts={},alias={},known=new Set(Object.keys(A));let site=0,code=[],plots=0;
  const err=(m,l)=>{throw new Error('Pine'+(l?' baris '+l:'')+': '+m)};
  const tx=(e,ln)=>{let o='',i=0;while(i<e.length){const ch=e[i];
    if(/\s/.test(ch)){o+=ch;i++;continue}
    if(ch==='"'||ch==="'"){const j=e.indexOf(ch,i+1);if(j<0)err('string tidak ditutup',ln);o+=e.slice(i,j+1);i=j+1;continue}
    if(/\d|\.\d/.test(ch)){const m=/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(e.slice(i));o+=m[0];i+=m[0].length;continue}
    if(/[A-Za-z_]/.test(ch)){const m=/^[A-Za-z_][\w.]*/.exec(e.slice(i))[0];i+=m.length;const rest=e.slice(i),call=/^\s*\(/.test(rest);
     if(m.startsWith('ta.')){const f=m.slice(3);if(!T[f]||f==='at')err('ta.'+f+' belum didukung',ln);if(call){i+=rest.indexOf('(')+1;const emp=/^\s*\)/.test(e.slice(i));o+=`T.${f}(${++site}${emp?'':','}`}else o+=`T.${f}(${++site})`;continue}
     if(m.startsWith('math.')){o+='Math.'+m.slice(5);continue}
     if(m.startsWith('color.')){const c=m.slice(6);if(c==='new'){i+=rest.indexOf('(')+1;o+='cnew(';continue}o+=JSON.stringify(COLORS[c]||'#8a93a0');continue}
     if(m==='and'){o+='&&';continue}if(m==='or'){o+='||';continue}if(m==='not'){o+='!';continue}if(m==='true'||m==='false'){o+=m;continue}
     if(m==='na'){if(call){i+=rest.indexOf('(')+1;o+='isNaN(';}else o+='NaN';continue}
     if(call&&FN[m]){o+=FN[m];continue}
     const nm=alias[m]||m;
     if(m in consts){o+='('+JSON.stringify(consts[m])+')';continue}
     if(!known.has(nm))err('simbol tidak dikenal "'+m+'"',ln);
     if(e[i]==='['){let d=0,j=i;for(;j<e.length;j++){if(e[j]==='[')d++;else if(e[j]===']'&&--d===0)break}o+=`G(${JSON.stringify(nm)},i-(${tx(e.slice(i+1,j),ln)}))`;i=j+1}else o+=`G(${JSON.stringify(nm)},i)`;continue}
    o+=ch;i++}return o.replace(/\bnot\s*/g,'!')};
  const named=(args,names)=>{const o={},pos=[];for(const a of args){const m=/^(\w+)\s*=(?!=)\s*(.*)$/s.exec(a);if(m)o[m[1]]=m[2];else pos.push(a)}return{o,pos}};
  const lit=s=>{if(s==null)return undefined;try{return Function('"use strict";return('+s.replace(/\bcolor\.(\w+)/g,(_,c)=>JSON.stringify(COLORS[c]||'#8a93a0'))+')')()}catch(e){return undefined}};
  const lines=src.split(/\r?\n/);const meta={inputs:[]};
  lines.forEach((raw,li)=>{const ln=li+1;let l=raw.replace(/\/\/.*$/,'').trim();if(!l||l[0]==='@')return;
   if(/^(if|for|while|switch)\b|=>/.test(l)||/^\s{2,}/.test(raw)&&false)err('if/for/fungsi buatan belum didukung',ln);
   let m;
   if(m=/^indicator\s*\((.*)\)$/.exec(l)){const o=named(splitTop(m[1])).o;if(/^true$/.test((o.overlay||'').trim()))R.overlay=true;return}
   if(/^(strategy|library)\b/.test(l))err('hanya indicator() yang didukung',ln);
   if(/^(bgcolor|barcolor|alertcondition|label|line|box|table)\b/.test(l))return;
   if(m=/^hline\s*\((.*)\)$/.exec(l)){const a=named(splitTop(m[1]));R.levels.push({v:+lit(a.pos[0]),c:lit(a.o.color)});return}
   if(m=/^plot\s*\((.*)\)$/.exec(l)){const a=named(splitTop(m[1])),k=plots++,title=lit(a.o.title||a.pos[1])||'plot '+(k+1),st=(a.o.style||'')+'';
    R.plots.push({k:String(title).slice(0,24),data:new Array(n).fill(NaN),c:lit(a.o.color),w:+lit(a.o.linewidth)||undefined,t:/histogram|columns/.test(st)?'hist':/circles|cross/.test(st)?'dots':'line'});code.push(`PL(${k},i,${tx(a.pos[0],ln)});`);return}
   if(m=/^plotshape\s*\((.*)\)$/.exec(l)){const a=named(splitTop(m[1])),down=/down|abovebar/.test((a.o.style||'')+(a.o.location||''));code.push(`if(${tx(a.pos[0],ln)})MK(i,${down?"'down'":"'up'"},${JSON.stringify(lit(a.o.color)||null)},${JSON.stringify(lit(a.o.text)||null)});`);return}
   if(m=/^(?:\w+\s+)?(\w+)\s*=\s*input(?:\.(\w+))?\s*\((.*)\)$/.exec(l)){const a=named(splitTop(m[3])),kind=m[2]||'float',d=a.pos[0];
    if(kind==='source'){alias[m[1]]=(d||'close').trim();known.add(m[1]);return}
    const def=kind==='bool'?d==='true':kind==='string'?lit(d):+lit(d),val=p&&p[m[1]]!==undefined&&kind!=='string'&&kind!=='bool'?+p[m[1]]:def;consts[m[1]]=val;
    if(kind==='int'||kind==='float')meta.inputs.push({key:m[1],label:lit(a.o.title||a.pos[1])||m[1],def,min:lit(a.o.minval),max:lit(a.o.maxval)});return}
   if(m=/^\[([\w\s,]+)\]\s*=\s*(.*)$/.exec(l)){const names=m[1].split(',').map(s=>s.trim());names.forEach(x=>{known.add(x);V[x]=new Array(n).fill(NaN)});code.push(`{const r=${tx(m[2],ln)};${names.map((x,j)=>`V.${x}[i]=r[${j}];`).join('')}}`);return}
   if(m=/^(?:(?:var|varip)\s+)?(?:(?:int|float|bool|string|series\s+\w+)\s+)?(\w+)\s*:?=\s*(.*)$/.exec(l)){if(/^(close|open|high|low|volume)$/.test(m[1]))err('nama bawaan tidak dapat ditimpa',ln);const rhs=tx(m[2],ln);known.add(m[1]);V[m[1]]=new Array(n).fill(NaN);code.push(`V.${m[1]}[i]=${rhs};`);return}
   err('sintaks tidak dikenali: '+l.slice(0,40),ln)});
  if(!R.plots.length)err('tidak ada plot()');
  const G=(k,j)=>j<0||j>=n?NaN:V[k][j],PL=(k,i,v)=>{R.plots[k].data[i]=v},MK=(i,s,c,t)=>R.markers.push({i,s,c,txt:t}),cnew=c=>c;
  const step=new Function('G','T','V','PL','MK','nz','cnew','i','"use strict";'+code.join('\n'));
  for(let i=0;i<n;i++){T.at(i);step(G,T,V,PL,MK,nz,cnew,i)}
  R.inputs=meta.inputs;return R}
 self.onmessage=e=>{const{id,lang,src,p,bars}=e.data;try{const R=lang==='pine'?pine(src,p,bars):runJs(src,p,bars);post({id,ok:out(R,bars.t.length),inputs:R.inputs})}catch(err){post({id,err:String(err&&err.message||err).slice(0,300)})}}
})();
