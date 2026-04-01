import { createTenv } from '@internal/e2e';
import { usingHiveRouterRuntime } from '@internal/testing';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);

it.skipIf(usingHiveRouterRuntime())('should execute', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
    },
  });
  await expect(execute({ query: '{ hello }' })).resolves.toMatchInlineSnapshot(
    `
    {
      "data": {
        "hello": "world",
      },
    }
  `,
  );
});
