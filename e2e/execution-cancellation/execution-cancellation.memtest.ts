import path from 'path';
import { createExampleSetup, createTenv } from '@internal/e2e';
import { memtest } from '@internal/perf/memtest';
import { spawn, waitForPort } from '@internal/proc';
import { getAvailablePort } from '@internal/testing';
import { describe } from 'vitest';

const cwd = __dirname;

const { gateway } = createTenv(cwd);
const { supergraph, query } = createExampleSetup(cwd);

describe('Hive Gateway', () => {
  memtest(
    {
      cwd,
      query,
    },
    async () =>
      gateway({
        supergraph: await supergraph(),
      }),
  );
});

describe('Yoga', () => {
  memtest(
    {
      cwd,
      query: '{hello}',
    },
    async () => {
      const port = await getAvailablePort();
      const [proc] = await spawn(
        { cwd, env: { PORT: port } },
        'node',
        '--inspect-port=0', // necessary for perf inspector
        '--import',
        'tsx',
        path.join(cwd, 'yoga-server.ts'),
      );

      await waitForPort({
        port,
        protocol: 'http',
        signal: new AbortController().signal,
      });

      return {
        ...proc,
        port,
        protocol: 'http',
      };
    },
  );
});
