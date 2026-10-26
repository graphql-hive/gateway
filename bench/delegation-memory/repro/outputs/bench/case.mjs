import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import {freemem} from 'node:os';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {getHeapStatistics} from 'node:v8';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import { dirname } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

if (!isMainThread) {
  let peak = 0, heapPeak = 0, samples = 0, pending = false, stopping = false;
  let inspector;
  if(workerData?.measureHeap) { const {Session}=await import('node:inspector'); inspector=new Session(); inspector.connectToMainThread(); }
  const finish=()=>{parentPort.postMessage({rss:peak,heap:heapPeak,samples});inspector?.disconnect();};
  const timer = setInterval(() => {
    const rss=process.memoryUsage.rss(); peak = Math.max(peak, rss);
    if(workerData?.guard && (rss>workerData.guard.maxRss || freemem()<workerData.guard.minFree)) {
      if(workerData.guard.logPath) writeFileSync(workerData.guard.logPath,JSON.stringify({rss,free:freemem(),peakRss:peak,heapPeak,samples,time:Date.now()}));
      process.stderr.write(`RESOURCE_GUARD rss=${rss} free=${freemem()}\n`); process.kill(process.pid,'SIGKILL');
    }
    if(inspector && !pending) { pending=true; inspector.post('Runtime.getHeapUsage',(e,r)=>{ if(!e){heapPeak=Math.max(heapPeak,r.usedSize);samples++;}pending=false;if(stopping)finish(); }); }
  }, 2);
  parentPort.on('message', msg => {
    if (msg === 'reset') { peak = process.memoryUsage.rss(); heapPeak=0;samples=0;parentPort.postMessage('ready'); }
    if (msg === 'stop') { clearInterval(timer);stopping=true;if(!pending)finish(); }
  });
} else {
  const c = JSON.parse(process.argv[2] || '{}');
  const { mode = 'graphql', count = 10000, depth = 3, width = 3, asyncFields = false, concurrency = 1, textLength = 8, patched = false, profile = false, measureHeap=false, targetBytes=0, tailBytes=0, optimization='promise-map' } = c;
  const countLimit=c.stress && c.fixturePath && targetBytes<=150000000 ? 2200000 : c.guard?400000:40000;
  assert(count > 0 && count <= countLimit && depth > 0 && depth <= 5 && width > 0 && width <= 5 && concurrency > 0 && concurrency <= 4 && textLength <= 256, 'bounded workload only');
  if(c.guard) assert.equal(concurrency,1);
  const require = createRequire(import.meta.url);
  const fastHook=patched && optimization.includes('fast-result') ? (await import('./candidate-fast-result.mjs')).enableFastResult() : undefined;
  const emptyHook=patched && optimization==='empty-args' ? (await import('./candidate-empty-args.mjs')).enableEmptyArgs() : undefined;
  const hook = patched && mode === 'graphql17' && optimization==='promise-map' ? (await import('./candidate17.mjs')).enableCandidate17() : undefined;
  const g = mode === 'graphql17' ? await import('../../work/graphql-js/src/index.ts') : await import('graphql');
  hook?.deregister();
  emptyHook?.deregister();
  if(!mode.startsWith('gateway')) fastHook?.deregister();
  let execute = g.execute;
  if (patched && mode === 'graphql') {
    assert.equal(mode, 'graphql');
    execute = (await import('./candidate.mjs')).candidateExecute();
  }
  const scalarSDL = Array.from({length:width}, (_,i) => `f${i}: String!`).join(' ');
  const sdl = `type Query { rows: [Row!]! } type Row { ${scalarSDL} child: Row }`;
  const selection = d => `${Array.from({length:width},(_,i)=>`f${i}`).join(' ')}${d > 1 ? ` child { ${selection(d-1)} }` : ''}`;
  const query = `{ rows { ${selection(depth)} } }`;
  const schema = g.buildSchema(sdl);
  const document = g.parse(query);
  const makeRow = (d, i) => {
    const row = {};
    for (let f = 0; f < width; f++) row[`f${f}`] = `${i.toString(36)}-${f}-`.padEnd(textLength,'x').slice(0,textLength);
    if (d > 1) row.child = makeRow(d-1, i);
    return row;
  };
  const makeInput = n => {const input={ rows: Array.from({length:n},(_,i)=>makeRow(depth,i)) }; if(n===count && tailBytes) input.rows.at(-1).f0+='x'.repeat(tailBytes);return input;};
  const fieldResolver = (source, _args, _context, info) => {
    const value = source[info.fieldName];
    return asyncFields && info.parentType.name === 'Row' && info.fieldName === 'f0' ? Promise.resolve(value) : value;
  };
  let gateway;
  let upstream;
  let phase = 'setup';
  const stages = [];
  const mark = name => stages.push({ name, ...process.memoryUsage() });
  if (mode.startsWith('gateway')) {
    const candidateHooks=[];
    if(patched && optimization.includes('argument-map')) candidateHooks.push((await import('./candidate-utils.mjs')).enableCandidateUtils());
    if(patched && optimization.includes('lazy-metadata')) candidateHooks.push((await import('./candidate-delegate.mjs')).enableCandidateDelegate());
    if(patched && optimization.includes('shared-clone')) candidateHooks.push((await import('./candidate-http-clone.mjs')).enableCandidateHTTPClone());
    if(patched && optimization.includes('fast-metadata')) candidateHooks.push((await import('./candidate-fast-metadata.mjs')).enableFastMetadata());
    const { createGatewayRuntime } = await import('@graphql-hive/gateway-runtime');
    for(const candidateHook of candidateHooks) candidateHook.deregister();
    fastHook?.deregister();
    const fetch = async (_url, _init, _context, info) => {
      if(c.fixturePath && phase==='measured') return new Response(Readable.toWeb(createReadStream(c.fixturePath)),{headers:{'content-type':'application/json'}});
      assert(upstream, 'fixture must be set');
      return new Response(upstream, { headers: { 'content-type': 'application/json' } });
    };
    const config = { logging: false, graphiql: false, maskedErrors: false, fetchAPI: {fetch}, plugins: () => [{
      onSubgraphExecute() { return () => { if (phase === 'measured') mark('upstream-parsed'); }; },
      onExecute() { return { onExecuteDone() { if (phase === 'measured') mark('gateway-executed'); } }; },
    }] };
    if (mode === 'gateway-proxy') Object.assign(config, { proxy: { endpoint: 'http://fixture/graphql' }, schema: sdl });
    else {
      // One-subgraph federation: no entity joins. Transport and stitching still execute.
      config.supergraph = `schema { query: Query }
        directive @join__graph(name: String!, url: String!) on ENUM_VALUE
        directive @join__type(graph: join__Graph!) repeatable on OBJECT | INTERFACE
        directive @join__field(graph: join__Graph) on FIELD_DEFINITION
        enum join__Graph { FIXTURE @join__graph(name: "fixture", url: "http://fixture/graphql") }
        type Query @join__type(graph: FIXTURE) { rows: [Row!]! @join__field(graph: FIXTURE) }
        type Row @join__type(graph: FIXTURE) { ${scalarSDL} child: Row }`;
    }
    gateway = createGatewayRuntime(config);
  }
  const request = () => gateway.fetch('http://gateway/graphql', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({query}) });
  // Warm imports, schema, validation and execution caches with a tiny result.
  if (gateway) { upstream = JSON.stringify({data:makeInput(10)}); const r = await request(); const t = await r.text(); assert.equal(r.status,200,t); assert(!JSON.parse(t).errors,t); }
  else for (let i=0;i<3;i++) await execute({schema,document,rootValue:makeInput(10),fieldResolver});
  upstream = undefined;
  const sampler = new Worker(new URL(import.meta.url),{workerData:{measureHeap,guard:c.guard}});
  sampler.postMessage('reset'); await once(sampler,'message');
  if(c.ballastBytes) {assert(c.ballastBytes<=500000000 && c.guard);globalThis.__syntheticBaseline=new Array(Math.floor(c.ballastBytes/8)).fill(7);}
  global.gc(); await new Promise(r=>setTimeout(r,30));
  mark('idle');
  if(c.startPath) writeFileSync(c.startPath,JSON.stringify({idle:stages.at(-1),heapSizeLimit:getHeapStatistics().heap_size_limit,runtime:process.versions,ballastBytes:c.ballastBytes||0,guard:c.guard}));
  sampler.postMessage('reset'); await once(sampler,'message');
  let session;
  if (profile) {
    const { Session } = await import('node:inspector'); session = new Session(); session.connect();
    await new Promise((resolve,reject)=>session.post('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true},e=>e?reject(e):resolve()));
  }
  async function workload() {
  const startUptimeMs=process.uptime()*1000;
  if(measureHeap) console.log('@@MEASURE_START');
  const start = performance.now(); phase = 'measured';
  const startCpu=process.cpuUsage();
  const hash = createHash('sha256');
  let inputs = c.fixturePath ? undefined : Array.from({length:concurrency},()=>makeInput(count));
  mark('input');
  let results, strings, responses, pending;
  if (gateway) {
    if(!c.fixturePath) {upstream = JSON.stringify({data:inputs[0]});inputs = undefined; global.gc(); mark('upstream-fixture-only');}
    responses = await Promise.all(Array.from({length:concurrency},request));
    mark('response-ready');
    // Read bytes, avoid allocating a parsed client result in the gateway process.
    let bytes = 0;
    for (const response of responses) {
      assert.equal(response.status,200);
      const reader = response.body.getReader();
      for (;;) { const {done,value} = await reader.read(); if(done) break; bytes += value.byteLength; hash.update(value); }
    }
    results = {bytes};
  } else {
    pending = inputs.map(rootValue=>mode === 'direct' ? {data:rootValue} : execute({schema,document,rootValue,fieldResolver}));
    mark('execute-returned-before-await');
    results = await Promise.all(pending);
    for(const r of results) assert(!r.errors,JSON.stringify(r.errors));
    mark('executed');
    strings = results.map(r=>JSON.stringify(r)); mark('serialized');
    // UTF-8 output copy kept alive alongside strings and objects.
    responses = strings.map(s=>Buffer.from(s)); mark('encoded');
    for (const buffer of responses) hash.update(buffer);
  }
  const bytes = gateway ? results.bytes : responses.reduce((n,b)=>n+b.byteLength,0);
  if(targetBytes) assert.equal(bytes,targetBytes);
  const elapsedMs = performance.now()-start;
  mark('complete');
  if(measureHeap) console.log('@@MEASURE_END');
  inputs=results=strings=responses=upstream=pending=undefined;
  return {bytes,elapsedMs,cpuUsage:process.cpuUsage(startCpu),sha256:hash.digest('hex'),startUptimeMs,endUptimeMs:process.uptime()*1000};
  }
  const {bytes,elapsedMs,cpuUsage,sha256,startUptimeMs,endUptimeMs} = await workload();
  sampler.postMessage('stop'); const [sampled] = await once(sampler,'message'); const sampledPeakRss=sampled.rss;
  await new Promise(r=>setImmediate(r)); global.gc(); global.gc(); mark('after-release-gc');
  await sampler.terminate();
  if (profile) {
    const {profile:allocationProfile} = await new Promise((resolve,reject)=>session.post('HeapProfiler.stopSampling',(e,r)=>e?reject(e):resolve(r)));
    writeFileSync(profile,JSON.stringify(allocationProfile)); session.disconnect();
  }
  const out = {config:{mode,count,depth,width,asyncFields,concurrency,textLength,patched,profile,measureHeap,targetBytes,tailBytes,optimization},runtime:process.versions,platform:process.platform,arch:process.arch,bytes,sha256,elapsedMs,sampledPeakRss,sampledPeakHeap:sampled.heap,heapSamples:sampled.samples,resourceMaxRssKiB:process.resourceUsage().maxRSS,stages};
  out.startUptimeMs=startUptimeMs;out.endUptimeMs=endUptimeMs;
  out.fixturePath=c.fixturePath;
  out.heapSizeLimit=getHeapStatistics().heap_size_limit;
  out.guard=c.guard;
  out.ballastBytes=c.ballastBytes||0;
  out.cpuUsage=cpuUsage;
  out.harnessSha256=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
  if(c.resultPath) writeFileSync(c.resultPath,JSON.stringify(out,null,2));
  console.log(JSON.stringify(out));
  if(gateway) await gateway[Symbol.asyncDispose]();
}
