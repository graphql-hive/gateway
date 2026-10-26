import {createWriteStream,statSync,mkdirSync} from 'node:fs';
import {once} from 'node:events';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const targetBytes=Number(process.argv[2]||150000000),file=process.argv[3],textLength=Number(process.argv[4]||64),width=Number(process.argv[5]||3);
assert(file && targetBytes>0 && targetBytes<=150000000 && textLength>=8 && textLength<=64);
assert(width===1||width===3);
mkdirSync(dirname(file),{recursive:true});const stream=createWriteStream(file);const hash=createHash('sha256');
const rowBytes=3*(width*(textLength+8)+10)-8,count=Math.floor((targetBytes-19)/rowBytes),tailBytes=targetBytes-(19+count*rowBytes);
const row=(d,i)=>{const r={};for(let f=0;f<width;f++)r['f'+f]=`${i.toString(36)}-${f}-`.padEnd(textLength,'x').slice(0,textLength);if(d>1)r.child=row(d-1,i);return r;};
const write=async s=>{hash.update(s);if(!stream.write(s))await once(stream,'drain');};
await write('{"data":{"rows":[');
for(let i=0;i<count;i++){const r=row(3,i);if(i===count-1)r.f0+='x'.repeat(tailBytes);await write((i?',':'')+JSON.stringify(r));}
await write(']}}');stream.end();await once(stream,'finish');assert.equal(statSync(file).size,targetBytes);
console.log(JSON.stringify({targetBytes,count,objectCount:3*count,width,textLength,tailBytes,sha256:hash.digest('hex'),file}));
