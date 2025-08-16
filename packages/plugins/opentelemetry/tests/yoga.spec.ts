import { Logger } from '@graphql-hive/logger';
import { useOpenTelemetry } from '@graphql-mesh/plugin-opentelemetry';
import { createSchema, createYoga, Plugin as YogaPlugin } from 'graphql-yoga';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ContextMatcher } from '../src/plugin';
import { disableAll, setupOtelForTests, spanExporter } from './utils';

describe('useOpenTelemetry', () => {
  beforeAll(() => {
    disableAll();
    setupOtelForTests();
  });

  beforeEach(() => {
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
          log: new Logger({ level: false }),
          useContextManager: contextManager,
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
            const result = await response.json();
            if (result.errors) {
              console.error('Graphql Errors:', result.errors);
            }
            expect(result.errors).not.toBeDefined();
          },
          [Symbol.asyncDispose]: async () => {
            await yoga.dispose();
          },
        };
      }

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

        it.only('should allow to report custom spans', async () => {
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
          };

          await using yoga = buildTest({
            plugins: (openTelemetry) => {
              const createSpan = (name: string) => (matcher: ContextMatcher) =>
                openTelemetry.tracer
                  ?.startSpan(name, {}, openTelemetry.getActiveContext(matcher))
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
