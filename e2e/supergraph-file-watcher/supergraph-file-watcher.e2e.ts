import { setTimeout } from 'timers/promises';
import { createTenv, handleDockerHostNameInSDL } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gatewayRunner, gateway, service, composeWithMesh, fs } =
  createTenv(__dirname);

it('should detect supergraph file change and reload schema', async () => {
  const services = [await service('a'), await service('b')];

  // compose only "a" service
  let compose = await composeWithMesh({ services });
  if (gatewayRunner.includes('docker')) {
    compose.result = handleDockerHostNameInSDL(compose.result);
  }
  const supergraph = await fs.tempfile('supergraph.graphql', compose.result);

  const gw = await gateway({ supergraph });

  await expect(
    gw.execute({
      query: /* GraphQL */ `
        {
          a
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "a": "hello from a",
      },
    }
  `);

  // compose only "b" service
  compose = await composeWithMesh({ services, env: { USE_B: 1 } });
  if (gatewayRunner.includes('docker')) {
    compose.result = handleDockerHostNameInSDL(compose.result);
  }
  await fs.write(supergraph, compose.result);

  // give gw some time to reload
  const timeout = AbortSignal.timeout(1000);
  for (;;) {
    timeout.throwIfAborted();
    await setTimeout(100);
    if (gw.getStd('both').match(/supergraph changed/i)) {
      break;
    }
  }

  await expect(
    gw.execute({
      query: /* GraphQL */ `
        {
          b
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "b": "hello from b",
      },
    }
  `);
});
