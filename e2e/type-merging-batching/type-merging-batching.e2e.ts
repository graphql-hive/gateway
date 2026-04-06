import { createTenv, Gateway } from '@internal/e2e';
import { usingHiveRouterRuntime } from '@internal/testing';
import { beforeAll, expect, it } from 'vitest';

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

// uses @resolveTo in additionalTypeDefs at compose level for cross-source
// batched type merging which is not supported by the Rust QP
it.skipIf(usingHiveRouterRuntime()).each([
  {
    name: 'Author',
    query: /* GraphQL */ `
      query Author {
        author(id: 1) {
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
  },
  {
    name: 'Authors',
    query: /* GraphQL */ `
      query Authors {
        authors {
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
  },
  {
    name: 'Book',
    query: /* GraphQL */ `
      query Book {
        book(id: 1) {
          id
          title
          author {
            id
            name
            books {
              id
              title
            }
          }
        }
      }
    `,
  },
  {
    name: 'Books',
    query: /* GraphQL */ `
      query Books {
        books {
          id
          title
          author {
            id
            name
            books {
              id
              title
            }
          }
        }
      }
    `,
  },
])('should execute $name', async ({ query }) => {
  await expect(gw.execute({ query })).resolves.toMatchSnapshot();
});
