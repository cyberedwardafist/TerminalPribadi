// Interpreter Pine: eksekusi per bar dengan semantik seri (riwayat x[n]), var/varip, fungsi buatan, UDT, loop, request.security,
// serta keluaran (plot, plotshape, bgcolor, fill, hline, label/line/box, alertcondition) yang dikembalikan sebagai data ke halaman.
(function(G){'use strict';
const{PineError,parse}=G.PineParse,PL=G.PineLib,{L,CONST,F,isNa,num,nz,tostr,tfSeconds,tfString,parseColor,rgba}=PL;
const BRK={b:1},CNT={c:1};
class NeedData{constructor(need){this.need=need}}
class Cell{constructor(){this.v=NaN;this.hist=[];this.init=false}}
class Frame{constructor(){this.cells=new Map();this.st=new Map();this.kids=new Map()}}
class Scope{constructor(parent,frame){this.parent=parent;this.frame=frame;this.vars=new Map()}
 find(n){for(let s=this;s;s=s.parent){const c=s.vars.get(n);if(c)return c}return null}}
const truthy=v=>v===true||(typeof v==='number'&&v===v&&v!==0);
const pathOf=n=>n.k==='Id'?n.name:n.k==='Member'?(pathOf(n.obj)?pathOf(n.obj)+'.'+n.prop:null):null;
const SERIES=new Set(['open','high','low','close','volume','hl2','hlc3','ohlc4','hlcc4','bar_index','time','time_close']);
const CONSTNS=new Set(['shape','location','plot','size','line','label','hline','display','format','extend','xloc','yloc','position','text','order','currency','session','dayofweek','adjustment','scale','alert','barmerge','earnings','dividends','splits','font','box','table','math','color','strategy','position','backadjustment','settlement_as_close','chart']);

function identAt(name,c,j){const b=c.bars;if(j<0||j>=c.n)return NaN;
 switch(name){
  case 'open':return b.o[j];case 'high':return b.h[j];case 'low':return b.l[j];case 'close':return b.c[j];case 'volume':return b.v[j];
  case 'hl2':return(b.h[j]+b.l[j])/2;case 'hlc3':return(b.h[j]+b.l[j]+b.c[j])/3;case 'ohlc4':return(b.o[j]+b.h[j]+b.l[j]+b.c[j])/4;case 'hlcc4':return(b.h[j]+b.l[j]+2*b.c[j])/4;
  case 'bar_index':return j;case 'time':return b.t[j]*1000;case 'time_close':return(b.t[j]+c.tfSec)*1000}
 return undefined}
function ident(name,c){
 const v=identAt(name,c,c.i);if(v!==undefined)return v;
 switch(name){
  case 'na':return NaN;case 'last_bar_index':return c.n-1;case 'last_bar_time':return c.bars.t[c.n-1]*1000;case 'timenow':return Date.now();
  case 'time_tradingday':return Math.floor(c.bars.t[c.i]/86400)*86400000;
  case 'year':case 'month':case 'dayofmonth':case 'dayofweek':case 'hour':case 'minute':case 'second':case 'weekofyear':return PL.dtFns[name](new Date(c.bars.t[c.i]*1000));
 }
 return undefined}
// konstanta bernilai fungsi dari konteks
const NSVAL={
 'syminfo.tickerid':c=>c.sym,'syminfo.ticker':c=>String(c.sym).replace(/^.*:/,''),'syminfo.prefix':c=>'','syminfo.mintick':c=>c.mintick,'syminfo.pointvalue':c=>1,'syminfo.currency':c=>c.currency||'USD','syminfo.basecurrency':c=>'','syminfo.type':c=>c.symType||'crypto','syminfo.timezone':c=>'UTC','syminfo.description':c=>c.sym,'syminfo.session':c=>'24x7',
 'timeframe.period':c=>tfString(c.tfSec),'timeframe.multiplier':c=>{const s=c.tfSec;return s>=2592000?s/2592000:s>=604800?s/604800:s>=86400?s/86400:s>=60?s/60:s},
 'timeframe.isintraday':c=>c.tfSec<86400,'timeframe.isdaily':c=>c.tfSec>=86400&&c.tfSec<604800,'timeframe.isweekly':c=>c.tfSec>=604800&&c.tfSec<2592000,'timeframe.ismonthly':c=>c.tfSec>=2592000,'timeframe.isdwm':c=>c.tfSec>=86400,'timeframe.isseconds':c=>c.tfSec<60,'timeframe.main_period':c=>tfString(c.tfSec),
 'barstate.isfirst':c=>c.i===0,'barstate.islast':c=>c.i===c.n-1,'barstate.ishistory':c=>c.i<c.n-1,'barstate.isrealtime':c=>c.i===c.n-1&&!!c.live,'barstate.isnew':c=>true,'barstate.isconfirmed':c=>true,'barstate.islastconfirmedhistory':c=>c.i===c.n-2,
 'chart.is_standard':c=>true,'chart.is_heikinashi':c=>false,'chart.is_renko':c=>false,'chart.bg_color':c=>'#ffffff','chart.fg_color':c=>'#131722','chart.is_kagi':c=>false,'chart.is_linebreak':c=>false,'chart.is_pnf':c=>false,'chart.is_range':c=>false,
};

// ---------- operator ----------
function bin(op,a,b){
 switch(op){
  case '+':if(typeof a==='string'||typeof b==='string')return tostr(a)+tostr(b);return num(a)+num(b);
  case '-':return num(a)-num(b);case '*':return num(a)*num(b);case '/':return num(a)/num(b);case '%':return num(a)%num(b);
  case '==':return eq(a,b);case '!=':return!eq(a,b);
  case '<':return cmpv(a)<cmpv(b);case '<=':return cmpv(a)<=cmpv(b);case '>':return cmpv(a)>cmpv(b);case '>=':return cmpv(a)>=cmpv(b)}
 throw new Error('Operator tidak dikenal '+op)}
const cmpv=x=>typeof x==='string'?x:num(x);
const eq=(a,b)=>{if(typeof a==='number'&&typeof b==='number')return a===b;if(typeof a==='boolean'||typeof b==='boolean')return truthy(a)===truthy(b);if(isNa(a)||isNa(b))return false;return a===b};

// ---------- jalankan ----------
function run(src,params,bars,opts){
 opts=opts||{};params=params||{};
 const ast=parse(src),n=bars.t.length;
 const c={bars,n,i:0,key:'',ops:0,params,inputs:[],inputKeys:new Set(),funcs:new Map(),types:new Map(),enums:new Map(),varCells:[],sec:opts.sec||{},sym:opts.sym||'SYMBOL',tfSec:opts.tfSec||3600,mintick:opts.mintick||.01,live:!!opts.live,symType:opts.symType,hint:null,
  out:{plots:[],hlines:[],fills:[],markers:[],bg:[],barcol:[],candles:[],objs:[],alerts:[],events:[],meta:{overlay:null,title:null,short:null,kind:'indicator'}},plotKeys:new Set(),strat:null,version:ast.version||5};
 const root=new Frame(),gs=new Scope(null,root);c.global=gs;c.root=root;
 for(const s of ast.body){if(s.k==='FuncDef')c.funcs.set(s.name,{node:s,scope:gs});else if(s.k==='TypeDef')c.types.set(s.name,s);else if(s.k==='EnumDef')c.enums.set(s.name,s.vals)}
 const body=ast.body.filter(s=>s.k!=='FuncDef'&&s.k!=='TypeDef'&&s.k!=='EnumDef');
 for(let i=0;i<n;i++){
  c.i=i;c.key='';
  if(c.strat&&G.PineStrategy)G.PineStrategy.beginBar(c);
  for(const s of body){
   try{ev(s,gs,c)}catch(e){wrapErr(e,s)}}
  for(const cell of c.varCells)cell.hist[i]=cell.v;
  if(c.strat&&G.PineStrategy)G.PineStrategy.endBar(c)}
 return finalize(c)}
function wrapErr(e,node){if(e instanceof NeedData||e instanceof PineError)throw e;throw new PineError(String(e&&e.message||e),node.ln)}

// ---------- evaluasi ----------
function cellFor(fr,node,c,sfx){const k=node.id+(sfx||'')+c.key;let x=fr.cells.get(k);if(!x){x=new Cell();fr.cells.set(k,x)}return x}
const setCell=(cell,v,c)=>{cell.v=v;cell.hist[c.i]=v};
function stateOf(sc,node,c){const k=node.id+c.key;let s=sc.frame.st.get(k);if(!s){s={};sc.frame.st.set(k,s)}return s}
function execBlock(blk,sc,c,fresh){
 const s=fresh===false?sc:new Scope(sc,sc.frame);let v;
 for(const st of blk.body){
  try{v=ev(st,s,c)}catch(e){wrapErr(e,st)}
  if(v===BRK||v===CNT)return v}
 return v}
function ev(n,sc,c){
 switch(n.k){
  case 'Num':case 'Str':case 'Bool':return n.v;
  case 'Col':{const h=n.v;return h.length===8?rgba(parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),parseInt(h.slice(6),16)/255):'#'+h}
  case 'Id':{const cell=sc.find(n.name);if(cell)return cell.v;const v=ident(n.name,c);if(v!==undefined)return v;
   if(c.funcs.has(n.name))throw new PineError(`"${n.name}" adalah fungsi; panggil dengan tanda kurung`,n.ln);
   const lf=L[n.name]||L['ta.'+n.name]||L['math.'+n.name];if(lf&&lf.p&&lf.p.length===0)return callLib(lf,n,sc,c,[]);
   if(c.enums.has(n.name))return n.name;
   throw new PineError(`Variabel "${n.name}" tidak dikenal`,n.ln)}
  case 'Binary':return bin(n.op,ev(n.l,sc,c),ev(n.r,sc,c));
  case 'Logic':{const a=ev(n.l,sc,c);if(n.op==='and')return truthy(a)?truthy(ev(n.r,sc,c)):false;return truthy(a)?true:truthy(ev(n.r,sc,c))}
  case 'Unary':{const v=ev(n.e,sc,c);return n.op==='not'?!truthy(v):n.op==='-'?-num(v):num(v)}
  case 'Ternary':return truthy(ev(n.c,sc,c))?ev(n.a,sc,c):ev(n.b,sc,c);
  case 'ArrayLit':return n.items.map(e=>ev(e,sc,c));
  case 'Member':return evalMember(n,sc,c);
  case 'Index':return evalIndex(n,sc,c);
  case 'Call':return evalCall(n,sc,c);
  case 'Block':return execBlock(n,sc,c);
  case 'If':{if(truthy(ev(n.c,sc,c)))return execBlock(n.a,sc,c);return n.b?execBlock(n.b,sc,c):NaN}
  case 'For':return evalFor(n,sc,c);
  case 'ForIn':return evalForIn(n,sc,c);
  case 'While':{let v,g=0;const ok=c.key;while(truthy(ev(n.c,sc,c))){if(++g>1e6)throw new PineError('Loop while terlalu panjang',n.ln);c.key=ok+'.'+g;v=execBlock(n.body,sc,c);if(v===BRK){v=undefined;break}}c.key=ok;return v}
  case 'Switch':{
   if(n.subj){const s=ev(n.subj,sc,c);for(const k of n.cases)if(eq(ev(k.c,sc,c),s))return execBlock(k.body,sc,c)}
   else for(const k of n.cases)if(truthy(ev(k.c,sc,c)))return execBlock(k.body,sc,c);
   return n.def?execBlock(n.def,sc,c):NaN}
  case 'Break':return BRK;case 'Continue':return CNT;
  case 'Assign':return evalAssign(n,sc,c);
  case 'TupleAssign':{const v=ev(n.value,sc,c);if(!Array.isArray(v))throw new PineError('Sisi kanan tuple harus mengembalikan beberapa nilai',n.ln);
   n.names.forEach((nm,j)=>{if(nm==='_')return;const cell=cellFor(sc.frame,n,c,':'+nm);setCell(cell,v[j]===undefined?NaN:v[j],c);sc.vars.set(nm,cell)});return v}
  case 'FuncDef':c.funcs.set(n.name,{node:n,scope:sc});return undefined;
  case 'TypeDef':c.types.set(n.name,n);return undefined;
  case 'EnumDef':c.enums.set(n.name,n.vals);return undefined;
 }
 throw new PineError('Node tidak dikenal: '+n.k,n.ln)}

function evalAssign(n,sc,c){
 const t=n.target;
 if(n.decl){
  if(t.k!=='Id')throw new PineError('Deklarasi harus berupa nama variabel',n.ln);
  const cell=cellFor(sc.frame,n,c);
  if(n.isVar){
   if(!cell.init){cell.init=true;c.varCells.push(cell);c.hint=t.name;const v=ev(n.value,sc,c);c.hint=null;setCell(cell,v,c)}
   sc.vars.set(t.name,cell);return cell.v}
  c.hint=t.name;const v=ev(n.value,sc,c);c.hint=null;setCell(cell,v,c);sc.vars.set(t.name,cell);return v}
 let v=ev(n.value,sc,c);
 if(t.k==='Member'){const o=ev(t.obj,sc,c);if(o==null||typeof o!=='object')throw new PineError('Objek tidak valid untuk penugasan field',n.ln);if(n.op!==':=')v=bin(n.op[0],o[t.prop],v);o[t.prop]=v;return v}
 const cell=sc.find(t.name);if(!cell)throw new PineError(`Variabel "${t.name}" belum dideklarasikan (gunakan "=" untuk membuat variabel baru)`,n.ln);
 if(n.op!==':=')v=bin(n.op[0],cell.v,v);
 setCell(cell,v,c);return v}

function evalFor(n,sc,c){
 const a=num(ev(n.from,sc,c)),b=num(ev(n.to,sc,c));let by=n.by?num(ev(n.by,sc,c)):(a<=b?1:-1);
 if(!by)throw new PineError('Langkah for tidak boleh 0',n.ln);
 const cell=new Cell(),ok=c.key;let v,g=0;
 for(let i=a;by>0?i<=b:i>=b;i+=by){
  if(++g>2e6)throw new PineError('Loop for terlalu panjang',n.ln);
  const s=new Scope(sc,sc.frame);cell.v=i;s.vars.set(n.v,cell);c.key=ok+'.'+g;
  v=execBlock(n.body,s,c,false);if(v===BRK){v=undefined;break}}
 c.key=ok;return v}
function evalForIn(n,sc,c){
 const it=ev(n.it,sc,c);if(!Array.isArray(it)&&!(it instanceof Map))throw new PineError('for-in membutuhkan array',n.ln);
 const arr=it instanceof Map?[...it.entries()].map(e=>e[1]):it,ok=c.key;let v,g=0;
 for(let i=0;i<arr.length;i++){
  const s=new Scope(sc,sc.frame);
  if(n.names.length===2){const a=new Cell(),b=new Cell();a.v=i;b.v=arr[i];s.vars.set(n.names[0],a);s.vars.set(n.names[1],b)}
  else{const b=new Cell();b.v=arr[i];s.vars.set(n.names[0],b)}
  c.key=ok+'.'+(++g);v=execBlock(n.body,s,c,false);if(v===BRK){v=undefined;break}}
 c.key=ok;return v}

function evalMember(n,sc,c){
 const path=pathOf(n);
 if(path){
  const first=path.slice(0,path.indexOf('.'));
  if(!sc.find(first)){
   if(path in CONST)return CONST[path];
   if(c.enums.has(first))return path;
   if(NSVAL[path])return NSVAL[path](c);
   const lf=L[path];if(lf&&lf.p&&lf.p.length<=1&&/^ta\.(tr|obv|vwap|accdist|iii|pvt|nvi|pvi|wad|wvad)$/.test(path))return callLib(lf,n,sc,c,[]);
   if(c.strat&&G.PineStrategy){const sv=G.PineStrategy.value(path,c);if(sv!==undefined)return sv}
   if(CONSTNS.has(first))return path;
   throw new PineError(`"${path}" tidak dikenal`,n.ln)}}
 const o=ev(n.obj,sc,c);
 if(o==null||typeof o!=='object')throw new PineError(`Tidak dapat mengakses ".${n.prop}" pada nilai non-objek`,n.ln);
 if(!(n.prop in o)&&!o.__t)throw new PineError(`Field "${n.prop}" tidak ada`,n.ln);
 const v=o[n.prop];return v===undefined?NaN:v}

function evalIndex(n,sc,c){
 const k=Math.floor(num(ev(n.idx,sc,c)));
 if(isNaN(k)||k<0)return NaN;
 const o=n.obj;
 if(o.k==='Id'){
  const cell=sc.find(o.name);
  if(cell){if(k===0)return cell.v;const x=cell.hist[c.i-k];return x===undefined?NaN:x}
  const v=identAt(o.name,c,c.i-k);if(v!==undefined)return v;
  if(SERIES.has(o.name)||['year','month','dayofmonth','dayofweek','hour','minute'].includes(o.name)){return c.i-k<0?NaN:identOffset(o.name,c,k)}}
 const v=ev(o,sc,c),st=stateOf(sc,n,c);(st.h||(st.h=[]))[c.i]=v;
 if(k===0)return v;const x=st.h[c.i-k];return x===undefined?NaN:x}
function identOffset(name,c,k){const j=c.i-k;if(j<0)return NaN;return PL.dtFns[name](new Date(c.bars.t[j]*1000))}

// ---------- panggilan ----------
function lookupLib(path){
 let f=L[path];if(f)return f;
 if(!path.includes('.'))return L['ta.'+path]||L['math.'+path]||L['str.'+path]||L['array.'+path]||null;
 if(path.startsWith('table.')||path.startsWith('linefill.')||path.startsWith('polyline.')||path.startsWith('log.')||path.startsWith('chart.point'))return NOOP;
 return null}
const NOOP={p:null,v:true,f:()=>({_k:'noop'}),s:false};
function bindArgs(fn,node,sc,c,pre){
 const vals=pre?pre.slice():[],named=[];
 for(const a of node.args){const v=ev(a.v,sc,c);if(a.n)named.push([a.n,v]);else vals.push(v)}
 if(named.length){
  if(!fn.p){for(const[,v]of named)vals.push(v)}
  else for(const[k,v]of named){const j=fn.p.indexOf(k);if(j<0)throw new PineError(`Argumen "${k}" tidak dikenal untuk ${node.path||'fungsi ini'}`,node.ln);vals[j]=v}}
 return vals}
function callLib(fn,node,sc,c,vals){
 const st=fn.s?stateOf(sc,node,c):null;
 return fn.f(c,st,vals,node)}
function callUser(fv,node,sc,c,pre){
 const key=node.id+c.key,pf=sc.frame;let fr=pf.kids.get(key);if(!fr){fr=new Frame();pf.kids.set(key,fr)}
 const fn=fv.node,s=new Scope(fv.scope,fr),vals=pre?pre.slice():[],named={};
 for(const a of node.args){const v=ev(a.v,sc,c);if(a.n)named[a.n]=v;else vals.push(v)}
 const ok=c.key;c.key='';
 fn.params.forEach((p,j)=>{let v;
  if(j<vals.length&&vals[j]!==undefined)v=vals[j];else if(p.name in named)v=named[p.name];else if(p.def)v=ev(p.def,s,c);else v=NaN;
  let cell=fr.cells.get('p:'+p.name);if(!cell){cell=new Cell();fr.cells.set('p:'+p.name,cell)}setCell(cell,v,c);s.vars.set(p.name,cell)});
 for(const k in named)if(!fn.params.some(p=>p.name===k))throw new PineError(`Argumen "${k}" tidak dikenal untuk ${fn.name}`,node.ln);
 let r;try{r=execBlock(fn.body,s,c,false)}finally{c.key=ok}
 return r===BRK||r===CNT?NaN:r}
function newUDT(type,node,sc,c){
 const t=c.types.get(type),o={__t:type},vals=[];const named={};
 for(const a of node.args){const v=ev(a.v,sc,c);if(a.n)named[a.n]=v;else vals.push(v)}
 t.fields.forEach((f,j)=>{o[f.name]=j<vals.length?vals[j]:f.name in named?named[f.name]:f.def?ev(f.def,sc,c):NaN});return o}
function evalCall(n,sc,c){
 if(++c.ops>3e7)throw new PineError('Terlalu banyak operasi; periksa loop',n.ln);
 const path=n.path;
 if(path==='request.security'||path==='security')return reqSecurity(n,sc,c);
 if(path){
  if(!path.includes('.')){
   const fv=c.funcs.get(path);if(fv)return callUser(fv,n,sc,c);
   if(c.strat&&G.PineStrategy&&G.PineStrategy.has('strategy.'+path)){}
  }else{
   const first=path.slice(0,path.indexOf('.'));
   if(sc.find(first))return callMethod(n,sc,c);
   if(path.endsWith('.new')&&c.types.has(path.slice(0,-4)))return newUDT(path.slice(0,-4),n,sc,c);
   if(c.strat&&G.PineStrategy&&path.startsWith('strategy.')){const sf=G.PineStrategy.fn(path);if(sf)return sf.f(c,stateOf(sc,n,c),bindArgs(sf,n,sc,c),n)}
  }
  const fn=lookupLib(path);
  if(fn)return callLib(fn,n,sc,c,bindArgs(fn,n,sc,c));
  throw new PineError(`Fungsi "${path}" belum didukung`,n.ln)}
 if(n.callee.k==='Member')return callMethod(n,sc,c);
 throw new PineError('Pemanggilan fungsi tidak valid',n.ln)}
function callMethod(n,sc,c){
 const callee=n.callee,o=ev(callee.obj,sc,c),name=callee.prop;let fn=null,ns;
 if(Array.isArray(o))ns='array';else if(o instanceof Map)ns='map';else if(typeof o==='string')ns='str';else if(o&&o._k)ns=o._k;else if(o&&o.__t){const fv=c.funcs.get(name);if(fv)return callUser(fv,n,sc,c,[o])}
 if(!ns)throw new PineError(`Metode ".${name}" tidak tersedia untuk nilai ini`,n.ln);
 fn=L[ns+'.'+name]||(ns==='noop'?NOOP:null);if(!fn)throw new PineError(`Metode ${ns}.${name} belum didukung`,n.ln);
 return callLib(fn,n,sc,c,bindArgs(fn,n,sc,c,[o]))}

// ---------- request.security ----------
function reqSecurity(n,sc,c){
 const A=n.args,pick=(name,pos)=>{const k=A.find(a=>a.n===name);if(k)return k.v;const ps=A.filter(a=>!a.n);return ps[pos]?ps[pos].v:null};
 const symN=pick('symbol',0),tfN=pick('timeframe',1),exN=pick('expression',2),gapN=pick('gaps',3),laN=pick('lookahead',4);
 if(!exN)throw new PineError('request.security butuh ekspresi',n.ln);
 const sym=symN?String(ev(symN,sc,c)):c.sym,tf=tfN?ev(tfN,sc,c):'',la=laN?String(ev(laN,sc,c)).includes('on'):false;
 const sec=tf===''||tf==null?c.tfSec:tfSeconds(tf);
 if(sec!==sec)throw new PineError('Timeframe tidak valid: '+tf,n.ln);
 const mainSym=String(c.sym),same=(sym===mainSym||sym===''||sym.replace(/^.*:/,'')===mainSym.replace(/^.*:/,''));
 if(same&&sec===c.tfSec)return ev(exN,sc,c);
 const st0=stateOf(sc,n,c),key=sym.replace(/^.*:/,'')+'|'+sec,cache=st0.cache||(st0.cache={}),st=cache[key]||(cache[key]={});
 if(!st.res){
  const d=c.sec[key];
  if(!d)throw new NeedData({sym:sym.replace(/^.*:/,''),tf:String(tf===''?tfString(c.tfSec):tf),sec});
  const c2=Object.assign(Object.create(null),c);
  c2.bars=d;c2.n=d.t.length;c2.i=0;c2.tfSec=sec;c2.key='';c2.varCells=[];c2.inputs=[];c2.inputKeys=new Set();c2.sub=true;c2.hint=null;c2.strat=null;
  c2.out={plots:[],hlines:[],fills:[],markers:[],bg:[],barcol:[],candles:[],objs:[],alerts:[],events:[],meta:{}};c2.plotKeys=new Set();
  const fr=new Frame(),s2=new Scope(c.global,fr),res=[];
  for(let j=0;j<c2.n;j++){c2.i=j;c2.key='';let v;try{v=ev(exN,s2,c2)}catch(e){wrapErr(e,exN)}res.push(v);for(const cell of c2.varCells)cell.hist[j]=cell.v}
  st.res=res;st.t2=d.t;st.sec=sec;st.j=0}
 const t=c.bars.t[c.i],T2=st.t2;let j=st.j;while(j+1<T2.length&&T2[j+1]<=t)j++;st.j=j;
 if(T2[j]>t)return NaN;
 let use=j;if(!la&&!(T2[j]+st.sec<=t+c.tfSec))use=j-1;
 if(use<0)return Array.isArray(st.res[0])?st.res[0].map(()=>NaN):NaN;
 return st.res[use]}

// ---------- keluaran ----------
const R2=(name,p,f,s)=>{L[name]={p:p==='*'?null:p?p.split(','):[],v:p==='*',f,s:!!s}};
const hidden=d=>typeof d==='string'&&d.includes('none');
const colOf=v=>typeof v==='string'?v:null;
function uniqueKey(c,t){let k=String(t||'Plot').slice(0,28),b=k,j=1;while(c.plotKeys.has(k))k=b+' #'+(++j);c.plotKeys.add(k);return k}
function plotStyle(s){s=String(s||'');if(s.includes('histogram')||s.includes('columns'))return 'hist';if(s.includes('circles'))return 'dots';if(s.includes('cross'))return 'cross';if(s.includes('stepline'))return 'step';if(s.includes('areabr')||s.includes('area'))return 'area';if(s.includes('linebr'))return 'linebr';return 'line'}
R2('plot','series,title,color,linewidth,style,trackprice,histbase,offset,join,editable,show_last,display,format,precision,force_overlay',(c,st,a)=>{
 if(c.sub)return undefined;
 let s=st.slot;if(!s){s=st.slot={k:uniqueKey(c,a[1]||'Plot '+(c.out.plots.length+1)),t:plotStyle(a[4]),w:a[3]||1,data:new Array(c.n).fill(NaN),cols:[],off:a[7]|0,base:a[6],hide:hidden(a[11]),hasCol:false};c.out.plots.push(s)}
 s.data[c.i]=num(a[0]);const col=a[2];if(typeof col==='string'){s.cols[c.i]=col;s.hasCol=true}else if(col!==undefined&&isNa(col)){s.cols[c.i]=null;s.hasCol=true}
 return s},1);
const SHAPE=v=>String(v||'shape.xcross').replace('shape.',''),LOC=v=>String(v||'location.abovebar').replace('location.',''),SZ=v=>String(v||'size.auto').replace('size.','');
function marker(c,st,a,shape,loc,col,tcol,text,size,val,off){
 if(c.sub)return;if(c.out.markers.length>6000)c.out.markers.splice(0,2000);
 c.out.markers.push({i:c.i+(off|0),s:shape,l:loc,c:colOf(col),tc:colOf(tcol),x:text==null||text!==text?'':String(text),z:size,v:val})}
const fire=(v,loc)=>loc==='absolute'?!isNa(v):truthy(v);
R2('plotshape','series,title,style,location,color,offset,text,textcolor,editable,size,show_last,display,format,precision,force_overlay',(c,st,a)=>{
 const loc=LOC(a[3]);if(hidden(a[11]))return;if(fire(a[0],loc))marker(c,st,a,SHAPE(a[2]),loc,a[4]===undefined?'#2962FF':a[4],a[7],a[6],SZ(a[9]),num(a[0]),a[5])},1);
R2('plotchar','series,title,char,location,color,offset,text,textcolor,editable,size,show_last,display,format,precision,force_overlay',(c,st,a)=>{
 const loc=LOC(a[3]);if(hidden(a[11]))return;if(fire(a[0],loc))marker(c,st,a,'char',loc,a[4]===undefined?'#2962FF':a[4],a[7],a[2]===undefined?'●':a[2],SZ(a[9]),num(a[0]),a[5])},1);
R2('plotarrow','series,title,colorup,colordown,offset,minheight,maxheight,editable,show_last,display,format,precision,force_overlay',(c,st,a)=>{
 const v=num(a[0]);if(isNa(v)||v===0||hidden(a[9]))return;
 if(v>0)marker(c,st,a,'arrowup','belowbar',a[2]===undefined?'#089981':a[2],null,'','auto',v,a[4]);else marker(c,st,a,'arrowdown','abovebar',a[3]===undefined?'#F23645':a[3],null,'','auto',v,a[4])},1);
R2('bgcolor','color,offset,editable,show_last,title,display,force_overlay',(c,st,a)=>{if(c.sub||typeof a[0]!=='string')return;c.out.bg.push([c.i+(a[1]|0),a[0]])},1);
R2('barcolor','color,offset,editable,show_last,title,display',(c,st,a)=>{if(c.sub||typeof a[0]!=='string')return;c.out.barcol.push([c.i+(a[1]|0),a[0]])},1);
R2('hline','price,title,color,linestyle,linewidth,editable,display',(c,st,a)=>{if(c.sub)return;if(!st.h){st.h={v:num(a[0]),c:colOf(a[2])||'#787B86',dash:/solid/.test(a[3]||'')?0:/dotted/.test(a[3]||'')?2:1,w:a[4]||1,hide:hidden(a[6]),_k:'hline'};c.out.hlines.push(st.h)}return st.h},1);
R2('fill','plot1,plot2,color,title,editable,show_last,fillgaps,display',(c,st,a)=>{
 if(c.sub)return;let f=st.f;if(!f){f={a:a[0],b:a[1],cols:[],hide:hidden(a[7]||a[5])};st.f=f;c.out.fills.push(f)}
 let col=a[2];if(typeof col!=='string'&&typeof a[4]==='string')col=a[4];f.cols[c.i]=typeof col==='string'?col:null},1);
R2('plotcandle','open,high,low,close,title,color,wickcolor,editable,show_last,bordercolor,display,format,precision,force_overlay',(c,st,a)=>{
 if(c.sub)return;let s=st.cd;if(!s){s={k:uniqueKey(c,a[4]||'Candle'),o:new Array(c.n).fill(NaN),h:new Array(c.n).fill(NaN),l:new Array(c.n).fill(NaN),c:new Array(c.n).fill(NaN),cols:[],wick:[],border:[],bar:false};st.cd=s;c.out.candles.push(s)}
 s.o[c.i]=num(a[0]);s.h[c.i]=num(a[1]);s.l[c.i]=num(a[2]);s.c[c.i]=num(a[3]);s.cols[c.i]=colOf(a[5]);s.wick[c.i]=colOf(a[6]);s.border[c.i]=colOf(a[9])},1);
R2('plotbar','open,high,low,close,title,color,editable,show_last,display,format,precision,force_overlay',(c,st,a)=>{
 if(c.sub)return;let s=st.cd;if(!s){s={k:uniqueKey(c,a[4]||'Bar'),o:new Array(c.n).fill(NaN),h:new Array(c.n).fill(NaN),l:new Array(c.n).fill(NaN),c:new Array(c.n).fill(NaN),cols:[],wick:[],border:[],bar:true};st.cd=s;c.out.candles.push(s)}
 s.o[c.i]=num(a[0]);s.h[c.i]=num(a[1]);s.l[c.i]=num(a[2]);s.c[c.i]=num(a[3]);s.cols[c.i]=colOf(a[5])},1);
R2('alertcondition','condition,title,message',(c,st,a)=>{if(c.sub)return;if(!st.al){st.al={title:a[1]||'Alert',message:a[2]||'',bars:[]};c.out.alerts.push(st.al)}if(truthy(a[0])&&st.al.bars.length<2000)st.al.bars.push(c.i)},1);
R2('alert','message,freq',(c,st,a)=>{if(!c.sub&&c.out.events.length<2000)c.out.events.push({i:c.i,m:String(a[0])})});
const meta=(c,a,kind)=>{const m=c.out.meta;m.kind=kind;m.title=a[0];m.short=a[1];if(a[2]!==undefined)m.overlay=!!a[2];m.maxLabels=a[11]||a[22]||50;m.maxLines=a[10]||50;m.maxBoxes=a[12]||50;if(a[3])m.format=a[3];if(a[4]!==undefined)m.precision=a[4]};
R2('indicator','title,shorttitle,overlay,format,precision,scale,max_bars_back,timeframe,timeframe_gaps,explicit_plot_zorder,max_lines_count,max_labels_count,max_boxes_count,calc_bars_count,behind_chart',(c,st,a)=>{if(!c.sub)meta(c,a,'indicator')});
L.study=L.indicator;
R2('strategy','title,shorttitle,overlay,format,precision,scale,pyramiding,calc_on_order_fills,calc_on_every_tick,max_bars_back,backtest_fill_limits_assumption,default_qty_type,default_qty_value,initial_capital,currency,slippage,commission_type,commission_value,process_orders_on_close,close_entries_rule,margin_long,margin_short,explicit_plot_zorder,max_lines_count,max_labels_count,max_boxes_count,risk_free_rate,use_bar_magnifier,fill_orders_on_standard_ohlc,calc_bars_count,behind_chart',(c,st,a,node)=>{
 if(c.sub)return;if(!G.PineStrategy)throw new PineError('strategy() belum didukung di versi ini',node.ln);meta(c,a,'strategy');if(!c.strat)G.PineStrategy.init(c,{pyramiding:a[6]||0,qtyType:String(a[11]||'strategy.fixed').replace('strategy.',''),qty:a[12]===undefined?1:a[12],capital:a[13]===undefined?100000:a[13],commType:String(a[16]||'').replace('strategy.commission.',''),comm:a[17]||0,slip:a[15]||0,onClose:!!a[18]})});
R2('library','title',()=>{throw new PineError('library() tidak didukung; gunakan indicator()')});
R2('max_bars_back','var,num',()=>undefined);
R2('runtime.error','message',(c,st,a)=>{throw new Error(String(a[0]))});
for(const k of['info','warning','error'])R2('log.'+k,'*',()=>undefined);
// ---------- input ----------
const SRC=['open','high','low','close','hl2','hlc3','ohlc4','hlcc4','volume'];
function regInput(c,meta){
 const nid=meta.node?meta.node.id:null;if(!c.inByNode)c.inByNode=new Map();
 let k=nid!=null?c.inByNode.get(nid):null;
 if(!k){const key=c.hint||meta.title||'input'+(c.inputs.length+1);k=key;let j=1;while(c.inputKeys.has(k))k=key+'_'+(++j);if(nid!=null)c.inByNode.set(nid,k);
  if(!c.sub){c.inputKeys.add(k);const{node,...m}=meta;m.key=k;m.label=m.title||k;c.inputs.push(m)}}
 const p=c.params[k];let v=meta.def;
 if(p!==undefined&&p!==null){
  switch(meta.type){case 'int':v=Math.round(+p);break;case 'float':v=+p;break;case 'bool':v=p===true||p==='true';break;default:v=p}
  if(meta.type==='int'||meta.type==='float'){if(v!==v)v=meta.def;if(meta.min!=null)v=Math.max(meta.min,v);if(meta.max!=null)v=Math.min(meta.max,v)}}
 return v}
function inputFn(type){return(c,st,a,node)=>{
 let[def,title,x3,x4,x5,x6,x7,x8]=a,min,max,step,options,tooltip,group;
 if(type==='int'||type==='float'){if(Array.isArray(x3)){options=x3;tooltip=x4;group=x6}else{min=x3;max=x4;step=x5;tooltip=x6;group=x8}}
 else{if(Array.isArray(x3)){options=x3;tooltip=x4;group=x6}else{tooltip=x3;group=x5}}
 if(type==='source'){const dn=node&&node.args[0]&&node.args[0].v.k==='Id'?node.args[0].v.name:'close';const nm=SRC.includes(dn)?dn:'close';const v=regInput(c,{type:'source',def:nm,title,options:SRC,group,node});return identAt(String(v),c,c.i)}
 if(type==='untyped'){const dn=node&&node.args[0]&&node.args[0].v.k==='Id'&&SRC.includes(node.args[0].v.name)?node.args[0].v.name:null;
  if(dn){const v=regInput(c,{type:'source',def:dn,title,options:SRC,node});return identAt(String(v),c,c.i)}
  type=typeof def==='boolean'?'bool':typeof def==='string'?(/^#|^rgb/.test(def)?'color':'string'):Number.isInteger(def)?'int':'float'}
 if(type==='bool'&&typeof def!=='boolean')def=!!def;
 return regInput(c,{type,def,title,min,max,step,options,tooltip,group,node})}}
for(const t of['int','float','bool','string','color','timeframe','symbol','session','source','price','text_area','enum'])R2('input.'+t,'defval,title,minval,maxval,step,tooltip,inline,group,confirm,display,options',inputFn(t==='price'?'float':t==='text_area'||t==='enum'?'string':t),0);
R2('input','defval,title,type,minval,maxval,tooltip,inline,group,confirm,step,options',(c,st,a,node)=>{const f=inputFn('untyped');return f(c,st,[a[0],a[1],a[3],a[4],a[9]],node)});
// ---------- objek gambar: label, line, box ----------
const OBJ={
 label:{new:'x,y,text,xloc,yloc,color,style,textcolor,size,textalign,tooltip,text_font_family,force_overlay',props:['x','y','text','xloc','yloc','color','style','textcolor','size','textalign','tooltip']},
 line:{new:'x1,y1,x2,y2,xloc,extend,color,style,width,force_overlay',props:['x1','y1','x2','y2','xloc','extend','color','style','width']},
 box:{new:'left,top,right,bottom,border_color,border_width,border_style,extend,xloc,bgcolor,text,text_size,text_color,text_halign,text_valign,text_wrap,text_font_family,force_overlay',props:['left','top','right','bottom','border_color','border_width','border_style','extend','xloc','bgcolor','text','text_size','text_color']},
};
for(const k in OBJ){const d=OBJ[k],names=d.new.split(',');
 R2(k+'.new',d.new,(c,st,a)=>{if(c.sub)return{_k:'noop'};const o={_k:k,del:false,idx:c.i};names.forEach((nm,j)=>{if(d.props.includes(nm))o[nm]=a[j]});c.out.objs.push(o);
  const lim=k==='label'?c.out.meta.maxLabels||50:k==='line'?c.out.meta.maxLines||50:c.out.meta.maxBoxes||50;let cnt=0;for(let j=c.out.objs.length-1;j>=0;j--){const q=c.out.objs[j];if(q._k===k&&!q.del&&++cnt>Math.min(500,lim))q.del=true}
  if(c.out.objs.length>3000)c.out.objs=c.out.objs.filter(q=>!q.del);return o});
 for(const pr of d.props){R2(k+'.set_'+pr,'id,'+pr,(c,st,a)=>{if(a[0]&&a[0]._k===k)a[0][pr]=a[1]});R2(k+'.get_'+pr,'id',(c,st,a)=>{const v=a[0]&&a[0][pr];return v===undefined?NaN:v})}
 R2(k+'.delete','id',(c,st,a)=>{if(a[0]&&a[0]._k===k)a[0].del=true});
 R2(k+'.copy','id',(c,st,a)=>{if(!a[0]||a[0]._k!==k)return a[0];const o={...a[0],del:false};c.out.objs.push(o);return o});}
R2('label.set_xy','id,x,y',(c,st,a)=>{if(a[0]&&a[0]._k==='label'){a[0].x=a[1];a[0].y=a[2]}});
R2('line.set_xy1','id,x,y',(c,st,a)=>{a[0].x1=a[1];a[0].y1=a[2]});R2('line.set_xy2','id,x,y',(c,st,a)=>{a[0].x2=a[1];a[0].y2=a[2]});
R2('line.get_price','id,x',(c,st,a)=>{const l=a[0];if(!l||l.x2===l.x1)return l?l.y1:NaN;return l.y1+(l.y2-l.y1)*(a[1]-l.x1)/(l.x2-l.x1)});
R2('box.set_lefttop','id,left,top',(c,st,a)=>{a[0].left=a[1];a[0].top=a[2]});R2('box.set_rightbottom','id,right,bottom',(c,st,a)=>{a[0].right=a[1];a[0].bottom=a[2]});
for(const[k,v]of Object.entries({'label.style_label_up':1}))CONST[k]=k;
R2('request.dividends','*',()=>NaN);R2('request.splits','*',()=>NaN);R2('request.earnings','*',()=>NaN);R2('request.financial','*',()=>NaN);R2('request.economic','*',()=>NaN);R2('request.quandl','*',()=>NaN);R2('request.currency_rate','*',()=>1);
R2('ticker.new','prefix,ticker,session,adjustment',(c,st,a)=>String(a[0])+':'+String(a[1]));R2('ticker.standard','symbol',(c,st,a)=>a[0]);R2('ticker.modify','tickerid,session,adjustment',(c,st,a)=>a[0]);R2('ticker.heikinashi','symbol',(c,st,a)=>a[0]);
R2('syminfo.ticker_id','',()=>'');

// ---------- hasil ----------
const arr=a=>{const o=new Array(a.length);for(let i=0;i<a.length;i++){const v=a[i];o[i]=typeof v==='number'&&v===v&&isFinite(v)?v:null}return o};
function finalize(c){
 const o=c.out,n=c.n,m=o.meta;
 if(!o.plots.length&&!o.markers.length&&!o.objs.length&&!o.bg.length&&!o.candles.length&&!o.fills.length&&!o.hlines.length&&!o.barcol.length&&!(c.strat))throw new PineError('Skrip tidak menghasilkan keluaran: tambahkan plot(), plotshape(), label.new(), dst.');
 const strat=c.strat&&G.PineStrategy?G.PineStrategy.result(c):null;
 const plots=[];
 for(const s of o.plots){if(s.hide)continue;
  let col=null,cols=null;
  if(s.hasCol){let first,mixed=false,any=false;for(let i=0;i<n;i++){const v=s.cols[i];if(v===undefined)continue;if(!any){first=v;any=true}else if(v!==first){mixed=true;break}}
   if(!mixed)col=any?first:null;else{cols=new Array(n);for(let i=0;i<n;i++)cols[i]=s.cols[i]===undefined?null:s.cols[i]}}
  plots.push({k:s.k,t:s.t,w:s.w,c:col,cols,data:arr(s.data),off:s.off||0,base:s.base==null||s.base!==s.base?null:s.base})}
 const keyOf=h=>h&&h.k?h.k:null;
 const fills=[];
 for(const f of o.fills){if(f.hide)continue;let cs=f.cols,first,mixed=false,any=false;for(let i=0;i<n;i++){const v=cs[i];if(v===undefined)continue;if(!any){first=v;any=true}else if(v!==first){mixed=true;break}}
  const A=f.a,B=f.b;if(!A||!B)continue;
  const p={a:A._k==='hline'?null:keyOf(A),b:B._k==='hline'?null:keyOf(B),va:A._k==='hline'?A.v:null,vb:B._k==='hline'?B.v:null};
  if(!p.a&&p.va==null||!p.b&&p.vb==null)continue;
  if(mixed){p.cols=new Array(n);for(let i=0;i<n;i++)p.cols[i]=cs[i]===undefined?null:cs[i]}else p.c=any?first:null;fills.push(p)}
 // objek: konversi xloc waktu ke indeks bar
 const t=c.bars.t,toIdx=(x,xloc)=>{if(x==null||x!==x)return NaN;if(String(xloc||'').includes('bar_time')){const s=x/1000;if(s<=t[0])return(s-t[0])/c.tfSec;if(s>=t[n-1])return n-1+(s-t[n-1])/c.tfSec;let lo=0,hi=n-1;while(hi-lo>1){const mid=(lo+hi)>>1;t[mid]<=s?lo=mid:hi=mid}return lo+(s-t[lo])/(t[hi]-t[lo])}return x};
 const objs=[];for(const q of o.objs){if(q.del)continue;const r={k:q._k};
  if(q._k==='label'){r.x=toIdx(q.x,q.xloc);r.y=num(q.y);r.yloc=String(q.yloc||'').replace('yloc.','');r.text=q.text==null?'':String(q.text);r.c=colOf(q.color);r.tc=colOf(q.textcolor);r.style=String(q.style||'label.style_label_down').replace('label.style_','');r.size=String(q.size||'size.normal').replace('size.','')}
  else if(q._k==='line'){const xl=q.xloc;r.x1=toIdx(q.x1,xl);r.y1=num(q.y1);r.x2=toIdx(q.x2,xl);r.y2=num(q.y2);r.c=colOf(q.color)||'#2962FF';r.style=String(q.style||'line.style_solid').replace('line.style_','');r.w=q.width||1;r.ext=String(q.extend||'extend.none').replace('extend.','')}
  else{const xl=q.xloc;r.x1=toIdx(q.left,xl);r.y1=num(q.top);r.x2=toIdx(q.right,xl);r.y2=num(q.bottom);r.c=colOf(q.border_color)||'#2962FF';r.bg=colOf(q.bgcolor)||'rgba(41,98,255,.12)';r.w=q.border_width||1;r.ext=String(q.extend||'extend.none').replace('extend.','');r.text=q.text==null?'':String(q.text);r.tc=colOf(q.text_color)}
  if(r.k==='label'?!isNaN(r.x):(!isNaN(r.x1)&&!isNaN(r.x2)))objs.push(r)}
 const mk=o.markers.filter(x=>x.i>=-n&&x.i<n+500).slice(-4000);
 const res={version:c.version,overlay:m.overlay===null?false:m.overlay,title:m.title||null,short:m.short||null,kind:m.kind,plots,levels:o.hlines.filter(h=>!h.hide&&h.v===h.v).map(h=>({v:h.v,c:h.c,dash:h.dash,w:h.w})),fills,
  markers:mk,bg:o.bg.slice(-6000),barcol:o.barcol.slice(-6000),candles:o.candles.map(s=>({k:s.k,o:arr(s.o),h:arr(s.h),l:arr(s.l),c:arr(s.c),cols:s.cols,wick:s.wick,border:s.border,bar:s.bar})),objs:objs.slice(-1500),
  alerts:o.alerts.map(a=>({title:a.title,message:a.message,bars:a.bars.slice(-200)})),events:o.events.slice(-200),inputs:c.inputs};
 if(strat)res.strategy=strat;
 return res}

G.PineRun={run,NeedData,PineError};
})(typeof self!=='undefined'?self:globalThis);
