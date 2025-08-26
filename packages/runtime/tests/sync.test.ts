import { buildSubgraphSchema } from '@apollo/subgraph';
import { HTTPTransport } from '@graphql-hive/gateway';
import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { composeLocalSchemasWithApollo } from '@internal/testing';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { expect, it } from 'vitest';

it.skipIf(globalThis.Bun)(
  'should be sync if there is no async operations',
  async () => {
    const upstreamSchema = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          hello: String!
        }
      `),
      resolvers: {
        Query: {
          hello() {
            return 'Hello world!';
          },
        },
      },
    });
    await using upstreamYoga = createYoga({
      schema: upstreamSchema,
    });
    const supergraph = await composeLocalSchemasWithApollo([
      {
        name: 'upstream',
        schema: upstreamSchema,
        url: 'http://localhost:4001/graphql',
      },
    ]);
    await using gw = createGatewayRuntime({
      supergraph,
      transports(kind) {
        if (kind !== 'http') {
          throw new Error(`Unsupported transport ${kind}`);
        }
        return HTTPTransport;
      },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error - MeshFetch is not compatible with Yoga.fetch
          upstreamYoga.fetch,
        ),
      ],
      __experimental__batchExecution: false,
    });
    const res = gw.fetch('http://localhost:4000/graphql', {
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
    assertSyncValue(res);
    const resJson = handleMaybePromise(
      () => res.json(),
      (json) => json,
    );
    expect(resJson).toEqual({
      data: {
        hello: 'Hello world!',
      },
    });
  },
);

function assertSyncValue<T>(value: T | Promise<T>): asserts value is T {
  if (value instanceof Promise) {
    throw new Error('Expected sync value, got promise');
  }
}
