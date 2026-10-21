// Pine Script v5 (dengan kompatibilitas v4): lexer + parser rekursif -> AST. Berjalan di Web Worker (lihat ../worker.js).
// Mendukung: indentasi blok, baris lanjutan, if/else if/else (juga sebagai ekspresi), for/for-in/while, switch, break/continue,
// fungsi buatan (satu baris dan blok), var/varip, deklarasi bertipe, tuple, type (UDT), enum, argumen bernama, indeks riwayat x[n], generik array<T>.
(function(G){'use strict';
class PineError extends Error{constructor(m,ln){super((ln?'Baris '+ln+': ':'')+m);this.ln=ln;this.name='PineError'}}
const RESERVED=new Set(['if','else','for','to','by','in','while','switch','break','continue','var','varip','and','or','not','true','false','import','export','type','method','enum']);
const OPS=['=>',':=','==','!=','<=','>=','+=','-=','*=','/=','%=','+','-','*','/','%','<','>','=','?',':',',','(',')','[',']','.','{','}'];
const ASSIGN=new Set(['=',':=','+=','-=','*=','/=','%=']);
const QUAL=new Set(['series','simple','const','input']);

function lex(src){
 const T=[],L=String(src).replace(/\r\n?/g,'\n').split('\n'),ind=[0];let depth=0,version=null,open=false,lastFirst=null;
 const endLine=ln=>{if(open){T.push({t:'nl',ln});open=false}};
 for(let li=0;li<L.length;li++){
  const line=L[li],ln=li+1;let k=0,w=0;
  while(k<line.length&&(line[k]===' '||line[k]==='\t')){w+=line[k]==='\t'?4:1;k++}
  const rest=line.slice(k);
  if(rest===''||rest.startsWith('//')){const m=/^\/\/\s*@version\s*=\s*(\d+)/.exec(rest);if(m)version=+m[1];continue}
  let cont=depth>0;
  if(!cont&&open){const last=T[T.length-1],opens=lastFirst&&['if','for','while','switch','else'].includes(lastFirst)||(last&&last.t==='op'&&last.v==='=>');
   const trail=last&&((last.t==='op'&&['+','-','*','/','%','==','!=','<','>','<=','>=','?',':',',','=',':=','+=','-=','*=','/=','%='].includes(last.v))||(last.t==='id'&&(last.v==='and'||last.v==='or'||last.v==='not')));
   if(trail||(w%4!==0&&!opens))cont=true}
  if(!cont){
   endLine(ln);
   const top=ind[ind.length-1];
   if(w>top){ind.push(w);T.push({t:'ind',ln})}
   else if(w<top){while(w<ind[ind.length-1]){ind.pop();T.push({t:'ded',ln})}if(w!==ind[ind.length-1])throw new PineError('Indentasi tidak konsisten',ln)}
   open=true;lastFirst=null}
  let i=k;
  while(i<line.length){
   const c=line[i];
   if(c===' '||c==='\t'){i++;continue}
   if(c==='/'&&line[i+1]==='/'){const m=/^\/\/\s*@version\s*=\s*(\d+)/.exec(line.slice(i));if(m)version=+m[1];break}
   if(c==='"'||c==="'"){let j=i+1,s='';while(j<line.length&&line[j]!==c){if(line[j]==='\\'&&j+1<line.length){const e=line[j+1];s+=e==='n'?'\n':e==='t'?'\t':e;j+=2}else s+=line[j++]}
    if(j>=line.length)throw new PineError('String tidak ditutup',ln);T.push({t:'str',v:s,ln});i=j+1;continue}
   if(c==='#'){const m=/^#([0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b/.exec(line.slice(i));if(!m)throw new PineError('Literal warna tidak valid',ln);T.push({t:'col',v:m[1],ln});i+=m[0].length;continue}
   let m;
   if((m=/^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(line.slice(i)))){T.push({t:'num',v:parseFloat(m[1]),ln});i+=m[1].length;continue}
   if((m=/^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(i)))){T.push({t:'id',v:m[0],ln});if(lastFirst===null)lastFirst=m[0];i+=m[0].length;continue}
   const op=OPS.find(o=>line.startsWith(o,i));
   if(!op)throw new PineError('Karakter tidak dikenal "'+c+'"',ln);
   if(op==='('||op==='['||op==='{')depth++;else if(op===')'||op===']'||op==='}')depth=Math.max(0,depth-1);
   T.push({t:'op',v:op,ln});if(lastFirst===null)lastFirst=op;i+=op.length}
 }
 endLine(L.length);while(ind.length>1){ind.pop();T.push({t:'ded',ln:L.length})}T.push({t:'eof',ln:L.length});
 return{toks:T,version}}

function parse(src){
 const{toks,version}=lex(src);let p=0,nid=0;
 const show=t=>t.t==='nl'?'akhir baris':t.t==='ind'?'indentasi':t.t==='ded'?'akhir blok':t.t==='eof'?'akhir kode':String(t.v);
 const err=(m,t)=>{t=t||toks[p];throw new PineError(m,t&&t.ln)};
 const isOp=(v,o=0)=>{const t=toks[p+o];return t&&t.t==='op'&&t.v===v};
 const isId=(v,o=0)=>{const t=toks[p+o];return t&&t.t==='id'&&(v==null||t.v===v)};
 const eatOp=v=>{if(!isOp(v))err(`Diharapkan "${v}" tetapi ditemukan "${show(toks[p])}"`);return toks[p++]};
 const mk=(k,o,t)=>{o.k=k;o.id=++nid;o.ln=(t||toks[Math.max(0,p-1)]).ln;return o};
 const pathOf=n=>n.k==='Id'?n.name:n.k==='Member'?(pathOf(n.obj)?pathOf(n.obj)+'.'+n.prop:null):null;
 const skipNL=()=>{while(toks[p].t==='nl')p++};
 function endStmt(){const t=toks[p];if(t.t==='nl'){p++;return}if(toks[p-1].t==='ded'||t.t==='eof'||t.t==='ded')return;err(`Token tidak terduga "${show(t)}"`)}
 function skipGeneric(){ // pada '<': lompati sampai '>' seimbang
  let d=0;do{if(isOp('<'))d++;else if(isOp('>'))d--;else if(toks[p].t==='eof'||toks[p].t==='nl')err('Generik tidak ditutup');p++}while(d>0)}
 // ----- program dan blok -----
 function block(){
  if(toks[p].t!=='nl')err('Diharapkan blok (baris baru dengan indentasi) tetapi ditemukan "'+show(toks[p])+'"');
  p++;if(toks[p].t!=='ind')err('Blok kosong atau indentasi salah');p++;
  const body=[];
  while(toks[p].t!=='ded'&&toks[p].t!=='eof'){const s=stmt();if(s)body.push(s)}
  if(toks[p].t==='ded')p++;
  return mk('Block',{body})}
 function bodyOrInline(){ // setelah '=>' : ekspresi satu baris atau blok
  if(toks[p].t==='nl')return block();
  const t=toks[p],e=expr();endStmt();return mk('Block',{body:[e]},t)}
 // ----- pola -----
 function matchParen(i){let d=0;for(let j=i;j<toks.length;j++){const t=toks[j];if(t.t==='op'){if(t.v==='('||t.v==='['||t.v==='{')d++;else if(t.v===')'||t.v===']'||t.v==='}'){d--;if(d===0)return j}}if(t.t==='eof')break}return -1}
 const isFuncDef=()=>{const t=toks[p];if(t.t!=='id'||RESERVED.has(t.v)||!isOp('(',1))return false;const j=matchParen(p+1);return j>0&&toks[j+1].t==='op'&&toks[j+1].v==='=>'};
 function declAhead(){let j=p;while(toks[j].t==='id'&&QUAL.has(toks[j].v)&&toks[j+1].t==='id')j++;
  if(toks[j].t!=='id'||RESERVED.has(toks[j].v))return false;j++;
  if(toks[j].t==='op'&&toks[j].v==='<'){let d=0;for(;;j++){const t=toks[j];if(t.t==='op'&&t.v==='<')d++;else if(t.t==='op'&&t.v==='>'){d--;if(!d){j++;break}}else if(t.t==='eof'||t.t==='nl')return false}}
  while(toks[j].t==='op'&&toks[j].v==='['&&toks[j+1].t==='op'&&toks[j+1].v===']')j+=2;
  return toks[j].t==='id'&&!RESERVED.has(toks[j].v)&&toks[j+1].t==='op'&&(toks[j+1].v==='='||toks[j+1].v===':=')}
 function isTupleAssign(){if(!isOp('['))return false;const j=matchParen(p);return j>0&&toks[j+1].t==='op'&&toks[j+1].v==='='&&toks.slice(p+1,j).every(t=>t.t==='id'||(t.t==='op'&&t.v===','))}
 // ----- pernyataan -----
 function stmt(){
  const t=toks[p];
  if(t.t==='nl'){p++;return null}
  if(t.t==='id'){
   switch(t.v){
    case 'break':p++;endStmt();return mk('Break',{},t);
    case 'continue':p++;endStmt();return mk('Continue',{},t);
    case 'import':err('import/library belum didukung',t);break;
    case 'export':p++;return stmt();
    case 'method':p++;return funcDef();
    case 'type':if(toks[p+1].t==='id'&&toks[p+2].t==='nl')return typeDef();break;
    case 'enum':if(toks[p+1].t==='id'&&toks[p+2].t==='nl')return enumDef();break;
    case 'var':case 'varip':return decl();
   }
   if(isFuncDef())return funcDef();
   if(declAhead())return decl();
  }
  if(isTupleAssign()){const s=toks[p++];const names=[];while(!isOp(']')){if(isOp(',')){p++;continue}names.push(toks[p++].v)}p++;eatOp('=');const v=expr();endStmt();return mk('TupleAssign',{names,value:v},s)}
  const e=expr();
  if(toks[p].t==='op'&&ASSIGN.has(toks[p].v)){
   const op=toks[p++].v;
   if(e.k!=='Id'&&!(e.k==='Member'&&op!=='=')&&e.k!=='Member')err('Sisi kiri penugasan tidak valid');
   const v=expr();endStmt();
   return mk('Assign',{target:e,op,value:v,decl:op==='=',isVar:false},e)}
  endStmt();return e}
 function decl(){
  const s=toks[p];let isVar=false,varip=false;
  if(isId('var')||isId('varip')){varip=toks[p].v==='varip';isVar=true;p++}
  while(isId()&&QUAL.has(toks[p].v)&&toks[p+1].t==='id')p++;
  if(!(toks[p+1].t==='op'&&(toks[p+1].v==='='||toks[p+1].v===':='))){ // ada tipe
   p++;if(isOp('<'))skipGeneric();while(isOp('[')&&isOp(']',1))p+=2}
  const name=toks[p];if(name.t!=='id')err('Nama variabel diharapkan');p++;
  const op=toks[p].v;if(!(toks[p].t==='op'&&(op==='='||op===':=')))err('Diharapkan "=" pada deklarasi');p++;
  const v=expr();endStmt();
  return mk('Assign',{target:mk('Id',{name:name.v},name),op:'=',value:v,decl:true,isVar,varip},s)}
 function typeParams(){const ps=[];if(!isOp('('))return ps;p++;
  while(!isOp(')')){if(isOp(',')){p++;continue}
   const parts=[];while(!isOp(',')&&!isOp(')')&&!isOp('=')){if(isOp('<'))skipGeneric();else parts.push(toks[p++])}
   const name=parts.filter(t=>t.t==='id').pop();if(!name)err('Parameter tidak valid');
   let def=null;if(isOp('=')){p++;def=expr()}
   ps.push({name:name.v,def})}
  p++;return ps}
 function funcDef(){const s=toks[p],name=toks[p++].v,params=typeParams();eatOp('=>');const body=bodyOrInline();return mk('FuncDef',{name,params,body},s)}
 function typeDef(){const s=toks[p++];const name=toks[p++].v;p++;if(toks[p].t!=='ind')err('Definisi type kosong');p++;const fields=[];
  while(toks[p].t!=='ded'&&toks[p].t!=='eof'){if(toks[p].t==='nl'){p++;continue}
   const parts=[];while(toks[p].t!=='nl'&&!isOp('=')){if(isOp('<'))skipGeneric();else parts.push(toks[p++])}
   const f=parts.filter(t=>t.t==='id').pop();let def=null;if(isOp('=')){p++;def=expr()}
   if(f)fields.push({name:f.v,def});endStmt()}
  if(toks[p].t==='ded')p++;return mk('TypeDef',{name,fields},s)}
 function enumDef(){const s=toks[p++];const name=toks[p++].v;p++;p++;const vals=[];
  while(toks[p].t!=='ded'&&toks[p].t!=='eof'){if(toks[p].t==='nl'){p++;continue}vals.push(toks[p++].v);if(isOp('=')){p++;expr()}if(toks[p].t==='nl')p++}
  if(toks[p].t==='ded')p++;return mk('EnumDef',{name,vals},s)}
 // ----- ekspresi -----
 function expr(){return ternary()}
 function ternary(){const c=orE();if(isOp('?')){const s=toks[p++];const a=ternary();eatOp(':');const b=ternary();return mk('Ternary',{c,a,b},s)}return c}
 function orE(){let l=andE();while(isId('or')){const s=toks[p++];l=mk('Logic',{op:'or',l,r:andE()},s)}return l}
 function andE(){let l=notE();while(isId('and')){const s=toks[p++];l=mk('Logic',{op:'and',l,r:notE()},s)}return l}
 function notE(){if(isId('not')){const s=toks[p++];return mk('Unary',{op:'not',e:notE()},s)}return cmp()}
 function cmp(){let l=add();while(toks[p].t==='op'&&['==','!=','<','<=','>','>='].includes(toks[p].v)){const s=toks[p++];l=mk('Binary',{op:s.v,l,r:add()},s)}return l}
 function add(){let l=mul();while(toks[p].t==='op'&&(toks[p].v==='+'||toks[p].v==='-')){const s=toks[p++];l=mk('Binary',{op:s.v,l,r:mul()},s)}return l}
 function mul(){let l=unary();while(toks[p].t==='op'&&(toks[p].v==='*'||toks[p].v==='/'||toks[p].v==='%')){const s=toks[p++];l=mk('Binary',{op:s.v,l,r:unary()},s)}return l}
 function unary(){if(toks[p].t==='op'&&(toks[p].v==='-'||toks[p].v==='+')){const s=toks[p++];return mk('Unary',{op:s.v,e:unary()},s)}return postfix()}
 function args(){const a=[];
  while(!isOp(')')){
   if(isOp(',')){p++;continue}
   if(toks[p].t==='eof'||toks[p].t==='nl')err('Tanda kurung tidak ditutup');
   let n=null;if(toks[p].t==='id'&&isOp('=',1)){n=toks[p].v;p+=2}
   a.push({n,v:expr()})}
  p++;return a}
 function postfix(){
  let e=primary();
  for(;;){
   if(isOp('(')){const s=toks[p++];const path=pathOf(e);const a=args();e=mk('Call',{callee:e,args:a,path},s)}
   else if(isOp('[')){const s=toks[p++];const i=expr();eatOp(']');e=mk('Index',{obj:e,idx:i},s)}
   else if(isOp('.')&&toks[p+1].t==='id'){const s=toks[p++];const prop=toks[p++].v;e=mk('Member',{obj:e,prop},s);
    if(isOp('<')){const path=pathOf(e);if(path&&/^(array|matrix|map)\.(new|from)$/.test(path))skipGeneric()}}
   else break}
  return e}
 function primary(){
  const t=toks[p];
  if(t.t==='num'){p++;return mk('Num',{v:t.v},t)}
  if(t.t==='str'){p++;return mk('Str',{v:t.v},t)}
  if(t.t==='col'){p++;return mk('Col',{v:t.v},t)}
  if(t.t==='op'){
   if(t.v==='('){p++;const e=expr();eatOp(')');return e}
   if(t.v==='['){p++;const items=[];while(!isOp(']')){if(isOp(',')){p++;continue}if(toks[p].t==='eof')err('Kurung siku tidak ditutup');items.push(expr())}p++;return mk('ArrayLit',{items},t)}
   err(`Token tidak terduga "${t.v}"`)}
  if(t.t==='id'){
   switch(t.v){
    case 'true':case 'false':p++;return mk('Bool',{v:t.v==='true'},t);
    case 'if':return ifExpr();
    case 'for':return forExpr();
    case 'while':{p++;const c=expr();const b=block();return mk('While',{c,body:b},t)}
    case 'switch':return switchExpr();
   }
   if(RESERVED.has(t.v))err(`Kata kunci "${t.v}" tidak boleh dipakai di sini`);
   p++;return mk('Id',{name:t.v},t)}
  err(`Token tidak terduga "${show(t)}"`)}
 function ifExpr(){const t=toks[p++];const c=expr();const a=block();let b=null;
  if(isId('else')){p++;if(isId('if'))b=mk('Block',{body:[ifExpr()]});else b=block()}
  return mk('If',{c,a,b},t)}
 function forExpr(){const t=toks[p++];
  if(isOp('[')){p++;const names=[];while(!isOp(']')){if(isOp(',')){p++;continue}names.push(toks[p++].v)}p++;if(!isId('in'))err('Diharapkan "in"');p++;const it=expr();const b=block();return mk('ForIn',{names,it,body:b},t)}
  const v=toks[p++];if(v.t!=='id')err('Nama variabel loop diharapkan',v);
  if(isId('in')){p++;const it=expr();const b=block();return mk('ForIn',{names:[v.v],it,body:b},t)}
  eatOp('=');const from=expr();if(!isId('to'))err('Diharapkan "to" pada for');p++;const to=expr();let by=null;if(isId('by')){p++;by=expr()}
  const b=block();return mk('For',{v:v.v,from,to,by,body:b},t)}
 function switchExpr(){const t=toks[p++];let subj=null;if(toks[p].t!=='nl')subj=expr();
  if(toks[p].t!=='nl')err('Diharapkan baris baru setelah switch');p++;if(toks[p].t!=='ind')err('switch tanpa kasus');p++;
  const cases=[];let def=null;
  while(toks[p].t!=='ded'&&toks[p].t!=='eof'){
   if(toks[p].t==='nl'){p++;continue}
   if(isOp('=>')){p++;def=bodyOrInline();continue}
   const c=expr();eatOp('=>');cases.push({c,body:bodyOrInline()})}
  if(toks[p].t==='ded')p++;
  return mk('Switch',{subj,cases,def},t)}
 const body=[];
 while(toks[p].t!=='eof'){if(toks[p].t==='ded'||toks[p].t==='ind')err('Indentasi tidak terduga');const s=stmt();if(s)body.push(s)}
 return{k:'Program',body,version,nodes:nid}}

G.PineParse={parse,lex,PineError};
})(typeof self!=='undefined'?self:globalThis);
