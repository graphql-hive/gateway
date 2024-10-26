import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should work with untouched schema', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('Wiki')],
    },
  });

  await expect(
    execute({
      query: /* GraphQL */ `
        mutation Good {
          postGood(input: { banana: true }) {
            apple
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "postGood": [
          {
            "apple": "good",
          },
        ],
      },
    }
  `);
});

it('should work with renamed argument', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('Wiki')],
    },
  });
  await expect(
    execute({
      query: /* GraphQL */ `
        mutation Bad {
          postBad(requestBody: { banana: true }) {
            apple
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "postBad": [
          {
            "apple": "bad",
          },
        ],
      },
    }
  `);
});
