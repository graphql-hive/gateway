// Summarizes `allocations.heapprofile` from `run.mjs --heap-prof`: what a request allocates, by
// package and by the function allocating it.
//
//   node bench/router-runtime/heap-profile.mjs <tmp>/<scenario>-<run>.heap [top] [warmup s] [duration s]

import fs from 'node:fs';
import path from 'node:path';

const [dir, top = '30', warmup = '10', duration = '30'] = process.argv.slice(2);
const name = path.basename(dir, '.heap');
const summary = JSON.parse(
  fs.readFileSync(path.join(dir, `../${name}.summary.json`), 'utf8'),
);
// the profile covers the warmup too, at about the same rate
const requests =
  summary.metrics.http_reqs.count * (1 + Number(warmup) / Number(duration));
const { head } = JSON.parse(
  fs.readFileSync(path.join(dir, 'allocations.heapprofile'), 'utf8'),
);
const group = (url) =>
  url.includes('router-runtime/src')
    ? 'router-runtime'
    : url.includes('executors/http')
      ? 'http executor'
      : url.includes('executors/common')
        ? 'executor-common'
        : url.includes('graphql-yoga')
          ? 'yoga'
          : url.includes('@whatwg-node')
            ? 'whatwg-node'
            : url.includes('/packages/')
              ? url.split('/packages/')[1].split('/src')[0]
              : url.startsWith('node:') || url === ''
                ? 'node/native'
                : url.includes('node_modules/')
                  ? url.split('node_modules/').pop().split('/')[0]
                  : 'other';
const groups = new Map();
const fns = new Map();
let total = 0;
(function walk(node, parent) {
  const { functionName, url, lineNumber } = node.callFrame;
  // native frames allocate for their JS caller
  const owner = url ? node.callFrame : (parent ?? node.callFrame);
  if (node.selfSize) {
    total += node.selfSize;
    const g = group(owner.url);
    groups.set(g, (groups.get(g) ?? 0) + node.selfSize);
    const fn = `${functionName || '(anonymous)'}${owner !== node.callFrame ? ` < ${owner.functionName || '(anonymous)'}` : ''} ${g} ${(owner.url || '').split('/').pop()}:${(owner.lineNumber ?? lineNumber) + 1}`;
    fns.set(fn, (fns.get(fn) ?? 0) + node.selfSize);
  }
  for (const child of node.children) walk(child, url ? node.callFrame : parent);
})(head);
const kb = (bytes) => (bytes / requests / 1024).toFixed(2).padStart(7);
console.log(`${name}: ~${Math.round(requests)} requests, ${kb(total)} KB/req allocated`);
for (const [g, b] of [...groups].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${kb(b)}  ${g}`);
console.log('functions:');
for (const [f, b] of [...fns].sort((a, b) => b[1] - a[1]).slice(0, Number(top))) console.log(`  ${kb(b)}  ${f}`);
