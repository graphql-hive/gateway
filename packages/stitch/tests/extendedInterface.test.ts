import { normalizedExecutor } from '@graphql-tools/executor';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { assertSome } from '@graphql-tools/utils';
import { graphql, print } from 'graphql';
import { describe, expect, test } from 'vitest';
import { stitchSchemas } from '../src/stitchSchemas.js';

describe('extended interfaces', () => {
  test('expands extended interface types for subservices', async () => {
    const itemsSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        interface Slot {
          id: ID!
        }
        type Item implements Slot {
          id: ID!
          name: String!
        }
        type Query {
          slot: Slot
        }
      `,
      resolvers: {
        Query: {
          slot() {
            return { __typename: 'Item', id: '23', name: 'The Item' };
          },
        },
      },
    });

    const stitchedSchema = stitchSchemas({
      subschemas: [{ schema: itemsSchema }],
      typeDefs: /* GraphQL */ `
        extend interface Slot {
          name: String!
        }
      `,
    });

    const { data } = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        query {
          slot {
            id
            name
          }
        }
      `,
    });
    assertSome(data);
    expect(data['slot']).toEqual({ id: '23', name: 'The Item' });
  });

  test('merges types behind gateway interface extension', async () => {
    const itemsSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Item {
          id: ID!
          name: String!
        }
        type Query {
          itemById(id: ID!): Item
        }
      `,
      resolvers: {
        Query: {
          itemById(_obj, args, _context, _info) {
            return { id: args.id, name: `Item ${args.id}` };
          },
        },
      },
    });

    const placementSchema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        interface Placement {
          id: ID!
        }
        type Item implements Placement {
          id: ID!
        }
        type Query {
          placementById(id: ID!): Placement
        }
      `,
      resolvers: {
        Query: {
          placementById(_obj, args, _context, _info) {
            return { __typename: 'Item', id: args.id };
          },
        },
      },
    });

    const stitchedSchema = stitchSchemas({
      subschemas: [
        {
          schema: itemsSchema,
          merge: {
            Item: {
              selectionSet: '{ id }',
              fieldName: 'itemById',
              args: ({ id }) => ({ id }),
            },
          },
        },
        { schema: placementSchema },
      ],
      typeDefs: /* GraphQL */ `
        extend interface Placement {
          name: String!
        }
      `,
    });

    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        query {
          placement: placementById(id: 23) {
            id
            name
          }
        }
      `,
    });
    assertSome(result.data);
    expect(result.data['placement']).toEqual({ id: '23', name: 'Item 23' });
  });

  // Adding `foo` on the gateway via `extend type Movie_Type` used to rewrite the
  // upstream query as `movie { ... on Movie_Type { title } }`. The remote only
  // needs `movie { title }`; the extra inline fragment is unnecessary.
  test('does not insert an unneeded inline fragment when extending a type', async () => {
    let delegatedQuery = '';
    const remote = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        interface Movie {
          id: ID!
          title: String
        }
        type Movie_Type implements Movie {
          id: ID!
          title: String
        }
        type Query {
          movie: Movie
        }
      `,
      resolvers: {
        Query: {
          movie: () => ({
            __typename: 'Movie_Type',
            id: '1',
            title: 'Dune',
          }),
        },
        Movie: {
          __resolveType: () => 'Movie_Type',
        },
      },
    });

    const stitchedSchema = stitchSchemas({
      inheritResolversFromInterfaces: true,
      subschemas: [
        {
          schema: remote,
          executor: async ({ document }) => {
            delegatedQuery = print(document);
            return normalizedExecutor({
              schema: remote,
              document,
            });
          },
        },
      ],
      typeDefs: /* GraphQL */ `
        extend interface Movie {
          foo: String
        }
        extend type Movie_Type {
          foo: String
        }
      `,
      resolvers: {
        Movie: {
          foo: () => 'foo',
        },
      },
    });

    const result = await graphql({
      schema: stitchedSchema,
      source: /* GraphQL */ `
        {
          movie {
            title
            foo
          }
        }
      `,
    });

    expect(result).toEqual({
      data: {
        movie: {
          title: 'Dune',
          foo: 'foo',
        },
      },
    });
    expect(delegatedQuery).not.toMatch(/\.\.\. on /);
  });
});
