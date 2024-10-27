import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should work when pruned', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('Wiki')],
    },
  });
  await expect(
    execute({
      query: /* GraphQL */ `
        mutation Main {
          post_main(input: { banana: true }) {
            apple
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "post_main": [
          {
            "apple": "correct",
          },
        ],
      },
    }
  `);
});
