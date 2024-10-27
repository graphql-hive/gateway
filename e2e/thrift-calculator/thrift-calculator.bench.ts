import { createTenv, Gateway } from '@internal/e2e';
import { beforeAll, bench, expect } from 'vitest';

const { gateway, service } = createTenv(__dirname);

let gw: Gateway;
beforeAll(async () => {
  gw = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('calculator')],
    },
  });
});

bench('Add', async () => {
  await expect(
    gw.execute({
      query: /* GraphQL */ `
        query Add {
          add(request: { left: 2, right: 3 })
        }
      `,
    }),
  ).resolves.toEqual({
    data: {
      add: 5,
    },
  });
});
