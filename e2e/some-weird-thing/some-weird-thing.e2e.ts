import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should do something', async () => {
  const gw = await gateway({
    subgraph: {
      with: 'mesh',
      subgraphName: 'hello',
      services: [await service('hello')],
    },
  });

  const err: Error = await gw
    .execute({
      query: '{slowHello}',
    })
    .catch((err) => err);

  expect(err.message).toContain(
    'ResponseError: Status is not 200, got status 503 Service Unavailable',
  );
});
