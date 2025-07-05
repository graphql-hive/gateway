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

const runner = {
  docker: {
    volumes: [
      {
        host: __dirname + '/otel-setup.ts',
        container: `/gateway/otel-setup.ts`,
      },
    ],
  },
};

beforeAll(async () => {
  supergraph = await exampleSetup.supergraph();
});

type JaegerTracesApiResponse = {
  data: Array<{
    traceID: string;
    spans: JaegerTraceSpan[];
    processes: { [key: string]: JaegerTraceResource };
  }>;
};

type JaegerTraceTag = {
  key: string;
  type: string;
  value: string;
};

type JaegerTraceResource = {
  serviceName: string;
  tags: JaegerTraceTag[];
};

type JaegerTraceSpan = {
  traceID: string;
  spanID: string;
  operationName: string;
  tags: Array<JaegerTraceTag>;
  references: Array<{ refType: string; spanID: string; traceID: string }>;
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
        checkFn: (
          res: JaegerTracesApiResponse,
          abort: AbortController,
        ) => void | PromiseLike<void>,
      ): Promise<void> {
        const url = `http://0.0.0.0:${jaeger.additionalPorts[16686]}/api/traces?service=${service}`;

        let res!: JaegerTracesApiResponse;
        let err: any;
        const timeout = AbortSignal.timeout(15_000);
        const abort = new AbortController();
        const signal = AbortSignal.any([timeout, abort.signal]);
        while (!signal.aborted) {
          try {
            res = await fetch(url, { signal }).then((r) => r.json());
            await checkFn(res, abort);
            return;
          } catch (e) {
            if (signal.aborted) {
              const relevantTrace = res.data.find((trace) =>
                trace.spans.some(
                  (span) => span.operationName === 'POST /graphql',
                ),
              );
              const actualError = timeout.aborted ? err : e;
              console.error(
                actualError,
                '\nTraces was:',
                Object.fromEntries(
                  res.data.map(({ traceID, spans }) => [
                    traceID,
                    spans.map((s) => s.operationName),
                  ]),
                ),
                '\nSpan tree was:',
                relevantTrace
                  ? '\n' +
                      printSpanTree(
                        buildSpanTree(relevantTrace.spans, 'POST /graphql'),
                      )
                  : 'no trace containing "POST /graphql" span found',
              );
              throw actualError;
            }
            if (abort.signal.aborted) {
              throw e;
            }
            if (timeout.aborted) {
              throw err;
            }
            err = e;
          }
        }
        throw err;
      }
      it('should report telemetry metrics correctly to jaeger', async () => {
        const serviceName = 'mesh-e2e-test-1';
        const { execute } = await gateway({
          runner,
          supergraph,
          env: {
            OTLP_EXPORTER_TYPE,
            OTLP_EXPORTER_URL: urls[OTLP_EXPORTER_TYPE],
            OTEL_SERVICE_NAME: serviceName,
            OTEL_SERVICE_VERSION: '1.0.0',
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
          const relevantTraces = traces.data.filter((trace) =>
            trace.spans.some((span) => span.operationName === 'POST /graphql'),
          );
          expect(relevantTraces.length).toBe(1);
          const relevantTrace = relevantTraces[0];
          expect(relevantTrace).toBeDefined();
          expect(relevantTrace!.spans.length).toBe(20);

          const resource = relevantTrace!.processes['p1'];
          expect(resource).toBeDefined();

          const tags = resource!.tags.map(({ key, value }) => ({ key, value }));
          const tagKeys = resource!.tags.map(({ key }) => key);
          expect(resource!.serviceName).toBe(serviceName);
          [
            ['custom.resource', 'custom value'],
            ['otel.library.name', 'gateway'],
          ].forEach(([key, value]) => {
            return expect(tags).toContainEqual({ key, value });
          });

          if (
            process.env['E2E_GATEWAY_RUNNER'] === 'node' ||
            process.env['E2E_GATEWAY_RUNNER'] === 'docker'
          ) {
            const expectedTags = [
              'process.owner',
              'host.arch',
              'os.type',
              'service.instance.id',
            ];
            if (process.env['E2E_GATEWAY_RUNNER'] === 'docker') {
              expectedTags.push('container.id');
            }
            expectedTags.forEach((key) => {
              return expect(tagKeys).toContain(key);
            });
          }

          const spanTree = buildSpanTree(relevantTrace!.spans, 'POST /graphql');
          expect(spanTree).toBeDefined();

          expect(spanTree!.children).toHaveLength(1);

          const operationSpan = spanTree!.children[0];
          const expectedOperationChildren = [
            'graphql.parse',
            'graphql.validate',
            'graphql.context',
            'graphql.execute',
          ];
          expect(operationSpan!.children).toHaveLength(4);
          for (const operationName of expectedOperationChildren) {
            expect(operationSpan?.children).toContainEqual(
              expect.objectContaining({
                span: expect.objectContaining({ operationName }),
              }),
            );
          }

          expect(
            operationSpan!.children
              .find(({ span }) => span.operationName === 'graphql.execute')
              ?.span.tags.find(({ key }) => key === 'custom.attribute'),
          ).toMatchObject({ value: 'custom value' });

          const executeSpan = operationSpan!.children.find(
            ({ span }) => span.operationName === 'graphql.execute',
          );

          const expectedExecuteChildren = [
            ['subgraph.execute (accounts)', 2],
            ['subgraph.execute (products)', 2],
            ['subgraph.execute (inventory)', 1],
            ['subgraph.execute (reviews)', 2],
          ] as const;

          for (const [operationName, count] of expectedExecuteChildren) {
            const matchingChildren = executeSpan!.children.filter(
              ({ span }) => span.operationName === operationName,
            );
            expect(matchingChildren).toHaveLength(count);
            for (const child of matchingChildren) {
              expect(child.children).toHaveLength(1);
              expect(child.children).toContainEqual(
                expect.objectContaining({
                  span: expect.objectContaining({
                    operationName: 'http.fetch',
                  }),
                }),
              );
            }
          }
        });
      });

      it('should report telemetry metrics correctly to jaeger using cli options', async () => {
        const serviceName = 'mesh-e2e-test-1';
        const { execute } = await gateway({
          runner,
          supergraph,
          env: {
            DISABLED_OPENTELEMETRY_SETUP: '1',
            OTEL_SERVICE_NAME: serviceName,
            OTEL_SERVICE_VERSION: '1.0.0',
          },
          args: [
            '--opentelemetry',
            urls[OTLP_EXPORTER_TYPE],
            '--opentelemetry-exporter-type',
            `otlp-${OTLP_EXPORTER_TYPE}`,
          ],
        });

        await expect(
          execute({ query: exampleSetup.query }),
        ).resolves.toMatchObject({
          data: {},
        });
        await expectJaegerTraces(serviceName, (traces) => {
          const relevantTraces = traces.data.filter((trace) =>
            trace.spans.some((span) => span.operationName === 'POST /graphql'),
          );
          expect(relevantTraces.length).toBe(1);
          const relevantTrace = relevantTraces[0];
          expect(relevantTrace).toBeDefined();
          expect(relevantTrace!.spans.length).toBe(20);

          const resource = relevantTrace!.processes['p1'];
          expect(resource).toBeDefined();

          const tags = resource!.tags.map(({ key, value }) => ({ key, value }));
          const tagKeys = resource!.tags.map(({ key }) => key);
          expect(resource!.serviceName).toBe(serviceName);
          [
            ['custom.resource', 'custom value'],
            ['otel.library.name', 'gateway'],
          ].forEach(([key, value]) => {
            return expect(tags).toContainEqual({ key, value });
          });

          if (
            process.env['E2E_GATEWAY_RUNNER'] === 'node' ||
            process.env['E2E_GATEWAY_RUNNER'] === 'docker'
          ) {
            const expectedTags = [
              'process.owner',
              'host.arch',
              'os.type',
              'service.instance.id',
            ];
            if (process.env['E2E_GATEWAY_RUNNER'] === 'docker') {
              expectedTags.push('container.id');
            }
            expectedTags.forEach((key) => {
              return expect(tagKeys).toContain(key);
            });
          }

          const spanTree = buildSpanTree(relevantTrace!.spans, 'POST /graphql');
          expect(spanTree).toBeDefined();

          expect(spanTree!.children).toHaveLength(1);

          const operationSpan = spanTree!.children[0];
          const expectedOperationChildren = [
            'graphql.parse',
            'graphql.validate',
            'graphql.context',
            'graphql.execute',
          ];
          expect(operationSpan!.children).toHaveLength(4);
          for (const operationName of expectedOperationChildren) {
            expect(operationSpan?.children).toContainEqual(
              expect.objectContaining({
                span: expect.objectContaining({ operationName }),
              }),
            );
          }

          const executeSpan = operationSpan!.children.find(
            ({ span }) => span.operationName === 'graphql.execute',
          );

          const expectedExecuteChildren = [
            ['subgraph.execute (accounts)', 2],
            ['subgraph.execute (products)', 2],
            ['subgraph.execute (inventory)', 1],
            ['subgraph.execute (reviews)', 2],
          ] as const;

          for (const [operationName, count] of expectedExecuteChildren) {
            const matchingChildren = executeSpan!.children.filter(
              ({ span }) => span.operationName === operationName,
            );
            expect(matchingChildren).toHaveLength(count);
            for (const child of matchingChildren) {
              expect(child.children).toHaveLength(1);
              expect(child.children).toContainEqual(
                expect.objectContaining({
                  span: expect.objectContaining({
                    operationName: 'http.fetch',
                  }),
                }),
              );
            }
          }
        });
      });

      it('should report parse failures correctly', async () => {
        const serviceName = 'mesh-e2e-test-2';
        const { execute } = await gateway({
          runner,
          supergraph,
          env: {
            OTLP_EXPORTER_TYPE,
            OTLP_EXPORTER_URL: urls[OTLP_EXPORTER_TYPE],
            OTEL_SERVICE_NAME: serviceName,
            OTEL_SERVICE_VERSION: '1.0.0',
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
          const relevantTrace = traces.data.find((trace) =>
            trace.spans.some((span) => span.operationName === 'POST /graphql'),
          );
          expect(relevantTrace).toBeDefined();
          expect(relevantTrace?.spans.length).toBe(3);

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
          runner,
          supergraph,
          env: {
            OTLP_EXPORTER_TYPE,
            OTLP_EXPORTER_URL: urls[OTLP_EXPORTER_TYPE],
            OTEL_SERVICE_NAME: serviceName,
            OTEL_SERVICE_VERSION: '1.0.0',
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
          const relevantTrace = traces.data.find((trace) =>
            trace.spans.some((span) => span.operationName === 'POST /graphql'),
          );
          expect(relevantTrace).toBeDefined();
          expect(relevantTrace?.spans.length).toBe(4);

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
          runner,
          supergraph,
          env: {
            OTLP_EXPORTER_TYPE,
            OTLP_EXPORTER_URL: urls[OTLP_EXPORTER_TYPE],
            OTEL_SERVICE_NAME: serviceName,
            OTEL_SERVICE_VERSION: '1.0.0',
          },
        });
        const path = '/non-existing';
        await fetch(`http://0.0.0.0:${port}${path}`).catch(() => {});
        await expectJaegerTraces(serviceName, (traces) => {
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
          runner,
          supergraph,
          env: {
            OTLP_EXPORTER_TYPE,
            OTLP_EXPORTER_URL: urls[OTLP_EXPORTER_TYPE],
            OTEL_SERVICE_NAME: serviceName,
            OTEL_SERVICE_VERSION: '1.0.0',
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

type TraceTreeNode = {
  span: JaegerTraceSpan;
  children: TraceTreeNode[];
};
function buildSpanTree(
  spans: JaegerTraceSpan[],
  rootName: string,
): TraceTreeNode | undefined {
  function buildNode(root: JaegerTraceSpan): TraceTreeNode {
    return {
      span: root,
      children: spans
        .filter((span) =>
          span.references.find(
            (ref) => ref.refType === 'CHILD_OF' && ref.spanID === root.spanID,
          ),
        )
        .map(buildNode),
    };
  }

  const root = spans.find((span) => span.operationName === rootName);
  return root && buildNode(root);
}

function printSpanTree(node: TraceTreeNode | undefined, prefix = ''): string {
  if (!node) {
    return '<empty span tree>';
  }
  const childrenSting = node.children
    .map((c): string => printSpanTree(c, prefix + '  |'))
    .join('');

  return `${prefix}-- ${node.span.operationName}\n${childrenSting}`;
}
