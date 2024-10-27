import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);

it('should execute', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('calculator')],
    },
  });
  await expect(
    execute({
      query: /* GraphQL */ `
        query Add {
          add(request: { left: 2, right: 3 })
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "add": 5,
      },
    }
  `);
});
