import { Opts } from "@internal/testing";
import { createSchema, createYoga } from "graphql-yoga";
import { createServer } from "node:http";

export const yoga = createYoga({
    schema: createSchema({
        typeDefs: /* GraphQL */ `
            interface Node {
                id: ID!
            }

            type User implements Node {
                id: ID!
                name: String!
            }

            type Query {
                node(id: ID!): Node
                user(id: ID!): User
            }
        `,
        resolvers: {
            Node: {
                __resolveType: (obj: { __typename: string }) => obj.__typename,
            },
            Query: {
                node: () => ({ __typename: 'User', id: '1', name: 'Alice' }),
            }
        },
    }),
    maskedErrors: false,
})

const opts = Opts(process.argv);

createServer(yoga).listen(opts.getServicePort('Test'), () => {
    console.log(`🚀 Server ready at http://localhost:${opts.getServicePort('Test')}/graphql`);
})