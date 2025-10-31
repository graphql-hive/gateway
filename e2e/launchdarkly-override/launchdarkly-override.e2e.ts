// Dummy E2E Test file to generate the example

import { createTenv } from '@internal/e2e';
import { describe, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

describe('LaunchDarkly Override E2E Test', () => {
  it('runs', async () => {
    await gateway({
      runner: {
        docker: {
          volumes: [
            {
              host: `${__dirname}/node_modules`,
              container: `/gateway/node_modules`,
            },
          ],
        },
      },
      supergraph: {
        with: 'apollo',
        services: [
          await service('inventory'),
          await service('products'),
          await service('reviews'),
        ],
      },
    });
  });
});
