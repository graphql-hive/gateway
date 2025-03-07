import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { graphql } from 'graphql';
import { describe, expect, test } from 'vitest';

describe('Supergraph handles stitched field with different name correctly', () => {
  test('ensures correct error path in response', async () => {
    const bookDetailsSubschema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          books(ids: [ID!]!): [Book!]!
        }

        type Book {
          id: ID!
          title: String
          summary: String
        }
      `,
      resolvers: {
        Query: {
          books: (_parent, { ids }: { ids: string[] }) =>
            ids.map((id) => ({
              id,
              title: () => {
                throw new Error('Title - Forced error for testing purposes');
              },
              summary: () => {
                throw new Error('Summary - Forced error for testing purposes');
              },
            })),
        },
      },
    });

    const bookIdSubschema = makeExecutableSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          book(id: ID!): Book
        }

        type Book {
          id: ID!
        }
      `,
      resolvers: {
        Query: {
          book: (_, { id }: { id: string }) => {
            return { id };
          },
        },
      },
    });

    const supergraphSchema = stitchSchemas({
      subschemas: [
        {
          schema: bookDetailsSubschema,
          merge: {
            Book: {
              fieldName: 'books',
              selectionSet: '{ id }',
              key: ({ id }) => id,
              argsFromKeys: (ids) => ({ ids }),
            },
          },
        },
        {
          schema: bookIdSubschema,
          merge: {
            Book: {
              fieldName: 'book',
              selectionSet: '{ id }',
              args: ({ id }) => ({ id }),
            },
          },
        },
      ],
    });

    const query = `
        query Book($id: ID!) {
            book(id: $id) {
                title
                summary
            }
        }
        `;
    const result = await graphql({
      schema: supergraphSchema,
      source: query,
      variableValues: { id: '1' },
    });

    expect(JSON.parse(JSON.stringify(result))).toMatchObject({
      errors: [
        {
          message: 'Title - Forced error for testing purposes',
          // path is wrong - returning as ['book', 0, 'title'] but should be ['book', "title"]
          path: ['book', 'title'],
        },
        {
          message: 'Summary - Forced error for testing purposes',
          // path is wrong - returning as ['book', 0, 'summary'] but should be ['book', "summary"]
          path: ['book', 'summary'],
        },
      ],
    });
  });
});
