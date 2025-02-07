import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { createDeferred } from '@graphql-tools/utils';
import { createDisposableServer } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';

describe('Upstream Timeout', () => {
  it('times out based on factory function', async () => {
    const greetingsDeferred = createDeferred<string>();
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
                hello: () => greetingsDeferred.promise,
              },
            },
          },
        },
      ],
      upstreamTimeout({ subgraphName }) {
        if (subgraphName === 'upstream') {
          return 1000;
        }
        throw new Error('Unexpected subgraph');
      },
    });
    await expect(
      gateway.execute({
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            message: expect.stringMatching(
              /(The operation was aborted due to timeout|The operation timed out.)/,
            ),
            path: ['hello'],
          }),
        ],
      }),
    );
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
    await using gateway = createGatewayTester({
      supergraph: getUnifiedGraphGracefully([
        {
          name: 'upstream',
          schema: upstreamSchema,
          url: `${upstreamHttpServer.url}/graphql`,
        },
      ]),
      upstreamTimeout: 10_000,
    });
    await expect(
      gateway.execute({
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      }),
    ).resolves.toEqual({
      data: {
        hello: 'Hello, World!',
      },
    });
  });
});
