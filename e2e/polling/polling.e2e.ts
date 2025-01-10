import { createTenv, handleDockerHostName } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

describe('Polling', async () => {
  const { service, gateway, composeWithMesh, gatewayRunner } =
    createTenv(__dirname);
  let { output } = await composeWithMesh({
    services: [await service('Graph')],
    output: 'graphql',
  });
  const volumes: {
    host: string;
    container: string;
  }[] = [];
  if (gatewayRunner.includes('docker')) {
    output = await handleDockerHostName(output, volumes);
  }
  const gw = await gateway({
    args: ['supergraph'],
    env: {
      SUPERGRAPH_PATH: output,
    },
    runner: {
      docker: {
        volumes,
      },
    },
  });
  it('should not break the long running query while polling and schema remaining the same', async () => {
    const res = await gw.execute({
      query: /* GraphQL */ `
        query {
          hello
        }
      `,
    });
    expect(res).toEqual({
      data: {
        hello: 'Hello world!',
      },
    });
  }, 30_000);
});
