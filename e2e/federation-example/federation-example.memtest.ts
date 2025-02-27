import { createExampleSetup, createTenv } from '@internal/e2e';
import { memtest } from '@internal/perf/memtest';

const cwd = __dirname;

const { gateway } = createTenv(cwd);
const { supergraph, query } = createExampleSetup(cwd);

memtest(
  {
    cwd,
    query,
  },
  async () => {
    const gw = await gateway({
      supergraph: await supergraph(),
    });
    const ready = await gw.readiness(); // load the graphql schema reflecting accurate memory size during idle phase
    if (!ready) {
      throw new Error('Gateway is not ready');
    }
    return gw;
  },
);
