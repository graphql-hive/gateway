import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { MeshFetch } from '@graphql-mesh/types';
import { Response } from '@whatwg-node/fetch';
import { createGraphQLError, createSchema, createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';

describe('Upstream Retry', () => {
  it('respects \`maxRetries\`', async () => {
    let attempts = 0;
    let maxRetries = 2;
    const retryDelay = 100;
    const failUntil = 3;
    const upstreamSchema = createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          hello: String
        }
      `,
      resolvers: {
        Query: {
          hello: () => 'world',
        },
      },
    });
    await using upstreamServer = createYoga({
      schema: upstreamSchema,
      plugins: [
        {
          onRequest({ endResponse }) {
            if (attempts <= failUntil) {
              attempts++;
              endResponse(
                Response.json(
                  {
                    errors: [
                      createGraphQLError(`Error in attempt ${attempts}`),
                    ],
                  },
                  {
                    status: 500,
                  },
                ),
              );
              return;
            }
          },
        },
      ],
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
      upstreamRetry: () => ({
        maxRetries,
        retryDelay,
      }),
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
    expect(resJson).toEqual(
      expect.objectContaining({
        errors: [
          {
            message: 'Error in attempt 3',
            extensions: {
              code: 'DOWNSTREAM_SERVICE_ERROR',
              serviceName: 'upstream',
            },
            path: ['hello'],
          },
        ],
      }),
    );
    attempts = 0;
    maxRetries = 10;
    const res2 = await gateway.fetch('http://localhost:4000/graphql', {
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
    const resJson2 = await res2.json();
    expect(resJson2).toEqual({
      data: {
        hello: 'world',
      },
    });
  });
  it('respects \`Retry-After\` header', async () => {
    let diffBetweenRetries: number | undefined;
    let lastAttempt: number | undefined;
    const upstreamSchema = createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          hello: String
        }
      `,
      resolvers: {
        Query: {
          hello: () => 'world',
        },
      },
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
        return [
          useCustomFetch(() => {
            if (lastAttempt) {
              diffBetweenRetries = Date.now() - lastAttempt;
            }
            lastAttempt = Date.now();
            return Response.json(
              {
                errors: [createGraphQLError(`Rate limited`)],
              },
              {
                status: 429,
                headers: {
                  'Retry-After': '1',
                },
              },
            );
          }),
        ];
      },
      upstreamRetry: () => ({
        maxRetries: 1,
        // To make sure it is more than retry-after
        retryDelay: 10_000,
      }),
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
    expect(resJson).toEqual(
      expect.objectContaining({
        errors: [
          {
            message: 'Rate limited',
            extensions: {
              code: 'DOWNSTREAM_SERVICE_ERROR',
              serviceName: 'upstream',
            },
            path: ['hello'],
          },
        ],
      }),
    );
    expect(diffBetweenRetries).toBeDefined();
    expect(Math.floor(diffBetweenRetries! / 1000)).toBeGreaterThanOrEqual(1);
  });
});
