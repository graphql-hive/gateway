import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { getSupportedEncodings, useContentEncoding } from '@whatwg-node/server';
import { createClient as createSSEClient } from 'graphql-sse';
import {
  createSchema,
  createYoga,
  Repeater,
  type FetchAPI,
  type YogaInitialContext,
} from 'graphql-yoga';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGatewayRuntime,
  OnFetchHookDonePayload,
  useCustomFetch,
} from '../src/index';

describe('contentEncoding', () => {
  const fooResolver = vi.fn((_, __, _context: YogaInitialContext) => {
    return 'bar';
  });
  function decompressResponse(response: Response, fetchAPI: FetchAPI) {
    const encodingFormat = response.headers.get('content-encoding');
    const supportedFormats: CompressionFormat[] = ['gzip', 'deflate'];
    if (!supportedFormats.includes(encodingFormat as CompressionFormat)) {
      return response;
    }
    if (!response.body) {
      return response;
    }
    if (!fetchAPI.DecompressionStream) {
      return response;
    }
    const decompressionStream = new fetchAPI.DecompressionStream(
      encodingFormat as CompressionFormat,
    );
    return new fetchAPI.Response(
      response.body.pipeThrough(decompressionStream),
      response,
    );
  }
  // Mimic the behavior of the `fetch` API in the browser
  const onFetchDoneSpy = vi.fn((payload: OnFetchHookDonePayload) => {
    payload.setResponse(
      decompressResponse(payload.response, subgraphServer.fetchAPI),
    );
  });
  const subgraphSchema = createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        foo: String
      }
    `,
    resolvers: {
      Query: {
        foo: fooResolver,
      },
    },
  });
  const subgraphServer = createYoga({
    schema: subgraphSchema,
    plugins: [useContentEncoding()],
  });
  const gateway = createGatewayRuntime({
    supergraph() {
      return getUnifiedGraphGracefully([
        {
          name: 'subgraph',
          schema: subgraphSchema,
          url: 'http://localhost:4001/graphql',
        },
      ]);
    },
    contentEncoding: {
      subgraphs: ['subgraph'],
    },
    plugins: () => [
      useCustomFetch(
        // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
        subgraphServer.fetch,
      ),
      {
        onFetch() {
          return onFetchDoneSpy;
        },
      },
    ],
  });
  afterEach(() => {
    fooResolver.mockClear();
    onFetchDoneSpy.mockClear();
  });
  const firstSupportedEncoding = getSupportedEncodings(gateway.fetchAPI)[0];
  const skipIfNoEncodingSupport = firstSupportedEncoding ? it : it.skip;
  skipIfNoEncodingSupport('from gateway to subgraph', async () => {
    const response = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: `query { foo }`,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const resJson = await response.json();
    expect(resJson).toEqual({
      data: {
        foo: 'bar',
      },
    });
    expect(
      fooResolver.mock.calls[0]?.[2].request.headers.get('content-encoding'),
    ).toBe('gzip');
  });
  skipIfNoEncodingSupport('from subgraph to gateway', async () => {
    const response = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: `query { foo }`,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const resJson = await response.json();
    expect(resJson).toEqual({
      data: {
        foo: 'bar',
      },
    });
    expect(
      fooResolver.mock.calls[0]?.[2].request.headers.get('accept-encoding'),
    ).toContain(firstSupportedEncoding);
    expect(
      onFetchDoneSpy.mock.calls[0]?.[0].response.headers.get(
        'content-encoding',
      ),
    ).toBe('gzip');
  });
  skipIfNoEncodingSupport('from the client to the gateway', async () => {
    const origBody = JSON.stringify({
      query: `query { foo }`,
    });
    const fakeRequest = new gateway.fetchAPI.Request(
      'http://localhost:4000/graphql',
      {
        method: 'POST',
        body: origBody,
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip',
        },
      },
    );
    const compressionStream = new gateway.fetchAPI.CompressionStream('gzip');
    const response = await subgraphServer.fetch(
      'http://localhost:4000/graphql',
      {
        method: 'POST',
        body: fakeRequest.body?.pipeThrough(compressionStream),
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
        },
      },
    );
    const resJson = await response.json();
    expect(resJson).toEqual({
      data: {
        foo: 'bar',
      },
    });
  });
  skipIfNoEncodingSupport('from the gateway to the client', async () => {
    const response = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: `query { foo }`,
      }),
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
      },
    });
    expect(response.headers.get('content-encoding')).toBe('gzip');
    const decompressedRes = decompressResponse(
      response,
      subgraphServer.fetchAPI,
    );
    const resJson = await decompressedRes.json();
    expect(resJson).toEqual({
      data: {
        foo: 'bar',
      },
    });
  });
});

describe('contentEncoding with SSE subscriptions', () => {
  const subgraphSchema = createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        hello: String
      }

      type Subscription {
        countdown(from: Int!): Int
      }
    `,
    resolvers: {
      Query: {
        hello: () => 'world',
      },
      Subscription: {
        countdown: {
          subscribe: (_, { from }: { from: number }) =>
            new Repeater(async (push, stop) => {
              for (let i = from; i >= 0; i--) {
                push(i);
                await new Promise((resolve) => setTimeout(resolve, 50));
              }
              stop();
            }),
          resolve: (value: number) => value,
        },
      },
    },
  });
  const subgraphServer = createYoga({
    schema: subgraphSchema,
  });
  const gateway = createGatewayRuntime({
    supergraph() {
      return getUnifiedGraphGracefully([
        {
          name: 'subgraph',
          schema: subgraphSchema,
          url: 'http://localhost:4001/graphql',
        },
      ]);
    },
    contentEncoding: true,
    plugins: () => [
      useCustomFetch(
        // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
        subgraphServer.fetch,
      ),
    ],
  });
  const firstSupportedEncoding = getSupportedEncodings(gateway.fetchAPI)[0];
  const skipIfNoEncodingSupport = firstSupportedEncoding ? it : it.skip;
  skipIfNoEncodingSupport(
    'should deliver SSE subscription events to the client',
    async () => {
      const client = createSSEClient({
        url: 'http://localhost:4000/graphql',
        fetchFn: gateway.fetch,
        headers: {
          'Accept-Encoding': 'gzip',
        },
      });

      const sub = client.iterate({
        query: /* GraphQL */ `
          subscription {
            countdown(from: 3)
          }
        `,
      });

      const msgs: unknown[] = [];
      const result = await Promise.race([
        (async () => {
          for await (const msg of sub) {
            msgs.push(msg);
            if (msgs.length >= 4) {
              break;
            }
          }
          return 'ok' as const;
        })(),
        new Promise<'timeout'>((resolve) =>
          setTimeout(() => resolve('timeout'), 5_000),
        ),
      ]);

      // If this fails, gzip compression is buffering small SSE events
      // and never flushing them to the client.
      expect(result).toBe('ok');
      expect(msgs).toEqual([
        { data: { countdown: 3 } },
        { data: { countdown: 2 } },
        { data: { countdown: 1 } },
        { data: { countdown: 0 } },
      ]);
    },
    10_000,
  );
});
