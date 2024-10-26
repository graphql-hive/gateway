import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);

it.concurrent.each([
  {
    name: 'TestQuery',
    query: /* GraphQL */ `
      query TestQuery {
        alignment_and_tree(limit: 5) {
          rfam_acc
          family(limit: 1) {
            type
            description
            comment
            author
          }
        }
      }
    `,
  },
])('should execute $name', async ({ query }) => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [],
    },
  });
  await expect(execute({ query })).resolves.toMatchSnapshot();
});
