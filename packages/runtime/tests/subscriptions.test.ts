import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { type MaybePromise } from '@graphql-tools/utils';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { createClient as createSSEClient } from 'graphql-sse';
import { createSchema, Repeater } from 'graphql-yoga';
import { afterAll, describe, expect, it } from 'vitest';

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

  it('should terminate subscriptions gracefully on shutdown', async () => {
    await using serve = createGatewayTester({
      subgraphs: [
        {
          name: 'upstream',
          schema: upstreamSchema,
        },
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

    await using serve = createGatewayTester({
      pollingInterval: 500,
      subgraphs: () => {
        if (changeSchema) {
          return [
            {
              name: 'upstream',
              schema: {
                typeDefs: /* GraphQL */ `
                  type Query {
                    foo: String!
                  }
                `,
              },
            },
          ];
        }
        changeSchema = true;
        return [
          {
            name: 'upstream',
            schema: upstreamSchema,
          },
        ];
      },
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
      await expect(
        serve.execute({
          query: /* GraphQL */ `
            query {
              __typename
            }
          `,
        }),
      ).resolves.toMatchObject({
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
