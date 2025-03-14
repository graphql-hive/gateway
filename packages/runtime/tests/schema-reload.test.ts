import { buildSubgraphSchema } from '@apollo/subgraph';
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import {
  composeLocalSchemasWithApollo,
  createDisposableServer,
} from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { afterAll, describe, expect, it } from 'vitest';

describe('Schema reload', () => {
  let interval: ReturnType<typeof setInterval> | undefined;
  afterAll(() => {
    if (interval) {
      clearInterval(interval);
    }
  });
  it('retries automatically when the schema reloads', async () => {
    const firstUpstreamSchema = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          foo: String
        }
      `),
      resolvers: {
        Query: {
          foo: () => new Promise(() => {}),
        },
      },
    });
    await using firstUpstreamYoga = createYoga({ schema: firstUpstreamSchema });
    await using firstUpstreamServer =
      await createDisposableServer(firstUpstreamYoga);
    const secondUpstreamSchema = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          foo: String
        }
      `),
      resolvers: {
        Query: {
          foo: () => 'barFromSecond',
        },
      },
    });
    await using secondUpstreamYoga = createYoga({
      schema: secondUpstreamSchema,
    });
    await using secondUpstreamServer =
      await createDisposableServer(secondUpstreamYoga);
    let fetchCount = 0;
    await using gw = createGatewayRuntime({
      supergraph() {
        fetchCount++;
        if (fetchCount === 1) {
          return composeLocalSchemasWithApollo([
            {
              name: 'upstream',
              schema: firstUpstreamSchema,
              url: `${firstUpstreamServer.url}/graphql`,
            },
          ]);
        } else if (fetchCount === 2) {
          return composeLocalSchemasWithApollo([
            {
              name: 'upstream',
              schema: secondUpstreamSchema,
              url: `${secondUpstreamServer.url}/graphql`,
            },
          ]);
        }
        throw new Error('Unexpected fetch count');
      },
      pollingInterval: 300,
    });
    interval = setInterval(() => {
      gw.fetch('http://mesh/graphql', {
        method: 'POST',
        body: JSON.stringify({
          query: /* GraphQL */ `
            query {
              __typename
            }
          `,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }, 100);
    const response = await gw.fetch('http://mesh/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            foo
          }
        `,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const result = await response.json();
    expect(result).toEqual({
      data: {
        foo: 'barFromSecond',
      },
    });
  });
});
