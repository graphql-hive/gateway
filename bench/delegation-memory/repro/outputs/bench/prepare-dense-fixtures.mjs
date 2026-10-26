import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const here=fileURLToPath(new URL('.',import.meta.url)),folder=fileURLToPath(new URL('../../work/fixtures/',import.meta.url));
mkdirSync(folder,{recursive:true});
const fixtures=[{bytes:25000000,sha256:'9919ea9b1447b01a9f769bf5aa649c85c4dc96ba95659e3fa1460a6ec8097d76',path:folder+'dense-25000000.json',shape:{width:1,depth:3,textLength:8}}];
for(const bytes of [50000000,100000000,150000000]){
 const path=folder+`dense-${bytes}.json`;
 const p=spawnSync(process.execPath,[here+'fixture.mjs',String(bytes),path,'8','1'],{encoding:'utf8',timeout:60000});
 if(p.status!==0)throw new Error(p.stderr);
 const r=JSON.parse(p.stdout);fixtures.push({bytes,sha256:r.sha256,path,shape:{width:1,depth:3,textLength:8},count:r.count,objectCount:r.objectCount,tailBytes:r.tailBytes});
 writeFileSync(folder+'manifest.json',JSON.stringify({fixtures},null,2));
 console.log(JSON.stringify(r));
}
writeFileSync(here+'dense-fixture-manifest.json',JSON.stringify({fixtures},null,2));
