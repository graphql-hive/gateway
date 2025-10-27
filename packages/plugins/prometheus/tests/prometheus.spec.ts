import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import { createGatewayTester } from '@graphql-hive/gateway-testing';
import InMemoryLRUCache from '@graphql-mesh/cache-inmemory-lru';
import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { createDefaultExecutor } from '@graphql-mesh/transport-common';
import { isDebug } from '@internal/testing';
import { createSchema } from 'graphql-yoga';
import { Registry, register as registry } from 'prom-client';
import { beforeEach, describe, expect, it } from 'vitest';
import usePrometheus, {
  createCounter,
  createHistogram,
  type PrometheusPluginOptions,
} from '../src/index';

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

  function newTestRuntime(
    metrics: Partial<PrometheusPluginOptions['metrics']> = {},
    registry?: Registry,
  ) {
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
          registry,
          metrics: {
            graphql_gateway_subgraph_execute_duration: true,
            graphql_gateway_subgraph_execute_errors: true,
            graphql_gateway_fetch_duration: true,
            ...metrics,
          },
        }),
      ],
      maskedErrors: false,
    });
  }

  beforeEach(() => registry.clear());

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

  it('should not track subgraph requests if metric is disabled', async () => {
    await using gateway = newTestRuntime({
      graphql_gateway_subgraph_execute_duration: false,
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
    const metrics = await registry.metrics();
    expect(metrics).not.toContain('graphql_gateway_subgraph_execute_duration');
  });

  it('should not track subgraph requests if shouldObserve returns false', async () => {
    const registry = new Registry();
    await using gateway = newTestRuntime(
      {
        graphql_gateway_subgraph_execute_duration: createHistogram({
          registry,
          histogram: {
            name: 'graphql_gateway_subgraph_execute_duration',
            help: 'HELP ME',
          },
          fillLabelsFn: () => ({}) as Record<string, string>,
          phases: ['subgraphExecute'],
          shouldObserve: () => false,
        }),
      },
      registry,
    );
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
    expect(metrics).toContain(
      'graphql_gateway_subgraph_execute_duration_sum 0',
    );
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

  it('should not track subgraph request errors if metric is disabled', async () => {
    await using gateway = newTestRuntime({
      graphql_gateway_subgraph_execute_errors: false,
    });
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
    expect(metrics).not.toContain('graphql_gateway_subgraph_execute_errors');
  });

  it('should not track subgraph request errors if shouldObserve returns false', async () => {
    const registry = new Registry();
    await using gateway = newTestRuntime(
      {
        graphql_gateway_subgraph_execute_errors: createCounter({
          registry,
          counter: {
            name: 'graphql_gateway_subgraph_execute_errors',
            help: 'HELP ME',
          },
          phases: ['subgraphExecute'],
          fillLabelsFn: () => ({}) as Record<string, string>,
          shouldObserve: () => false,
        }),
      },
      registry,
    );
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
    expect(metrics).toContain('graphql_gateway_subgraph_execute_errors 0');
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

  it('should not increment fetch count on cached responses', async () => {
    const registry = new Registry();
    await using cache = new InMemoryLRUCache();
    const gateway = createGatewayTester({
      subgraphs: [
        {
          name: 'TEST_SUBGRAPH',
          schema: subgraphSchema,
        },
      ],
      cache,
      responseCaching: {
        session: () => null,
      },
      plugins: (ctx) => [
        usePrometheus({
          ...ctx,
          registry,
          metrics: {
            graphql_gateway_subgraph_execute_duration: true,
            graphql_gateway_subgraph_execute_errors: true,
            graphql_gateway_fetch_duration: true,
          },
        }),
      ],
    });

    for (let i = 0; i < 3; i++) {
      await expect(
        gateway.execute({
          query: /* GraphQL */ `
            {
              hello
            }
          `,
        }),
      ).resolves.toEqual({
        data: { hello: 'Hello world!' },
      });
    }

    const metric = await registry
      .getSingleMetric('graphql_gateway_fetch_duration')
      ?.get();

    const count = metric?.values.find(
      (v) =>
        // @ts-expect-error metricName does exist
        v.metricName === 'graphql_gateway_fetch_duration_count',
    )?.value;

    expect(count).toBe(1);
  });
});
