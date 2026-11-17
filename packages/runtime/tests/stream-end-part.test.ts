import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { describe, expect, it } from 'vitest';

/**
 * What a graphql-yoga subgraph with `useDeferStream` sends for
 * `items @stream(initialCount: 0)` when the items come from an async
 * generator: each item in its own part, and the end of the stream as a part
 * of its own, because the resolver only learns the list is over after the
 * last item.
 */
const parts = [
  { data: { items: [] }, hasNext: true },
  {
    incremental: [{ items: [{ id: 'a' }], path: ['items', 0] }],
    hasNext: true,
  },
  {
    incremental: [{ items: [{ id: 'b' }], path: ['items', 1] }],
    hasNext: true,
  },
  { hasNext: false },
];

function multipartResponse() {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const part of parts) {
        const json = JSON.stringify(part);
        controller.enqueue(
          encoder.encode(
            `\r\n---\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${encoder.encode(json).byteLength}\r\n\r\n${json}`,
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      controller.enqueue(encoder.encode('\r\n-----\r\n'));
      controller.close();
    },
  });
  return new Response(body, {
    headers: { 'content-type': 'multipart/mixed; boundary="-"' },
  });
}

describe('@stream forwarded to a subgraph', () => {
  it('ends the list when the subgraph closes the stream with a part of its own', async () => {
    await using gw = createGatewayTester({
      deferStream: true,
      subgraphs: [
        {
          name: 'upstream',
          schema: {
            typeDefs: /* GraphQL */ `
              type Query {
                items: [Item!]
              }
              type Item {
                id: ID!
              }
            `,
          },
          // The subgraph answers with the parts above, whatever it is asked.
          yoga: () =>
            ({
              graphqlEndpoint: '/graphql',
              fetch: multipartResponse,
            }) as any,
        },
      ],
    });

    const res = await gw.fetch('http://gateway/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'multipart/mixed',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            items @stream(initialCount: 0) {
              id
            }
          }
        `,
      }),
    });
    const body = await res.text();

    const received = body
      .split(/\r\n---/)
      .map((part) => part.slice(part.indexOf('\r\n\r\n') + 4).trim())
      .filter((json) => json.startsWith('{'))
      .map((json) => JSON.parse(json));
    const incremental = received.flatMap((part) => part.incremental ?? []);

    expect(incremental.flatMap((item) => item.errors ?? [])).toEqual([]);
    expect(incremental.flatMap((item) => item.items ?? [])).toEqual([
      { id: 'a' },
      { id: 'b' },
    ]);
    expect(received.at(-1)?.hasNext).toBe(false);
  });
});
