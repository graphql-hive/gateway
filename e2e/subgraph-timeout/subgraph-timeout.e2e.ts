import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should do something', async () => {
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [await service('hello')],
    },
  });

  await expect(
    gw.execute({
      query: '{slowHello}',
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "slowHello": "world",
      },
    }
  `);
});
