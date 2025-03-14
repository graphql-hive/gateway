import { createTenv } from '@internal/e2e';
import { memtest } from '@internal/perf/memtest';

const cwd = __dirname;

const { service, gateway } = createTenv(cwd);

memtest(
  {
    cwd,
    query: /* GraphQL */ `
      fragment UserF on User {
        id
        name
      }
      query User {
        john: user(id: 1) {
          ...UserF
        }
        jane: user(id: 2) {
          ...UserF
        }
      }
    `,
  },
  async () =>
    gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('api')],
      },
    }),
);
