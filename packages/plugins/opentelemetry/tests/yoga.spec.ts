import { useOpenTelemetry } from '@graphql-mesh/plugin-opentelemetry';
import { createSchema, createYoga, Plugin as YogaPlugin } from 'graphql-yoga';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spanExporter } from './utils';

let mockModule = vi.mock;
if (globalThis.Bun) {
  mockModule = require('bun:test').mock.module;
}
const mockRegisterProvider = vi.fn();

describe('useOpenTelemetry', () => {
  mockModule('@opentelemetry/sdk-trace-web', () => ({
    WebTracerProvider: vi.fn(() => ({ register: mockRegisterProvider })),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    spanExporter.reset();
  });

  describe('usage with Yoga', () => {
    describe.each([
      { name: 'with context manager', contextManager: undefined },
      { name: 'without context manager', contextManager: false as const },
    ])('$name', ({ contextManager }) => {
      function buildTest(
        options: {
          plugins?: (
            otelPlugin: ReturnType<typeof useOpenTelemetry>,
          ) => YogaPlugin[];
        } = {},
      ) {
        const otelPlugin = useOpenTelemetry({
          initializeNodeSDK: false,
          contextManager,
        });

        const yoga = createYoga({
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
          maskedErrors: false,
          plugins: [otelPlugin, ...(options.plugins?.(otelPlugin) ?? [])],
        });

        return {
          query: async () => {
            const response = await yoga.fetch('http://yoga/graphql', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify({ query: '{ hello }' }),
            });
            expect(response.status).toBe(200);
          },
          [Symbol.asyncDispose]: async () => {
            await yoga.dispose();
          },
        };
      }

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
      };

      describe('span parenting', () => {
        it('should register a complete span tree $name', async () => {
          await using gateway = buildTest();
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
          };

          await using yoga = buildTest({
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
                },
              ];
            },
          });
          await yoga.query();

          for (const { root, children } of Object.values(expectedCustomSpans)) {
            const spanTree = spanExporter.assertRoot(root);
            children.forEach(spanTree.expectChild);
          }
        });
      });
    });
  });
});
