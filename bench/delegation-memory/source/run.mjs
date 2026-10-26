import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { freemem } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [baseArg, fixtureArg, outArg, sizeArg, repsArg, tag] =
  process.argv.slice(2);
const bytes = Number(sizeArg),
  reps = Number(repsArg);
assert.equal(process.versions.node, '24.19.0');
assert([25000000, 50000000, 100000000, 150000000].includes(bytes));
assert(reps > 0 && reps <= 7 && /^[a-z0-9-]+$/.test(tag));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const baseBuild = resolve(baseArg),
  fixturePath = resolve(fixtureArg),
  out = resolve(outArg);
mkdirSync(out, { recursive: true });
const output = resolve(out, tag + '.json');
assert(!existsSync(output), 'Preserve previous results');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const fixtureSha = sha(fixturePath);
assert.equal(readFileSync(fixturePath).length, bytes);
const files = [
  resolve(root, 'yarn.lock'),
  resolve(root, 'packages/runtime/dist/index.js'),
  ...[
    'packages/delegate/dist/index.js',
    'packages/executors/http/dist/index.js',
  ].flatMap((p) => [resolve(root, p), resolve(baseBuild, p)]),
  fileURLToPath(import.meta.url),
  fileURLToPath(new URL('./case.mjs', import.meta.url)),
  fileURLToPath(new URL('../repro/outputs/bench/case.mjs', import.meta.url)),
];
const identity = () => Object.fromEntries(files.map((p) => [p, sha(p)]));
const source = identity();
const report = {
  bytes,
  node: process.versions,
  platform: process.platform,
  source,
  fixtureSha,
  ballastBytes: 0,
  events: [],
  policy: {
    oldMiB: 2813,
    semiMiB: 16,
    observer: false,
    maxRss: 2684354560,
    minFree: 3221225472,
  },
  startedAt: new Date().toISOString(),
};
const save = () => writeFileSync(output, JSON.stringify(report, null, 2));
save();
const env = { ...process.env, UV_THREADPOOL_SIZE: '4' };
delete env.NODE_OPTIONS;
delete env.NODE_V8_COVERAGE;
for (let rep = 0; rep < reps; rep++)
  for (const variant of rep % 2 ? ['head', 'base'] : ['base', 'head']) {
    assert(freemem() > 6500000000, 'Launch reserve');
    assert.deepEqual(identity(), source, 'Build/source changed during series');
    const label = `${tag}-r${rep}-${variant}`,
      count = Math.floor((bytes - 19) / 70);
    const config = {
      mode: 'gateway-supergraph',
      count,
      depth: 3,
      width: 1,
      textLength: 8,
      tailBytes: bytes - (19 + count * 70),
      concurrency: 1,
      patched: false,
      targetBytes: bytes,
      stress: true,
      ballastBytes: 0,
      fixturePath,
      profile: false,
      measureHeap: false,
      sourceVariant: variant,
      baseBuild,
      resultPath: resolve(out, label + '.result.json'),
      startPath: resolve(out, label + '.start.json'),
      guard: {
        maxRss: report.policy.maxRss,
        minFree: report.policy.minFree,
        logPath: resolve(out, label + '.guard.json'),
      },
    };
    const p = spawnSync(
      process.execPath,
      [
        '--expose-gc',
        '--max-old-space-size=2813',
        '--max-semi-space-size=16',
        fileURLToPath(new URL('./case.mjs', import.meta.url)),
        JSON.stringify(config),
      ],
      { env, encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1048576 },
    );
    writeFileSync(
      resolve(out, label + '.log'),
      p.stdout + '\nSTDERR\n' + p.stderr,
    );
    if (p.status !== 0) {
      report.events.push({
        rep,
        variant,
        failed: true,
        status: p.status,
        signal: p.signal,
        error: p.error?.message,
      });
      save();
      throw new Error(
        `Stopped ${label}: ${p.stderr.slice(-2500)} ${p.error || ''}`,
      );
    }
    const r = JSON.parse(readFileSync(config.resultPath));
    assert.equal(r.bytes, bytes);
    assert.equal(r.sha256, fixtureSha);
    const idleHeap = r.stages[0].heapUsed,
      peakHeap = Math.max(...r.stages.slice(0, -1).map((s) => s.heapUsed));
    const event = {
      rep,
      variant,
      idleHeap,
      peakHeap,
      addedHeap: peakHeap - idleHeap,
      peakRss: Math.max(r.sampledPeakRss, r.resourceMaxRssKiB * 1024),
      wallMs: r.elapsedMs,
      cpuMs: (r.cpuUsage.user + r.cpuUsage.system) / 1000,
      postGCHeap: r.stages.at(-1).heapUsed,
      bytes: r.bytes,
      sha256: r.sha256,
      loadedBuiltEntries: r.loadedBuiltEntries,
    };
    report.events.push(event);
    save();
    console.log(JSON.stringify(event));
  }
report.completedAt = new Date().toISOString();
save();
