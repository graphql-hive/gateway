import { createTenv } from '@internal/e2e';
import { usingHiveRouterRuntime } from '@internal/testing';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

// uses @resolveTo in additionalTypeDefs at compose level for cross-source
// type merging which is not supported by the Rust QP
it.skipIf(usingHiveRouterRuntime())('resolves extra fields', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('foo'), await service('bar')],
    },
  });
  await expect(
    execute({
      query: /* GraphQL */ `
        query FooBarFoo {
          foo {
            id
            bar {
              id
              foo {
                id
              }
            }
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "foo": {
          "bar": {
            "foo": {
              "id": "1",
            },
            "id": "1",
          },
          "id": "1",
        },
      },
    }
  `);
});
