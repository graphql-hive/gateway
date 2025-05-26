import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';
import { encodeGlobalID } from './id';

const { gateway, service } = createTenv(__dirname);

it('should resolve the data behind the node', async () => {
  const { execute } = await gateway({
    pipeLogs: 'gw.out',
    supergraph: {
      with: 'apollo',
      services: [await service('users'), await service('posts')],
    },
  });

  await expect(
    execute({
      query: /* GraphQL */ `
        query ($id: ID!) {
          node(id: $id) {
            ... on User {
              name
              posts {
                title
                content
              }
            }
          }
        }
      `,
      variables: {
        id: encodeGlobalID('User', 'user-2'),
      },
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "errors": [
        {
          "extensions": {
            "code": "GRAPHQL_VALIDATION_FAILED",
          },
          "locations": [
            {
              "column": 11,
              "line": 3,
            },
          ],
          "message": "Cannot query field "node" on type "Query".",
        },
      ],
    }
  `);
});
