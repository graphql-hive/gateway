import { createTenv } from '@internal/e2e';
import { memtest } from '@internal/perf/memtest';

const cwd = __dirname;

const { gateway, service } = createTenv(cwd);

memtest(
  {
    cwd,
    query: /* GraphQL */ `
      query {
        node(id: "1") {
          id
          ... on User {
            name
          }
          self {
            id
            ... on User {
              name
            }
          }
        }
      }
    `,
  },
  async () =>
    await gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('Test')],
      },
    }),
);
