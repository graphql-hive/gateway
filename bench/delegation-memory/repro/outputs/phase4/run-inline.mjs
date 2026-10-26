import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {freemem} from 'node:os';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const [size,reps,tag]=process.argv.slice(2),bytes=+size,n=+reps,out=resolve('outputs/phase4');
assert.equal(process.versions.node,'24.19.0');assert([25000000,100000000,150000000].includes(bytes));assert(n>0&&n<=7);assert(/^[a-z0-9-]+$/.test(tag));assert(!existsSync(out+'/'+tag+'.json'));
const fixture=JSON.parse(readFileSync('work/fixtures/manifest.json')).fixtures.find(f=>f.bytes===bytes&&f.shape.width===1);
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const sourceFiles=['outputs/phase4/candidate-inline-composite.mjs','outputs/phase4/case-inline-wrapper.mjs','outputs/phase4/run-inline.mjs','outputs/phase2/case-wrapper.mjs','outputs/phase2/candidate-annotation.mjs','outputs/phase2/candidate-compact-maps.mjs','outputs/bench/case.mjs','outputs/bench/package-lock.json','outputs/bench/node_modules/@graphql-tools/delegate/dist/index.js','outputs/bench/node_modules/@whatwg-node/promise-helpers/esm/index.js','outputs/bench/node_modules/@graphql-tools/utils/esm/getArgumentValues.js'];
const identity=()=>Object.fromEntries(sourceFiles.map(p=>[p,hash(p)]));
const report={bytes,ballastBytes:0,source:identity(),events:[],policy:{oldMiB:1536,semiMiB:16,observer:false},startedAt:new Date().toISOString()};
const save=()=>writeFileSync(out+'/'+tag+'.json',JSON.stringify(report,null,2));save();
const env={...process.env,UV_THREADPOOL_SIZE:'4'};delete env.NODE_OPTIONS;delete env.NODE_V8_COVERAGE;
for(let rep=0;rep<n;rep++)for(const variant of (rep%2?['inline-composite','baseline']:['baseline','inline-composite'])){
 assert(freemem()>6500000000,'Launch reserve');assert.deepEqual(identity(),report.source);
 const label=`${tag}-r${rep}-${variant}`,count=Math.floor((bytes-19)/70);
 const config={mode:'gateway-supergraph',count,depth:3,width:1,textLength:8,tailBytes:bytes-(19+count*70),concurrency:1,patched:true,optimization:'shared-clone+fast-metadata+fast-result',targetBytes:bytes,stress:true,ballastBytes:0,fixturePath:resolve(`work/fixtures/dense-${bytes}.json`),profile:false,measureHeap:false,phase2Variant:'compact-annotation',phase4Variant:variant,resultPath:out+'/'+label+'.result.json',startPath:out+'/'+label+'.start.json',guard:{maxRss:2684354560,minFree:3221225472,logPath:out+'/'+label+'.guard.json'}};
 const flags=['--expose-gc','--max-old-space-size=1536','--max-semi-space-size=16'];
 const p=spawnSync(process.execPath,[...flags,out+'/case-inline-wrapper.mjs',JSON.stringify(config)],{env,encoding:'utf8',timeout:240000,maxBuffer:8*1048576});
 writeFileSync(out+'/'+label+'.log',p.stdout+'\nSTDERR\n'+p.stderr);assert.equal(p.status,0,p.stderr+' '+p.error);
 const r=JSON.parse(readFileSync(config.resultPath));assert.equal(r.bytes,bytes);assert.equal(r.sha256,fixture.sha256);assert.equal(r.heapSizeLimit,1660944384);
 const idle=r.stages[0],peak=Math.max(...r.stages.slice(0,-1).map(s=>s.heapUsed));
 const event={rep,variant,idleHeap:idle.heapUsed,peakHeap:peak,addedHeap:peak-idle.heapUsed,peakRss:Math.max(r.sampledPeakRss,r.resourceMaxRssKiB*1024),wallMs:r.elapsedMs,cpuMs:(r.cpuUsage.user+r.cpuUsage.system)/1000,postGCHeap:r.stages.at(-1).heapUsed,flags,config};
 report.events.push(event);save();console.log(JSON.stringify({...event,config:undefined,flags:undefined}));
}
report.completedAt=new Date().toISOString();save();




