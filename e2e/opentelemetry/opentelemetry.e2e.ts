import os from 'os';
import { createExampleSetup, createTenv, type Container } from '@internal/e2e';
import { isCI } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { beforeAll, describe, expect, it } from 'vitest';

const { gateway, container, gatewayRunner } = createTenv(__dirname);

let supergraph!: string;

const JAEGER_HOSTNAME =
  gatewayRunner === 'docker' || gatewayRunner === 'bun-docker'
    ? isCI()
      ? '172.17.0.1'
      : 'host.docker.internal'
    : '0.0.0.0';

const exampleSetup = createExampleSetup(__dirname);

beforeAll(async () => {
  supergraph = await exampleSetup.supergraph();
});

type JaegerTracesApiResponse = {
  data: Array<{
    traceID: string;
    spans: Array<{
      traceID: string;
      spanID: string;
      operationName: string;
      tags: Array<{ key: string; value: string; type: string }>;
    }>;
  }>;
};

describe('OpenTelemetry', () => {
  (['grpc', 'http'] as const).forEach((OTLP_EXPORTER_TYPE) => {
    describe(`exporter > ${OTLP_EXPORTER_TYPE}`, () => {
      let jaeger: Container;
      beforeAll(async () => {
        jaeger = await container({
          name: `jaeger-${OTLP_EXPORTER_TYPE}`,
          image:
            os.platform().toLowerCase() === 'win32'
              ? 'johnnyhuy/jaeger-windows:1809'
              : 'jaegertracing/all-in-one:1.56',
          env: {
            COLLECTOR_OTLP_ENABLED: 'true',
          },
          containerPort: 4318,
          additionalContainerPorts: [16686, 4317],
          healthcheck: ['CMD-SHELL', 'wget --spider http://0.0.0.0:14269'],
        });
      });

      const urls = {
        get http() {
          return `http://${JAEGER_HOSTNAME}:${jaeger.port}/v1/traces`;
        },
        get grpc() {
          return `http://${JAEGER_HOSTNAME}:${jaeger.additionalPorts[4317]}`;
        },
      };

      async function expectJaegerTraces(
        service: string,
        checkFn: (res: JaegerTracesApiResponse) => void | PromiseLike<void>,
      ): Promise<void> {
        const url = `http://0.0.0.0:${jaeger.additionalPorts[16686]}/api/traces?service=${service}`;

        let res!: JaegerTracesApiResponse;
        let err: any;
        const signal = AbortSignal.timeout(15_000);
        while (!signal.aborted) {
          try {
            res = await fetch(url, { signal }).then((r) => r.json());
            await checkFn(res);
            return;
          } catch (e) {
            err = e;
          }
        }
        throw err;
      }
      it('should report telemetry metrics correctly to jaeger', async () => {
        const serviceName = 'mesh-e2e-test-1';
        const { execute } = await gateway({
          supergraph,
          env: {
            OTLP_EXPORTER_TYPE,
            OTLP_EXPORTER_URL: urls[OTLP_EXPORTER_TYPE],
            OTLP_SERVICE_NAME: serviceName,
          },
        });

        await expect(execute({ query: exampleSetup.query })).resolves.toEqual({
          data: {
            topProducts: [
              {
                inStock: true,
                name: 'Table',
                price: 899,
                reviews: [
                  {
                    author: {
                      id: '1',
                      name: 'Ada Lovelace',
                      reviews: [
                        {
                          body: 'Love it!',
                          id: '1',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                        {
                          body: 'Too expensive.',
                          id: '2',
                          product: {
                            inStock: false,
                            name: 'Couch',
                            price: 1299,
                            shippingEstimate: 0,
                            upc: '2',
                            weight: 1000,
                          },
                        },
                      ],
                      username: '@ada',
                    },
                    body: 'Love it!',
                    id: '1',
                  },
                  {
                    author: {
                      id: '2',
                      name: 'Alan Turing',
                      reviews: [
                        {
                          body: 'Could be better.',
                          id: '3',
                          product: {
                            inStock: true,
                            name: 'Chair',
                            price: 54,
                            shippingEstimate: 25,
                            upc: '3',
                            weight: 50,
                          },
                        },
                        {
                          body: 'Prefer something else.',
                          id: '4',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                      ],
                      username: '@complete',
                    },
                    body: 'Prefer something else.',
                    id: '4',
                  },
                ],
                shippingEstimate: 50,
                upc: '1',
                weight: 100,
              },
              {
                inStock: false,
                name: 'Couch',
                price: 1299,
                reviews: [
                  {
                    author: {
                      id: '1',
                      name: 'Ada Lovelace',
                      reviews: [
                        {
                          body: 'Love it!',
                          id: '1',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                        {
                          body: 'Too expensive.',
                          id: '2',
                          product: {
                            inStock: false,
                            name: 'Couch',
                            price: 1299,
                            shippingEstimate: 0,
                            upc: '2',
                            weight: 1000,
                          },
                        },
                      ],
                      username: '@ada',
                    },
                    body: 'Too expensive.',
                    id: '2',
                  },
                ],
                shippingEstimate: 0,
                upc: '2',
                weight: 1000,
              },
              {
                inStock: true,
                name: 'Chair',
                price: 54,
                reviews: [
                  {
                    author: {
                      id: '2',
                      name: 'Alan Turing',
                      reviews: [
                        {
                          body: 'Could be better.',
                          id: '3',
                          product: {
                            inStock: true,
                            name: 'Chair',
                            price: 54,
                            shippingEstimate: 25,
                            upc: '3',
                            weight: 50,
                          },
                        },
                        {
                          body: 'Prefer something else.',
                          id: '4',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                      ],
                      username: '@complete',
                    },
                    body: 'Could be better.',
                    id: '3',
                  },
                ],
                shippingEstimate: 25,
                upc: '3',
                weight: 50,
              },
            ],
            users: [
              {
                id: '1',
                name: 'Ada Lovelace',
                reviews: [
                  {
                    body: 'Love it!',
                    id: '1',
                    product: {
                      inStock: true,
                      name: 'Table',
                      price: 899,
                      reviews: [
                        {
                          author: {
                            id: '1',
                            name: 'Ada Lovelace',
                            reviews: [
                              {
                                body: 'Love it!',
                                id: '1',
                                product: {
                                  inStock: true,
                                  name: 'Table',
                                  price: 899,
                                  shippingEstimate: 50,
                                  upc: '1',
                                  weight: 100,
                                },
                              },
                              {
                                body: 'Too expensive.',
                                id: '2',
                                product: {
                                  inStock: false,
                                  name: 'Couch',
                                  price: 1299,
                                  shippingEstimate: 0,
                                  upc: '2',
                                  weight: 1000,
                                },
                              },
                            ],
                            username: '@ada',
                          },
                          body: 'Love it!',
                          id: '1',
                        },
                        {
                          author: {
                            id: '2',
                            name: 'Alan Turing',
                            reviews: [
                              {
                                body: 'Could be better.',
                                id: '3',
                                product: {
                                  inStock: true,
                                  name: 'Chair',
                                  price: 54,
                                  shippingEstimate: 25,
                                  upc: '3',
                                  weight: 50,
                                },
                              },
                              {
                                body: 'Prefer something else.',
                                id: '4',
                                product: {
                                  inStock: true,
                                  name: 'Table',
                                  price: 899,
                                  shippingEstimate: 50,
                                  upc: '1',
                                  weight: 100,
                                },
                              },
                            ],
                            username: '@complete',
                          },
                          body: 'Prefer something else.',
                          id: '4',
                        },
                      ],
                      shippingEstimate: 50,
                      upc: '1',
                      weight: 100,
                    },
                  },
                  {
                    body: 'Too expensive.',
                    id: '2',
                    product: {
                      inStock: false,
                      name: 'Couch',
                      price: 1299,
                      reviews: [
                        {
                          author: {
                            id: '1',
                            name: 'Ada Lovelace',
                            reviews: [
                              {
                                body: 'Love it!',
                                id: '1',
                                product: {
                                  inStock: true,
                                  name: 'Table',
                                  price: 899,
                                  shippingEstimate: 50,
                                  upc: '1',
                                  weight: 100,
                                },
                              },
                              {
                                body: 'Too expensive.',
                                id: '2',
                                product: {
                                  inStock: false,
                                  name: 'Couch',
                                  price: 1299,
                                  shippingEstimate: 0,
                                  upc: '2',
                                  weight: 1000,
                                },
                              },
                            ],
                            username: '@ada',
                          },
                          body: 'Too expensive.',
                          id: '2',
                        },
                      ],
                      shippingEstimate: 0,
                      upc: '2',
                      weight: 1000,
                    },
                  },
                ],
                username: '@ada',
              },
              {
                id: '2',
                name: 'Alan Turing',
                reviews: [
                  {
                    body: 'Could be better.',
                    id: '3',
                    product: {
                      inStock: true,
                      name: 'Chair',
                      price: 54,
                      reviews: [
                        {
                          author: {
                            id: '2',
                            name: 'Alan Turing',
                            reviews: [
                              {
                                body: 'Could be better.',
                                id: '3',
                                product: {
                                  inStock: true,
                                  name: 'Chair',
                                  price: 54,
                                  shippingEstimate: 25,
                                  upc: '3',
                                  weight: 50,
                                },
                              },
                              {
                                body: 'Prefer something else.',
                                id: '4',
                                product: {
                                  inStock: true,
                                  name: 'Table',
                                  price: 899,
                                  shippingEstimate: 50,
                                  upc: '1',
                                  weight: 100,
                                },
                              },
                            ],
                            username: '@complete',
                          },
                          body: 'Could be better.',
                          id: '3',
                        },
                      ],
                      shippingEstimate: 25,
                      upc: '3',
                      weight: 50,
                    },
                  },
                  {
                    body: 'Prefer something else.',
                    id: '4',
                    product: {
                      inStock: true,
                      name: 'Table',
                      price: 899,
                      reviews: [
                        {
                          author: {
                            id: '1',
                            name: 'Ada Lovelace',
                            reviews: [
                              {
                                body: 'Love it!',
                                id: '1',
                                product: {
                                  inStock: true,
                                  name: 'Table',
                                  price: 899,
                                  shippingEstimate: 50,
                                  upc: '1',
                                  weight: 100,
                                },
                              },
                              {
                                body: 'Too expensive.',
                                id: '2',
                                product: {
                                  inStock: false,
                                  name: 'Couch',
                                  price: 1299,
                                  shippingEstimate: 0,
                                  upc: '2',
                                  weight: 1000,
                                },
                              },
                            ],
                            username: '@ada',
                          },
                          body: 'Love it!',
                          id: '1',
                        },
                        {
                          author: {
                            id: '2',
                            name: 'Alan Turing',
                            reviews: [
                              {
                                body: 'Could be better.',
                                id: '3',
                                product: {
                                  inStock: true,
                                  name: 'Chair',
                                  price: 54,
                                  shippingEstimate: 25,
                                  upc: '3',
                                  weight: 50,
                                },
                              },
                              {
                                body: 'Prefer something else.',
                                id: '4',
                                product: {
                                  inStock: true,
                                  name: 'Table',
                                  price: 899,
                                  shippingEstimate: 50,
                                  upc: '1',
                                  weight: 100,
                                },
                              },
                            ],
                            username: '@complete',
                          },
                          body: 'Prefer something else.',
                          id: '4',
                        },
                      ],
                      shippingEstimate: 50,
                      upc: '1',
                      weight: 100,
                    },
                  },
                ],
                username: '@complete',
              },
            ],
          },
        });
        await expectJaegerTraces(serviceName, (traces) => {
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
      });

      it('should report parse failures correctly', async () => {
        const serviceName = 'mesh-e2e-test-2';
        const { execute } = await gateway({
          supergraph,
          env: {
            OTLP_EXPORTER_TYPE,
            OTLP_EXPORTER_URL: urls[OTLP_EXPORTER_TYPE],
            OTLP_SERVICE_NAME: serviceName,
          },
        });

        await expect(execute({ query: 'query { test' })).resolves
          .toMatchInlineSnapshot(`
          {
            "errors": [
              {
                "extensions": {
                  "code": "GRAPHQL_PARSE_FAILED",
                },
                "locations": [
                  {
                    "column": 13,
                    "line": 1,
                  },
                ],
                "message": "Syntax Error: Expected Name, found <EOF>.",
              },
            ],
          }
        `);
        await expectJaegerTraces(serviceName, (traces) => {
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
      });

      it('should report validate failures correctly', async () => {
        const serviceName = 'mesh-e2e-test-3';
        const { execute } = await gateway({
          supergraph,
          env: {
            OTLP_EXPORTER_TYPE,
            OTLP_EXPORTER_URL: urls[OTLP_EXPORTER_TYPE],
            OTLP_SERVICE_NAME: serviceName,
          },
        });

        await expect(execute({ query: 'query { nonExistentField }' })).resolves
          .toMatchInlineSnapshot(`
          {
            "errors": [
              {
                "extensions": {
                  "code": "GRAPHQL_VALIDATION_FAILED",
                },
                "locations": [
                  {
                    "column": 9,
                    "line": 1,
                  },
                ],
                "message": "Cannot query field "nonExistentField" on type "Query".",
              },
            ],
          }
        `);
        await expectJaegerTraces(serviceName, (traces) => {
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
                  value:
                    'Cannot query field "nonExistentField" on type "Query".',
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
      });

      it('should report http failures', async () => {
        const serviceName = 'mesh-e2e-test-4';
        const { port } = await gateway({
          supergraph,
          env: {
            OTLP_EXPORTER_TYPE,
            OTLP_EXPORTER_URL: urls[OTLP_EXPORTER_TYPE],
            OTLP_SERVICE_NAME: serviceName,
          },
        });
        const path = '/non-existing';
        await fetch(`http://0.0.0.0:${port}${path}`).catch(() => {});
        await expectJaegerTraces(serviceName, (traces) => {
          expect(traces.data.length).toBe(2);
          const relevantTrace = traces.data.find((trace) =>
            trace.spans.some((span) => span.operationName === 'GET ' + path),
          );
          expect(relevantTrace).toBeDefined();
          expect(relevantTrace?.spans.length).toBe(1);

          expect(relevantTrace?.spans).toContainEqual(
            expect.objectContaining({
              operationName: 'GET ' + path,
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
      });

      it('context propagation should work correctly', async () => {
        const traceId = '0af7651916cd43dd8448eb211c80319c';
        const serviceName = 'mesh-e2e-test-5';
        const { execute, port } = await gateway({
          supergraph,
          env: {
            OTLP_EXPORTER_TYPE,
            OTLP_EXPORTER_URL: urls[OTLP_EXPORTER_TYPE],
            OTLP_SERVICE_NAME: serviceName,
          },
        });

        await expect(
          execute({
            query: exampleSetup.query,
            headers: {
              traceparent: `00-${traceId}-b7ad6b7169203331-01`,
            },
          }),
        ).resolves.toEqual({
          data: {
            topProducts: [
              {
                inStock: true,
                name: 'Table',
                price: 899,
                reviews: [
                  {
                    author: {
                      id: '1',
                      name: 'Ada Lovelace',
                      reviews: [
                        {
                          body: 'Love it!',
                          id: '1',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                        {
                          body: 'Too expensive.',
                          id: '2',
                          product: {
                            inStock: false,
                            name: 'Couch',
                            price: 1299,
                            shippingEstimate: 0,
                            upc: '2',
                            weight: 1000,
                          },
                        },
                      ],
                      username: '@ada',
                    },
                    body: 'Love it!',
                    id: '1',
                  },
                  {
                    author: {
                      id: '2',
                      name: 'Alan Turing',
                      reviews: [
                        {
                          body: 'Could be better.',
                          id: '3',
                          product: {
                            inStock: true,
                            name: 'Chair',
                            price: 54,
                            shippingEstimate: 25,
                            upc: '3',
                            weight: 50,
                          },
                        },
                        {
                          body: 'Prefer something else.',
                          id: '4',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                      ],
                      username: '@complete',
                    },
                    body: 'Prefer something else.',
                    id: '4',
                  },
                ],
                shippingEstimate: 50,
                upc: '1',
                weight: 100,
              },
              {
                inStock: false,
                name: 'Couch',
                price: 1299,
                reviews: [
                  {
                    author: {
                      id: '1',
                      name: 'Ada Lovelace',
                      reviews: [
                        {
                          body: 'Love it!',
                          id: '1',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                        {
                          body: 'Too expensive.',
                          id: '2',
                          product: {
                            inStock: false,
                            name: 'Couch',
                            price: 1299,
                            shippingEstimate: 0,
                            upc: '2',
                            weight: 1000,
                          },
                        },
                      ],
                      username: '@ada',
                    },
                    body: 'Too expensive.',
                    id: '2',
                  },
                ],
                shippingEstimate: 0,
                upc: '2',
                weight: 1000,
              },
              {
                inStock: true,
                name: 'Chair',
                price: 54,
                reviews: [
                  {
                    author: {
                      id: '2',
                      name: 'Alan Turing',
                      reviews: [
                        {
                          body: 'Could be better.',
                          id: '3',
                          product: {
                            inStock: true,
                            name: 'Chair',
                            price: 54,
                            shippingEstimate: 25,
                            upc: '3',
                            weight: 50,
                          },
                        },
                        {
                          body: 'Prefer something else.',
                          id: '4',
                          product: {
                            inStock: true,
                            name: 'Table',
                            price: 899,
                            shippingEstimate: 50,
                            upc: '1',
                            weight: 100,
                          },
                        },
                      ],
                      username: '@complete',
                    },
                    body: 'Could be better.',
                    id: '3',
                  },
                ],
                shippingEstimate: 25,
                upc: '3',
                weight: 50,
              },
            ],
            users: [
              {
                id: '1',
                name: 'Ada Lovelace',
                reviews: [
                  {
                    body: 'Love it!',
                    id: '1',
                    product: {
                      inStock: true,
                      name: 'Table',
                      price: 899,
                      reviews: [
                        {
                          author: {
                            id: '1',
                            name: 'Ada Lovelace',
                            reviews: [
                              {
                                body: 'Love it!',
                                id: '1',
                                product: {
                                  inStock: true,
                                  name: 'Table',
                                  price: 899,
                                  shippingEstimate: 50,
                                  upc: '1',
                                  weight: 100,
                                },
                              },
                              {
                                body: 'Too expensive.',
                                id: '2',
                                product: {
                                  inStock: false,
                                  name: 'Couch',
                                  price: 1299,
                                  shippingEstimate: 0,
                                  upc: '2',
                                  weight: 1000,
                                },
                              },
                            ],
                            username: '@ada',
                          },
                          body: 'Love it!',
                          id: '1',
                        },
                        {
                          author: {
                            id: '2',
                            name: 'Alan Turing',
                            reviews: [
                              {
                                body: 'Could be better.',
                                id: '3',
                                product: {
                                  inStock: true,
                                  name: 'Chair',
                                  price: 54,
                                  shippingEstimate: 25,
                                  upc: '3',
                                  weight: 50,
                                },
                              },
                              {
                                body: 'Prefer something else.',
                                id: '4',
                                product: {
                                  inStock: true,
                                  name: 'Table',
                                  price: 899,
                                  shippingEstimate: 50,
                                  upc: '1',
                                  weight: 100,
                                },
                              },
                            ],
                            username: '@complete',
                          },
                          body: 'Prefer something else.',
                          id: '4',
                        },
                      ],
                      shippingEstimate: 50,
                      upc: '1',
                      weight: 100,
                    },
                  },
                  {
                    body: 'Too expensive.',
                    id: '2',
                    product: {
                      inStock: false,
                      name: 'Couch',
                      price: 1299,
                      reviews: [
                        {
                          author: {
                            id: '1',
                            name: 'Ada Lovelace',
                            reviews: [
                              {
                                body: 'Love it!',
                                id: '1',
                                product: {
                                  inStock: true,
                                  name: 'Table',
                                  price: 899,
                                  shippingEstimate: 50,
                                  upc: '1',
                                  weight: 100,
                                },
                              },
                              {
                                body: 'Too expensive.',
                                id: '2',
                                product: {
                                  inStock: false,
                                  name: 'Couch',
                                  price: 1299,
                                  shippingEstimate: 0,
                                  upc: '2',
                                  weight: 1000,
                                },
                              },
                            ],
                            username: '@ada',
                          },
                          body: 'Too expensive.',
                          id: '2',
                        },
                      ],
                      shippingEstimate: 0,
                      upc: '2',
                      weight: 1000,
                    },
                  },
                ],
                username: '@ada',
              },
              {
                id: '2',
                name: 'Alan Turing',
                reviews: [
                  {
                    body: 'Could be better.',
                    id: '3',
                    product: {
                      inStock: true,
                      name: 'Chair',
                      price: 54,
                      reviews: [
                        {
                          author: {
                            id: '2',
                            name: 'Alan Turing',
                            reviews: [
                              {
                                body: 'Could be better.',
                                id: '3',
                                product: {
                                  inStock: true,
                                  name: 'Chair',
                                  price: 54,
                                  shippingEstimate: 25,
                                  upc: '3',
                                  weight: 50,
                                },
                              },
                              {
                                body: 'Prefer something else.',
                                id: '4',
                                product: {
                                  inStock: true,
                                  name: 'Table',
                                  price: 899,
                                  shippingEstimate: 50,
                                  upc: '1',
                                  weight: 100,
                                },
                              },
                            ],
                            username: '@complete',
                          },
                          body: 'Could be better.',
                          id: '3',
                        },
                      ],
                      shippingEstimate: 25,
                      upc: '3',
                      weight: 50,
                    },
                  },
                  {
                    body: 'Prefer something else.',
                    id: '4',
                    product: {
                      inStock: true,
                      name: 'Table',
                      price: 899,
                      reviews: [
                        {
                          author: {
                            id: '1',
                            name: 'Ada Lovelace',
                            reviews: [
                              {
                                body: 'Love it!',
                                id: '1',
                                product: {
                                  inStock: true,
                                  name: 'Table',
                                  price: 899,
                                  shippingEstimate: 50,
                                  upc: '1',
                                  weight: 100,
                                },
                              },
                              {
                                body: 'Too expensive.',
                                id: '2',
                                product: {
                                  inStock: false,
                                  name: 'Couch',
                                  price: 1299,
                                  shippingEstimate: 0,
                                  upc: '2',
                                  weight: 1000,
                                },
                              },
                            ],
                            username: '@ada',
                          },
                          body: 'Love it!',
                          id: '1',
                        },
                        {
                          author: {
                            id: '2',
                            name: 'Alan Turing',
                            reviews: [
                              {
                                body: 'Could be better.',
                                id: '3',
                                product: {
                                  inStock: true,
                                  name: 'Chair',
                                  price: 54,
                                  shippingEstimate: 25,
                                  upc: '3',
                                  weight: 50,
                                },
                              },
                              {
                                body: 'Prefer something else.',
                                id: '4',
                                product: {
                                  inStock: true,
                                  name: 'Table',
                                  price: 899,
                                  shippingEstimate: 50,
                                  upc: '1',
                                  weight: 100,
                                },
                              },
                            ],
                            username: '@complete',
                          },
                          body: 'Prefer something else.',
                          id: '4',
                        },
                      ],
                      shippingEstimate: 50,
                      upc: '1',
                      weight: 100,
                    },
                  },
                ],
                username: '@complete',
              },
            ],
          },
        });

        const upstreamHttpCalls = await fetch(
          `http://0.0.0.0:${port}/upstream-fetch`,
        ).then(
          (r) =>
            r.json() as unknown as Array<{
              url: string;
              headers?: Record<string, string>;
            }>,
        );

        await expectJaegerTraces(serviceName, (traces) => {
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
});
