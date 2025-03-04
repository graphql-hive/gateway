import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { createDefaultExecutor } from '@graphql-tools/delegate';
import { isDebug } from '@internal/testing';
import { createSchema } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';
import { GatewayPlugin } from '../src/types';

describe('instruments', () => {
  const subgraphSchema = createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        hello: String
        errorHere: String
      }
    `,
    resolvers: {
      Query: {
        hello: () => 'Hello world!',
        errorHere: () => {
          throw new Error('Error here');
        },
      },
    },
  });

  it('should wrap all phases in the order of the plugin array', async () => {
    const results: string[] = [];
    const make = (name: string): GatewayPlugin => ({
      instruments: {
        request: async (_, w) => {
          results.push(`pre-request-${name}`);
          await w();
          results.push(`post-request-${name}`);
        },
        requestParse: async (_, w) => {
          results.push(`pre-request-parse-${name}`);
          await w();
          results.push(`post-request-parse-${name}`);
        },
        operation: async (_, w) => {
          results.push(`pre-operation-${name}`);
          await w();
          results.push(`post-operation-${name}`);
        },
        init: async (_, w) => {
          results.push(`pre-init-${name}`);
          w();
          results.push(`post-init-${name}`);
        },
        parse: (_, w) => {
          results.push(`pre-parse-${name}`);
          w();
          results.push(`post-parse-${name}`);
        },
        validate: (_, w) => {
          results.push(`pre-validate-${name}`);
          w();
          results.push(`post-validate-${name}`);
        },
        context: (_, w) => {
          results.push(`pre-context-${name}`);
          w();
          results.push(`post-context-${name}`);
        },
        execute: async (_, w) => {
          results.push(`pre-execute-${name}`);
          await w();
          results.push(`post-execute-${name}`);
        },
        fetch: async (_, w) => {
          results.push(`pre-fetch-${name}`);
          await w();
          results.push(`post-fetch-${name}`);
        },
        subgraphExecute: async (_, w) => {
          results.push(`pre-subgraph-execute-${name}`);
          await w();
          results.push(`post-subgraph-execute-${name}`);
        },
        resultProcess: async (_, w) => {
          results.push(`pre-result-process-${name}`);
          await w();
          results.push(`post-result-process-${name}`);
        },
      },
    });
    await using gateway = createGatewayRuntime({
      supergraph: () =>
        getUnifiedGraphGracefully([
          {
            name: 'TEST_SUBGRAPH',
            schema: subgraphSchema,
          },
        ]),
      transports() {
        return {
          getSubgraphExecutor() {
            return createDefaultExecutor(subgraphSchema);
          },
        };
      },
      plugins: () => [
        make('1'),
        make('2'),
        make('3'),
        {
          onFetch() {
            console.log('on fetch');
          },
        },
      ],
      logging: isDebug(),
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
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { hello: 'Hello world!' } });

    const withPrefix = (prefix: string) => [
      `${prefix}-1`,
      `${prefix}-2`,
      `${prefix}-3`,
    ];

    expect(results).toEqual([
      ...withPrefix('pre-request'),
      ...withPrefix('pre-request-parse'),
      ...withPrefix('post-request-parse').reverse(),
      ...withPrefix('pre-operation'),
      ...withPrefix('pre-init'),
      ...withPrefix('post-init').reverse(),
      ...withPrefix('pre-parse'),
      ...withPrefix('post-parse').reverse(),
      ...withPrefix('pre-validate'),
      ...withPrefix('post-validate').reverse(),
      ...withPrefix('pre-context'),
      ...withPrefix('post-context').reverse(),
      ...withPrefix('pre-execute'),
      ...withPrefix('pre-subgraph-execute'),
      ...withPrefix('pre-fetch'),
      ...withPrefix('post-fetch').reverse(),
      ...withPrefix('post-subgraph-execute').reverse(),
      ...withPrefix('post-execute').reverse(),
      ...withPrefix('post-operation').reverse(),
      ...withPrefix('pre-result-process'),
      ...withPrefix('post-result-process').reverse(),
      ...withPrefix('post-request').reverse(),
    ]);
  });
});
