import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const port = Opts(process.argv).getServicePort('a');

createServer(
  createYoga({
    schema: buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          _aPlaceholder: Boolean
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String!
          description: String!
          extra: String!
        }
      `),
      resolvers: {
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `A:name`,
              description: `A:description`,
              extra: `A:extra`,
            };
          },
        },
      },
    }),
    plugins: [
      {
        onParams({ params }) {
          if (params.query?.includes('__ApolloGetServiceDefinition__')) {
            return;
          }
          // eslint-disable-next-line no-console
          console.log(`[service-a] received query: ${params.query}`);
        },
      },
    ],
  }),
).listen({ port }, () => {
  // eslint-disable-next-line no-console
  console.log(`Service A running at http://localhost:${port}/graphql`);
});
