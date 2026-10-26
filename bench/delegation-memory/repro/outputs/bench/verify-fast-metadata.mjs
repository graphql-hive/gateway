import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
if(!process.argv.includes('--child')) {
 const outputs=[];
 for(const patched of [false,true]) {
  const p=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--child',String(patched)],{encoding:'utf8',timeout:30000});
  assert.equal(p.status,0,p.stderr);outputs.push(JSON.parse(p.stdout));
 }
 assert.deepEqual(outputs[1],outputs[0]);
 console.log(`PASS: ${outputs[0].length} differential cases through stitched delegation and public metadata APIs; baseline and fast-metadata identical.`);
} else {
 if(process.argv.at(-1)==='true') (await import('./candidate-fast-metadata.mjs')).enableFastMetadata();
 const {stitchSchemas}=await import('@graphql-tools/stitch');
 const {normalizedExecutor}=await import('@graphql-tools/executor');
 const {buildSchema,parse,execute}=await import('graphql');
 const a=buildSchema(`type Query { rows:[Row] row(id:ID!):Row } type Row {id:ID! a:String child:Row}`);
 const b=buildSchema(`type Query {row(id:ID!):Row} type Row {id:ID! b:String bad:String must:String!}`);
 const rows=[{id:'1',a:'a1',child:{id:'2',a:'a2'}},null,{id:'2',a:'a2',child:null},{id:'1',a:'a1',child:{id:'2',a:'a2'}}];
 const rootA={rows,row:({id})=>rows.find(r=>r?.id===id)};
 const outputs=[];
 const {resolveExternalValue, FIELD_SUBSCHEMA_MAP_SYMBOL, getSubschema, isExternalObject}=await import('@graphql-tools/delegate');
 const rowType=a.getType('Row');
 let previousMap;
 for(const width of [0,1,4,21,64]) {
  const object={id:'metadata'};
  const resolved=resolveExternalValue(object,[],a,undefined,undefined,rowType,true);
  assert.equal(resolved,object); assert.equal(isExternalObject(object),true);
  assert.equal(Object.hasOwn(object,FIELD_SUBSCHEMA_MAP_SYMBOL),true);
  const map=object[FIELD_SUBSCHEMA_MAP_SYMBOL];
  assert(map && typeof map==='object'); assert.equal(Object.getPrototypeOf(map),null);
  assert.equal(Object.isExtensible(map),true); assert.notEqual(map,previousMap);
  assert.deepEqual(Object.keys(map),[]); previousMap=map;
  const symbolDescriptor=Object.getOwnPropertyDescriptor(object,FIELD_SUBSCHEMA_MAP_SYMBOL);
  assert.equal(symbolDescriptor.writable,true);assert.equal(symbolDescriptor.enumerable,false);assert.equal(symbolDescriptor.configurable,false);
  const target={schema:b};
  for(const key of ['__proto__','constructor','toString',...Array.from({length:width},(_,i)=>`field${i}`)]) {
   map[key]=target;
   assert.equal(getSubschema(object,key),target);
   assert.deepEqual(Object.getOwnPropertyDescriptor(map,key),{value:target,writable:true,enumerable:true,configurable:true});
  }
  assert.equal(Object.getPrototypeOf(map),null);assert.equal(getSubschema(object,'absent'),a);
  resolveExternalValue(object,[],a,undefined,undefined,rowType,true);
  assert.equal(object[FIELD_SUBSCHEMA_MAP_SYMBOL],map);
  delete map.__proto__;assert.equal(getSubschema(object,'__proto__'),a);
  outputs.push({metadataWidth:width,keys:Object.keys(map),descriptors:{writable:symbolDescriptor.writable,enumerable:symbolDescriptor.enumerable,configurable:symbolDescriptor.configurable}});
 }
 const queries=[
  '{rows{id a b child{id a b}}}',
  '{rows{id x:b y:b a}}',
  '{rows{id bad a b}}',
  '{rows{id must a b}}',
  'query($yes:Boolean!){rows{id b @include(if:$yes) a}}',
  '{rows{...F child{...F}}} fragment F on Row {id a b}',
  '{one:row(id:"1"){id b} two:row(id:"2"){id b} absent:row(id:"none"){id b}}',
  '{rows{__proto__:a constructor:a toString:b}}',
 ];
 for(const asyncB of [false,true]) {
  const rootB={row:({id})=>({id,b:()=>asyncB?Promise.resolve('b'+id):'b'+id,bad:()=>{throw new Error('expected-error-'+id)},must:()=>null})};
  const exec=(schema,rootValue)=>(req)=>execute({schema,rootValue,document:req.document,variableValues:req.variables,contextValue:req.context});
  const merged=stitchSchemas({subschemas:[{schema:a,executor:exec(a,rootA),merge:{Row:{selectionSet:'{id}',fieldName:'row',args:obj=>({id:obj.id})}}},{schema:b,executor:exec(b,rootB),merge:{Row:{selectionSet:'{id}',fieldName:'row',args:obj=>({id:obj.id})}}}]});
  for(const query of queries) {
   const result=await normalizedExecutor({schema:merged,document:parse(query),variableValues:{yes:true}});
   const json=JSON.parse(JSON.stringify(result));
   if(query===queries[0]) {assert.equal(json.data.rows[0].b,'b1');assert.equal(json.data.rows[2].b,'b2');assert.equal(json.data.rows[0].child.b,'b2');assert.equal(json.data.rows[1],null);}
   if(query.includes('bad')) assert(json.errors?.some(e=>e.message==='expected-error-1'));
   outputs.push(json);
  }
 }
 console.log(JSON.stringify(outputs));
}


