import {readFileSync,writeFileSync} from 'node:fs';
const path=process.argv[2],r=JSON.parse(readFileSync(path));
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const groups={};
for(const delay of [...new Set(r.events.map(e=>e.delayMs??0))]){
 const events=r.events.filter(e=>(e.delayMs??0)===delay),candidate=events.find(e=>e.variant!=='baseline')?.variant;
 if(!candidate)continue;
 const pairs=[...new Set(events.map(e=>e.rep))].map(rep=>({before:events.find(e=>e.rep===rep&&e.variant==='baseline'),after:events.find(e=>e.rep===rep&&e.variant===candidate)})).filter(p=>p.before&&p.after);
 const summary={pairs:pairs.length,candidate};
 for(const metric of ['idleHeap','addedHeap','peakHeap','peakRss','wallMs','cpuMs','maxWriteBytes','maxQueuedBytes']){
  const get=e=>metric==='wallMs'?e.wallMs??e.elapsedMs:e[metric];if(!pairs.length||get(pairs[0].before)===undefined)continue;
  const before=pairs.map(p=>get(p.before)),after=pairs.map(p=>get(p.after)),savings=pairs.map(p=>100*(get(p.before)-get(p.after))/get(p.before));
  summary[metric]={beforeMedian:median(before),afterMedian:median(after),pairedReductionMedian:median(savings),pairedReductionMin:Math.min(...savings),pairedReductionMax:Math.max(...savings),improvedPairs:savings.filter(x=>x>0).length};
 }
 groups[delay]=summary;
}
writeFileSync(path.replace(/\.json$/,'.summary.json'),JSON.stringify(groups,null,2));console.log(JSON.stringify(groups,null,2));
