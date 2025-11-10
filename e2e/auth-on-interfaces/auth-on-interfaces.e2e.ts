import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should require all interface and implementor scopes', async () => {
  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [await service('protected-req-on-int')],
    },
  });

  await expect(
    gw.execute({
      query: /* GraphQL */ `
        {
          i {
            id
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "errors": [
        {
          "message": "Unauthenticated",
        },
      ],
    }
  `);
});
