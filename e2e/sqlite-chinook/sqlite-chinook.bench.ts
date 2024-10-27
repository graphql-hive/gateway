import { createTenv, Gateway } from '@internal/e2e';
import { beforeAll, bench, expect } from 'vitest';

const { gateway } = createTenv(__dirname);

let gw: Gateway;
beforeAll(async () => {
  gw = await gateway({ supergraph: { with: 'mesh' } });
});

bench('Albums', async () => {
  await expect(
    gw.execute({
      query: /* GraphQL */ `
        query Albums {
          albums(limit: 2) {
            __typename
            albumId
            title
            artist {
              name
            }
          }
        }
      `,
    }),
  ).resolves.toEqual(
    expect.objectContaining({
      data: {
        albums: expect.arrayContaining([
          expect.objectContaining({
            __typename: expect.stringContaining(''),
          }),
        ]),
      },
    }),
  );
});
