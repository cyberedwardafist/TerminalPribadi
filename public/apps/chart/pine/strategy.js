// Strategi Pine (subset): strategy.entry/order/exit/close/close_all/cancel, ukuran posisi, komisi, slippage, laporan.
// Order dibuat di bar i terisi pada open bar i+1 (limit/stop: saat harga tersentuh), seperti perilaku bawaan TradingView.
(function(G){'use strict';
const{num,isNa}=G.PineLib;
const dirOf=v=>/short/.test(String(v))?-1:1;
function init(c,o){c.strat={o,pos:0,orders:[],open:[],closed:[],cash:o.capital,eq:new Array(c.n).fill(null),peak:o.capital,mdd:0,mddPct:0,seq:0}}
function qtyFor(c,S,q,price){const o=S.o;if(q!=null&&!isNa(q))return q;const eq=S.cash+openPnl(S,price);
 if(o.qtyType==='percent_of_equity')return eq*o.qty/100/price;if(o.qtyType==='cash')return o.qty/price;return o.qty}
const openPnl=(S,p)=>S.open.reduce((a,t)=>a+(p-t.price)*t.qty*t.dir,0);
function comm(S,qty,price){const o=S.o;if(!o.comm)return 0;if(o.commType==='percent')return qty*price*o.comm/100;if(o.commType==='cash_per_contract')return qty*o.comm;if(o.commType==='cash_per_order')return o.comm;return 0}
function openTrade(c,S,id,d,qty,price,cm){const slip=S.o.slip*c.mintick*d;price+=slip;const t={id,dir:d,qty,price,bar:c.i,time:c.bars.t[c.i],cm:comm(S,qty,price)+0};S.open.push(t);S.pos+=d*qty;S.cash-=t.cm;t.cmt=cm||''}
function closeTrade(c,S,t,qty,price,why,cm){const slip=S.o.slip*c.mintick*-t.dir;price+=slip;qty=Math.min(qty,t.qty);
 const part=qty/t.qty,cx=comm(S,qty,price),pnl=(price-t.price)*qty*t.dir-t.cm*part-cx;
 S.cash+=(price-t.price)*qty*t.dir-cx;S.pos-=t.dir*qty;
 S.closed.push({id:t.id,dir:t.dir,qty,ep:t.price,xp:price,eb:t.bar,xb:c.i,et:t.time,xt:c.bars.t[c.i],pnl,why:why||'',ecm:t.cmt||'',xcm:cm||''});
 t.qty-=qty;t.cm-=t.cm*part;if(t.qty<=1e-12)S.open.splice(S.open.indexOf(t),1)}
function fillPrice(o,b){ // harga isi untuk order pada bar b, atau null
 const bu=o.dir>0;
 if(o.type==='mkt')return b.o;
 if(o.type==='lim'){if(bu?b.o<=o.limit:b.o>=o.limit)return b.o;return(bu?b.l<=o.limit:b.h>=o.limit)?o.limit:null}
 if(o.type==='stp'){if(bu?b.o>=o.stop:b.o<=o.stop)return b.o;return(bu?b.h>=o.stop:b.l<=o.stop)?o.stop:null}
 return null}
function beginBar(c){const S=c.strat,i=c.i,B=c.bars,b={o:B.o[i],h:B.h[i],l:B.l[i],c:B.c[i]};
 for(const o of S.orders.slice()){if(o.bar>=i&&!o.now)continue;
  if(o.kind==='exit'){ // keluar dari trade terbuka yang cocok
   const ts=S.open.filter(t=>(o.from==null||t.id===o.from)&&(t.bar<i||t.filledNow));
   for(const t of ts){let lim=o.limit,stp=o.stop;const sg=t.dir;
    if(o.profit!=null&&!isNa(o.profit))lim=t.price+sg*o.profit*c.mintick;if(o.loss!=null&&!isNa(o.loss))stp=t.price-sg*o.loss*c.mintick;
    let px=null,why='';
    if(stp!=null&&!isNa(stp)){const hit=sg>0?(b.o<=stp?b.o:b.l<=stp?stp:null):(b.o>=stp?b.o:b.h>=stp?stp:null);if(hit!=null){px=hit;why='stop'}}
    if(px==null&&lim!=null&&!isNa(lim)){const hit=sg>0?(b.o>=lim?b.o:b.h>=lim?lim:null):(b.o<=lim?b.o:b.l<=lim?lim:null);if(hit!=null){px=hit;why='target'}}
    if(px!=null){const q=o.qty!=null?o.qty:o.pct!=null?t.qty*o.pct/100:t.qty;closeTrade(c,S,t,q,px,why||o.id,o.cmt)}}
   if(!S.open.some(t=>o.from==null||t.id===o.from)&&o.armed)S.orders.splice(S.orders.indexOf(o),1);else if(S.open.some(t=>o.from==null||t.id===o.from))o.armed=true;continue}
  if(o.kind==='close'){const ts=o.id==null?S.open.slice():S.open.filter(t=>t.id===o.id);for(const t of ts)closeTrade(c,S,t,o.qty!=null?o.qty:t.qty,b.o,'close',o.cmt);S.orders.splice(S.orders.indexOf(o),1);continue}
  const px=fillPrice(o,b);if(px==null)continue;S.orders.splice(S.orders.indexOf(o),1);fillEntry(c,S,o,px,b)}}
function fillEntry(c,S,o,px,b){
 if(o.kind==='entry'){ // balik arah: tutup posisi berlawanan dulu
  for(const t of S.open.slice())if(t.dir!==o.dir)closeTrade(c,S,t,t.qty,px,'reverse '+o.id,o.cmt);
  const same=S.open.filter(t=>t.dir===o.dir);if(same.length>S.o.pyramiding)return;if(S.open.some(t=>t.id===o.id&&t.dir===o.dir))return}
 const q=qtyFor(c,S,o.qty,px);if(!(q>0))return;openTrade(c,S,o.id,o.dir,q,px,o.cmt);const t=S.open[S.open.length-1];t.filledNow=true;t.price=px+S.o.slip*c.mintick*o.dir;
 // exit yang sudah menunggu entry ini dapat langsung memeriksa bar yang sama
 for(const x of S.orders)if(x.kind==='exit'&&(x.from==null||x.from===t.id)){x.now=true}
 if(S.orders.some(x=>x.now&&x.kind==='exit')){const keep=S.orders.filter(x=>x.kind==='exit'&&x.now);for(const x of keep){x.now=false;x.bar=-1}
  const tmp=c.i;// evaluasi exit pada bar yang sama (setelah open)
  const ex=keep.slice();for(const x of ex){if(!S.orders.includes(x))continue;const ts=S.open.filter(tt=>(x.from==null||tt.id===x.from));for(const tt of ts){let lim=x.limit,stp=x.stop;const sg=tt.dir;if(x.profit!=null&&!isNa(x.profit))lim=tt.price+sg*x.profit*c.mintick;if(x.loss!=null&&!isNa(x.loss))stp=tt.price-sg*x.loss*c.mintick;let hp=null,why='';
     if(stp!=null&&!isNa(stp)){const h=sg>0?(b.l<=stp?stp:null):(b.h>=stp?stp:null);if(h!=null){hp=h;why='stop'}}
     if(hp==null&&lim!=null&&!isNa(lim)){const h=sg>0?(b.h>=lim?lim:null):(b.l<=lim?lim:null);if(h!=null){hp=h;why='target'}}
     if(hp!=null)closeTrade(c,S,tt,tt.qty,hp,why,x.cmt)}}}
 t.filledNow=false}
function endBar(c){const S=c.strat,i=c.i,p=c.bars.c[i];
 if(S.o.onClose){for(const o of S.orders.slice()){if(o.bar===i&&o.type==='mkt'&&(o.kind==='entry'||o.kind==='order')){S.orders.splice(S.orders.indexOf(o),1);fillEntry(c,S,o,p,{o:p,h:p,l:p,c:p})}else if(o.bar===i&&o.kind==='close'){for(const t of S.open.slice())if(o.id==null||t.id===o.id)closeTrade(c,S,t,t.qty,p,'close',o.cmt);S.orders.splice(S.orders.indexOf(o),1)}}}
 const eq=S.cash+openPnl(S,p);S.eq[i]=eq;if(eq>S.peak)S.peak=eq;const dd=S.peak-eq;if(dd>S.mdd){S.mdd=dd;S.mddPct=S.peak?dd/S.peak*100:0}}
const add=(c,o)=>{const S=c.strat;o.bar=c.i;if(o.id!=null)S.orders=S.orders.filter(x=>!(x.id===o.id&&x.kind===o.kind&&x.kind!=='close'));S.orders.push(o)};
const F={
 'strategy.entry':{p:['id','direction','qty','limit','stop','oca_name','oca_type','comment','alert_message','disable_alert','when'],f:(c,st,a)=>{if(a[10]===false)return;add(c,{kind:'entry',id:String(a[0]),dir:dirOf(a[1]),qty:a[2],limit:a[3],stop:a[4],type:a[3]!=null&&!isNa(a[3])?'lim':a[4]!=null&&!isNa(a[4])?'stp':'mkt',cmt:a[7]})}},
 'strategy.order':{p:['id','direction','qty','limit','stop','oca_name','oca_type','comment','alert_message','disable_alert','when'],f:(c,st,a)=>{if(a[10]===false)return;add(c,{kind:'order',id:String(a[0]),dir:dirOf(a[1]),qty:a[2],limit:a[3],stop:a[4],type:a[3]!=null&&!isNa(a[3])?'lim':a[4]!=null&&!isNa(a[4])?'stp':'mkt',cmt:a[7]})}},
 'strategy.exit':{p:['id','from_entry','qty','qty_percent','profit','limit','loss','stop','trail_price','trail_points','trail_offset','oca_name','comment','comment_profit','comment_loss','comment_trailing','alert_message','alert_profit','alert_loss','alert_trailing','disable_alert','when'],f:(c,st,a)=>{if(a[21]===false)return;add(c,{kind:'exit',id:String(a[0]),from:a[1]==null||a[1]===''?null:String(a[1]),qty:a[2],pct:a[3],profit:a[4],limit:a[5],loss:a[6],stop:a[7],cmt:a[12]})}},
 'strategy.close':{p:['id','comment','qty','qty_percent','alert_message','immediately','disable_alert','when'],f:(c,st,a)=>{if(a[7]===false)return;add(c,{kind:'close',id:String(a[0]),qty:a[2],cmt:a[1]})}},
 'strategy.close_all':{p:['comment','alert_message','immediately','disable_alert','when'],f:(c,st,a)=>{if(a[4]===false)return;add(c,{kind:'close',id:null,cmt:a[0]})}},
 'strategy.cancel':{p:['id'],f:(c,st,a)=>{c.strat.orders=c.strat.orders.filter(o=>o.id!==String(a[0]))}},
 'strategy.cancel_all':{p:[],f:(c)=>{c.strat.orders=[]}},
};

// strategy.closedtrades.* / opentrades.* (v5.1+/v6): akses per nomor trade
const ct=(c,i)=>c.strat.closed[Math.floor(num(i))],ot=(c,i)=>c.strat.open[Math.floor(num(i))],V=x=>x===undefined?NaN:x;
const T1=(name,f)=>{F['strategy.closedtrades.'+name]={p:['trade_num'],f:(c,st,a)=>{const t=ct(c,a[0]);return t?V(f(t,c)):NaN}}};
const T2=(name,f)=>{F['strategy.opentrades.'+name]={p:['trade_num'],f:(c,st,a)=>{const t=ot(c,a[0]);return t?V(f(t,c)):NaN}}};
T1('profit',t=>t.pnl);T1('entry_price',t=>t.ep);T1('exit_price',t=>t.xp);T1('entry_bar_index',t=>t.eb);T1('exit_bar_index',t=>t.xb);T1('size',t=>t.dir*t.qty);T1('entry_id',t=>t.id);T1('exit_id',t=>t.why);T1('entry_time',t=>t.et*1000);T1('exit_time',t=>t.xt*1000);T1('commission',t=>0);
T1('profit_percent',t=>t.pnl/(t.ep*t.qty)*100);
T2('profit',(t,c)=>(c.bars.c[c.i]-t.price)*t.qty*t.dir);T2('entry_price',t=>t.price);T2('entry_bar_index',t=>t.bar);T2('size',t=>t.dir*t.qty);T2('entry_id',t=>t.id);T2('entry_time',t=>t.time*1000);T2('commission',t=>t.cm);
const has=p=>p in F,fn=p=>F[p]||null;
function value(path,c){const S=c.strat,i=c.i,p=c.bars.c[i];
 switch(path){
  case 'strategy.position_size':return S.pos;
  case 'strategy.position_avg_price':{const q=S.open.reduce((a,t)=>a+t.qty,0);return q?S.open.reduce((a,t)=>a+t.price*t.qty,0)/q:NaN}
  case 'strategy.equity':return S.cash+openPnl(S,p);
  case 'strategy.initial_capital':return S.o.capital;
  case 'strategy.netprofit':return S.closed.reduce((a,t)=>a+t.pnl,0);
  case 'strategy.grossprofit':return S.closed.reduce((a,t)=>a+(t.pnl>0?t.pnl:0),0);
  case 'strategy.grossloss':return S.closed.reduce((a,t)=>a+(t.pnl<0?-t.pnl:0),0);
  case 'strategy.openprofit':return openPnl(S,p);
  case 'strategy.opentrades':return S.open.length;
  case 'strategy.closedtrades':return S.closed.length;
  case 'strategy.wintrades':return S.closed.filter(t=>t.pnl>0).length;
  case 'strategy.losstrades':return S.closed.filter(t=>t.pnl<0).length;
  case 'strategy.eventrades':return S.closed.filter(t=>t.pnl===0).length;
  case 'strategy.max_drawdown':return S.mdd;
  case 'strategy.long':case 'strategy.short':case 'strategy.fixed':case 'strategy.cash':case 'strategy.percent_of_equity':return path;
 }
 if(path.startsWith('strategy.commission.'))return path;
 return undefined}
function result(c){const S=c.strat,cl=S.closed,n=c.n;
 const gp=cl.reduce((a,t)=>a+(t.pnl>0?t.pnl:0),0),gl=cl.reduce((a,t)=>a+(t.pnl<0?-t.pnl:0),0),w=cl.filter(t=>t.pnl>0).length,net=gp-gl,last=c.bars.c[n-1],open=openPnl(S,last)-S.open.reduce((a,t)=>a+t.cm,0);
 const lng=cl.filter(t=>t.dir>0),sht=cl.filter(t=>t.dir<0),sum=a=>a.reduce((x,t)=>x+t.pnl,0);
 const eq=S.eq,step=Math.max(1,Math.ceil(n/1200)),eqs=[];for(let i=0;i<n;i+=step)eqs.push(eq[i]==null?null:Math.round(eq[i]*100)/100);
 const rets=[];for(let i=1;i<n;i++)if(eq[i]!=null&&eq[i-1]){rets.push(eq[i]/eq[i-1]-1)}
 const m=rets.reduce((a,b)=>a+b,0)/(rets.length||1),sd=Math.sqrt(rets.reduce((a,b)=>a+(b-m)*(b-m),0)/(rets.length||1));
 // penanda masuk/keluar pada grafik
 for(const t of cl.slice(-300)){const up=t.dir>0;c.out.markers.push({i:t.eb,s:up?'arrowup':'arrowdown',l:up?'belowbar':'abovebar',c:up?'#089981':'#F23645',tc:null,x:t.id,z:'small',v:t.ep},{i:t.xb,s:'xcross',l:up?'abovebar':'belowbar',c:'#787B86',tc:null,x:'',z:'tiny',v:t.xp})}
 for(const t of S.open)c.out.markers.push({i:t.bar,s:t.dir>0?'arrowup':'arrowdown',l:t.dir>0?'belowbar':'abovebar',c:t.dir>0?'#089981':'#F23645',tc:null,x:t.id,z:'small',v:t.price});
 return{initial:S.o.capital,stats:{net,netPct:net/S.o.capital*100,gp,gl,pf:gl?gp/gl:(gp?Infinity:0),n:cl.length,win:w,winRate:cl.length?w/cl.length*100:0,avg:cl.length?net/cl.length:0,avgWin:w?gp/w:0,avgLoss:cl.length-w?-gl/(cl.length-w):0,maxDD:S.mdd,maxDDPct:S.mddPct,open:S.open.length,openPnl:open,equity:S.cash+openPnl(S,last),longNet:sum(lng),shortNet:sum(sht),longN:lng.length,shortN:sht.length,sharpe:sd?m/sd*Math.sqrt(Math.min(252,rets.length)):0,best:cl.reduce((a,t)=>Math.max(a,t.pnl),0),worst:cl.reduce((a,t)=>Math.min(a,t.pnl),0)},
  trades:cl.slice(-500).map(t=>({id:t.id,dir:t.dir,qty:t.qty,ep:t.ep,xp:t.xp,et:t.et,xt:t.xt,pnl:t.pnl,why:t.why})),openTrades:S.open.map(t=>({id:t.id,dir:t.dir,qty:t.qty,ep:t.price,et:t.time})),equity:eqs,step}}
G.PineStrategy={init,beginBar,endBar,has,fn,value,result};
})(typeof self!=='undefined'?self:globalThis);
