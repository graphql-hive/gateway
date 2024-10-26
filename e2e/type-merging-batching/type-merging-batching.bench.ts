import { createTenv, Gateway } from '@internal/e2e';
import { beforeAll, bench, expect } from 'vitest';

const { service, gateway } = createTenv(__dirname);

let gw: Gateway;
beforeAll(async () => {
  gw = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('authors'), await service('books')],
    },
  });
});

bench('Authors', async () => {
  await expect(
    gw.execute({
      query: /* GraphQL */ `
        query Authors {
          authors {
            __typename
            id
            name
            books {
              id
              title
              author {
                id
                name
              }
            }
          }
        }
      `,
    }),
  ).resolves.toEqual({
    data: {
      authors: expect.arrayContaining([
        expect.objectContaining({
          __typename: expect.stringContaining(''),
        }),
      ]),
    },
  });
});
