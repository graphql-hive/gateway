import { createExampleSetup, createTenv } from '@internal/e2e';
import { loadtest } from '@internal/memtest';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);
const { supergraph, query } = createExampleSetup(__dirname);

it('should not leak', async () => {
  const gw = await gateway({
    supergraph: await supergraph(),
  });

  using test = await loadtest({
    cwd: __dirname,
    server: gw,
    query,
  });

  await test.waitForComplete;

  expect(() => test.checkMemTrend()).not.toThrow();
});
