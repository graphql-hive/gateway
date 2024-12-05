import { createTenv } from '@internal/e2e';
import { getLocalhost } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { createClient, ExecutionResult } from 'graphql-sse';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('handles subscriptions with transforms', async () => {
  const { port } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('my-subgraph')],
    },
  });
  const hostname = await getLocalhost(port);
  const client = createClient({
    url: `${hostname}:${port}/graphql`,
    fetchFn: fetch,
    retryAttempts: 0,
  });
  const res = await client.iterate({
    query: /* GraphQL */ `
      subscription {
        test_countdown(from: 3)
      }
    `,
  });
  const results: ExecutionResult<Record<string, unknown>, unknown>[] = [];
  for await (const result of res) {
    results.push(result);
  }
  expect(results).toMatchInlineSnapshot(`
    [
      {
        "data": {
          "test_countdown": 3,
        },
      },
      {
        "data": {
          "test_countdown": 2,
        },
      },
      {
        "data": {
          "test_countdown": 1,
        },
      },
      {
        "data": {
          "test_countdown": 0,
        },
      },
    ]
  `);
});
