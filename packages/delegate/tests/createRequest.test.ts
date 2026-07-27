import { makeExecutableSchema } from '@graphql-tools/schema';
import { createGraphQLError } from '@graphql-tools/utils';
import {
  buildSchema,
  graphql,
  Kind,
  OperationTypeNode,
  parse,
  print,
  validate,
} from 'graphql';
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

test('creates a target-compatible variable when reusing an argument value', () => {
  const targetSchema = buildSchema(/* GraphQL */ `
    type Identity {
      id: ID!
    }
    type Query {
      identity(id: ID!): Identity!
    }
  `);
  const document = parse(/* GraphQL */ `
    query GetIdentity($identityId: ID) {
      identity(id: $identityId) {
        id
      }
    }
  `);
  const operation = document.definitions[0];

  if (operation?.kind !== Kind.OPERATION_DEFINITION) {
    throw new Error('Expected an operation definition');
  }
  const fieldNode = operation.selectionSet.selections[0];
  if (fieldNode?.kind !== Kind.FIELD) {
    throw new Error('Expected a field');
  }

  const request = createRequest({
    subgraphName: 'identity',
    targetOperation: OperationTypeNode.QUERY,
    targetFieldName: 'identity',
    targetSchema,
    fieldNodes: [fieldNode],
    // @ts-expect-error we are testing the creation of a request with a variable
    info: {
      operation,
      variableValues: { identityId: 'identity-abc-123' },
    },
    args: { id: 'identity-abc-123' },
  });

  expect(validate(targetSchema, request.document)).toEqual([]);
});

test('forwards enum arguments as variables when the delegated field is missing from the target schema', () => {
  const gatewaySchema = buildSchema(/* GraphQL */ `
    enum Color {
      RED
      GREEN
      BLUE
    }
    input CreateThingInput {
      name: String!
      color: Color!
    }
    type Thing {
      id: ID!
    }
    type Mutation {
      createThing(input: CreateThingInput!): Thing
    }
  `);
  // the delegated field has been filtered out of the target schema
  // (@inaccessible, FilterRootFields, ...), so its arg types cannot be looked up
  const targetSchema = buildSchema(/* GraphQL */ `
    enum Color {
      RED
      GREEN
      BLUE
    }
    input CreateThingInput {
      name: String!
      color: Color!
    }
    type Thing {
      id: ID!
    }
    type Mutation {
      other: Boolean
    }
  `);
  const document = parse(/* GraphQL */ `
    mutation CreateThing($input: CreateThingInput!) {
      createThing(input: $input) {
        id
      }
    }
  `);
  const operation = document.definitions[0];
  if (operation?.kind !== Kind.OPERATION_DEFINITION) {
    throw new Error('Expected an operation definition');
  }
  const fieldNode = operation.selectionSet.selections[0];
  if (fieldNode?.kind !== Kind.FIELD) {
    throw new Error('Expected a field');
  }
  const variableValues = { input: { name: 'x', color: 'RED' } };

  const request = createRequest({
    subgraphName: 'inner',
    targetOperation: OperationTypeNode.MUTATION,
    targetFieldName: 'createThing',
    targetSchema,
    fieldNodes: [fieldNode],
    // @ts-expect-error only the fields read by createRequest are needed here
    info: {
      schema: gatewaySchema,
      operation,
      variableValues,
    },
    args: { input: variableValues.input },
  });

  // the enum must not be inlined as a quoted string, it has to stay a variable
  expect(print(request.document)).toContain('createThing(input: $input)');
  expect(request.variables).toEqual(variableValues);
});
