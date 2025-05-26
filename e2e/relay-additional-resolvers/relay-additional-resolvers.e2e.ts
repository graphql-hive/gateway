import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should resolve the data behind the node', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'apollo',
      services: [await service('users'), await service('posts')],
    },
  });

  await expect(
    execute({
      query: /* GraphQL */ `
        {
          node(id: "user-2") {
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
    }),
  ).resolves.toMatchInlineSnapshot();
});
