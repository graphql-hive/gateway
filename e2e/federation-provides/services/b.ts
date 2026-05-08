import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const port = Opts(process.argv).getServicePort('b');

createServer(
  createYoga({
    schema: buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          entity: Entity @provides(fields: "name description")
        }

        type Entity @key(fields: "id") {
          id: ID!
          name: String! @external
          description: String! @external
        }
      `),
      resolvers: {
        Query: {
          entity() {
            return {
              id: '1',
              name: 'B:name',
              description: 'B:description',
            };
          },
        },
        Entity: {
          __resolveReference({ id }: { id: string }) {
            return {
              id,
              name: `B:name for ${id}`,
              description: `B:description for ${id}`,
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
          console.log(`[service-b] received query: ${params.query}`);
        },
      },
    ],
  }),
).listen({ port }, () => {
  // eslint-disable-next-line no-console
  console.log(`Service B running at http://localhost:${port}/graphql`);
});
