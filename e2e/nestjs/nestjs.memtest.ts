import { createExampleSetup, createTenv } from '@internal/e2e';
import { memtest } from '@internal/perf/memtest';

const cwd = __dirname;

const { service } = createTenv(cwd);
const { supergraph, query } = createExampleSetup(cwd);

memtest(
  {
    cwd,
    query,
  },
  async () =>
    service('nestjs', {
      args: [`--supergraph=${await supergraph()}`],
    }),
);
