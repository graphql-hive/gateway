import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { createGraphQLError, ExecutionResult } from '@graphql-tools/utils';
import {
  graphql,
  GraphQLError,
  GraphQLResolveInfo,
  locatedError,
  OperationTypeNode,
} from 'graphql';
import { describe, expect, test } from 'vitest';
import { checkResultAndHandleErrors } from '../src/checkResultAndHandleErrors.js';
import {
  defaultMergedResolver,
  delegateToSchema,
  DelegationContext,
} from '../src/index.js';
import { getUnpathedErrors } from '../src/mergeFields.js';
import { UNPATHED_ERRORS_SYMBOL } from '../src/symbols.js';

describe('Errors', () => {
  describe('getUnpathedErrors', () => {
    test('should return all unpathed errors', () => {
      const error = {
        message: 'Test error without path',
      };
      const mockExternalObject: any = {
        responseKey: '',
        [UNPATHED_ERRORS_SYMBOL]: [error],
      };

      expect(getUnpathedErrors(mockExternalObject)).toEqual([
        mockExternalObject[UNPATHED_ERRORS_SYMBOL][0],
      ]);
    });
  });

  describe('checkResultAndHandleErrors', () => {
    const fakeInfo: GraphQLResolveInfo = {
      fieldName: 'foo',
      fieldNodes: [],
      returnType: {} as any,
      parentType: {} as any,
      path: { prev: undefined, key: 'foo', typename: undefined } as any,
      schema: {} as any,
      fragments: {},
      rootValue: {},
      operation: {} as any,
      variableValues: {},
    };

    test('should return single error', () => {
      const result = checkResultAndHandleErrors(
        {
          errors: [createGraphQLError('Test error')],
        },
        {
          fieldName: 'responseKey',
          info: fakeInfo,
        } as DelegationContext,
      );
      expect(result.toJSON()).toMatchInlineSnapshot(`
        {
          "message": "Test error",
          "path": [
            "foo",
          ],
        }
      `);
    });

    test('should return single error with extensions', () => {
      const result = checkResultAndHandleErrors(
        {
          errors: [
            createGraphQLError('Test error', {
              extensions: {
                code: 'UNAUTHENTICATED',
              },
            }),
          ],
        },
        {
          fieldName: 'responseKey',
          info: fakeInfo,
        } as DelegationContext,
      );
      expect(result.toJSON()).toMatchInlineSnapshot(`
        {
          "extensions": {
            "code": "UNAUTHENTICATED",
          },
          "message": "Test error",
          "path": [
            "foo",
          ],
        }
      `);
    });

    test('should return multiple errors in ExecutionResult format', () => {
      const result = checkResultAndHandleErrors(
        {
          errors: [
            createGraphQLError('Test error'),
            createGraphQLError('Test error 2'),
          ],
        },
        {
          fieldName: 'responseKey',
          info: fakeInfo,
        } as DelegationContext,
      );
      expect(result.data).toBeUndefined();
      expect(result.errors.map((e: GraphQLError) => e.toJSON()))
        .toMatchInlineSnapshot(`
        [
          {
            "message": "Test error",
            "path": [
              "foo",
            ],
          },
          {
            "message": "Test error 2",
            "path": [
              "foo",
            ],
          },
        ]
      `);
    });

    test('should return multiple errors with extensions in ExecutionResult format', () => {
      const result = checkResultAndHandleErrors(
        {
          errors: [
            createGraphQLError('Test error', {
              extensions: {
                code: 'GOOD',
              },
            }),
            createGraphQLError('Test error 2', {
              extensions: {
                code: 'VERY_GOOD',
              },
            }),
          ],
        },
        {
          fieldName: 'responseKey',
          info: fakeInfo,
        } as DelegationContext,
      );
      expect(result.data).toBeUndefined();
      expect(result.errors.map((e: GraphQLError) => e.toJSON()))
        .toMatchInlineSnapshot(`
          [
            {
              "extensions": {
                "code": "GOOD",
              },
              "message": "Test error",
              "path": [
                "foo",
              ],
            },
            {
              "extensions": {
                "code": "VERY_GOOD",
              },
              "message": "Test error 2",
              "path": [
                "foo",
              ],
            },
          ]
        `);
    });

    test('should return multiple errors with original errors in ExecutionResult format', () => {
      const errors = [
        createGraphQLError('Error1'),
        createGraphQLError('Error2'),
      ];
      const result = checkResultAndHandleErrors(
        {
          errors,
        },
        {
          fieldName: 'responseKey',
          info: fakeInfo,
        } as DelegationContext,
      );
      expect(result.data).toBeUndefined();
      expect(
        result.errors.map((e: GraphQLError) => ({
          ...e.toJSON(),
          originalError: (e.originalError as GraphQLError).toJSON(),
        })),
      ).toMatchInlineSnapshot(`
        [
          {
            "message": "Error1",
            "originalError": {
              "message": "Error1",
            },
            "path": [
              "foo",
            ],
          },
          {
            "message": "Error2",
            "originalError": {
              "message": "Error2",
            },
            "path": [
              "foo",
            ],
          },
        ]
      `);
      for (const i in errors) {
        const originalError = errors[i];
        expect(result.errors[i].originalError).toBe(originalError);
      }
    });

    test('should handle single not-instanceof-Error errors', () => {
      const result = checkResultAndHandleErrors(
        {
          errors: [
            // @ts-expect-error - testing non-Error error
            { message: 'Test error' },
          ],
        },
        {
          fieldName: 'responseKey',
          info: fakeInfo,
        } as DelegationContext,
      );
      expect(result).toBeInstanceOf(GraphQLError);
      expect(result.toJSON()).toMatchInlineSnapshot(`
        {
          "message": "Test error",
          "path": [
            "foo",
          ],
        }
      `);
    });

    test('should handle multiple not-instanceof-Error errors', () => {
      const result = checkResultAndHandleErrors(
        {
          errors: [
            // @ts-expect-error - testing non-Error error
            { message: 'Test error' },
            // @ts-expect-error - testing non-Error error
            { message: 'Test error 2' },
          ],
        },
        {
          fieldName: 'responseKey',
          info: fakeInfo,
        } as DelegationContext,
      );
      expect(result.data).toBeUndefined();
      expect(result.errors.map((e: GraphQLError) => e.toJSON()))
        .toMatchInlineSnapshot(`
        [
          {
            "message": "Test error",
            "path": [
              "foo",
            ],
          },
          {
            "message": "Test error 2",
            "path": [
              "foo",
            ],
          },
        ]
      `);
    });

    // see https://github.com/ardatan/graphql-tools/issues/1641
    describe('it proxies errors with invalid paths', () => {
      test('it works with bare delegation', async () => {
        const typeDefs = /* GraphQL */ `
          type Object {
            field1: String
            field2: String
          }
          type Query {
            object: Object
          }
        `;

        const unpathedError = locatedError(
          new Error('TestError'),
          undefined as any,
          ['_entities', 7, 'name'],
        );

        const remoteSchema = makeExecutableSchema({
          typeDefs,
          resolvers: {
            Query: {
              object: () => ({
                field1: unpathedError,
                field2: 'data',
              }),
            },
          },
        });

        const gatewaySchema = makeExecutableSchema({
          typeDefs,
          resolvers: {
            Query: {
              object: (_parent, _args, context, info) =>
                delegateToSchema({
                  schema: remoteSchema,
                  operation: 'query' as OperationTypeNode,
                  context,
                  info,
                }),
            },
          },
        });

        const query = /* GraphQL */ `
          {
            object {
              field1
              field2
            }
          }
        `;

        const expectedResult: ExecutionResult = {
          data: {
            object: {
              field1: null,
              field2: 'data',
            },
          },
          errors: [unpathedError],
        };

        const gatewayResult = await graphql({
          schema: gatewaySchema,
          source: query,
          fieldResolver: defaultMergedResolver,
        });

        expect(gatewayResult).toEqual(expectedResult);
      });

      test('it works with stitched schemas', async () => {
        const typeDefs = /* GraphQL */ `
          type Object {
            field1: String
            field2: String
          }
          type Query {
            object: Object
          }
        `;

        const unpathedError = locatedError(
          new Error('TestError'),
          undefined as any,
          ['_entities', 7, 'name'],
        );

        const remoteSchema = makeExecutableSchema({
          typeDefs,
          resolvers: {
            Query: {
              object: () => ({
                field1: unpathedError,
                field2: 'data',
              }),
            },
          },
        });

        const gatewaySchema = stitchSchemas({
          subschemas: [remoteSchema],
        });

        const query = /* GraphQL */ `
          {
            object {
              field1
              field2
            }
          }
        `;

        const expectedResult: ExecutionResult = {
          data: {
            object: {
              field1: null,
              field2: 'data',
            },
          },
          errors: [unpathedError],
        };

        const gatewayResult = await graphql({
          schema: gatewaySchema,
          source: query,
        });

        expect(gatewayResult).toEqual(expectedResult);
      });

      test('should handle multiple errors from multiple fields', async () => {
        const schema = stitchSchemas({
          subschemas: [
            makeExecutableSchema({
              typeDefs: /* GraphQL */ `
                type Object {
                  field1: String
                  field2: String
                }
                type Query {
                  object: Object
                }
              `,
              resolvers: {
                Query: {
                  object: () => ({
                    field1: () => {
                      throw new Error('field1 error');
                    },
                    field2: () => {
                      throw new Error('field2 error');
                    },
                  }),
                },
              },
            }),
          ],
        });

        const result = await graphql({
          schema,
          source: /* GraphQL */ `
            {
              object {
                field1
                field2
              }
            }
          `,
        });

        expect(result.data).toMatchInlineSnapshot(`
          {
            "object": {
              "field1": null,
              "field2": null,
            },
          }
        `);
        result.errors!.forEach((error) => {
          expect(error).toBeInstanceOf(GraphQLError);
        });
        expect(result.errors!.map((e) => e.toJSON())).toMatchInlineSnapshot(`
          [
            {
              "locations": [
                {
                  "column": 17,
                  "line": 4,
                },
              ],
              "message": "field1 error",
              "path": [
                "object",
                "field1",
              ],
            },
            {
              "locations": [
                {
                  "column": 17,
                  "line": 5,
                },
              ],
              "message": "field2 error",
              "path": [
                "object",
                "field2",
              ],
            },
          ]
        `);
      });

      test('should handle multiple errors from single field', async () => {
        const schema = stitchSchemas({
          subschemas: [
            makeExecutableSchema({
              typeDefs: /* GraphQL */ `
                type Query {
                  field: String
                }
              `,
              resolvers: {
                Query: {
                  field: () => {
                    throw new AggregateError([
                      new Error('field error 1'),
                      new Error('field error 2'),
                    ]);
                  },
                },
              },
            }),
          ],
        });

        const result = await graphql({
          schema,
          source: /* GraphQL */ `
            {
              field
            }
          `,
        });

        expect(result.data).toMatchInlineSnapshot(`
          {
            "field": null,
          }
        `);
        result.errors!.forEach((error) => {
          expect(error).toBeInstanceOf(GraphQLError);
        });
        expect(
          result.errors!.map((e) => {
            const eobj = e.toJSON();
            return {
              ...eobj,
              // replace all newlines in the message with spaces to pass snapshot for both bun and vitest
              message: eobj.message.replaceAll('\n', ' '),
            };
          }),
        ).toMatchInlineSnapshot(`
          [
            {
              "locations": [
                {
                  "column": 15,
                  "line": 3,
                },
              ],
              "message": "field error 1, field error 2",
              "path": [
                "field",
              ],
            },
          ]
        `);
      });
    });
  });
});
