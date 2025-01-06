import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should disallow disallowed', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('users')],
    },
  });

  await expect(
    execute({
      query: /* GraphQL */ `
        {
          disallowed
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": null,
      "errors": [
        {
          "locations": [
            {
              "column": 11,
              "line": 3,
            },
          ],
          "message": "Insufficient permissions for selecting 'Query.disallowed'.",
        },
      ],
    }
  `);
});

it('should allow allowed', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('users')],
    },
  });

  await expect(
    execute({
      query: /* GraphQL */ `
        {
          allowed
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "allowed": "cool",
      },
    }
  `);
});
