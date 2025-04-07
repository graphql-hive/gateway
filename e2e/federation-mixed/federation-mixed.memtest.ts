import { createExampleSetup, createTenv } from '@internal/e2e';
import { memtest } from '@internal/perf/memtest';

const cwd = __dirname;

const { service, gateway } = createTenv(cwd);
const exampleSetup = createExampleSetup(cwd);

memtest(
  {
    cwd,
    query: exampleSetup.query,
  },
  async () => {
    const inventoryService = await exampleSetup.service('inventory');
    return gateway({
      supergraph: {
        with: 'mesh',
        services: [
          await service('accounts'),
          inventoryService,
          await exampleSetup.service('products'),
          await exampleSetup.service('reviews'),
        ],
      },
      env: {
        INVENTORY_ENDPOINT: `http://localhost:${inventoryService.port}/graphql`,
      },
    });
  },
);
