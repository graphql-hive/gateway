import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const [path,mode]=process.argv.slice(2),raw=JSON.parse(readFileSync(path)),s=JSON.parse(readFileSync(path.replace(/\.json$/,'.summary.json')))['0'];
assert(raw.completedAt);assert(['pilot','confirm','validate'].includes(mode));
const pairs=mode==='confirm'?5:3,wins=mode==='confirm'?4:2,minimum=mode==='validate'?0:5;
assert.equal(s.pairs,pairs);assert.equal(raw.events.length,pairs*2);
const tests={cpuMedian:s.cpuMs.pairedReductionMedian>=minimum,elapsedMedian:s.wallMs.pairedReductionMedian>=minimum,heapRegression:s.addedHeap.pairedReductionMedian>-3,rssRegression:s.peakRss.pairedReductionMedian>-3};
if(mode!=='validate'){tests.cpuConsistency=s.cpuMs.improvedPairs>=wins;tests.elapsedConsistency=s.wallMs.improvedPairs>=wins;}
const result={mode,passed:Object.values(tests).every(Boolean),tests,memoryWin:mode==='confirm'?{addedHeap:s.addedHeap.pairedReductionMedian>=5&&s.addedHeap.improvedPairs>=4,rss:s.peakRss.pairedReductionMedian>=5&&s.peakRss.improvedPairs>=4}:null};
writeFileSync(path.replace(/\.json$/,'.decision.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
