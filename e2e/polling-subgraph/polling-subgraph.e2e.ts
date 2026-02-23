import { setTimeout } from 'node:timers/promises';
import { createTenv, handleDockerHostNameInURLOrAtPath } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

describe('Subgraph Regular', async () => {
  const tenv = createTenv(__dirname);
  it('refreshes on poll', async () => {
    const greetingsService = await tenv.service('greetings');
    const subgraphPath = await tenv.fs.tempfile('subgraph.graphql');
    async function compose(prefix: string) {
      let { result } = await tenv.composeWithMesh({
        services: [greetingsService],
        args: ['--subgraph', 'greetings'],
        env: {
          TRANSFORM_PREFIX: prefix,
        },
        output: 'graphql',
      });
      if (tenv.gatewayRunner.includes('docker')) {
        result = await handleDockerHostNameInURLOrAtPath(result, []);
      }
      await tenv.fs.write(subgraphPath, result);
    }
    await compose('prefix1_');
    const gateway = await tenv.gateway({
      subgraph: subgraphPath,
    });
    const result = await gateway.execute({
      query: /* GraphQL */ `
        query {
          prefix1_greetings
        }
      `,
    });
    expect(result).toMatchObject({
      data: {
        prefix1_greetings: 'Hello!',
      },
    });
    await compose('prefix2_');
    await setTimeout(15_000); // wait for the polling to happen
    const result2 = await gateway.execute({
      query: /* GraphQL */ `
        query {
          prefix2_greetings
        }
      `,
    });
    expect(result2).toMatchObject({
      data: {
        prefix2_greetings: 'Hello!',
      },
    });
  }, 30_000);
});
