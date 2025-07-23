import {
  createExampleSetup,
  createTenv,
  replaceLocalhostWithDockerHost,
} from '@internal/e2e';
import { getLocalhost } from '@internal/testing';
import { expect, it } from 'vitest';

const { gateway, gatewayRunner } = createTenv(__dirname);
const { service } = createExampleSetup(__dirname);

it('should execute', async () => {
  const inventoryService = await service('inventory');
  const inventoryHost = await getLocalhost(
    inventoryService.port,
    inventoryService.protocol,
  );

  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [inventoryService, await service('products')],
      env: {
        // pass for composition
        INVENTORY_ENDPOINT: `${inventoryHost}:${inventoryService.port}/graphql`,
      },
    },
    env: {
      // pass for gateway
      INVENTORY_ENDPOINT: `${gatewayRunner.includes('docker') ? replaceLocalhostWithDockerHost(inventoryHost) : inventoryHost}:${inventoryService.port}/graphql`,
    },
  });
  await expect(
    execute({
      query: /* GraphQL */ `
        {
          topProducts(first: 1) {
            name
            inStock
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "topProducts": [
          {
            "inStock": true,
            "name": "Table",
          },
        ],
      },
    }
  `);
});
