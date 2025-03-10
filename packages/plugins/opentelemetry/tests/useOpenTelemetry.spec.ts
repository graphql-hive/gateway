import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { createSchema, createYoga } from 'graphql-yoga';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { OpenTelemetryContextExtension } from '../src/plugin';
import { buildTestGateway, MockSpanExporter } from './utlis';

let mockModule = vi.mock;
if (globalThis.Bun) {
  mockModule = require('bun:test').mock.module;
}
const mockRegisterProvider = vi.fn();
let gw: typeof import('../../../runtime/src');
describe('useOpenTelemetry', () => {
  mockModule('@opentelemetry/sdk-trace-web', () => ({
    WebTracerProvider: vi.fn(() => ({ register: mockRegisterProvider })),
  }));

  let traceProvider: WebTracerProvider;
  const spanExporter = new MockSpanExporter();
  beforeAll(async () => {
    gw = await import('../../../runtime/src');
    traceProvider = new WebTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(spanExporter)],
    });
    traceProvider.register({
      contextManager: new AsyncLocalStorageContextManager(),
    });
  });
  afterAll(async () => {
    traceProvider.shutdown();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    spanExporter.reset();
  });
  describe('initialization', () => {
    it('initializes and starts a new provider by default', async () => {
      const { useOpenTelemetry } = await import('../src');
      await using upstream = createYoga({
        schema: createSchema({
          typeDefs: /* GraphQL */ `
            type Query {
              hello: String
            }
          `,
          resolvers: {
            Query: {
              hello: () => 'World',
            },
          },
        }),
        logging: false,
      });

      await using gateway = gw.createGatewayRuntime({
        proxy: {
          endpoint: 'https://example.com/graphql',
        },
        plugins: (ctx) => [
          gw.useCustomFetch(
            // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
            upstream.fetch,
          ),
          useOpenTelemetry({
            exporters: [],
            ...ctx,
          }),
        ],
        logging: false,
      });

      const response = await gateway.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: /* GraphQL */ `
            query {
              hello
            }
          `,
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data?.hello).toBe('World');
      expect(mockRegisterProvider).toHaveBeenCalledTimes(1);
    });

    it('does not initialize a new provider and does not start the provided provider instance', async () => {
      const { useOpenTelemetry } = await import('../src');
      await using upstream = createYoga({
        schema: createSchema({
          typeDefs: /* GraphQL */ `
            type Query {
              hello: String
            }
          `,
          resolvers: {
            Query: {
              hello: () => 'World',
            },
          },
        }),
        logging: false,
      });

      await using gateway = gw.createGatewayRuntime({
        proxy: {
          endpoint: 'https://example.com/graphql',
        },
        plugins: (ctx) => [
          gw.useCustomFetch(
            // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
            upstream.fetch,
          ),
          useOpenTelemetry({ initializeNodeSDK: false, ...ctx }),
        ],
        logging: false,
      });

      const response = await gateway.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: /* GraphQL */ `
            query {
              hello
            }
          `,
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data?.hello).toBe('World');
      expect(mockRegisterProvider).not.toHaveBeenCalled();
    });
  });

  describe('tracing', () => {
    describe.each([
      { name: 'with context manager', contextManager: undefined },
      { name: 'without context manager', contextManager: false as const },
    ])('$name', ({ contextManager }) => {
      const buildTestGatewayForCtx: typeof buildTestGateway = (
        options,
        plugins,
      ) => buildTestGateway({ contextManager, ...options }, plugins);

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

          await using gateway = await buildTestGatewayForCtx(
            {},
            (otelPlugin) => {
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
          );
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

          await using gateway = await buildTestGatewayForCtx({}, () => {
            const createSpan =
              (name: string) =>
              ({ context: gqlCtx, executionRequest }: any) => {
                const ctx: OpenTelemetryContextExtension =
                  gqlCtx ?? executionRequest?.context;
                return ctx.opentelemetry.tracer
                  .startSpan(name, {}, ctx.opentelemetry.activeContext())
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
          });
          await gateway.query();

          for (const { root, children } of Object.values(expectedCustomSpans)) {
            const spanTree = spanExporter.assertRoot(root);
            children.forEach(spanTree.expectChild);
          }
        });
      });

      describe('span configuration', () => {
        it('should not trace http requests if disabled', async () => {
          await using gateway = await buildTestGatewayForCtx({
            spans: { http: false },
          });
          await gateway.query();

          allExpectedSpans.forEach(spanExporter.assertNoSpanWithName);
        });

        it('should not trace graphql operation if disable', async () => {
          await using gateway = await buildTestGatewayForCtx({
            spans: { graphql: false },
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
            spans: { graphqlParse: false },
          });
          await gateway.query();

          spanExporter.assertNoSpanWithName('graphql.parse');

          allExpectedSpans
            .filter((name) => name != 'graphql.parse')
            .forEach(spanExporter.assertSpanWithName);
        });

        it('should not trace validate if disabled', async () => {
          await using gateway = await buildTestGatewayForCtx({
            spans: { graphqlValidate: false },
          });
          await gateway.query();

          spanExporter.assertNoSpanWithName('graphql.validate');

          allExpectedSpans
            .filter((name) => name != 'graphql.validate')
            .forEach(spanExporter.assertSpanWithName);
        });

        it('should not trace context building if disabled', async () => {
          await using gateway = await buildTestGatewayForCtx({
            spans: { graphqlContextBuilding: false },
          });
          await gateway.query();

          spanExporter.assertNoSpanWithName('graphql.context');

          allExpectedSpans
            .filter((name) => name != 'graphql.context')
            .forEach(spanExporter.assertSpanWithName);
        });

        it('should not trace execute if disabled', async () => {
          await using gateway = await buildTestGatewayForCtx({
            spans: { graphqlExecute: false },
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
            spans: { subgraphExecute: false },
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
            spans: { upstreamFetch: false },
          });
          await gateway.query();

          spanExporter.assertNoSpanWithName('http.fetch');

          allExpectedSpans
            .filter((name) => name !== 'http.fetch')
            .forEach(spanExporter.assertSpanWithName);
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

      await using gateway = await buildTestGateway({}, (otelPlugin) => {
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
      });
      await gateway.query();

      for (const { root, children } of Object.values(expectedCustomSpans)) {
        const spanTree = spanExporter.assertRoot(root);
        children.forEach(spanTree.expectChild);
      }
    });
  });
});
