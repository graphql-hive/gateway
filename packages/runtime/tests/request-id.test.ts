import { Logger, MemoryLogWriter } from '@graphql-hive/logger';
import { createSchema, createYoga } from 'graphql-yoga';
import { expect, it } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';
import { useCustomFetch } from '../src/plugins/useCustomFetch';

it.each([
  { trustHeader: true, hostId: undefined, expected: 'client-id' },
  { trustHeader: false, hostId: undefined, expected: 'generated-id' },
  { trustHeader: true, hostId: 'host-id', expected: 'host-id' },
  { trustHeader: false, hostId: 'host-id', expected: 'host-id' },
])(
  'correlates and forwards request IDs: %j',
  async ({ trustHeader, hostId, expected }) => {
    const writer = new MemoryLogWriter();
    const upstreamIds: (string | null)[] = [];
    await using upstream = createYoga({
      logging: false,
      schema: createSchema({
        typeDefs: 'type Query { hello: String }',
        resolvers: { Query: { hello: () => 'world' } },
      }),
    });
    await using gateway = createGatewayRuntime({
      logging: new Logger({ writers: [writer] }),
      proxy: { endpoint: 'http://upstream/graphql' },
      requestId: { trustHeader, generateRequestId: () => 'generated-id' },
      plugins: () => [
        useCustomFetch((url, options) => {
          upstreamIds.push(new Headers(options?.headers).get('x-request-id'));
          return upstream.fetch(String(url), options as RequestInit);
        }),
      ],
    });

    const response = await gateway.fetch(
      'http://gateway/graphql',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'client-id',
        },
        body: JSON.stringify({ query: '{ hello }' }),
      },
      { req: { id: hostId } },
    );

    expect(await response.json()).toEqual({ data: { hello: 'world' } });
    expect(response.headers.get('x-request-id')).toBe(expected);
    expect(upstreamIds).toContain(expected);
    expect(
      writer.logs.filter(({ msg }) => msg === 'Request processed'),
    ).toEqual([
      expect.objectContaining({
        attrs: expect.objectContaining({ requestId: expected }),
      }),
    ]);
  },
);
