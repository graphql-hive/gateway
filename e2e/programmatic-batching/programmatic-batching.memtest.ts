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
    expectedHeavyFrame: (frame) =>
      [
        // heap snapshots were analyised and concluded that the memory is stable considering the given heavy frames
        'onwrite',
        'leave',
      ].includes(frame.name),
  },
  async () =>
    gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('api')],
      },
    }),
);
