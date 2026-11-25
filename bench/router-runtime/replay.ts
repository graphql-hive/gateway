// Runs the Hive Router runtime's executor on the benchmark operation in-process, with the
// subgraph responses replayed from bytes captured once, so only the executor's own work is
// measured: no network, no server, no load generator. Compares the data as parsed objects with
// the data as a response tape (`responseTape`).
//
//   node --expose-gc --import tsx bench/router-runtime/replay.ts [--rounds 6] [--executions 2000]
//
// It needs the benchmark subgraphs on port 4200 the first time, to capture their responses.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PerformanceObserver } from 'node:perf_hooks';
import { parseArgs, isDeepStrictEqual } from 'node:util';
import { QueryPlanner } from '@graphql-hive/router-query-planner';
import {
  createRawExecutionResult,
  defaultPrintFn,
} from '@graphql-tools/executor-common';
import type { ExecutionRequest, ExecutionResult } from '@graphql-tools/utils';
import { buildSchema, parse } from 'graphql';
import { executeQueryPlan } from '../../packages/router-runtime/src/executor';

const { values: args } = parseArgs({
  options: {
    rounds: { type: 'string', default: '6' },
    executions: { type: 'string', default: '2000' },
    concurrency: { type: 'string', default: '50' },
    only: { type: 'string' },
  },
});
const here = import.meta.dirname;
const planner = new QueryPlanner(
  fs.readFileSync(path.join(here, 'supergraph.graphql'), 'utf8'),
);
const supergraphSchema = buildSchema(planner.consumerSchema);
const query = fs.readFileSync(path.join(here, 'operations/bench.graphql'), 'utf8');
const document = parse(query);
const queryPlan = planner.plan(query, undefined, new Set(), 0);
const { entityKeys, possibleTypes } = planner;
const expected = JSON.parse(
  fs.readFileSync(path.join(here, 'expected/bench.json'), 'utf8'),
);
const decoder = new TextDecoder();
const encoder = new TextEncoder();

// the responses of one execution, by subgraph and operation, every fetch of the plan has its own
type Captured = { subgraph: string; query: string; body: string }[];
const captureFile = path.join(os.tmpdir(), 'router-runtime-replay.json');
let captured: Captured;
if (fs.existsSync(captureFile)) {
  captured = JSON.parse(fs.readFileSync(captureFile, 'utf8'));
} else {
  captured = [];
  await executeQueryPlan({
    queryPlan,
    supergraphSchema,
    entityKeys,
    possibleTypes,
    executionRequest: { document, context: {} },
    async onSubgraphExecute(subgraph, request) {
      const query = defaultPrintFn(request.document);
      const res = await fetch(`http://localhost:4200/${subgraph}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables: request.variables }),
      });
      const body = await res.text();
      captured.push({ subgraph, query, body });
      return JSON.parse(body);
    },
  });
  fs.writeFileSync(captureFile, JSON.stringify(captured));
}
const bodies = new Map(
  captured.map(({ subgraph, query, body }) => [
    `${subgraph}\n${query}`,
    encoder.encode(body),
  ]),
);

function execute(responseTape: boolean) {
  return executeQueryPlan({
    queryPlan,
    supergraphSchema,
    entityKeys,
    possibleTypes,
    responseTape,
    executionRequest: { document, context: {} } as ExecutionRequest,
    onSubgraphExecute(subgraph, request) {
      const body = bodies.get(
        `${subgraph}\n${defaultPrintFn(request.document)}`,
      );
      if (!body) {
        throw new Error(`nothing captured for a request to ${subgraph}`);
      }
      // a copy, like bytes read from the network
      const bytes = body.slice();
      const parseBody = (bytes: Uint8Array) =>
        JSON.parse(decoder.decode(bytes)) as ExecutionResult;
      // later, like a response does
      return Promise.resolve(
        responseTape ? createRawExecutionResult(bytes, parseBody) : parseBody(bytes),
      );
    },
  }) as Promise<ExecutionResult>;
}

/** The response as the server sends it, `stringify` is what Yoga uses when a result has one. */
function send(result: ExecutionResult) {
  const stringify = (result as { stringify?: (r: ExecutionResult) => string })
    .stringify;
  const body: unknown = stringify ? stringify(result) : JSON.stringify(result);
  // the tape's response is its bytes, a `Response` takes them as they are
  return body instanceof Uint8Array ? body : encoder.encode(body as string);
}

const modes = {
  objects: false,
  tape: true,
} as const;
for (const [name, responseTape] of Object.entries(modes)) {
  const out = JSON.parse(decoder.decode(send(await execute(responseTape))));
  if (!isDeepStrictEqual(out, expected)) {
    throw new Error(`${name} doesn't give the expected response`);
  }
}

let gcMs = 0;
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    gcMs += entry.duration;
  }
}).observe({ entryTypes: ['gc'] });

async function measure(responseTape: boolean, executions: number) {
  const concurrency = Number(args.concurrency);
  globalThis.gc?.();
  await new Promise((resolve) => setTimeout(resolve, 20));
  gcMs = 0;
  const cpu = process.cpuUsage();
  for (let done = 0; done < executions; done += concurrency) {
    await Promise.all(
      Array.from({ length: concurrency }, () =>
        execute(responseTape).then(send),
      ),
    );
  }
  const used = process.cpuUsage(cpu);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return {
    cpu: (used.user + used.system) / executions,
    gc: (gcMs * 1000) / executions,
  };
}

const executions = Number(args.executions);
const selected = Object.entries(modes).filter(
  ([name]) => !args.only || args.only === name,
);
for (const [, responseTape] of selected) {
  await measure(responseTape, executions);
}
const results: Record<string, { cpu: number[]; gc: number[] }> = {};
for (let round = 0; round < Number(args.rounds); round++) {
  for (const [name, responseTape] of selected) {
    const { cpu, gc } = await measure(responseTape, executions);
    (results[name] ??= { cpu: [], gc: [] }).cpu.push(cpu);
    results[name].gc.push(gc);
  }
}
const median = (values: number[]) =>
  values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
console.log(`${captured.length} subgraph responses, ${[...bodies.values()].reduce((a, b) => a + b.length, 0)} B, ${os.loadavg()[0]!.toFixed(1)} load`);
for (const [name, { cpu, gc }] of Object.entries(results)) {
  console.log(
    `${name.padEnd(8)} CPU ${median(cpu).toFixed(0).padStart(5)} µs/execution  GC ${median(gc).toFixed(1).padStart(5)} µs  (CPU of every round: ${cpu.map((c) => c.toFixed(0)).join(' ')})`,
  );
}
