// Summarizes a gateway CPU profile from `run.mjs --cpu-prof`, per request: by package, and the
// functions with the most self time.
//
//   node bench/router-runtime/profile.mjs <tmp>/<scenario>-<run>.prof [top]

import fs from 'node:fs';
import path from 'node:path';

const [dir, top = '30'] = process.argv.slice(2);
const name = path.basename(dir, '.prof');
const summary = JSON.parse(
  fs.readFileSync(path.join(dir, `../${name}.summary.json`), 'utf8'),
);
// the profile covers the warmup too, k6's warmup and measured runs send the same per second
const file = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.cpuprofile'))
  .map((f) => path.join(dir, f))
  .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
const profile = JSON.parse(fs.readFileSync(file, 'utf8'));
const seconds = (profile.endTime - profile.startTime) / 1e6;
const requests = summary.metrics.http_reqs.rate * seconds;
const interval = (profile.endTime - profile.startTime) / profile.samples.length;
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const samples = new Map();
for (const id of profile.samples) samples.set(id, (samples.get(id) ?? 0) + 1);

const group = (url, fn) =>
  fn === '(garbage collector)'
    ? 'GC'
    : url.includes('router-runtime/src')
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
                  : url.includes('node_modules')
                    ? url.split('node_modules/').pop().split('/').slice(0, url.split('node_modules/').pop().startsWith('@') ? 2 : 1).join('/')
                    : 'other';
const groups = new Map();
const fns = new Map();
for (const [id, count] of samples) {
  const { url, functionName, lineNumber } = nodes.get(id).callFrame;
  if (functionName === '(idle)' || functionName === '(program)') continue;
  const g = group(url, functionName);
  groups.set(g, (groups.get(g) ?? 0) + count);
  const fn = `${functionName || '(anonymous)'} ${g} ${url.split('/').pop()}:${lineNumber + 1}`;
  fns.set(fn, (fns.get(fn) ?? 0) + count);
}
const us = (count) => ((count * interval) / requests).toFixed(1).padStart(7);
console.log(`${name}: ~${Math.round(requests)} requests over ${seconds.toFixed(0)}s, µs/req`);
for (const [g, c] of [...groups].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${us(c)}  ${g}`);
console.log('functions:');
for (const [f, c] of [...fns].sort((a, b) => b[1] - a[1]).slice(0, Number(top))) console.log(`  ${us(c)}  ${f}`);
