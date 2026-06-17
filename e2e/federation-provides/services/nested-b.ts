import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const port = Opts(process.argv).getServicePort('nested-b');

createServer(
  createYoga({
    schema: buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        extend schema
          @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable", "@external", "@provides"])

        type Query {
          entity: Entity
            @provides(fields: "nested { nestedNested { name description } }")
        }

        type Entity @key(fields: "id") {
          id: ID!
          nested: NestedField! @shareable
        }

        type NestedField @shareable {
          nestedNested: NestedNestedField!
        }

        type NestedNestedField {
          name: String! @external
          description: String! @external
        }
      `),
      resolvers: {
        Query: {
          entity() {
            return {
              id: '1',
              nested: {
                nestedNested: {
                  name: 'B:name',
                  description: 'B:description',
                },
              },
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
          console.log(`[service-nested-b] received query: ${params.query}`);
        },
      },
    ],
  }),
).listen({ port }, () => {
  // eslint-disable-next-line no-console
  console.log(`Service nested-b running at http://localhost:${port}/graphql`);
});
