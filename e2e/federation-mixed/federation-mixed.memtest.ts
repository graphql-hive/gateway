import { createExampleSetup, createTenv } from '@internal/e2e';
import { memtest } from '@internal/perf/memtest';

const cwd = __dirname;

const { service, gateway } = createTenv(cwd);
const exampleSetup = createExampleSetup(cwd);

memtest(
  {
    cwd,
    query: exampleSetup.query,
  },
  async () =>
    gateway({
      supergraph: {
        with: 'mesh',
        services: [
          await service('accounts'),
          await exampleSetup.service('inventory'),
          await exampleSetup.service('products'),
          await exampleSetup.service('reviews'),
        ],
      },
    }),
);
