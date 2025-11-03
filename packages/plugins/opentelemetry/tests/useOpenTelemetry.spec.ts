import { Logger } from '@graphql-hive/logger';
import {
  hiveTracingSetup,
  HiveTracingSpanProcessor,
  OpenTelemetryLogWriter,
  openTelemetrySetup,
  SEMATTRS_GRAPHQL_DOCUMENT,
  SEMATTRS_GRAPHQL_OPERATION_NAME,
  SEMATTRS_GRAPHQL_OPERATION_TYPE,
  SEMATTRS_HIVE_GATEWAY_OPERATION_SUBGRAPH_NAMES,
  SEMATTRS_HIVE_GATEWAY_UPSTREAM_SUBGRAPH_NAME,
  SEMATTRS_HIVE_GRAPHQL_ERROR_CODES,
  SEMATTRS_HIVE_GRAPHQL_ERROR_COUNT,
  SEMATTRS_HIVE_GRAPHQL_OPERATION_HASH,
  SEMATTRS_HTTP_HOST,
  SEMATTRS_HTTP_METHOD,
  SEMATTRS_HTTP_ROUTE,
  SEMATTRS_HTTP_SCHEME,
  SEMATTRS_HTTP_STATUS_CODE,
  SEMATTRS_HTTP_URL,
  SEMATTRS_NET_HOST_NAME,
} from '@graphql-hive/plugin-opentelemetry/setup';
import {
  ROOT_CONTEXT,
  SpanStatusCode,
  TextMapPropagator,
  TracerProvider,
} from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  LoggerProvider,
  LogRecordExporter,
  LogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BasicTracerProvider,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  ParentBasedSampler,
  SimpleSpanProcessor,
  SpanProcessor,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { usingHiveRouterRuntime } from '~internal/env';
import { beforeEach, describe, expect, it, MockedFunction, vi } from 'vitest';
import { hive } from '../src/api';
import type {
  ContextMatcher,
  OpenTelemetryContextExtension,
} from '../src/plugin';
import {
  buildTestGateway,
  disableAll,
  getContextManager,
  getPropagator,
  getResource,
  getSampler,
  getSpanProcessors,
  getTracerProvider,
  MockLogRecordExporter,
  setupOtelForTests,
  spanExporter,
} from './utils';

