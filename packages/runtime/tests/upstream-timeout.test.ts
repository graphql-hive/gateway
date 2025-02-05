import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { MeshFetch } from '@graphql-mesh/types';
import { createDeferred } from '@graphql-tools/utils';
import { createDisposableServer } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';

describe('Upstream Timeout', () => {
  it('times out based on factory function', async () => {
    const greetingsDeferred = createDeferred<string>();
    const upstreamSchema = createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          hello: String
        }
      `,
      resolvers: {
        Query: {
          hello: () => greetingsDeferred.promise,
        },
      },
    });
    await using upstreamServer = createYoga({
      schema: upstreamSchema,
    });
    await using gateway = createGatewayRuntime({
      supergraph: getUnifiedGraphGracefully([
        {
          name: 'upstream',
          schema: upstreamSchema,
          url: 'http://localhost:4001/graphql',
        },
      ]),
      plugins() {
        return [useCustomFetch(upstreamServer.fetch as MeshFetch)];
      },
      upstreamTimeout({ subgraphName }) {
        if (subgraphName === 'upstream') {
          return 1000;
        }
        throw new Error('Unexpected subgraph');
      },
    });
    const res = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      }),
    });
    const resJson = await res.json();
    expect(resJson).toEqual({
      data: {
        hello: null,
      },
      errors: [
        expect.objectContaining({
          message: expect.stringMatching(
            /(The operation was aborted due to timeout|The operation timed out.)/,
          ),
          path: ['hello'],
        }),
      ],
    });
    greetingsDeferred.resolve('Hello, World!');
  });
  it('issue #303 - does not leak when it does not time out', async () => {
    const upstreamSchema = createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          hello: String
        }
      `,
      resolvers: {
        Query: {
          hello: () => 'Hello, World!',
        },
      },
    });
    await using upstreamYoga = createYoga({
      schema: upstreamSchema,
    });
    await using upstreamHttpServer = await createDisposableServer(upstreamYoga);
    await using gateway = createGatewayRuntime({
      supergraph: getUnifiedGraphGracefully([
        {
          name: 'upstream',
          schema: upstreamSchema,
          url: `${upstreamHttpServer.url}/graphql`,
        },
      ]),
      upstreamTimeout: 10_000,
    });
    const res = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      }),
    });
    const resJson = await res.json();
    expect(resJson).toEqual({
      data: {
        hello: 'Hello, World!',
      },
    });
  });
});
