import { createTenv } from '@internal/e2e';
import { getLocalhost } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { ExecutionResult } from 'graphql';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('reproduction-136', async () => {
  const { port } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('my-subgraph')],
    },
  });
  const hostname = await getLocalhost(port);
  const res = await fetch(`${hostname}:${port}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        subscription {
          test_countdown(from: 3)
        }
      `,
    }),
  });
  const results: string[] = [];
  for await (const result of res.body) {
    results.push(Buffer.from(result).toString('utf-8').trim());
  }
  expect(results).toMatchInlineSnapshot(`
    [
      ":",
      ":",
      ":",
      ":",
      "event: next
    data: {"data":{"test_countdown":3}}",
      ":",
      ":",
      ":",
      "event: next
    data: {"data":{"test_countdown":2}}",
      ":",
      ":",
      ":",
      "event: next
    data: {"data":{"test_countdown":1}}",
      ":",
      ":",
      ":",
      ":",
      "event: next
    data: {"data":{"test_countdown":0}}",
      "event: complete
    data:",
    ]
  `);
});
