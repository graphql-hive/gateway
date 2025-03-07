import { buildSubgraphSchema } from '@apollo/subgraph';
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import {
  composeLocalSchemasWithApollo,
  createDisposableServer,
} from '@internal/testing';
import { parse } from 'graphql';
import { createGraphQLError, createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';

describe('Subgraph Errors', () => {
  it('shows the error with the subgraph name', async () => {
    const upstreamServiceName = Math.random().toString(36).substring(7);
    const randomErrorMessage = Math.random().toString(36).substring(7);
    const upstreamSchema = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          hello: String!
        }
      `),
      resolvers: {
        Query: {
          hello() {
            return createGraphQLError(randomErrorMessage);
          },
        },
      },
    });
    await using upstreamYoga = createYoga({
      schema: upstreamSchema,
    });
    await using upstreamServer = await createDisposableServer(upstreamYoga);
    const supergraph = await composeLocalSchemasWithApollo([
      {
        name: upstreamServiceName,
        schema: upstreamSchema,
        url: `${upstreamServer.url}/graphql`,
      },
    ]);
    await using gw = createGatewayRuntime({
      supergraph,
    });
    const query = /* GraphQL */ `
      query hello {
        hello
      }
    `;
    const response = await gw.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const result = await response.json();
    expect(result).toEqual({
      data: null,
      errors: [
        {
          message: randomErrorMessage,
          extensions: {
            code: 'DOWNSTREAM_SERVICE_ERROR',
            serviceName: upstreamServiceName,
          },
          path: ['hello'],
        },
      ],
    });
  });
});
