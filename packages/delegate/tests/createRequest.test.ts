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

test('does not inline enum arguments as quoted strings when the delegated field is missing from the target schema', () => {
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
  // the subgraph the delegated document is actually sent to still has the field
  const subgraphSchema = buildSchema(/* GraphQL */ `
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

  // either forwarding `$input` or inlining a proper EnumValue is acceptable,
  // a quoted `color: "RED"` is not
  expect(validate(subgraphSchema, request.document)).toEqual([]);
  const serialized =
    print(request.document) + JSON.stringify(request.variables);
  expect(serialized).not.toContain('color: "RED"');
  expect(serialized).toContain('RED');
});

test('keeps the original variable definition when it is still used inside a fragment', () => {
  const targetSchema = buildSchema(/* GraphQL */ `
    input Filter {
      visible: Boolean
    }
    type Value {
      id: ID!
    }
    type Section {
      values(filter: Filter): [Value!]!
    }
    type Group {
      visible: Section
    }
    type Query {
      grouping(filter: Filter!): Group
    }
  `);
  const document = parse(/* GraphQL */ `
    query Board($filter: Filter) {
      grouping(filter: $filter) {
        ...GroupFields
      }
    }

    fragment GroupFields on Group {
      visible {
        values(filter: $filter) {
          id
        }
      }
    }
  `);
  const operation = document.definitions[0];
  if (operation?.kind !== Kind.OPERATION_DEFINITION) {
    throw new Error('Expected an operation definition');
  }
  const fragment = document.definitions[1];
  if (fragment?.kind !== Kind.FRAGMENT_DEFINITION) {
    throw new Error('Expected a fragment definition');
  }
  const fieldNode = operation.selectionSet.selections[0];
  if (fieldNode?.kind !== Kind.FIELD) {
    throw new Error('Expected a field');
  }
  const variableValues = { filter: { visible: true } };

  // the nullable $filter is not assignable to the non-null arg, so the root arg
  // gets its own variable, but $filter is still referenced from the fragment
  const request = createRequest({
    subgraphName: 'inner',
    targetOperation: OperationTypeNode.QUERY,
    targetFieldName: 'grouping',
    targetSchema,
    fieldNodes: [fieldNode],
    fragments: [fragment],
    // @ts-expect-error only the fields read by createRequest are needed here
    info: {
      schema: targetSchema,
      operation,
      variableValues,
    },
    args: { filter: variableValues.filter },
  });

  expect(validate(targetSchema, request.document)).toEqual([]);
  expect(request.variables).toMatchObject(variableValues);
});

test('keeps the original variable definition when it is still used by a sibling selection', () => {
  const targetSchema = buildSchema(/* GraphQL */ `
    input Filter {
      visible: Boolean
    }
    type Value {
      id: ID!
    }
    type Section {
      values(filter: Filter): [Value!]!
    }
    type Group {
      visible: Section
    }
    type Query {
      grouping(filter: Filter!): Group
    }
  `);
  const document = parse(/* GraphQL */ `
    query Board($filter: Filter) {
      grouping(filter: $filter) {
        visible {
          values(filter: $filter) {
            id
          }
        }
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
  const variableValues = { filter: { visible: true } };

  // same as above but with no fragment involved, so a usage scan that only
  // walks fragments would still miss this one
  const request = createRequest({
    subgraphName: 'inner',
    targetOperation: OperationTypeNode.QUERY,
    targetFieldName: 'grouping',
    targetSchema,
    fieldNodes: [fieldNode],
    // @ts-expect-error only the fields read by createRequest are needed here
    info: {
      schema: targetSchema,
      operation,
      variableValues,
    },
    args: { filter: variableValues.filter },
  });

  expect(validate(targetSchema, request.document)).toEqual([]);
  expect(request.variables).toMatchObject(variableValues);
});
