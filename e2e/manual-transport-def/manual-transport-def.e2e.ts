import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should execute the query', async () => {
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('greetings'), await service('helloer')],
    },
  });
  await expect(
    execute({
      query: /* GraphQL */ `
        query {
          greet(name: "world") {
            greeting
          }
          hello
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "greet": {
          "greeting": "Hello, world!",
        },
        "hello": "world",
      },
    }
  `);
});
