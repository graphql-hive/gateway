import { createYoga, createSchema } from 'graphql-yoga';
import { createServer } from 'node:http';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);

const PORT = opts.getServicePort('GQL');

createServer(
    createYoga({
        schema: createSchema({
            typeDefs: /* GraphQL */ `
                type Query {
                    books: [Book!]!
                }

                type Book {
                    id: ID!
                    title: String!
                }
            `,
            resolvers: {
                Query: {
                    books() {
                        return [
                            { id: '1', title: 'Book 1' },
                            { id: '2', title: 'Book 2' },
                            { id: '3', title: 'Book 3' },
                        ];
                    },
                },
            },
        })
    })
).listen(PORT, () => {
    console.log(`🚀 Server ready at http://localhost:${PORT}`);
});