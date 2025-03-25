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
    expectedHeavyFrame: (frame) =>
      // allocates a lot but all is freed confirmed through heap snapshot
      frame.name === 'set' &&
      frame.callstack.some((frame) => frame.name === 'createBatchingExecutor'),
  },
  async () =>
    await gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('Test')],
      },
    }),
);
