import type { TraceState } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import {
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { createSchema, createYoga, type GraphQLParams } from 'graphql-yoga';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { OpenTelemetryGatewayPluginOptions } from '../src/plugin';

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
      it.each([
        { name: 'with context manager', contextManager: undefined },
        { name: 'without context manager', contextManager: false as const },
      ])(
        'should register a complete span tree $name',
        async ({ contextManager }) => {
          await using gateway = await buildTestGateway({ contextManager });
          await gateway.query();

          for (const { root, children } of Object.values(expected)) {
            const spanTree = spanExporter.assertRoot(root);
            children.forEach(spanTree.expectChild);
          }
        },
      );
    });

    describe('span configuration', () => {
      it('should not trace http requests if disabled', async () => {
        await using gateway = await buildTestGateway({
          spans: { http: false },
        });
        await gateway.query();

        allExpectedSpans.forEach(spanExporter.assertNoSpanWithName);
      });

      it('should not trace graphql operation if disable', async () => {
        await using gateway = await buildTestGateway({
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
        await using gateway = await buildTestGateway({
          spans: { graphqlParse: false },
        });
        await gateway.query();

        spanExporter.assertNoSpanWithName('graphql.parse');

        allExpectedSpans
          .filter((name) => name != 'graphql.parse')
          .forEach(spanExporter.assertSpanWithName);
      });

      it('should not trace validate if disabled', async () => {
        await using gateway = await buildTestGateway({
          spans: { graphqlValidate: false },
        });
        await gateway.query();

        spanExporter.assertNoSpanWithName('graphql.validate');

        allExpectedSpans
          .filter((name) => name != 'graphql.validate')
          .forEach(spanExporter.assertSpanWithName);
      });

      it('should not trace context building if disabled', async () => {
        await using gateway = await buildTestGateway({
          spans: { graphqlContextBuilding: false },
        });
        await gateway.query();

        spanExporter.assertNoSpanWithName('graphql.context');

        allExpectedSpans
          .filter((name) => name != 'graphql.context')
          .forEach(spanExporter.assertSpanWithName);
      });

      it('should not trace execute if disabled', async () => {
        await using gateway = await buildTestGateway({
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
        await using gateway = await buildTestGateway({
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
        await using gateway = await buildTestGateway({
          spans: { upstreamFetch: false },
        });
        await gateway.query();

        spanExporter.assertNoSpanWithName('http.fetch');

        allExpectedSpans
          .filter((name) => name !== 'http.fetch')
          .forEach(spanExporter.assertSpanWithName);
      });
    });

    async function buildTestGateway(
      options: Partial<
        Extract<OpenTelemetryGatewayPluginOptions, { initializeNodeSDK: false }>
      > = {},
    ) {
      const { useOpenTelemetry } = await import('../src');
      const stack = new AsyncDisposableStack();

      const upstream = stack.use(
        createYoga({
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
        }),
      );

      const gateway = stack.use(
        gw.createGatewayRuntime({
          proxy: {
            endpoint: 'https://example.com/graphql',
          },
          plugins: (ctx) => [
            gw.useCustomFetch(
              // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
              upstream.fetch,
            ),
            useOpenTelemetry({ initializeNodeSDK: false, ...ctx, ...options }),
          ],
          logging: false,
        }),
      );

      return {
        query: async (
          body: GraphQLParams = {
            query: /* GraphQL */ `
              query {
                hello
              }
            `,
          },
        ) => {
          const response = await gateway.fetch(
            'http://localhost:4000/graphql',
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify(body),
            },
          );
          return response.json();
        },
        [Symbol.asyncDispose]: () => {
          return stack.disposeAsync();
        },
      };
    }
  });
});

class MockSpanExporter implements SpanExporter {
  spans: Span[];

  constructor() {
    this.spans = [];
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    this.spans.push(
      ...spans.map((span) => ({
        ...span,
        traceId: span.spanContext().traceId,
        traceState: span.spanContext().traceState,
        id: span.spanContext().spanId,
      })),
    );
    setTimeout(() => resultCallback({ code: ExportResultCode.SUCCESS }), 0);
  }
  shutdown() {
    this.reset();
    return Promise.resolve();
  }
  forceFlush() {
    this.reset();
    return Promise.resolve();
  }
  reset() {
    this.spans = [];
  }

  buildSpanNode = (span: Span): TraceTreeNode =>
    new TraceTreeNode(
      span,
      this.spans
        .filter(({ parentSpanId }) => parentSpanId === span.id)
        .map(this.buildSpanNode),
    );

  assertRoot(rootName: string): TraceTreeNode {
    const root = this.spans.find(({ name }) => name === rootName);
    if (!root) {
      expect.fail(
        `No root span found with name '${rootName}'. Span names are: ${this.spans.map(({ name }) => `\n\t- ${name}`)}`,
      );
    }
    return this.buildSpanNode(root);
  }

  assertNoSpanWithName = (name: string) => {
    expect(this.spans.map(({ name }) => name)).not.toContain(name);
  };

  assertSpanWithName = (name: string) => {
    expect(this.spans.map(({ name }) => name)).toContain(name);
  };

  toString() {
    return this.spans.map((span) => span.name);
  }
}

class TraceTreeNode {
  constructor(
    public span: Span,
    public children: TraceTreeNode[],
  ) {}

  expectChild = (name: string): TraceTreeNode => {
    const child = this.children.find((child) => child.span.name === name);
    if (!child) {
      expect.fail(
        `No child span found with name '${name}'. Children names are: ${this.children.map((child) => `\n\t- ${child.span.name}`)}`,
      );
    }
    return child;
  };

  get length() {
    return this.children.length;
  }
}

type Span = ReadableSpan & {
  traceId: string;
  traceState?: TraceState;
  id: string;
};

function assertExist<T>(value?: T): asserts value is T {
  expect(value).toBeDefined();
}
