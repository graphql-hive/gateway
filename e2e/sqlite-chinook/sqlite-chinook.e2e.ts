import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);

it('should execute ', async () => {
  const { execute } = await gateway({ supergraph: { with: 'mesh' } });
  await expect(
    execute({
      query: /* GraphQL */ `
        query Albums {
          albums(limit: 2) {
            albumId
            title
            artist {
              name
            }
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "albums": [
          {
            "albumId": 1,
            "artist": {
              "name": "AC/DC",
            },
            "title": "For Those About To Rock We Salute You",
          },
          {
            "albumId": 2,
            "artist": {
              "name": "Accept",
            },
            "title": "Balls to the Wall",
          },
        ],
      },
    }
  `);
});
