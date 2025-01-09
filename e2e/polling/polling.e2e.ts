import { createTenv } from '@internal/e2e';
import { describe, expect, it } from 'vitest';

describe('Polling', async () => {
  const { service, gateway, composeWithMesh } = createTenv(__dirname);
  const { output } = await composeWithMesh({
    services: [await service('Graph')],
    output: 'graphql',
  });
  const gw = await gateway({
    args: ['supergraph'],
    env: {
      SUPERGRAPH_PATH: output,
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
