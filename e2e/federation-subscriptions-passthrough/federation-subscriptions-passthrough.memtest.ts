import { createTenv } from '@internal/e2e';
import { memtest } from '@internal/perf/memtest';
import { getAvailablePort } from '@internal/testing';
import { describe } from 'vitest';

const cwd = __dirname;

const { service, gateway } = createTenv(cwd);

describe('upstream subscriptions via websockets', () => {
  memtest(
    {
      cwd,
      query: /* GraphQL */ `
        subscription {
          newProduct {
            id
            name
            price
            reviews {
              score
            }
          }
        }
      `,
    },
    async () =>
      gateway({
        supergraph: {
          with: 'apollo',
          services: [
            await service('products', { env: { MEMTEST: 1 } }),
            await service('reviews'),
          ],
        },
      }),
  );
});

describe('upstream subscriptions via http callbacks', () => {
  memtest(
    {
      cwd,
      query: /* GraphQL */ `
        subscription {
          newReview {
            score
          }
        }
      `,
      expectedHeavyFrame: (frame) =>
        // these frames are not leaks and have been confirmed to be stable analysing the heap snapshots (they do allocate a lot, but they all of their memory gets freed)
        [
          'delete',
          'get pathname',
          'onRequest',
          'Repeater.next',
          'Set',
          'debug',
          'Map',
          'createBatchingExecutor',
          '_storeHeader',
          'eos',
        ].includes(frame.name),
      allowFailingRequests: true,
    },
    async () => {
      const availablePort = await getAvailablePort();
      const publicUrl = `http://0.0.0.0:${availablePort}`;
      return gateway({
        supergraph: {
          with: 'apollo',
          services: [
            await service('products', { env: { MEMTEST: 1 } }),
            await service('reviews'),
          ],
        },
        port: availablePort,
        env: {
          PUBLIC_URL: publicUrl,
        },
      });
    },
  );
});
