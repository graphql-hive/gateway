import { createExampleSetup, createTenv } from '@internal/e2e';
import { getLocalhost } from '@internal/testing';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);
const exampleSetup = createExampleSetup(__dirname);

it('should execute', async () => {
  const inventoryService = await exampleSetup.service('inventory');
  const inventoryHost = await getLocalhost(
    inventoryService.port,
    inventoryService.protocol,
  );
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [
        await service('accounts'),
        inventoryService,
        await exampleSetup.service('products'),
        await exampleSetup.service('reviews'),
      ],
      env: {
        INVENTORY_ENDPOINT: `${inventoryHost}:${inventoryService.port}/graphql`,
      },
    },
    env: {
      INVENTORY_ENDPOINT: `${inventoryHost}:${inventoryService.port}/graphql`,
    },
  });
  await expect(
    execute({
      query: exampleSetup.query,
    }),
  ).resolves.toEqual(exampleSetup.result);
});
