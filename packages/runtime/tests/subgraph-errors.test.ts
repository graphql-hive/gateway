import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import {
  createRawExecutionResult,
  getRawResponseBytes,
} from '@graphql-tools/executor-common';
import {
  composeLocalSchemasWithApollo,
  createDisposableServer,
} from '@internal/testing';
import { Response } from '@whatwg-node/fetch';
import { GraphQLError, parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';
import { useSubgraphErrorPlugin } from '../src/plugins/useSubgraphErrorPlugin';

describe('Subgraph Errors', () => {
  it('extends the errors of a result still in its raw bytes once they are parsed', () => {
    let parsed = 0;
    const result = createRawExecutionResult(
      new TextEncoder().encode('{"data":null,"errors":[{"message":"boom"}]}'),
      (bytes) => {
        parsed++;
        const { errors } = JSON.parse(new TextDecoder().decode(bytes));
        return {
          data: null,
          errors: errors.map(
            ({ message }: { message: string }) => new GraphQLError(message),
          ),
        };
      },
    );
    const onDone = useSubgraphErrorPlugin().onSubgraphExecute!({
      subgraphName: 'upstream',
    } as any) as (payload: any) => void;
    onDone({ result });
    // the plugin didn't need the errors yet, so nothing was parsed
    expect(parsed).toBe(0);
    expect(getRawResponseBytes(result)).toBeDefined();
    expect(result.errors![0]!.extensions).toEqual({
      code: 'DOWNSTREAM_SERVICE_ERROR',
      serviceName: 'upstream',
    });
  });

  it('shows the error with the subgraph name', async () => {
    const upstreamServiceName = Math.random().toString(36).substring(7);
    const randomErrorMessage = Math.random().toString(36).substring(7);
    const upstreamSchema = buildSubgraphSchema([
      {
        typeDefs: parse(/* GraphQL */ `
          type Query {
            hello: String!
          }
        `),
        resolvers: {
          Query: {
            hello() {
              return new GraphQLError(randomErrorMessage);
            },
          },
        },
      },
    ]);
    await using upstreamYoga = createYoga({
      schema: upstreamSchema,
      logging: false,
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
      logging: false,
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
    const upstreamSchema = buildSubgraphSchema([
      {
        typeDefs: parse(/* GraphQL */ `
          type Query {
            hello: String!
          }
        `),
      },
    ]);
    const supergraph = await composeLocalSchemasWithApollo([
      {
        name: upstreamServiceName,
        schema: upstreamSchema,
        url: `http://localhost:9876/graphql`,
      },
    ]);
    await using gw = createGatewayRuntime({
      logging: false,
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