describe('useOpenTelemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spanExporter.reset();
  });

  describe('setup', () => {
    beforeEach(() => {
      // Unregister all global OTEL apis, so that each tests can check for different setups
      disableAll();
    });

    it('should setup OTEL with sain default', () => {
      openTelemetrySetup({
        contextManager: new AsyncLocalStorageContextManager(),
        traces: {
          exporter: new OTLPTraceExporter(),
        },
      });

      // Check context manager
      expect(getTracerProvider()).toBeInstanceOf(BasicTracerProvider);
      expect(getContextManager()).toBeInstanceOf(
        AsyncLocalStorageContextManager,
      );

      // Check processor. Should be a batched HTTP OTLP exporter
      const processors = getSpanProcessors();
      expect(processors).toHaveLength(1);
      expect(processors![0]).toBeInstanceOf(BatchSpanProcessor);
      const processor = processors![0] as BatchSpanProcessor;
      // @ts-ignore access private field
      const exporter = processor._exporter as OTLPTraceExporter;
      expect(exporter).toBeInstanceOf(OTLPTraceExporter);

      // Check Sampler
      expect(getSampler()).toBeInstanceOf(AlwaysOnSampler);

      // Check Propagators
      const propagator = getPropagator();
      expect(propagator).toBeInstanceOf(CompositePropagator);
      // @ts-expect-error Access of private field
      const propagators = propagator._propagators as TextMapPropagator[];
      expect(propagators).toContainEqual(expect.any(W3CBaggagePropagator));
      expect(propagators).toContainEqual(expect.any(W3CTraceContextPropagator));

      const resource = getResource();
      expect(resource?.attributes).toMatchObject({
        'service.name': '@graphql-hive/plugin-opentelemetry',
      });
    });

    it('should register a custom TracerProvider', () => {
      const tracerProvider: TracerProvider & { register: () => void } = {
        register: vi.fn(),
        getTracer: vi.fn(),
      };

      openTelemetrySetup({
        contextManager: null,
        traces: {
          tracerProvider,
        },
      });

      expect(tracerProvider.register).toHaveBeenCalled();
    });

    it('should not register a contextManager when passed null', () => {
      const before = getContextManager();

      openTelemetrySetup({
        contextManager: null,
      });

      expect(getContextManager()).toBe(before);
    });

    it('should register a console exporter', () => {
      openTelemetrySetup({
        contextManager: null,
        traces: {
          console: true,
        },
      });

      const processors = getSpanProcessors();
      expect(processors).toHaveLength(1);
      // @ts-ignore access of private field
      const exporter = processors![0]!._exporter;
      expect(exporter).toBeInstanceOf(ConsoleSpanExporter);
    });

    it('should register a console exporter even if an exporter is given', () => {
      openTelemetrySetup({
        contextManager: null,
        traces: {
          exporter: new OTLPTraceExporter(),
          console: true,
        },
      });

      const processors = getSpanProcessors();
      expect(processors).toHaveLength(2);
      // @ts-ignore access of private field
      const exporter = processors![1]!._exporter;
      expect(exporter).toBeInstanceOf(ConsoleSpanExporter);
    });

    it('should register a console exporter even if a list of processors is given', () => {
      openTelemetrySetup({
        contextManager: null,
        traces: {
          processors: [new SimpleSpanProcessor(new OTLPTraceExporter())],
          console: true,
        },
      });

      const processors = getSpanProcessors();
      expect(processors).toHaveLength(2);
      // @ts-ignore access of private field
      const exporter = processors![1]!._exporter;
      expect(exporter).toBeInstanceOf(ConsoleSpanExporter);
    });

    it('should register a custom resource', () => {
      openTelemetrySetup({
        resource: resourceFromAttributes({
          'service.name': 'test-name',
          'service.version': 'test-version',
          'custom-attribute': 'test-value',
        }),
        traces: {
          console: true,
        },
        contextManager: null,
      });

      expect(getResource()?.attributes).toMatchObject({
        'service.name': 'test-name',
        'service.version': 'test-version',
        'custom-attribute': 'test-value',
      });
    });

    it.skipIf(!vi.stubEnv)(
      'should get service name and version from env var',
      () => {
        vi.stubEnv('OTEL_SERVICE_NAME', 'test-name');
        vi.stubEnv('OTEL_SERVICE_VERSION', 'test-version');

        openTelemetrySetup({
          traces: { console: true },
          contextManager: null,
        });

        expect(getResource()?.attributes).toMatchObject({
          'service.name': 'test-name',
          'service.version': 'test-version',
        });

        vi.unstubAllEnvs();
      },
    );

    it('should allow to register a custom sampler', () => {
      openTelemetrySetup({
        traces: {
          console: true,
        },
        contextManager: null,
        sampler: new AlwaysOffSampler(),
      });

      expect(getSampler()).toBeInstanceOf(AlwaysOffSampler);
    });

    it('should allow to configure a rate sampling strategy', () => {
      openTelemetrySetup({
        contextManager: null,
        traces: { console: true },
        samplingRate: 0.1,
      });

      const sampler = getSampler();
      expect(sampler).toBeInstanceOf(ParentBasedSampler);

      // @ts-ignore access private field
      const rootSampler = sampler._root;
      expect(rootSampler).toBeInstanceOf(TraceIdRatioBasedSampler);

      // @ts-ignore access private field
      const rate = rootSampler._ratio;
      expect(rate).toBe(0.1);
    });

    it('should allow to disable batching', () => {
      openTelemetrySetup({
        contextManager: null,
        traces: {
          exporter: new OTLPTraceExporter(),
          batching: false,
        },
      });

      const [processor] = getSpanProcessors()!;
      expect(processor).toBeInstanceOf(SimpleSpanProcessor);
    });

    it('should allow to configure batching', () => {
      openTelemetrySetup({
        contextManager: null,
        traces: {
          exporter: new OTLPTraceExporter(),
          batching: {
            maxExportBatchSize: 1,
            maxQueueSize: 2,
            scheduledDelayMillis: 3,
            exportTimeoutMillis: 4,
          },
        },
      });

      const [processor] = getSpanProcessors()!;
      expect(processor).toBeInstanceOf(BatchSpanProcessor);
      expect(processor).toMatchObject({
        _maxExportBatchSize: 1,
        _maxQueueSize: 2,
        _scheduledDelayMillis: 3,
        _exportTimeoutMillis: 4,
      });
    });

    it('should allow to manually define processor', () => {
      const processor = {} as SpanProcessor;
      openTelemetrySetup({
        contextManager: null,
        traces: {
          processors: [processor],
        },
      });

      const processors = getSpanProcessors();
      expect(processors).toHaveLength(1);
      expect(getSpanProcessors()![0]).toBe(processor);
    });

    it('should allow to customize propagators', () => {
      const propagator = {} as TextMapPropagator;
      openTelemetrySetup({
        contextManager: null,
        propagators: [propagator],
      });

      expect(getPropagator()).toBe(propagator);
    });

    it('should allow to customize propagators', () => {
      const before = getPropagator();

      openTelemetrySetup({
        contextManager: null,
        propagators: [],
      });

      expect(getPropagator()).toBe(before);
    });

    it('should allow to customize limits', () => {
      openTelemetrySetup({
        contextManager: null,
        traces: {
          console: true,
          spanLimits: {
            attributeCountLimit: 1,
            attributePerEventCountLimit: 2,
            attributePerLinkCountLimit: 3,
            attributeValueLengthLimit: 4,
            eventCountLimit: 5,
            linkCountLimit: 6,
          },
        },
        generalLimits: {
          attributeCountLimit: 7,
          attributeValueLengthLimit: 8,
        },
      });

      // @ts-ignore access private field
      const registeredConfig = getTracerProvider()._config;
      expect(registeredConfig).toMatchObject({
        spanLimits: {
          attributeCountLimit: 1,
          attributePerEventCountLimit: 2,
          attributePerLinkCountLimit: 3,
          attributeValueLengthLimit: 4,
          eventCountLimit: 5,
          linkCountLimit: 6,
        },
        generalLimits: {
          attributeCountLimit: 7,
          attributeValueLengthLimit: 8,
        },
      });
    });

    it('should setup Hive Tracing', () => {
      hiveTracingSetup({
        contextManager: new AsyncLocalStorageContextManager(),
        target: 'target',
        accessToken: 'access-token',
      });

      const processors = getSpanProcessors();
      expect(processors).toHaveLength(1);
      expect(processors![0]).toBeInstanceOf(HiveTracingSpanProcessor);
      const processor = processors![0] as HiveTracingSpanProcessor;
      // @ts-expect-error Access of private field
      const subProcessor = processor.processor as BatchSpanProcessor;
      expect(subProcessor).toBeInstanceOf(BatchSpanProcessor);
      // @ts-expect-error Access of private field
      const exporter = subProcessor._exporter as OTLPTraceExporter;
      expect(exporter).toBeInstanceOf(OTLPTraceExporter);
      // @ts-expect-error Access of private field
      expect(exporter._delegate._transport._transport._parameters.url).toBe(
        'http://localhost:4318/v1/traces',
      );
    });
  });

  describe('tracing', () => {
    beforeEach(() => {
      // Register testing OTEL api with a custom Span processor and an Async Context Manager
      disableAll();
      setupOtelForTests();
    });

    describe.each([
      { name: 'with context manager', useContextManager: undefined },
      { name: 'without context manager', useContextManager: false as const },
    ])('$name', ({ useContextManager }) => {
      const buildTestGatewayForCtx: typeof buildTestGateway = (options) =>
        buildTestGateway({
          ...options,
          options: { useContextManager, ...options?.options },
        });

      const expected = {
        http: {
          root: 'POST /graphql',
          children: ['graphql.operation'],
        },
        graphql: {
          root: 'graphql.operation',
          children: [
            'graphql.parse',
            'graphql.validate',
            'graphql.context',
            'graphql.execute',
          ],
        },
        execute: {
          root: 'graphql.execute',
          children: ['subgraph.execute (upstream)'],
        },
        subgraphExecute: {
          root: 'subgraph.execute (upstream)',
          children: ['http.fetch'],
        },
      };

      const allExpectedSpans: string[] = [
        expected.http.root,
        ...Object.values(expected).flatMap(({ children }) => children),
      ];

      describe('span parenting', () => {
        it('should register a complete span tree $name', async () => {
          await using gateway = await buildTestGatewayForCtx();
          await gateway.query();

          for (const { root, children } of Object.values(expected)) {
            const spanTree = spanExporter.assertRoot(root);
            children.forEach(spanTree.expectChild);
          }
        });

        it('should allow to report custom spans', async () => {
          const expectedCustomSpans = {
            http: { root: 'POST /graphql', children: ['custom.request'] },
            graphql: {
              root: 'graphql.operation',
              children: ['custom.operation'],
            },
            parse: { root: 'graphql.parse', children: ['custom.parse'] },
            validate: {
              root: 'graphql.validate',
              children: ['custom.validate'],
            },
            context: { root: 'graphql.context', children: ['custom.context'] },
            execute: { root: 'graphql.execute', children: ['custom.execute'] },
            subgraphExecute: {
              root: 'subgraph.execute (upstream)',
              children: ['custom.subgraph'],
            },
            fetch: { root: 'http.fetch', children: ['custom.fetch'] },
          };

          await using gateway = await buildTestGatewayForCtx({
            plugins: () => {
              const createSpan =
                (name: string) => (matcher: ContextMatcher) => {
                  hive.tracer
                    ?.startSpan(name, {}, hive.getActiveContext(matcher))
                    .end();
                };
              return [
                {
                  onRequest: createSpan('custom.request'),
                  onParams: createSpan('custom.operation'),
                  onParse: createSpan('custom.parse'),
                  onValidate: createSpan('custom.validate'),
                  onContextBuilding: createSpan('custom.context'),
                  onExecute: createSpan('custom.execute'),
                  onSubgraphExecute: createSpan('custom.subgraph'),
                  onFetch: createSpan('custom.fetch'),
                },
              ];
            },
          });
          await gateway.query();

          for (const { root, children } of Object.values(expectedCustomSpans)) {
            const spanTree = spanExporter.assertRoot(root);
            children.forEach(spanTree.expectChild);
          }
        });
        it('should allow to report custom spans using graphql context', async () => {
          const expectedCustomSpans = {
            parse: { root: 'graphql.parse', children: ['custom.parse'] },
            validate: {
              root: 'graphql.validate',
              children: ['custom.validate'],
            },
            context: { root: 'graphql.context', children: ['custom.context'] },
            execute: { root: 'graphql.execute', children: ['custom.execute'] },
          };

          await using gateway = await buildTestGatewayForCtx({
            plugins: () => {
              const createSpan = (name: string) => (payload: any) => {
                try {
                  const { context: gqlCtx, executionRequest } = payload;
                  const ctx: OpenTelemetryContextExtension =
                    gqlCtx ?? executionRequest?.context;
                  return ctx.openTelemetry.tracer
                    .startSpan(name, {}, ctx.openTelemetry.getActiveContext())
                    .end();
                } catch (err) {
                  console.error(err);
                }
              };

              return [
                {
                  onParse: createSpan('custom.parse'),
                  onValidate: createSpan('custom.validate'),
                  onContextBuilding: createSpan('custom.context'),
                  onExecute: createSpan('custom.execute'),
                },
              ];
            },
          });
          await gateway.query();

          for (const { root, children } of Object.values(expectedCustomSpans)) {
            const spanTree = spanExporter.assertRoot(root);
            children.forEach(spanTree.expectChild);
          }
        });

        it('should report retries of execution requests', async () => {
          let attempts = 0;
          await using gateway = await buildTestGatewayForCtx({
            gatewayOptions: {
              logging: true,
              upstreamRetry: {
                maxRetries: 2,
                retryDelay: 1,
                retryDelayFactor: 1,
              },
            },
            fetch:
              (upstreamFetch) =>
              (...args) => {
                attempts = (attempts + 1) % 3;
                return attempts === 0
                  ? upstreamFetch(...args)
                  : new Response('', { status: 500 });
              },
          });
          await gateway.query();
          const rootSpan = spanExporter.assertRoot('POST /graphql');
          const subgraphSpan = rootSpan
            .expectChild('graphql.operation')
            .expectChild('graphql.execute')
            .expectChild('subgraph.execute (upstream)');

          for (let i = 0; i < 3; i++) {
            const span = subgraphSpan.children[i]?.span;
            expect(span).toBeDefined();
            expect(span!.name).toBe('http.fetch');
            if (i > 0) {
              expect(span!.attributes).toMatchObject({
                'http.request.resend_count': i,
              });
            }
            expect(span?.status.code).toBe(
              i < 2 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
            );
          }
        });
      });

      describe('span configuration', () => {
        it('should not trace http requests if disabled', async () => {
          await using gateway = await buildTestGatewayForCtx({
            options: {
              traces: {
                spans: { http: false, schema: false },
              },
            },
          });
          await gateway.query();

          allExpectedSpans.forEach(spanExporter.assertNoSpanWithName);
        });

        it('should not trace graphql operation if disable', async () => {
          await using gateway = await buildTestGatewayForCtx({
            options: {
              traces: {
                spans: { graphql: false, schema: false },
              },
            },
          });
          await gateway.query();

          const httpSpan = spanExporter.assertRoot(expected.http.root);
          expected.http.children
            .filter((name) => name != expected.graphql.root)
            .forEach(httpSpan.expectChild);

          [
            expected.graphql.root,
            ...expected.graphql.children,
            ...expected.execute.children,
            ...expected.subgraphExecute.children,
          ].forEach(spanExporter.assertNoSpanWithName);
        });

        it('should not trace parse if disable', async () => {
          await using gateway = await buildTestGatewayForCtx({
            options: {
              traces: {
                spans: { graphqlParse: false },
              },
            },
          });
          await gateway.query();

          spanExporter.assertNoSpanWithName('graphql.parse');

          allExpectedSpans
            .filter((name) => name != 'graphql.parse')
            .forEach(spanExporter.assertSpanWithName);
        });

        it('should not trace validate if disabled', async () => {
          await using gateway = await buildTestGatewayForCtx({
            options: {
              traces: {
                spans: { graphqlValidate: false },
              },
            },
          });
          await gateway.query();

          spanExporter.assertNoSpanWithName('graphql.validate');

          allExpectedSpans
            .filter((name) => name != 'graphql.validate')
            .forEach(spanExporter.assertSpanWithName);
        });

        it('should not trace context building if disabled', async () => {
          await using gateway = await buildTestGatewayForCtx({
            options: {
              traces: {
                spans: { graphqlContextBuilding: false },
              },
            },
          });
          await gateway.query();

          spanExporter.assertNoSpanWithName('graphql.context');

          allExpectedSpans
            .filter((name) => name != 'graphql.context')
            .forEach(spanExporter.assertSpanWithName);
        });

        it('should not trace execute if disabled', async () => {
          await using gateway = await buildTestGatewayForCtx({
            options: {
              traces: {
                spans: { graphqlExecute: false, schema: false },
              },
            },
          });
          await gateway.query();

          [
            expected.execute.root,
            ...expected.execute.children,
            ...expected.subgraphExecute.children,
          ].forEach(spanExporter.assertNoSpanWithName);

          [
            expected.http.root,
            ...expected.http.children,
            ...expected.graphql.children,
          ]
            .filter((name) => name != 'graphql.execute')
            .forEach(spanExporter.assertSpanWithName);
        });

        it('should not trace subgraph execute if disabled', async () => {
          await using gateway = await buildTestGatewayForCtx({
            options: {
              traces: {
                spans: { subgraphExecute: false, schema: false },
              },
            },
          });
          await gateway.query();

          [
            expected.subgraphExecute.root,
            ...expected.subgraphExecute.children,
          ].forEach(spanExporter.assertNoSpanWithName);

          [
            expected.http.root,
            ...expected.http.children,
            ...expected.graphql.children,
            ...expected.execute.children,
          ]
            .filter((name) => name !== 'subgraph.execute (upstream)')
            .forEach(spanExporter.assertSpanWithName);
        });

        it('should not trace fetch if disabled', async () => {
          await using gateway = await buildTestGatewayForCtx({
            options: {
              traces: {
                spans: { upstreamFetch: false },
              },
            },
          });
          await gateway.query();

          spanExporter.assertNoSpanWithName('http.fetch');

          allExpectedSpans
            .filter((name) => name !== 'http.fetch')
            .forEach(spanExporter.assertSpanWithName);
        });

        it('should not trace fetch if disabled', async () => {
          await using gateway = await buildTestGatewayForCtx({
            plugins: ({ fetch }) => {
              return [
                {
                  onPluginInit() {
                    fetch('http://foo.bar', {});
                  },
                },
              ];
            },
          });
          await gateway.query();

          const initSpan = spanExporter.assertRoot('gateway.initialization');
          initSpan.expectChild('http.fetch');
        });
      });

      it('should handle validation error with hive processor', async () => {
        disableAll();
        const traceProvider = new BasicTracerProvider({
          spanProcessors: [
            new HiveTracingSpanProcessor({
              processor: new SimpleSpanProcessor(spanExporter),
            }),
          ],
        });
        setupOtelForTests({ traceProvider });
        await using gateway = await buildTestGatewayForCtx({
          plugins: ({ fetch }) => {
            return [
              {
                onPluginInit() {
                  fetch('http://foo.bar', {});
                },
              },
            ];
          },
        });
        await gateway.query({
          body: { query: 'query test{ unknown }' },
          shouldReturnErrors: true,
        });

        const operationSpan = spanExporter.assertRoot('graphql.operation test');
        expect(operationSpan.span.attributes['graphql.operation.name']).toBe(
          'test',
        );
        expect(operationSpan.span.attributes['graphql.operation.type']).toBe(
          'query',
        );
        expect(
          operationSpan.span.attributes[SEMATTRS_HIVE_GRAPHQL_ERROR_COUNT],
        ).toBe(1);
      });
    });

    it('should allow to create custom spans without explicit context passing', async () => {
      const expectedCustomSpans = {
        http: { root: 'POST /graphql', children: ['custom.request'] },
        graphql: {
          root: 'graphql.operation',
          children: ['custom.operation'],
        },
        parse: { root: 'graphql.parse', children: ['custom.parse'] },
        validate: {
          root: 'graphql.validate',
          children: ['custom.validate'],
        },
        context: { root: 'graphql.context', children: ['custom.context'] },
        execute: { root: 'graphql.execute', children: ['custom.execute'] },
        subgraphExecute: {
          root: 'subgraph.execute (upstream)',
          children: ['custom.subgraph'],
        },
        fetch: { root: 'http.fetch', children: ['custom.fetch'] },
      };

      await using gateway = await buildTestGateway({
        plugins: () => {
          const createSpan = (name: string) => () =>
            hive.tracer?.startSpan(name).end();

          return [
            {
              onRequest: createSpan('custom.request'),
              onParams: createSpan('custom.operation'),
              onParse: createSpan('custom.parse'),
              onValidate: createSpan('custom.validate'),
              onContextBuilding: createSpan('custom.context'),
              onExecute: createSpan('custom.execute'),
              onSubgraphExecute: createSpan('custom.subgraph'),
              onFetch: createSpan('custom.fetch'),
            },
          ];
        },
      });
      await gateway.query();

      for (const { root, children } of Object.values(expectedCustomSpans)) {
        const spanTree = spanExporter.assertRoot(root);
        children.forEach(spanTree.expectChild);
      }
    });

    it('should have a response cache attribute', async () => {
      function checkCacheAttributes(attrs: {
        http: 'hit' | 'miss';
        operation?: 'hit' | 'miss';
      }) {
        const { span: httpSpan } = spanExporter.assertRoot('POST /graphql');
        const operationSpan = spanExporter.spans.find(({ name }) =>
          name.startsWith('graphql.operation'),
        );
        expect(httpSpan.attributes['gateway.cache.response_cache']).toBe(
          attrs.http,
        );
        if (attrs.operation) {
          expect(operationSpan).toBeDefined();
          expect(
            operationSpan!.attributes['gateway.cache.response_cache'],
          ).toBe(attrs.operation);
        }
      }
      await using gateway = await buildTestGateway({
        gatewayOptions: {
          cache: await import('@graphql-mesh/cache-localforage').then(
            ({ default: Cache }) => new Cache(),
          ),
          responseCaching: {
            session: () => '1',
          },
        },
      });
      await gateway.query();

      checkCacheAttributes({ http: 'miss', operation: 'miss' });

      spanExporter.reset();
      await gateway.query();

      checkCacheAttributes({ http: 'miss', operation: 'hit' });

      spanExporter.reset();
      const response = await gateway.fetch('http://gateway/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'If-None-Match':
            'c2f6fb105ef60ccc99dd6725b55939742e69437d4f85d52bf4664af3799c49fa',
          'If-Modified-Since': new Date(),
        },
      });
      expect(response.status).toBe(304);

      checkCacheAttributes({ http: 'hit' }); // There is no graphql operation span when cached by HTTP
    });

    it('should register schema loading span', async () => {
      await using gateway = await buildTestGateway({
        gatewayOptions: {
          // @ts-expect-error Suppress the default supergraph from test setup
          supergraph: undefined,
          proxy: {
            endpoint: 'https://example.com/graphql',
          },
        },
        options: {
          traces: { spans: { http: false, schema: true } },
        },
      });
      await gateway.query();

      const schemaSpan = spanExporter.assertRoot('gateway.schema');

      const descendants = schemaSpan.descendants.map(({ name }) => name);

      expect(descendants).toEqual([
        'gateway.schema',
        'subgraph.execute (upstream)',
        'http.fetch',
      ]);
    });
  });

  describe('logging', () => {
    beforeEach(() => {
      disableAll();
    });

    describe('setup', () => {
      beforeEach(() => {
        disableAll();
      });

      it('should allow to use a given logger', () => {
        const logger = { emit: vi.fn() };
        const log = new Logger({
          writers: [
            new OpenTelemetryLogWriter({
              logger,
            }),
          ],
        });

        log.info({ foo: 'bar' }, 'test');

        expect(logger.emit).toHaveBeenCalledWith({
          severityText: 'info',
          severityNumber: SeverityNumber.INFO,
          body: 'test',
          attributes: { foo: 'bar' },
          context: ROOT_CONTEXT,
        });
      });

      it('should allow to use a provider', () => {
        const processor: LogRecordProcessor = {
          onEmit: vi.fn(),
          forceFlush: vi.fn(),
          shutdown: vi.fn(),
        };
        const provider = new LoggerProvider({ processors: [processor] });
        const log = new Logger({
          writers: [
            new OpenTelemetryLogWriter({
              provider,
            }),
          ],
        });

        log.info({ foo: 'bar' }, 'test');

        expect(processor.onEmit).toHaveBeenCalled();
        expect(
          (processor.onEmit as MockedFunction<LogRecordProcessor['onEmit']>)
            .mock.calls[0]![0],
        ).toMatchObject({
          severityText: 'info',
          severityNumber: SeverityNumber.INFO,
          body: 'test',
          attributes: { foo: 'bar' },
        });
      });

      it('should allow to provide a processor', () => {
        const processor: LogRecordProcessor = {
          onEmit: vi.fn(),
          forceFlush: vi.fn(),
          shutdown: vi.fn(),
        };
        const log = new Logger({
          writers: [
            new OpenTelemetryLogWriter({
              processors: [processor],
            }),
          ],
        });

        log.info({ foo: 'bar' }, 'test');

        expect(processor.onEmit).toHaveBeenCalled();
        expect(
          (processor.onEmit as MockedFunction<LogRecordProcessor['onEmit']>)
            .mock.calls[0]![0],
        ).toMatchObject({
          severityText: 'info',
          severityNumber: SeverityNumber.INFO,
          body: 'test',
          attributes: { foo: 'bar' },
        });
      });

      it('should allow to use an exporter', () => {
        const exportFn = vi.fn<LogRecordExporter['export']>();
        const exporter: LogRecordExporter = {
          export: exportFn,
          shutdown: vi.fn(),
        };

        const log = new Logger({
          writers: [
            new OpenTelemetryLogWriter({
              exporter,
              batching: false,
            }),
          ],
        });

        log.info({ foo: 'bar' }, 'test');

        expect(exportFn).toHaveBeenCalled();
        expect(exportFn.mock.calls[0]![0]).toMatchObject([
          {
            severityText: 'info',
            severityNumber: SeverityNumber.INFO,
            body: 'test',
            attributes: { foo: 'bar' },
          },
        ]);
      });
    });

    describe('logs correlation with span', () => {
      const hooks = [
        'onRequest',
        'onParams',
        'onParse',
        'onContextBuilding',
        'onValidate',
        'onExecute',
        'onSubgraphExecute',
        'onFetch',
      ];
      const exporter = new MockLogRecordExporter();

      const buildTestGatewayForLogs = ({
        useContextManager,
      }: { useContextManager?: boolean } = {}) =>
        buildTestGateway({
          options: { useContextManager },
          gatewayOptions: {
            logging: new Logger({
              writers: [
                new OpenTelemetryLogWriter({
                  useContextManager,
                  exporter,
                  batching: false,
                }),
              ],
            }),
          },
          plugins: () => {
            const createHook = (name: string): any => ({
              [name]: (payload: any) => {
                const log =
                  // logger for the subgraph execution request
                  payload.executionRequest?.context.log ??
                  // logger before/outside graphql operation
                  payload.serverContext?.log ??
                  // graphql operation logger
                  payload.context?.log;
                const phase =
                  (name as string).charAt(2).toLowerCase() +
                  (name as string).substring(3);
                log.info({ phase }, name);
              },
            });

            let plugin = {};
            for (let hook of hooks) {
              plugin = { ...plugin, ...createHook(hook) };
            }

            return [plugin];
          },
        });

      beforeEach(() => {
        disableAll();
        exporter.reset();
      });

      it('should correlate logs with spans with context manager', async () => {
        setupOtelForTests();

        await using gateway = await buildTestGatewayForLogs();
        await gateway.query();

        const expectedLogs = {
          'POST /graphql': 'onRequest',
          'graphql.operation': 'onParams',
          'graphql.parse': 'onParse',
          'graphql.validate': 'onValidate',
          'graphql.context': 'onContextBuilding',
          'graphql.execute': 'onExecute',
          'subgraph.execute (upstream)': 'onSubgraphExecute',
          'http.fetch': 'onFetch',
        };

        Object.entries(expectedLogs).forEach(([spanName, hook]) => {
          const span = spanExporter.assertSpanWithName(spanName);
          const logs = exporter.getLogsForSpan(span.id);
          const phase = hook.charAt(2).toLowerCase() + hook.substring(3);
          // @ts-expect-error Access to private field. public `body` seems to not be readable (returns undefined)
          const log = logs.find((log) => log._body === hook);
          if (!log) {
            console.error(
              `${hook} log not found. Logs for ${spanName} were`,
              logs,
            );
            throw new Error(`${hook} log not found`);
          }

          expect(log.attributes).toMatchObject({ phase });
        });
      });

      it('should correlate logs with root http span without a context manager', async () => {
        setupOtelForTests({ contextManager: false });

        await using gateway = await buildTestGatewayForLogs({
          useContextManager: false,
        });
        await gateway.query();

        const httpSpan = spanExporter.assertRoot('POST /graphql');
        const logs = exporter.getLogsForSpan(httpSpan.span.id);
        for (let hook of hooks) {
          const phase = hook.charAt(2).toLowerCase() + hook.substring(3);
          // @ts-expect-error access to private field
          const log = logs.find(({ _body: body }) => body === hook);
          if (!log) {
            console.error(
              `missing log for ${hook}. Logs were:`,
              exporter.records,
            );
            throw new Error(`missing log for ${hook}`);
          }
          expect(log).toBeDefined();
          expect(log?.attributes).toMatchObject({ phase });
        }
      });
    });
  });

  describe('hive tracing', () => {
    beforeEach(() => {
      // Register testing OTEL api with a custom Span processor and an Async Context Manager
      disableAll();
      hiveTracingSetup({
        target: 'test-target',
        contextManager: new AsyncLocalStorageContextManager(),
        processor: new SimpleSpanProcessor(spanExporter),
      });
    });

    it('should not report http spans', async () => {
      await using gateway = await buildTestGateway();
      await gateway.query();

      spanExporter.assertNoSpanWithName('POST /graphql');
    });

    it('should have all attributes required by Hive Tracing', async () => {
      await using gateway = await buildTestGateway({
        fetch: () => () => new Response(null, { status: 500 }),
      });
      await gateway.query({
        shouldReturnErrors: true,
        body: { query: 'query testOperation { hello }' },
        headers: {
          'x-graphql-client-name': 'test-client-name',
          'x-graphql-client-version': 'test-client-version',
        },
      });

      const operationSpan = spanExporter.assertRoot(
        'graphql.operation testOperation',
      );

      expect(operationSpan.span.resource.attributes).toMatchObject({
        'hive.target_id': 'test-target',
      });

      // Root span
      expect(operationSpan.span.attributes).toMatchObject({
        // HTTP Attributes
        [SEMATTRS_HTTP_METHOD]: 'POST',
        [SEMATTRS_HTTP_URL]: 'http://localhost:4000/graphql',
        [SEMATTRS_HTTP_ROUTE]: '/graphql',
        [SEMATTRS_HTTP_SCHEME]: 'http:',
        [SEMATTRS_NET_HOST_NAME]: 'localhost',
        [SEMATTRS_HTTP_HOST]: 'localhost:4000',
        [SEMATTRS_HTTP_STATUS_CODE]: usingHiveRouterRuntime()
          ? // 500 because there wont be a data field with hive router query planner and it's a application graphql response json
            500
          : 200,

        // Hive specific
        ['hive.client.name']: 'test-client-name',
        ['hive.client.version']: 'test-client-version',
        ['hive.graphql']: true,

        // Operation Attributes
        [SEMATTRS_GRAPHQL_DOCUMENT]: 'query testOperation{hello}',
        [SEMATTRS_GRAPHQL_OPERATION_NAME]: 'testOperation',
        [SEMATTRS_GRAPHQL_OPERATION_TYPE]: 'query',
        [SEMATTRS_HIVE_GRAPHQL_OPERATION_HASH]:
          'd40f732de805d03db6284b9b8c6c6f0b',
        [SEMATTRS_HIVE_GRAPHQL_ERROR_COUNT]: 1,
        [SEMATTRS_HIVE_GRAPHQL_ERROR_CODES]: ['DOWNSTREAM_SERVICE_ERROR'],

        // Execution Attributes
        [SEMATTRS_HIVE_GATEWAY_OPERATION_SUBGRAPH_NAMES]: ['upstream'],
      });

      // Subgraph Execution Span
      expect(
        spanExporter.assertRoot('subgraph.execute (upstream)').span.attributes,
      ).toMatchObject({
        // HTTP Attributes
        [SEMATTRS_HTTP_METHOD]: 'POST',
        [SEMATTRS_HTTP_URL]: 'http://localhost:4011/graphql',
        [SEMATTRS_HTTP_ROUTE]: '/graphql',
        [SEMATTRS_HTTP_SCHEME]: 'http:',
        [SEMATTRS_NET_HOST_NAME]: 'localhost',
        [SEMATTRS_HTTP_HOST]: 'localhost:4011',
        [SEMATTRS_HTTP_STATUS_CODE]: 500,

        // Operation Attributes
        ...(usingHiveRouterRuntime()
          ? {
              [SEMATTRS_GRAPHQL_DOCUMENT]: '{hello}',
              [SEMATTRS_GRAPHQL_OPERATION_TYPE]: 'query',
            }
          : {
              [SEMATTRS_GRAPHQL_DOCUMENT]:
                'query testOperation{__typename hello}',
              [SEMATTRS_GRAPHQL_OPERATION_TYPE]: 'query',
              [SEMATTRS_GRAPHQL_OPERATION_NAME]: 'testOperation',
            }),

        // Federation attributes
        [SEMATTRS_HIVE_GATEWAY_UPSTREAM_SUBGRAPH_NAME]: 'upstream',
      });
    });
  });
});
