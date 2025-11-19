import { makeExecutableSchema } from '@graphql-tools/schema';
import { createGraphQLError } from '@graphql-tools/utils';
import { graphql, Kind, OperationTypeNode } from 'graphql';
import { describe, expect, test } from 'vitest';
import { createRequest } from '../src/createRequest.js';
import { delegateRequest } from '../src/delegateToSchema.js';

describe('bare requests', () => {
  test('should work', async () => {
    const innerSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Test {
          field: String
        }
        type Query {
          test(input: String): Test
        }
      `,
      resolvers: {
        Test: {
          field: (parent) => parent.input,
        },
        Query: {
          test: (_root, args) => ({ input: args.input }),
        },
      },
    });

    const outerSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Test {
          field: String
        }
        type Query {
          delegate(input: String): Test
        }
      `,
      resolvers: {
        Query: {
          delegate: (_root, args, _context, info) => {
            const request = createRequest({
              subgraphName: 'inner',
              fieldNodes: [
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: 'delegate',
                  },
                  selectionSet: {
                    kind: Kind.SELECTION_SET,
                    selections: [
                      {
                        kind: Kind.FIELD,
                        name: {
                          kind: Kind.NAME,
                          value: 'field',
                        },
                      },
                    ],
                  },
                  arguments: [
                    {
                      kind: Kind.ARGUMENT,
                      name: {
                        kind: Kind.NAME,
                        value: 'input',
                      },
                      value: {
                        kind: Kind.STRING,
                        value: args.input,
                      },
                    },
                  ],
                },
              ],
              targetOperation: 'query' as OperationTypeNode,
              targetFieldName: 'test',
              args,
              targetSchema: innerSchema,
            });
            return delegateRequest({
              request,
              schema: innerSchema,
              info,
              targetSchema: innerSchema,
            });
          },
        },
      },
    });

    const result = await graphql({
      schema: outerSchema,
      source: /* GraphQL */ `
        query {
          delegate(input: "test") {
            field
          }
        }
      `,
    });

    expect(result).toEqual({
      data: {
        delegate: {
          field: 'test',
        },
      },
    });
  });

  test('should work with adding args on delegation', async () => {
    const innerSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Test {
          field: String
        }
        type Query {
          test(input: String): Test
        }
      `,
      resolvers: {
        Test: {
          field: (parent) => parent.input,
        },
        Query: {
          test: (_root, args) => ({ input: args.input }),
        },
      },
    });

    const outerSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Test {
          field: String
        }
        type Query {
          delegate(input: String): Test
        }
      `,
      resolvers: {
        Query: {
          delegate: (_root, args, _context, info) => {
            const request = createRequest({
              subgraphName: 'inner',
              fieldNodes: [
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: 'delegate',
                  },
                  selectionSet: {
                    kind: Kind.SELECTION_SET,
                    selections: [
                      {
                        kind: Kind.FIELD,
                        name: {
                          kind: Kind.NAME,
                          value: 'field',
                        },
                      },
                    ],
                  },
                },
              ],
              targetOperation: 'query' as OperationTypeNode,
              targetFieldName: 'test',
              args,
              targetSchema: innerSchema,
            });
            return delegateRequest({
              request,
              schema: innerSchema,
              args,
              info,
              targetSchema: innerSchema,
            });
          },
        },
      },
    });

    const result = await graphql({
      schema: outerSchema,
      source: /* GraphQL */ `
        query {
          delegate(input: "test") {
            field
          }
        }
      `,
    });

    expect(result).toEqual({
      data: {
        delegate: {
          field: 'test',
        },
      },
    });
  });

  test('should work with errors', async () => {
    const innerSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          test: String
        }
      `,
      resolvers: {
        Query: {
          test: () => {
            throw new Error('test');
          },
        },
      },
    });

    const outerSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          delegate: String
        }
      `,
      resolvers: {
        Query: {
          delegate: (_source, args, _context, info) => {
            const request = createRequest({
              subgraphName: 'inner',
              fieldNodes: [
                {
                  kind: Kind.FIELD,
                  name: {
                    kind: Kind.NAME,
                    value: 'delegate',
                  },
                },
              ],
              targetOperation: 'query' as OperationTypeNode,
              targetFieldName: 'test',
              args,
              targetSchema: innerSchema,
            });
            return delegateRequest({
              request,
              schema: innerSchema,
              info,
              targetSchema: innerSchema,
            });
          },
        },
      },
    });

    const result = await graphql({
      schema: outerSchema,
      source: /* GraphQL */ `
        query {
          delegate
        }
      `,
    });

    expect(result).toEqual({
      data: {
        delegate: null,
      },
      errors: [
        createGraphQLError('test', {
          path: ['delegate'],
        }),
      ],
    });
  });
});
