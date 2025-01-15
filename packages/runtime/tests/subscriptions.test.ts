import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { type MaybePromise } from '@graphql-tools/utils';
import { isDebug } from '@internal/testing';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { createClient as createSSEClient } from 'graphql-sse';
import { createSchema, createYoga, Repeater } from 'graphql-yoga';
import { afterAll, describe, expect, it } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';
import { useCustomFetch } from '../src/plugins/useCustomFetch';

describe('Subscriptions', () => {
  const leftovers: (() => MaybePromise<void>)[] = [];
  afterAll(() => Promise.all(leftovers.map((l) => l())));
  const upstreamSchema = createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        foo: String
      }

      type Subscription {
        neverEmits: String
      }
    `,
    resolvers: {
      Query: {
        foo: () => 'bar',
      },
      Subscription: {
        neverEmits: {
          subscribe: () =>
            new Repeater((_push, stop) => {
              leftovers.push(stop);
            }),
        },
      },
    },
  });
  const upstream = createYoga({ schema: upstreamSchema });

  it('should terminate subscriptions gracefully on shutdown', async () => {
    await using serve = createGatewayRuntime({
      logging: false,
      supergraph() {
        return getUnifiedGraphGracefully([
          {
            name: 'upstream',
            schema: upstreamSchema,
            url: 'http://upstream/graphql',
          },
        ]);
      },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
          upstream.fetch,
        ),
      ],
    });

    const sse = createSSEClient({
      url: 'http://mesh/graphql',
      fetchFn: serve.fetch,
      on: {
        connected() {
          setImmediate(() => {
            serve[DisposableSymbols.asyncDispose]();
          });
        },
      },
    });

    const sub = sse.iterate({
      query: /* GraphQL */ `
        subscription {
          neverEmits
        }
      `,
    });

    const msgs: unknown[] = [];
    for await (const msg of sub) {
      msgs.push(msg);
    }

    expect(msgs[msgs.length - 1]).toMatchObject({
      errors: [
        {
          extensions: {
            code: 'SHUTTING_DOWN',
          },
          message:
            'operation has been aborted because the server is shutting down',
        },
      ],
    });
  });

  it('should terminate subscriptions gracefully on schema update', async () => {
    let changeSchema = false;

    await using serve = createGatewayRuntime({
      logging: isDebug(),
      pollingInterval: 500,
      async supergraph() {
        if (changeSchema) {
          return /* GraphQL */ `
            type Query {
              foo: String!
            }
          `;
        }
        changeSchema = true;
        return getUnifiedGraphGracefully([
          {
            name: 'upstream',
            schema: upstreamSchema,
            url: 'http://upstream/graphql',
          },
        ]);
      },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
          upstream.fetch,
        ),
      ],
    });

    const sse = createSSEClient({
      url: 'http://mesh/graphql',
      fetchFn: serve.fetch,
    });

    const sub = sse.iterate({
      query: /* GraphQL */ `
        subscription {
          neverEmits
        }
      `,
    });

    const msgs: unknown[] = [];
    globalThis.setTimeout(async () => {
      const res = await serve.fetch('http://mesh/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: /* GraphQL */ `
            query {
              __typename
            }
          `,
        }),
      });
      expect(await res.json()).toMatchObject({
        data: {
          __typename: 'Query',
        },
      });
    }, 1000);
    for await (const msg of sub) {
      msgs.push(msg);
    }

    expect(msgs[msgs.length - 1]).toMatchObject({
      errors: [
        {
          extensions: {
            code: 'SCHEMA_RELOAD',
          },
          message: 'operation has been aborted due to a schema reload',
        },
      ],
    });
  });
});
