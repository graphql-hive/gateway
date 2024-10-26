import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, compose, service } = createTenv(__dirname);

it('resolves extra fields', async () => {
  const { output } = await compose({
    services: [await service('foo'), await service('bar')],
    output: 'graphql',
  });
  const { execute } = await gateway({ supergraph: output });
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
  ).resolves.toMatchSnapshot();
});
