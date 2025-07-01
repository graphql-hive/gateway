import { openTelemetrySetup } from '@graphql-mesh/plugin-opentelemetry/setup';
import {
  SpanStatusCode,
  TextMapPropagator,
  TracerProvider,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenTelemetryContextExtension } from '../src/plugin';
import {
  buildTestGateway,
  disableAll,
  getContextManager,
  getPropagator,
  getResource,
  getSampler,
  getSpanProcessors,
  getTracerProvider,
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
        'service.name': '@graphql-mesh/plugin-opentelemetry',
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
          children: ['graphql.operation Anonymous'],
        },
        graphql: {
          root: 'graphql.operation Anonymous',
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
              root: 'graphql.operation Anonymous',
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
            plugins: (otelPlugin) => {
              const createSpan =
                (name: string) =>
                (
                  matcher: Parameters<(typeof otelPlugin)['getOtelContext']>[0],
                ) =>
                  otelPlugin
                    .getTracer()
                    .startSpan(name, {}, otelPlugin.getOtelContext(matcher))
                    .end();

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
              const createSpan =
                (name: string) =>
                ({ context: gqlCtx, executionRequest }: any) => {
                  const ctx: OpenTelemetryContextExtension =
                    gqlCtx ?? executionRequest?.context;
                  return ctx.openTelemetry.tracer
                    .startSpan(name, {}, ctx.openTelemetry.activeContext())
                    .end();
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
            .expectChild('graphql.operation Anonymous')
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
            plugins: (_, { fetch }) => {
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
    });
    it('should allow to create custom spans without explicit context passing', async () => {
      const expectedCustomSpans = {
        http: { root: 'POST /graphql', children: ['custom.request'] },
        graphql: {
          root: 'graphql.operation Anonymous',
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
        plugins: (otelPlugin) => {
          const createSpan = (name: string) => () =>
            otelPlugin.getTracer().startSpan(name).end();

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
        options: { traces: { spans: { http: false, schema: true } } },
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
});
