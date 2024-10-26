import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);

it('should execute', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [],
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
