import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import {
  composeLocalSchemasWithApollo,
  createDisposableServer,
} from '@internal/testing';
import { Response } from '@whatwg-node/fetch';
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
    expect(result).toEqual(
      expect.objectContaining({
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
      }),
    );
  });
  it('does not leak the error to the client when the subgraph returns an unexpected result', async () => {
    const upstreamServiceName = Math.random().toString(36).substring(7);
    const upstreamSchema = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          hello: String!
        }
      `),
    });
    const supergraph = await composeLocalSchemasWithApollo([
      {
        name: upstreamServiceName,
        schema: upstreamSchema,
        url: `http://localhost:9876/graphql`,
      },
    ]);
    await using gw = createGatewayRuntime({
      supergraph,
      maskedErrors: true,
      plugins: () => [
        useCustomFetch((url) => {
          if (url === `http://localhost:9876/graphql`) {
            return new Response('My non-JSON response', {
              headers: {
                'Content-Type': 'text/plain',
              },
            });
          }
          return Response.error();
        }),
      ],
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
    expect(result).toEqual(
      expect.objectContaining({
        errors: [
          {
            message: 'Unexpected error.',
            extensions: {
              code: 'INTERNAL_SERVER_ERROR',
            },
            path: ['hello'],
          },
        ],
      }),
    );
  });
});
