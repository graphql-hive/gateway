import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import {
  composeLocalSchemasWithApollo,
  usingHiveRouterRuntime,
} from '@internal/testing';
import { Response } from '@whatwg-node/fetch';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';

describe('Error handling', () => {
  /**
   * type Query {
   *  subgraph1: Subgraph1 # This subgraph is down
   *  subgraph2: Subgraph2
   * }
   */
  it('when a subgraph is down and Query.subgraph1 is nullable', async () => {
    const subgraph1 = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          subgraph1: Subgraph1
        }
        type Subgraph1 {
          subgraph1Field: String
        }
      `),
      resolvers: {
        Query: {
          subgraph1: () => ({
            subgraph1Field: 'hello from subgraph1',
          }),
        },
      },
    });
    const subgraph2 = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          subgraph2: Subgraph2
        }
        type Subgraph2 {
          subgraph2Field: String
        }
      `),
      resolvers: {
        Query: {
          subgraph2: () => ({
            subgraph2Field: 'hello from subgraph2',
          }),
        },
      },
    });
    await using subgraph2server = createYoga({
      schema: subgraph2,
    });
    const supergraph = await composeLocalSchemasWithApollo([
      {
        name: 'subgraph1',
        schema: subgraph1,
        url: 'http://subgraph1:4000/graphql',
      },
      {
        name: 'subgraph2',
        schema: subgraph2,
        url: 'http://subgraph2:4000/graphql',
      },
    ]);
    await using gw = createGatewayRuntime({
      supergraph,
      maskedErrors: false,
      plugins: () => [
        useCustomFetch(function (url, options) {
          if (url === 'http://subgraph1:4000/graphql') {
            return new Response(null, {
              status: 500,
              statusText: 'Internal Server Error',
            });
          }
          if (url === 'http://subgraph2:4000/graphql') {
            return subgraph2server.fetch(url, options as RequestInit);
          }
          return new Response(null, { status: 404 });
        }),
      ],
    });
    const resp = await gw.fetch('http://gateway:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            subgraph1 {
              subgraph1Field
            }
            subgraph2 {
              subgraph2Field
            }
          }
        `,
      }),
    });
    const res = await resp.json();
    expect(res).toEqual({
      data: {
        subgraph1: null,
        subgraph2: {
          subgraph2Field: 'hello from subgraph2',
        },
      },
      errors: [
        {
          extensions: {
            code: 'RESPONSE_VALIDATION_FAILED',
            request: {
              body: `{"query":"{subgraph1{subgraph1Field}}"}`,
              method: 'POST',
            },
            response: {
              body: '',
              status: 500,
              statusText: 'Internal Server Error',
            },
            serviceName: 'subgraph1',
          },
          message: 'No response returned',
          path: ['subgraph1'],
        },
      ],
    });
  });
  /**
   * type Query {
   *  subgraph1: Subgraph1 # This subgraph is down
   *  subgraph2: Subgraph2
   * }
   */
  it('when a subgraph is down and Query.subgraph1 is non-nullable', async () => {
    const subgraph1 = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          subgraph1: Subgraph1!
        }
        type Subgraph1 {
          subgraph1Field: String
        }
      `),
      resolvers: {
        Query: {
          subgraph1: () => ({
            subgraph1Field: 'hello from subgraph1',
          }),
        },
      },
    });
    const subgraph2 = buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          subgraph2: Subgraph2
        }
        type Subgraph2 {
          subgraph2Field: String
        }
      `),
      resolvers: {
        Query: {
          subgraph2: () => ({
            subgraph2Field: 'hello from subgraph2',
          }),
        },
      },
    });
    await using subgraph2server = createYoga({
      schema: subgraph2,
    });
    const supergraph = await composeLocalSchemasWithApollo([
      {
        name: 'subgraph1',
        schema: subgraph1,
        url: 'http://subgraph1:4000/graphql',
      },
      {
        name: 'subgraph2',
        schema: subgraph2,
        url: 'http://subgraph2:4000/graphql',
      },
    ]);
    await using gw = createGatewayRuntime({
      supergraph,
      maskedErrors: false,
      plugins: () => [
        useCustomFetch(function (url, options) {
          if (url === 'http://subgraph1:4000/graphql') {
            return new Response(null, {
              status: 500,
              statusText: 'Internal Server Error',
            });
          }
          if (url === 'http://subgraph2:4000/graphql') {
            return subgraph2server.fetch(url, options as RequestInit);
          }
          return new Response(null, { status: 404 });
        }),
      ],
    });
    const resp = await gw.fetch('http://gateway:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            subgraph1 {
              subgraph1Field
            }
            subgraph2 {
              subgraph2Field
            }
          }
        `,
      }),
    });
    const res = await resp.json();
    expect(res).toEqual({
      data: usingHiveRouterRuntime()
        ? {
            subgraph1: null,
            subgraph2: {
              subgraph2Field: 'hello from subgraph2',
            },
          }
        : null,
      errors: [
        {
          extensions: {
            code: 'RESPONSE_VALIDATION_FAILED',
            request: {
              body: `{"query":"{subgraph1{subgraph1Field}}"}`,
              method: 'POST',
            },
            response: {
              body: '',
              status: 500,
              statusText: 'Internal Server Error',
            },
            serviceName: 'subgraph1',
          },
          message: 'No response returned',
          path: ['subgraph1'],
        },
      ],
    });
  });
});
