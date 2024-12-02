import { createTenv, createTjaeger, OTLPExporterType } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { beforeAll, describe, it } from 'vitest';

const { service, gatewayRunner, gateway, composeWithApollo } =
  createTenv(__dirname);
const jaeger = createTjaeger(__dirname);

let supergraph!: string;

beforeAll(async () => {
  supergraph = await composeWithApollo([
    await service('accounts'),
    await service('inventory'),
    await service('products'),
    await service('reviews'),
  ]);
});

const query = /* GraphQL */ `
  fragment User on User {
    id
    username
    name
  }

  fragment Review on Review {
    id
    body
  }

  fragment Product on Product {
    inStock
    name
    price
    shippingEstimate
    upc
    weight
  }

  query TestQuery {
    users {
      ...User
      reviews {
        ...Review
        product {
          ...Product
          reviews {
            ...Review
            author {
              ...User
              reviews {
                ...Review
                product {
                  ...Product
                }
              }
            }
          }
        }
      }
    }
    topProducts {
      ...Product
      reviews {
        ...Review
        author {
          ...User
          reviews {
            ...Review
            product {
              ...Product
            }
          }
        }
      }
    }
  }
`;

describe.skipIf(
  // the disposal of other runners is on the process, not the gateway directly.
  // so we only test on node because disposing will properly flush the traces
  gatewayRunner !== 'node',
)('OpenTelemetry', () => {
  (['grpc', 'http'] satisfies OTLPExporterType[]).forEach((exporterType) => {
    describe.concurrent(`exporter > ${exporterType}`, () => {
      it('should report telemetry metrics correctly to jaeger', async ({
        expect,
      }) => {
        const { env, getTraces } = await jaeger.start(exporterType);
        const gw = await gateway({
          supergraph,
          env,
        });
        await expect(gw.execute({ query: query })).resolves.toMatchSnapshot();
        await gw[Symbol.asyncDispose](); // disposing the gateway will/should flush the traces

        const traces = await getTraces();
        expect(traces.data.length).toBe(2);
        const relevantTraces = traces.data.filter((trace) =>
          trace.spans.some((span) => span.operationName === 'POST /graphql'),
        );
        expect(relevantTraces.length).toBe(1);
        const relevantTrace = relevantTraces[0];
        expect(relevantTrace).toBeDefined();
        expect(relevantTrace?.spans.length).toBe(11);

        expect(relevantTrace?.spans).toContainEqual(
          expect.objectContaining({ operationName: 'POST /graphql' }),
        );
        expect(relevantTrace?.spans).toContainEqual(
          expect.objectContaining({ operationName: 'graphql.parse' }),
        );
        expect(relevantTrace?.spans).toContainEqual(
          expect.objectContaining({ operationName: 'graphql.validate' }),
        );
        expect(relevantTrace?.spans).toContainEqual(
          expect.objectContaining({ operationName: 'graphql.execute' }),
        );
        expect(
          relevantTrace?.spans.filter(
            (r) => r.operationName === 'subgraph.execute (accounts)',
          ).length,
        ).toBe(2);
        expect(
          relevantTrace?.spans.filter(
            (r) => r.operationName === 'subgraph.execute (products)',
          ).length,
        ).toBe(2);
        expect(
          relevantTrace?.spans.filter(
            (r) => r.operationName === 'subgraph.execute (inventory)',
          ).length,
        ).toBe(1);
        expect(
          relevantTrace?.spans.filter(
            (r) => r.operationName === 'subgraph.execute (reviews)',
          ).length,
        ).toBe(2);
      });

      it('should report parse failures correctly', async ({ expect }) => {
        const { env, getTraces } = await jaeger.start(exporterType);
        const gw = await gateway({
          supergraph,
          env,
        });
        await expect(gw.execute({ query: 'query { test' })).rejects.toThrow(
          'Syntax Error: Expected Name, found <EOF>.',
        );
        await gw[Symbol.asyncDispose](); // disposing the gateway will/should flush the traces

        const traces = await getTraces();
        expect(traces.data.length).toBe(2);
        const relevantTrace = traces.data.find((trace) =>
          trace.spans.some((span) => span.operationName === 'POST /graphql'),
        );
        expect(relevantTrace).toBeDefined();
        expect(relevantTrace?.spans.length).toBe(2);

        expect(relevantTrace?.spans).toContainEqual(
          expect.objectContaining({ operationName: 'POST /graphql' }),
        );
        expect(relevantTrace?.spans).toContainEqual(
          expect.objectContaining({
            operationName: 'graphql.parse',
            tags: expect.arrayContaining([
              expect.objectContaining({
                key: 'otel.status_code',
                value: 'ERROR',
              }),
              expect.objectContaining({
                key: 'error',
                value: true,
              }),
              expect.objectContaining({
                key: 'otel.status_description',
                value: 'Syntax Error: Expected Name, found <EOF>.',
              }),
              expect.objectContaining({
                key: 'graphql.error.count',
                value: 1,
              }),
            ]),
          }),
        );
        expect(relevantTrace?.spans).not.toContainEqual(
          expect.objectContaining({ operationName: 'graphql.execute' }),
        );
        expect(
          relevantTrace?.spans.filter((r) =>
            r.operationName.includes('subgraph.execute'),
          ).length,
        ).toBe(0);
      });

      it('should report validate failures correctly', async ({ expect }) => {
        const { env, getTraces } = await jaeger.start(exporterType);
        const gw = await gateway({
          supergraph,
          env,
        });
        await expect(
          gw.execute({ query: 'query { nonExistentField }' }),
        ).rejects.toThrow(
          '400 Bad Request\n{"errors":[{"message":"Cannot query field \\"nonExistentField\\" on type \\"Query\\".","locations":[{"line":1,"column":9}]}]}',
        );
        await gw[Symbol.asyncDispose](); // disposing the gateway will/should flush the traces

        const traces = await getTraces();
        expect(traces.data.length).toBe(2);
        const relevantTrace = traces.data.find((trace) =>
          trace.spans.some((span) => span.operationName === 'POST /graphql'),
        );
        expect(relevantTrace).toBeDefined();
        expect(relevantTrace?.spans.length).toBe(3);

        expect(relevantTrace?.spans).toContainEqual(
          expect.objectContaining({ operationName: 'POST /graphql' }),
        );
        expect(relevantTrace?.spans).toContainEqual(
          expect.objectContaining({ operationName: 'graphql.parse' }),
        );
        expect(relevantTrace?.spans).toContainEqual(
          expect.objectContaining({
            operationName: 'graphql.validate',
            tags: expect.arrayContaining([
              expect.objectContaining({
                key: 'otel.status_code',
                value: 'ERROR',
              }),
              expect.objectContaining({
                key: 'error',
                value: true,
              }),
              expect.objectContaining({
                key: 'otel.status_description',
                value: 'Cannot query field "nonExistentField" on type "Query".',
              }),
              expect.objectContaining({
                key: 'graphql.error.count',
                value: 1,
              }),
            ]),
          }),
        );
        expect(relevantTrace?.spans).not.toContainEqual(
          expect.objectContaining({ operationName: 'graphql.execute' }),
        );
        expect(
          relevantTrace?.spans.filter((r) =>
            r.operationName.includes('subgraph.execute'),
          ).length,
        ).toBe(0);
      });

      it('should report http failures', async ({ expect }) => {
        const { env, getTraces } = await jaeger.start(exporterType);
        const gw = await gateway({
          supergraph,
          env,
        });
        await fetch(`http://0.0.0.0:${gw.port}/non-existing`).catch(() => {});
        await gw[Symbol.asyncDispose](); // disposing the gateway will/should flush the traces

        const traces = await getTraces();
        expect(traces.data.length).toBe(2);
        const relevantTrace = traces.data.find((trace) =>
          trace.spans.some(
            (span) => span.operationName === 'GET /non-existing',
          ),
        );
        expect(relevantTrace).toBeDefined();
        expect(relevantTrace?.spans.length).toBe(1);

        expect(relevantTrace?.spans).toContainEqual(
          expect.objectContaining({
            operationName: 'GET /non-existing',
            tags: expect.arrayContaining([
              expect.objectContaining({
                key: 'otel.status_code',
                value: 'ERROR',
              }),
              expect.objectContaining({
                key: 'error',
                value: true,
              }),
              expect.objectContaining({
                key: 'http.status_code',
                value: 404,
              }),
            ]),
          }),
        );
      });

      it('context propagation should work correctly', async ({ expect }) => {
        const { env, getTraces } = await jaeger.start(exporterType);
        const gw = await gateway({
          supergraph,
          env,
        });
        const traceId = '0af7651916cd43dd8448eb211c80319c';
        await expect(
          gw.execute({
            query: query,
            headers: {
              traceparent: `00-${traceId}-b7ad6b7169203331-01`,
            },
          }),
        ).resolves.toMatchSnapshot();
        const upstreamHttpCalls = await fetch(
          `http://0.0.0.0:${gw.port}/upstream-fetch`,
        ).then(
          (r) =>
            r.json() as unknown as Array<{
              url: string;
              headers?: Record<string, string>;
            }>,
        );
        await gw[Symbol.asyncDispose](); // disposing the gateway will/should flush the traces

        const traces = await getTraces();
        expect(traces.data.length).toBe(3);

        const relevantTraces = traces.data.filter((trace) =>
          trace.spans.some((span) => span.operationName === 'POST /graphql'),
        );
        expect(relevantTraces.length).toBe(1);
        const relevantTrace = relevantTraces[0]!;
        expect(relevantTrace).toBeDefined();

        // Check for extraction of the otel context
        expect(relevantTrace.traceID).toBe(traceId);
        for (const span of relevantTrace.spans) {
          expect(span.traceID).toBe(traceId);
        }

        expect(upstreamHttpCalls.length).toBe(7);

        for (const call of upstreamHttpCalls) {
          const transparentHeader = (call.headers || {})['traceparent'];
          expect(transparentHeader).toBeDefined();
          expect(transparentHeader?.length).toBeGreaterThan(1);
          expect(transparentHeader).toContain(traceId);
        }
      });
    });
  });
});
