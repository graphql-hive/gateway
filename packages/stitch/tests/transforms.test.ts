import { delegateToSchema } from '@graphql-tools/delegate';
import { addMocksToSchema } from '@graphql-tools/mock';
import { makeExecutableSchema } from '@graphql-tools/schema';
import {
  FilterObjectFields,
  FilterRootFields,
  RenameRootTypes,
  wrapSchema,
} from '@graphql-tools/wrap';
import { propertySchema } from '@internal/testing/fixtures/schemas';
import { assertValidSchema, graphql } from 'graphql';
import { describe, expect, it, test } from 'vitest';
import { stitchSchemas } from '../src/stitchSchemas.js';

describe('rename root type', () => {
  test('works with stitchSchemas', async () => {
    let schemaWithCustomRootTypeNames = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        schema {
          query: QueryRoot
          mutation: MutationRoot
        }

        type QueryRoot {
          foo: String!
        }

        type MutationRoot {
          doSomething: DoSomethingPayload!
        }

        type DoSomethingPayload {
          somethingChanged: Boolean!
          query: QueryRoot!
        }
      `,
    });

    schemaWithCustomRootTypeNames = addMocksToSchema({
      schema: schemaWithCustomRootTypeNames,
    });

    let schemaWithDefaultRootTypeNames = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          bar: String!
        }

        type Mutation {
          doSomethingElse: DoSomethingElsePayload!
        }

        type DoSomethingElsePayload {
          somethingElseChanged: Boolean!
          query: Query!
        }
      `,
    });

    schemaWithDefaultRootTypeNames = addMocksToSchema({
      schema: schemaWithDefaultRootTypeNames,
    });

    const stitchedSchema = stitchSchemas({
      subschemas: [
        schemaWithCustomRootTypeNames,
        {
          schema: schemaWithDefaultRootTypeNames,
          transforms: [new RenameRootTypes((name) => `${name}Root`)],
        },
      ],
      typeDefs: /* GraphQL */ `
        schema {
          query: QueryRoot
          mutation: MutationRoot
        }
      `,
    });

    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        mutation {
          doSomething {
            query {
              foo
              bar
            }
          }
        }
      `,
    });

    expect(result).toEqual({
      data: {
        doSomething: {
          query: {
            foo: 'Hello World',
            bar: 'Hello World',
          },
        },
      },
    });
  });
});

describe('filter fields', () => {
  // Use case: breaking apart monolithic GQL codebase into microservices.
  // E.g. strip out types/fields from the monolith slowly and re-add them
  // as stitched resolvers to another service.
  it('should allow stitching a previously filtered field onto a type', () => {
    const filteredSchema = wrapSchema({
      schema: propertySchema,
      transforms: [
        new FilterObjectFields(
          (typeName, fieldName) =>
            `${typeName}.${fieldName}` !== 'Property.location',
        ),
      ],
    });

    assertValidSchema(filteredSchema);

    const stitchedSchema = stitchSchemas({
      subschemas: [filteredSchema],
      typeDefs: /* GraphQL */ `
        extend type Property {
          location: Location
        }
      `,
    });

    assertValidSchema(stitchedSchema);
  });

  // Hiding `_hidden` with `FilterRootFields` used to skip `selectionSet: '{ userId }'`
  // after the first hop. `userById { posts { user { id } } }` must still request
  // `userId` from the posts list so the nested `user` resolver can delegate.
  it('still resolves nested fields when a transform filters a root field', async () => {
    const users = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
          posts: [Post!]!
        }
        type Post {
          id: ID!
          userId: ID!
        }
        type Query {
          userById(id: ID!): User
          _hidden: String
        }
      `,
      resolvers: {
        Query: {
          userById: (_root, { id }) => ({
            id,
            posts: [{ id: 'p1', userId: id }],
          }),
          _hidden: () => 'nope',
        },
      },
    });

    const authors = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type User {
          id: ID!
        }
        type Query {
          _user(id: ID!): User
        }
      `,
      resolvers: {
        Query: {
          _user: (_root, { id }) => ({ id }),
        },
      },
    });

    const stitchedSchema = stitchSchemas({
      subschemas: [
        {
          schema: users,
          transforms: [new FilterRootFields((_op, name) => name !== '_hidden')],
        },
        authors,
      ],
      typeDefs: /* GraphQL */ `
        extend type Post {
          user: User
        }
      `,
      resolvers: {
        Post: {
          user: {
            selectionSet: '{ userId }',
            resolve: (post, _args, context, info) =>
              delegateToSchema({
                schema: authors,
                fieldName: '_user',
                args: { id: post.userId },
                context,
                info,
              }),
          },
        },
      },
    });

    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        {
          userById(id: "1") {
            posts {
              user {
                id
              }
            }
          }
        }
      `,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      userById: {
        posts: [{ user: { id: '1' } }],
      },
    });
  });
});
