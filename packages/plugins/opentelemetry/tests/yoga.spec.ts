import { Logger } from '@graphql-hive/logger';
import {
  createGraphQLError,
  createSchema,
  createYoga,
  Plugin as YogaPlugin,
} from 'graphql-yoga';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hive, SpanStatusCode } from '../src/api';
import { ContextMatcher, useOpenTelemetry } from '../src/plugin';
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
          plugins?: () => YogaPlugin[];
        } = {},
      ) {
        hive.disable();
        const yoga = createYoga({
          schema: createSchema({
            typeDefs: /* GraphQL */ `
              type Query {
                hello: String
                withFailing: WithFailing
              }

              type WithFailing {
                failingField: String
              }
            `,
            resolvers: {
              Query: {
                hello: () => 'World',
                withFailing: () => ({}),
              },
              WithFailing: {
                failingField: () => {
                  throw createGraphQLError('Test', {
                    extensions: {
                      code: 'TEST',
                      originalError: new Error('Test'),
                    },
                  });
                },
              },
            },
          }),
          logging: false,
          maskedErrors: false,
          plugins: [
            useOpenTelemetry({
              log: new Logger({ level: false }),
              useContextManager: contextManager,
            }),
            ...(options.plugins?.() ?? []),
          ],
        });

        return {
          query: async (
            queryOptions: {
              query?: string;
              shouldError?: boolean;
            } = {},
          ) => {
            const response = await yoga.fetch('http://yoga/graphql', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                query: queryOptions.query ?? '{ hello }',
              }),
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            if (queryOptions.shouldError) {
              expect(result.errors?.length).toBeGreaterThan(0);
            } else {
              if (result.errors) {
                console.error('Graphql Errors:', result.errors);
              }
              expect(result.errors).not.toBeDefined();
            }
            return result;
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
          };

          await using yoga = buildTest({
            plugins: () => {
              const createSpan = (name: string) => (matcher: ContextMatcher) =>
                hive.tracer
                  ?.startSpan(name, {}, hive.getActiveContext(matcher))
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

      describe('error reporting', () => {
        it('should report execution errors on operation span', async () => {
          await using gateway = buildTest();
          await gateway.query({
            query: '{ withFailing { failingField } }',
            shouldError: true,
          });

          const operationSpan = spanExporter.assertRoot('graphql.operation');
          expect(operationSpan.span.status).toMatchObject({
            code: SpanStatusCode.ERROR,
            message: 'GraphQL Execution Error',
          });
          expect(operationSpan.span.attributes).toMatchObject({
            'hive.graphql.error.count': 1,
            'hive.graphql.error.codes': ['TEST'],
            'hive.graphql.error.coordinates': ['WithFailing.failingField'],
          });

          const executionSpan = operationSpan.expectChild('graphql.execute');
          expect(executionSpan.span.status).toMatchObject({
            code: SpanStatusCode.ERROR,
            message: 'GraphQL Execution Error',
          });
          expect(executionSpan.span.attributes).toMatchObject({
            'hive.graphql.error.count': 1,
          });

          const errorEvent = operationSpan.span.events.find(
            (event) => event.name === 'graphql.error',
          );

          expect(errorEvent?.attributes).toMatchObject({
            'hive.graphql.error.message': 'Test',
            'hive.graphql.error.code': 'TEST',
            'hive.graphql.error.path': ['withFailing', 'failingField'],
            'hive.graphql.error.locations': ['1:17'],
            'hive.graphql.error.coordinate': 'WithFailing.failingField',
          });
          expect(errorEvent?.attributes?.['exception.stacktrace']).toMatch(
            /^Error: Test\n/,
          );
        });

        it('should report validation errors on operation span', async () => {
          await using gateway = buildTest();
          await gateway.query({
            query: 'query test { unknown }',
            shouldError: true,
          });

          const operationSpan = spanExporter.assertRoot(
            'graphql.operation test',
          );
          expect(operationSpan.span.status).toMatchObject({
            code: SpanStatusCode.ERROR,
            message: 'GraphQL Validation Error',
          });
          expect(operationSpan.span.attributes).toMatchObject({
            'hive.graphql.error.count': 1,
            'graphql.operation.type': 'query',
            'graphql.operation.name': 'test',
          });

          const validateSpan = operationSpan.expectChild('graphql.validate');
          expect(validateSpan.span.status).toMatchObject({
            code: SpanStatusCode.ERROR,
            message: 'GraphQL Validation Error',
          });
          expect(validateSpan.span.attributes).toMatchObject({
            'hive.graphql.error.count': 1,
          });

          const errorEvent = operationSpan.span.events.find(
            (event) => event.name === 'graphql.error',
          );

          expect(errorEvent?.attributes).toMatchObject({
            'hive.graphql.error.locations': ['1:14'],
            'hive.graphql.error.message':
              'Cannot query field "unknown" on type "Query".',
          });
        });

        it('should report parsing errors on operation span', async () => {
          await using gateway = buildTest();
          await gateway.query({
            query: 'parse error',
            shouldError: true,
          });

          const operationSpan = spanExporter.assertRoot('graphql.operation');
          expect(operationSpan.span.status).toMatchObject({
            code: SpanStatusCode.ERROR,
            message: 'GraphQL Parse Error',
          });
          expect(operationSpan.span.attributes).toMatchObject({
            'hive.graphql.error.count': 1,
          });

          const parseSpan = operationSpan.expectChild('graphql.parse');
          expect(parseSpan.span.status).toMatchObject({
            code: SpanStatusCode.ERROR,
            message: 'GraphQL Parse Error',
          });
          expect(parseSpan.span.attributes).toMatchObject({
            'hive.graphql.error.count': 1,
          });

          const errorEvent = operationSpan.span.events.find(
            (event) => event.name === 'graphql.error',
          );

          expect(errorEvent?.attributes).toMatchObject({
            'hive.graphql.error.locations': ['1:1'],
            'hive.graphql.error.message':
              'Syntax Error: Unexpected Name "parse".',
          });
        });
      });
    });
  });
});
