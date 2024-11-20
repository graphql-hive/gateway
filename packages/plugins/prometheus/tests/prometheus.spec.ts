import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { createDefaultExecutor } from '@graphql-mesh/transport-common';
import { isDebug } from '@internal/testing';
import { createSchema } from 'graphql-yoga';
import { register as registry } from 'prom-client';
import { afterAll, describe, expect, it } from 'vitest';
import usePrometheus from '../src/index';

describe('Prometheus', () => {
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

  function newTestRuntime() {
    return createGatewayRuntime({
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
      plugins: (ctx) => [
        usePrometheus({
          ...ctx,
          metrics: {
            graphql_gateway_subgraph_execute_duration: true,
            graphql_gateway_subgraph_execute_errors: true,
            graphql_gateway_fetch_duration: true,
          },
        }),
      ],
      logging: isDebug(),
    });
  }

  afterAll(() => registry.clear());

  it('should track subgraph requests', async () => {
    await using gateway = newTestRuntime();
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
    const metrics = await registry.metrics();
    expect(metrics).toContain('graphql_gateway_subgraph_execute_duration');
    expect(metrics).toContain('subgraphName="TEST_SUBGRAPH"');
    expect(metrics).toContain('operationType="query"');
  });
  it('should track subgraph request errors', async () => {
    await using gateway = newTestRuntime();
    const res = await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            errorHere
          }
        `,
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { errorHere: null },
      errors: [{ message: 'Error here' }],
    });
    const metrics = await registry.metrics();
    expect(metrics).toContain('graphql_gateway_subgraph_execute_errors');
    expect(metrics).toContain('subgraphName="TEST_SUBGRAPH"');
    expect(metrics).toContain('operationType="query"');
  });

  it('can be initialized multiple times in the same node process', async () => {
    await using gateway = newTestRuntime();
    async function testQuery() {
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
    }

    await testQuery();

    // Create a new mesh instance, as what happens when polling is enabled
    newTestRuntime();

    await testQuery();

    const metrics = await registry.metrics();
    expect(metrics).toContain('graphql_gateway_subgraph_execute_duration');
    expect(metrics).toContain('subgraphName="TEST_SUBGRAPH"');
    expect(metrics).toContain('operationType="query"');
  });
});
