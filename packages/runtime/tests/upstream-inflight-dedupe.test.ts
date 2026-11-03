import { setTimeout } from 'node:timers/promises';
import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { expect, it } from 'vitest';

it('deduplicates inflight requests', async () => {
  let requestCount = 0;
  await using gateway = createGatewayTester({
    subgraphs: [
      {
        name: 'upstream',
        schema: {
          typeDefs: /* GraphQL */ `
            type Query {
              hello: String
            }
          `,
          resolvers: {
            Query: {
              async hello() {
                requestCount++;
                // resolve after a short delay to simulate network latency
                await setTimeout(50);
                return 'world';
              },
            },
          },
        },
      },
    ],
  });

  // use gateway.fetch directly because gateway.execute uses an http executor
  // that would dedupe the client requests before they even reach the gateway
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      gateway
        .fetch('http://gateway/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            query: /* GraphQL */ `
              query {
                hello
              }
            `,
          }),
        })
        .then((res) => res.json()),
    ),
  );
  for (const res of results) {
    expect(res).toEqual({
      data: { hello: 'world' },
    });
  }
  expect(requestCount).toBe(1);
});
