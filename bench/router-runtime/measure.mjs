// Preloaded into the gateway process by `run.mjs`: appends its CPU time, GC time and memory to
// the file in `ROUTER_RUNTIME_BENCH_STATS` every 250ms, so the runner can tell how much of each a
// request took.
import fs from 'node:fs';
import { PerformanceObserver } from 'node:perf_hooks';

const file = process.env['ROUTER_RUNTIME_BENCH_STATS'];
if (file) {
  let gcMs = 0;
  let gcCount = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      gcMs += entry.duration;
      gcCount++;
    }
  }).observe({ entryTypes: ['gc'] });
  const write = () => {
    const cpu = process.cpuUsage();
    const memory = process.memoryUsage();
    fs.appendFileSync(
      file,
      JSON.stringify({
        time: Date.now(),
        cpuUs: cpu.user + cpu.system,
        gcMs,
        gcCount,
        heapUsed: memory.heapUsed,
        rss: memory.rss,
        external: memory.external,
      }) + '\n',
    );
  };
  write();
  setInterval(write, 250).unref();
}
