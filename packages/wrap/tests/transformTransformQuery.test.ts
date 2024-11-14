import { delegateToSchema } from '@graphql-tools/delegate';
import { execute } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { Kind, OperationTypeNode, parse } from 'graphql';
import { describe, expect, test } from 'vitest';
import { TransformQuery } from '../src';

describe('TransformQuery', () => {
  test('calls queryTransformer even when there is no subtree', async () => {
    let queryTransformerCalled = 0;
    const data = {
      u1: {
        id: 'user1',
        addressStreetAddress: 'Windy Shore 21 A 7',
        addressZip: '12345',
      },
    };
    const subschema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
          addressStreetAddress: String
          addressZip: String
        }

        type Query {
          userById(id: ID!): User
        }
      `,
      resolvers: {
        Query: {
          userById(_parent, { id }: { id: keyof typeof data }) {
            return data[id];
          },
        },
      },
    });
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
        }

        type Query {
          zipByUser(id: ID!): String
        }
      `,
      resolvers: {
        Query: {
          zipByUser(_parent, { id }, context, info) {
            return delegateToSchema({
              schema: subschema,
              operation: 'query' as OperationTypeNode,
              fieldName: 'userById',
              args: { id },
              context,
              info,
              transforms: [
                new TransformQuery({
                  path: ['userById'],
                  queryTransformer: () => {
                    queryTransformerCalled++;
                    return {
                      kind: Kind.SELECTION_SET,
                      selections: [
                        {
                          kind: Kind.FIELD,
                          name: { kind: Kind.NAME, value: 'addressZip' },
                        },
                      ],
                    };
                  },
                  resultTransformer: (result) => result.addressZip,
                }),
              ],
            });
          },
        },
      },
    });
    const result = await execute({
      schema,
      document: parse(/* GraphQL */ `
        query {
          zipByUser(id: "u1")
        }
      `),
    });

    expect(queryTransformerCalled).toEqual(1);
    expect(result).toEqual({ data: { zipByUser: '12345' } });
  });
  test('skips fragments', async () => {
    const subschema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          fooContainer: FooContainer
        }
        type FooContainer {
          foo: Foo
        }
        type Foo {
          bar: String
          fooContainer: FooContainer
        }
      `,
      resolvers: {
        Query: {
          fooContainer() {
            const fooContainer = {
              foo: {
                bar: 'baz',
                get fooContainer() {
                  return fooContainer;
                },
              },
            };
            return fooContainer;
          },
        },
      },
    });
    const schema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          foo: Foo
        }
        type Foo {
          bar: String
          fooContainer: FooContainer
        }
        type FooContainer {
          foo: Foo
        }
      `,
      resolvers: {
        Query: {
          foo(_parent, _args, context, info) {
            return delegateToSchema({
              schema: subschema,
              operation: 'query' as OperationTypeNode,
              fieldName: 'fooContainer',
              context,
              info,
              transforms: [
                new TransformQuery({
                  path: ['fooContainer'],
                  queryTransformer: (subTree) => ({
                    kind: Kind.SELECTION_SET,
                    selections: [
                      {
                        kind: Kind.FIELD,
                        name: { kind: Kind.NAME, value: 'foo' },
                        selectionSet: subTree,
                      },
                    ],
                  }),
                  resultTransformer: (result) => result.foo,
                }),
              ],
            });
          },
        },
      },
    });
    const result = await execute({
      schema,
      document: parse(/* GraphQL */ `
        fragment FooFragment on Foo {
          bar
          fooContainer {
            foo {
              bar
            }
          }
        }
        query {
          foo {
            ...FooFragment
          }
        }
      `),
    });
    expect(result).toEqual({
      data: {
        foo: {
          bar: 'baz',
          fooContainer: {
            foo: {
              bar: 'baz',
            },
          },
        },
      },
    });
  });
});
