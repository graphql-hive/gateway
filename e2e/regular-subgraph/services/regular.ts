import { createServer } from "http";
import { createSchema, createYoga } from "graphql-yoga";
import { Opts } from "@internal/testing";

const opts = Opts(process.argv);
const regularPort = opts.getServicePort("regular");

createServer(
    createYoga({
        maskedErrors: false,
        schema: createSchema({
            typeDefs: /* GraphQL */ `
                schema {
                    query: QueryType
                }

                type QueryType {
                    greeting(from: String, to: String): Greeting
                }

                type Greeting {
                    from: String
                    to: String
                    message: String
                    fullMessage: String
                }
            `,
            resolvers: {
                QueryType: {
                    greeting: (_, { from, to }) => ({
                        from,
                        to,
                        message: `Hello`,
                        fullMessage: `Hello ${to} from ${from}`,
                    }),
                },
            },
        })
    })
).listen(regularPort, () => {
    console.log(`Regular service is running on http://localhost:${regularPort}/graphql`);
})