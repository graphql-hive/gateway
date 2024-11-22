import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);

it('should execute Metrics with banana', async () => {
  const { execute } = await gateway({ supergraph: { with: 'mesh' } });
  await expect(
    execute({
      query: /* GraphQL */ `
        query Categories {
          jokes_categories
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "jokes_categories": [
          "animal",
          "career",
          "celebrity",
          "dev",
          "explicit",
          "fashion",
          "food",
          "history",
          "money",
          "movie",
          "music",
          "political",
          "religion",
          "science",
          "sport",
          "travel",
        ],
      },
    }
  `);
});
