import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);
const servicePort = opts.getServicePort('thing');

createServer(
  createYoga({
    schema: buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          thing(id: Int!): Thing!
        }

        type Thing @key(fields: "id") {
          id: Int!
        }
      `),
      resolvers: {
        Query: {
          thing: (_: unknown, { id }: { id: number }) => {
            console.log(
              '\n[Thing Query Resolver] Resolving thing with id:',
              id,
            );
            return { id };
          },
        },
      },
    }),
  }),
).listen(servicePort, () => {
  console.log(
    `Thing service is running at http://localhost:${servicePort}/graphql`,
  );
});
