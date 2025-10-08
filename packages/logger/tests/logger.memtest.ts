import path from 'path';
import { memtest } from '@internal/perf/memtest';
import { spawn, waitForPort } from '@internal/proc';
import { getAvailablePort } from '@internal/testing';
import { describe } from 'vitest';

const cwd = __dirname;

describe.each([
  'sync-logging',
  'async-logging',
  'child-loggers',
  'large-attributes',
  'circular-refs',
  'lazy-attributes',
  'mixed-levels',
  'level-changes',
])('logger memtest for %s', (name) => {
  memtest(
    {
      cwd,
      pathname: `/${name}`,
    },
    async () => {
      const port = await getAvailablePort();
      const [proc] = await spawn(
        { cwd, env: { PORT: port } },
        'node',
        '--inspect-port=0', // necessary for perf inspector
        '--import',
        'tsx',
        path.join(cwd, 'logger-memtest-server.ts'),
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
