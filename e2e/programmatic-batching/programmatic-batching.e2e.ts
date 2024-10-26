import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);

it.concurrent.each([
  {
    name: 'User',
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
  },
])('should execute $name', async ({ query }) => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('api')],
    },
  });
  await expect(execute({ query })).resolves.toMatchSnapshot();
});
