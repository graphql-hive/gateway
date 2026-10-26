import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.argv.includes('--child')) {
  const outputs = [];
  for (const patched of [false, true]) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', String(patched)], { encoding:'utf8', timeout:30000 });
    assert.equal(child.status,0,child.stderr);
    outputs.push(JSON.parse(child.stdout));
  }
  assert.deepEqual(outputs[1],outputs[0]);
  console.log(`PASS ${outputs[0].length} actual Hive Gateway composition cases, baseline vs HTTP shared-only cloning + fast metadata + fast result maps (${process.version})`);
} else {
  // Install all hooks before importing either the gateway or its executors.
  if (process.argv.at(-1)==='true') {
    (await import('./candidate-http-clone.mjs')).enableCandidateHTTPClone();
    (await import('./candidate-fast-metadata.mjs')).enableFastMetadata();
    (await import('./candidate-fast-result.mjs')).enableFastResult();
  }
  const { createGatewayRuntime } = await import('@graphql-hive/gateway-runtime');
  const g = await import('graphql');
  const schema = g.buildSchema('type Query { rows:[Row] row:Row fatal:Row! echo(value:String):String } type Row { id:ID! a:String b:String child:Row must:String! bad:String }');
  let asynchronous=false, upstreamCalls=0;
  const rows=[{id:'1',a:'a1',b:'b1',child:{id:'2',a:'a2',b:'b2'}},null,{id:'3',a:null,b:'b3',child:null}];
  const rootValue={rows,row:rows[0],fatal:{id:'fatal',a:'fatal'}};
  const gateway=createGatewayRuntime({
    logging:false,graphiql:false,maskedErrors:false,
    supergraph:`schema { query:Query }
      directive @join__graph(name:String!,url:String!) on ENUM_VALUE
      directive @join__type(graph:join__Graph!) repeatable on OBJECT | INTERFACE
      directive @join__field(graph:join__Graph) on FIELD_DEFINITION
      enum join__Graph { FIXTURE @join__graph(name:"fixture",url:"http://combined-fixture/graphql") }
      type Query @join__type(graph:FIXTURE) {
        rows:[Row] @join__field(graph:FIXTURE)
        row:Row @join__field(graph:FIXTURE)
        fatal:Row! @join__field(graph:FIXTURE)
        echo(value:String):String @join__field(graph:FIXTURE)
      }
      type Row @join__type(graph:FIXTURE) { id:ID! a:String b:String child:Row must:String! bad:String }`,
    fetchAPI:{fetch:async (url,init)=>{
      upstreamCalls++;
      const parsedURL=new URL(String(url));
      const request=init?.body ? JSON.parse(String(init.body)) : {
        query:parsedURL.searchParams.get('query'),
        variables:JSON.parse(parsedURL.searchParams.get('variables')||'{}'),
        operationName:parsedURL.searchParams.get('operationName')||undefined,
      };
      // Keep transport requests pending long enough for a concurrent caller to join.
      await new Promise(resolve=>setImmediate(resolve));
      const result=await g.execute({schema,document:g.parse(request.query),variableValues:request.variables,operationName:request.operationName,rootValue,
        fieldResolver(source,args,_context,info){
          let value;
          if(info.fieldName==='bad') {
            if(asynchronous) return Promise.reject(new Error('expected upstream failure'));
            throw new Error('expected upstream failure');
          }
          if(info.fieldName==='echo') value=args.value;
          else value=source[info.fieldName];
          return asynchronous ? Promise.resolve(value) : value;
        },
      });
      return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});
    }},
  });
  const run=async(query,variables={})=>{
    const response=await gateway.fetch('http://combined-gateway/graphql',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,variables})});
    assert.equal(response.status,200);
    return JSON.parse(await response.text());
  };
  const queries=[
    ['{rows{id a b child{id a}}}',{}],
    ['{rows{__proto__:a constructor:b toString:a}}',{}],
    ['{rows{...F child{...F}}} fragment F on Row {id a}',{}],
    ['query($yes:Boolean!){rows{id a @include(if:$yes) b @skip(if:$yes)}}',{yes:true}],
    ['query($yes:Boolean!){rows{id a @include(if:$yes) b @skip(if:$yes)}}',{yes:false}],
    ['query($value:String){echo(value:$value) row{a}}',{value:'variable value'}],
    ['{row{a bad b}}',{}],
    ['{rows{id must a}}',{}],
    ['{fatal{id must}}',{}],
    ['{one:row{id a} two:row{id b}}',{}],
  ];
  const outputs=[];
  try {
    for(asynchronous of [false,true]) {
      for(const [query,variables] of queries) {
        const result=await run(query,variables);
        if(query===queries[0][0]) {assert.equal(result.data.rows[0].a,'a1');assert.equal(result.data.rows[1],null);assert.equal(result.data.rows[2].a,null);}
        if(query.includes('bad')) assert(result.errors?.some(error=>error.message==='expected upstream failure'));
        if(query.includes('fatal')) {assert.equal(result.data,null);assert(result.errors?.length);}
        outputs.push({asynchronous,query,result});
      }
      const before=upstreamCalls;
      const query='{ rows { id a b } }';
      const [first,second]=await Promise.all([run(query),run(query)]);
      assert.deepEqual(first,second);
      assert.equal(upstreamCalls-before,1,'concurrent identical requests must share the actual HTTP request');
      first.data.rows[0].a='client mutation';assert.equal(second.data.rows[0].a,'a1');
      outputs.push({asynchronous,concurrentIdentical:true,result:second,upstreamFetches:upstreamCalls-before});
    }
  } finally {
    if(gateway[Symbol.asyncDispose]) await gateway[Symbol.asyncDispose]();
    else if(gateway.dispose) await gateway.dispose();
  }
  console.log(JSON.stringify(outputs));
}
