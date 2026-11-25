// Preloaded with `run.mjs --heap-prof`: samples every allocation of the gateway, also the ones
// the GC collected since, which is what a request costs, unlike `node --heap-prof` that keeps
// only what's alive at exit. Writes `<dir>/allocations.heapprofile` when the gateway exits.

import fs from 'node:fs';
import { Session } from 'node:inspector/promises';
import path from 'node:path';

const dir = process.env['ROUTER_RUNTIME_BENCH_HEAP_PROF'];
if (dir) {
  const session = new Session();
  session.connect();
  await session.post('HeapProfiler.enable');
  await session.post('HeapProfiler.startSampling', {
    samplingInterval: 4096,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  const write = async () => {
    const { profile } = await session.post('HeapProfiler.stopSampling');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'allocations.heapprofile'),
      JSON.stringify(profile),
    );
  };
  // before the gateway's own handler exits
  process.prependOnceListener('SIGINT', () => {
    write().then(() => process.exit(0));
  });
}
