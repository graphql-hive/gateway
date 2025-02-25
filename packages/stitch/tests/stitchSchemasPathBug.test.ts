import { describe, expect, test } from 'vitest';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { graphql, OperationTypeNode } from 'graphql';
import { delegateToSchema } from '@graphql-tools/delegate';

describe('Supergraph handles stitched field with different name correctly', () => {
    test('ensures correct error path in response', async () => {
        const subschema = makeExecutableSchema({
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
                    books: (_parent, args) => ([{
                        id: args.id,
                        title: () => {
                            throw new Error('Title - Forced error for testing purposes');
                        },
                        summary: () => {
                            throw new Error('Summary - Forced error for testing purposes');
                        },
                    }]),
                },
            },
        });

        // Stitch the subschema into the supergraph
        const supergraphSchema = stitchSchemas({
            subschemas: [subschema],
            typeDefs: /* GraphQL */ `
                type Query {
                    book(id: ID!): Book
                }

                type Book {
                    id: ID!
                    title: String
                    summary: String
                }
            `,
            resolvers: {
                Query: {
                    book: {
                        selectionSet: '{ id }',
                        resolve: (_parent, args, context, info) => {
                            const test =  delegateToSchema({
                                schema: subschema,
                                operation: 'query' as OperationTypeNode,
                                fieldName: 'books',
                                args: {
                                    ids: [args.id],
                                },
                                context,
                                info,
                            });
                            return test[0];
                        },
                    },
                },
            },
        });

        // Execute a query against the supergraph
        const result = await graphql({
            schema: supergraphSchema,
            source: /* GraphQL */ `
            query {
                book(id: "1") {
                    title
                    summary
                }
            }
        `,
        });

        expect(result.errors).toBeDefined();
        expect(result.errors.length).toEqual(2);

        expect(result.errors[0].message).contains('Forced error for testing purposes');
        // path is wrong - returning as ['book', 0, 'title'] but should be ['book', "title"]
        expect(result.errors[0].path).toEqual(['book', "title"]);

        expect(result.errors[1].message).contains('Forced error for testing purposes');
         // path is wrong - returning as ['book', 0, 'summary'] but should be ['book', "summary"]
        expect(result.errors[1].path).toEqual(['book', "summary"]);
    });
});
