import { setTimeout } from 'timers/promises';
import { createExampleSetup, createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);
const { supergraph, query, result } = createExampleSetup(__dirname);

it.each(['SIGINT', 'SIGTERM'] as const)(
  'should gracefully shut down on %s signal',
  async (signal) => {
    const gw = await gateway({
      supergraph: await supergraph(),
    });

    await expect(
      gw.execute({
        query,
      }),
    ).resolves.toEqual(result);

    gw.kill(signal);

    await Promise.race([
      gw.waitForExit,
      setTimeout(3_000).then(() => {
        expect.fail('Gateway did not exit on signal');
      }),
    ]);
  },
);
