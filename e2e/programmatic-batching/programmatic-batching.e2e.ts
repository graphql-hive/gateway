import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);

it('should execute', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('api')],
    },
  });
  await expect(
    execute({
      query: /* GraphQL */ `
        fragment UserF on User {
          id
          name
        }
        query User {
          john: user(id: 1) {
            ...UserF
          }
          jane: user(id: 2) {
            ...UserF
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "jane": {
          "id": 2,
          "name": "Jane Doe",
        },
        "john": {
          "id": 1,
          "name": "John Doe",
        },
      },
    }
  `);
});
