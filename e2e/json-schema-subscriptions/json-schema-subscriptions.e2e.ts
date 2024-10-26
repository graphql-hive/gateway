import { createTenv, getAvailablePort } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { createClient } from 'graphql-sse';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should query, mutate and subscribe', async () => {
  const gatewayPort = await getAvailablePort();
  const api = await service('api', { gatewayPort });
  const { execute } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [api],
    },
    port: gatewayPort,
  });

  await expect(
    execute({
      query: /* GraphQL */ `
        query Todos {
          todos {
            name
            content
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
{
  "data": {
    "todos": [],
  },
}
`);

  const sse = createClient({
    url: `http://0.0.0.0:${gatewayPort}/graphql`,
    retryAttempts: 0,
    fetchFn: fetch,
  });

  const sub = sse.iterate({
    query: /* GraphQL */ `
      subscription TodoAdded {
        todoAdded {
          name
          content
        }
      }
    `,
  });

  await expect(
    execute({
      query: /* GraphQL */ `
        mutation AddTodo {
          addTodo(input: { name: "Shopping", content: "Buy Milk" }) {
            name
            content
          }
        }
      `,
    }),
  ).resolves.toMatchInlineSnapshot(`
{
  "data": {
    "addTodo": {
      "content": "Buy Milk",
      "name": "Shopping",
    },
  },
}
`);

  for await (const msg of sub) {
    expect(msg).toMatchInlineSnapshot(`
{
  "data": {
    "todoAdded": {
      "content": "Buy Milk",
      "name": "Shopping",
    },
  },
}
`);
    break;
  }
});
