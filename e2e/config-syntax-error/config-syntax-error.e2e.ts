import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should execute query from additional resolvers', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('hello')],
    },
  });

  await expect(
    execute({
      query: /* GraphQL */ `
        {
          hello
          bye
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "bye": "world",
        "hello": "world",
      },
    }
  `);
});
