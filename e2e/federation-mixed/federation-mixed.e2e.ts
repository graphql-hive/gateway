import { createExampleSetup, createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);
const exampleSetup = createExampleSetup(__dirname);

it('should execute', async () => {
  await using inventoryService = await exampleSetup.service('inventory');
  await using gw = await gateway({
    supergraph: {
      with: 'mesh',
      services: [
        await service('accounts'),
        inventoryService,
        await exampleSetup.service('products'),
        await exampleSetup.service('reviews'),
      ],
      env: {
        INVENTORY_ENDPOINT: `http://localhost:${inventoryService.port}/graphql`,
      },
    },
  });
  await expect(
    gw.execute({
      query: exampleSetup.query,
    }),
  ).resolves.toEqual(exampleSetup.result);
});
