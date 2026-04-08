import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it.each(['mesh', 'gateway', 'both'])(
  'resolves extra fields using @resolveTo defined in %s',
  async (loc) => {
    const { execute } = await gateway({
      supergraph: {
        with: 'mesh',
        services: [await service('foo'), await service('bar')],
        env: {
          ADDITIONAL_TYPE_DEFS_IN: loc,
        },
      },
      env: {
        ADDITIONAL_TYPE_DEFS_IN: loc,
      },
      runner: {
        docker: {
          volumes: [
            {
              host: 'additionalTypeDefs.ts',
              container: '/gateway/additionalTypeDefs.ts',
            },
          ],
        },
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
  },
);
