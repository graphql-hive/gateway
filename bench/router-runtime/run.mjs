// Load tests the gateway on the Hive Router runtime and reports, per scenario and run: requests
// per second, latency, and the gateway's CPU time, GC time and memory per request.
//
//   node bench/router-runtime/run.mjs [--scenarios dedup,no-dedup] [--runs 2] [--duration 30s] [--vus 50] [--cpu-prof] [--heap-prof]
//
// With `--cpu-prof` or `--heap-prof`, every run writes the gateway's CPU or sampled allocation
// profile to its own directory next to the logs, see `profile.mjs`.
//
// See README.md for what it needs.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { checkOperations } from './diff.mjs';

const here = import.meta.dirname;
const root = path.resolve(here, '../..');
const { values: args } = parseArgs({
  options: {
    scenarios: { type: 'string', default: 'dedup,no-dedup' },
    runs: { type: 'string', default: '2' },
    duration: { type: 'string', default: '30s' },
    warmup: { type: 'string', default: '10s' },
    vus: { type: 'string', default: '50' },
    port: { type: 'string', default: '4000' },
    'cpu-prof': { type: 'boolean', default: false },
    'heap-prof': { type: 'boolean', default: false },
  },
});
const subgraphsBin = path.resolve(
  root,
  process.env['SUBGRAPHS_BIN'] ?? 'subgraphs',
);
const k6 = process.env['K6'] ?? 'k6';
const url = `http://localhost:${args.port}/graphql`;
const operation = path.join(here, 'operations/bench.graphql');

// the subgraphs binary takes no flags, it'd start serving
try {
  fs.accessSync(subgraphsBin, fs.constants.X_OK);
} catch {
  console.error(`No subgraphs binary at ${subgraphsBin}, see README.md`);
  process.exit(1);
}
if (spawnSync(k6, ['version'], { stdio: 'ignore' }).error) {
  console.error(`Could not run k6 (${k6}), see README.md`);
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'router-runtime-bench-'));
const children = new Set();
const start = (command, argv, env = {}, log) => {
  const child = spawn(command, argv, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', log, log],
  });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
};
const stop = async (child) => {
  if (child.exitCode != null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGINT');
  await exited;
};
process.on('exit', () => {
  for (const child of children) child.kill('SIGKILL');
});
const ready = async (check) => {
  for (let i = 0; i < 120; i++) {
    try {
      await check();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('timed out waiting for it to start');
};
const lastStats = (file) => {
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
};
const statsBetween = (file, from, to) =>
  fs
    .readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((s) => s.time >= from && s.time <= to);

const subgraphsLog = fs.openSync(path.join(tmp, 'subgraphs.log'), 'w');
const subgraphs = start(subgraphsBin, [], {}, subgraphsLog);
await ready(() =>
  fetch('http://localhost:4200/accounts', { method: 'POST' }).then(() => {}),
);

const rows = [];
for (const scenario of args.scenarios.split(',')) {
  const config = path.join(here, `configs/${scenario}.config.ts`);
  if (!fs.existsSync(config)) throw new Error(`no scenario ${scenario}`);
  for (let run = 1; run <= Number(args.runs); run++) {
    const stats = path.join(tmp, `${scenario}-${run}.stats.jsonl`);
    const gatewayLog = fs.openSync(
      path.join(tmp, `${scenario}-${run}.log`),
      'w',
    );
    const gateway = start(
      process.execPath,
      [
        ...(args['cpu-prof']
          ? ['--cpu-prof', `--cpu-prof-dir=${path.join(tmp, `${scenario}-${run}.prof`)}`]
          : []),
        ...(args['heap-prof'] ? ['--import', path.join(here, 'heap-prof.mjs')] : []),
        '--import',
        'tsx',
        '--import',
        path.join(here, 'measure.mjs'),
        'packages/gateway/src/bin.ts',
        'supergraph',
        path.join(here, 'supergraph.graphql'),
        '--hive-router-runtime',
        '--port',
        args.port,
        '--config-path',
        config,
      ],
      {
        NODE_ENV: 'production',
        ROUTER_RUNTIME_BENCH_STATS: stats,
        ...(args['heap-prof'] && {
          ROUTER_RUNTIME_BENCH_HEAP_PROF: path.join(tmp, `${scenario}-${run}.heap`),
        }),
      },
      gatewayLog,
    );
    await ready(() =>
      fetch(`http://localhost:${args.port}/healthcheck`).then((res) => {
        if (!res.ok) throw new Error();
      }),
    );
    // a gateway that answers differently isn't worth measuring
    const diffs = await checkOperations(url);
    if (diffs.length) {
      throw new Error(
        `${scenario}: responses differ from the recorded ones:\n${diffs.join('\n')}`,
      );
    }
    const k6Env = { URL: url, OPERATION: operation, VUS: args.vus };
    spawnSync(k6, ['run', '-q', path.join(here, 'k6.js')], {
      env: { ...process.env, ...k6Env, DURATION: args.warmup },
      stdio: 'ignore',
    });
    const summary = path.join(tmp, `${scenario}-${run}.summary.json`);
    const before = lastStats(stats);
    const result = spawnSync(
      k6,
      ['run', '-q', '--summary-export', summary, path.join(here, 'k6.js')],
      {
        env: { ...process.env, ...k6Env, DURATION: args.duration },
        stdio: 'ignore',
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = lastStats(stats);
    await stop(gateway);
    if (result.status !== 0) {
      throw new Error(`${scenario}: k6 failed, see ${summary}`);
    }
    const { metrics } = JSON.parse(fs.readFileSync(summary, 'utf8'));
    const requests = metrics.http_reqs.count;
    const window = statsBetween(stats, before.time, after.time);
    const duration = metrics.http_req_duration;
    rows.push({
      scenario,
      run,
      'req/s': Math.round(metrics.http_reqs.rate),
      'p50 ms': duration.med.toFixed(1),
      'p90 ms': duration['p(90)'].toFixed(1),
      'p99 ms': duration['p(99)'].toFixed(1),
      'failed checks': metrics.checks.fails,
      'CPU µs/req': Math.round((after.cpuUs - before.cpuUs) / requests),
      'GC µs/req': Math.round(((after.gcMs - before.gcMs) * 1000) / requests),
      'GCs/1k req': (
        ((after.gcCount - before.gcCount) * 1000) /
        requests
      ).toFixed(1),
      'heap MB (avg)': (
        window.reduce((sum, s) => sum + s.heapUsed, 0) /
        window.length /
        1048576
      ).toFixed(1),
      'RSS MB (max)': (Math.max(...window.map((s) => s.rss)) / 1048576).toFixed(
        0,
      ),
    });
  }
}
await stop(subgraphs);
console.table(rows);
console.log(`logs and raw results in ${tmp}`);
