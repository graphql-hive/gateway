import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {helpers} from './candidate-inline-composite.mjs';
import {handleMaybePromise,isActualPromise,isPromise,fakePromise,unfakePromise,promiseLikeFinally} from '../bench/node_modules/@whatwg-node/promise-helpers/esm/index.js';
const {finish,normalize}=new Function('isActualPromise','isPromise','fakePromise','unfakePromise','promiseLikeFinally','isAbstractType',helpers+'return {finish:finishCompositeResult,normalize:normalizeCompositeResult};')(isActualPromise,isPromise,fakePromise,unfakePromise,promiseLikeFinally,type=>type==='abstract');
const kinds=['plain','null','undefined','native','reject','thenable','thenable-throw','fake','fake-reject','throw','then-getter','then-throws','then-not-callable','unknown-type','typename-getter','thenable-chain'];
function make(kind,trace){switch(kind){
 case 'plain':return {x:1};case 'null':return null;case 'undefined':return undefined;
 case 'native':return Promise.resolve({x:1});case 'reject':return Promise.reject(new Error('expected rejection'));
 case 'thenable':return {then(resolve){trace.push('then');return resolve({x:1});}};
 case 'thenable-chain':return {then(resolve){trace.push('then');return {then(next){trace.push('then-next');return next(resolve({x:1}));}};}};
 case 'thenable-throw':return {then(){trace.push('then');throw new Error('then error');}};
 case 'fake':return fakePromise({x:1});case 'fake-reject':return fakePromise().then(()=>{throw new Error('fake error');});
 case 'throw':throw new Error('input error');
 case 'then-getter':return {get then(){trace.push('get-then');return undefined;},x:1};
 case 'then-throws':return {get then(){throw new Error('getter error');}};
 case 'then-not-callable':return {then:1};case 'unknown-type':return {__typename:'Unknown'};
 case 'typename-getter':return {get __typename(){trace.push('get-typename');return 'Known';}};
}}
const settle=value=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve({pending:true}),30);Promise.resolve(value).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
let cases=0;
for(const kind of kinds)for(const type of ['concrete','abstract'])for(const withInfo of [false,true]){
 const outputs=[];
 for(const patched of [false,true]){
  const trace=[],info=withInfo?{schema:{getType(name){trace.push('type:'+name);return name==='Known'?{}:undefined;}}}:undefined;
  const validate=value=>{if(info&&type==='abstract'){if(value.__typename!=null){const resolved=info.schema.getType(value.__typename);if(!resolved)return null;}return value;}return value;};
  try{const value=patched?finish(make(kind,trace),type,info):handleMaybePromise(()=>make(kind,trace),validate);const async=Boolean(value?.then);outputs.push({value:JSON.stringify(await settle(value)),async,trace});}
  catch(e){outputs.push({error:e.message,trace});}
 }
 assert.deepEqual(outputs[1],outputs[0],`${kind}/${type}/${withInfo}`);cases++;
}
for(const kind of kinds){
 const outputs=[];
 for(const fn of [value=>unfakePromise(fakePromise(value)),normalize]){const trace=[];try{const value=fn(make(kind,trace));outputs.push({tag:typeof value==='object'&&value!==null?Object.prototype.toString.call(value):typeof value,value:JSON.stringify(await settle(value)),trace});}catch(e){outputs.push({error:e.message,trace});}}
 assert.deepEqual(outputs[1],outputs[0],'normalize/'+kind);cases++;
}
// Exercise the preserved custom-thenable wrapper's catch/finally methods.
for(const method of ['then','catch','finally'])for(const rejects of [false,true]){
 const outputs=[];
 for(const fn of [value=>unfakePromise(fakePromise(value)),normalize]){
  const trace=[];const value={then(resolve,reject){trace.push('underlying');return rejects?reject(new Error('expected')):resolve('value');}};
  const wrapped=fn(value);const cb=x=>{trace.push('callback:'+String(x?.message??x));return 'callback-result';};
  try{outputs.push({value:await settle(wrapped[method](cb,cb)),trace});}catch(e){outputs.push({error:e.message,trace});}
 }
 assert.deepEqual(outputs[1],outputs[0],method+'/'+rejects);cases++;
}
// The legacy normalizer reads inherited fake-promise markers on its custom
// thenable wrapper. Preserve those reads as well as its catch/finally methods.
for(const markerValue of [undefined,'resolved','rejected']){
 const marker=Symbol.for('@whatwg-node/promise-helpers/FakePromise'),outputs=[];
 for(const fn of [value=>unfakePromise(fakePromise(value)),normalize]){
  const trace=[];
  try{
   Object.defineProperty(Object.prototype,marker,{configurable:true,get(){trace.push('marker');return markerValue;}});
   const result=fn({then(resolve){return resolve(1);}});
   outputs.push({returned:result===undefined?'undefined':typeof result,trace});
  }catch(e){outputs.push({thrown:e===undefined?'undefined':String(e),trace});}
  finally{delete Object.prototype[marker];}
 }
 assert.deepEqual(outputs[1],outputs[0],'inherited marker/'+markerValue);cases++;
}
const integration=[];
for(const [script,args] of [['verify-fast-result.mjs',['tools']],['verify-fast-metadata.mjs',[]],['verify-combined.mjs',[]],['verify-delegate.mjs',[]]]){
 const outputs=[];
 for(const installer of ['../phase2/install-compact-annotation.mjs','./install-inline.mjs']){
  const p=spawnSync(process.execPath,['--import',new URL(installer,import.meta.url).href,fileURLToPath(new URL('../bench/'+script,import.meta.url)),'--child',...args,script==='verify-delegate.mjs'?'false':'true'],{encoding:'utf8',timeout:60000,maxBuffer:8*1048576});
  assert.equal(p.status,0,p.stderr);outputs.push(JSON.parse(p.stdout));
 }
 assert.deepEqual(outputs[1],outputs[0]);integration.push({script,count:outputs[0].length});
}
const report={verdict:'PASS',cases,integration,node:process.version};writeFileSync(new URL('./inline-correctness.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));

