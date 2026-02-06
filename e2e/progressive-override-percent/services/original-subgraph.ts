import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import express from 'express';
import { gql } from 'graphql-tag';

async function main() {
  const originalTypeDefs = gql`
    extend schema
      @link(
        url: "https://specs.apollo.dev/federation/v2.7"
        import: ["@key", "@shareable"]
      )

    type Query {
      store(id: ID!): Store
    }

    type Store @key(fields: "id") {
      id: ID!
      someConfigOrig: SomeConfig!
      someConfigNonProg: SomeConfig!
      someConfigProg0: SomeConfig!
      someConfigProg100: SomeConfig!
      someConfigProgCustom: SomeConfig!
    }

    type SomeConfig @shareable {
      status: String!
    }
  `;

  const originalResolvers = {
    Query: {
      store: (_: unknown, { id }: { id: string }) => {
        console.log('[original-subgraph] Query.store called with id:', id);
        return { id };
      },
    },
    Store: {
      someConfigOrig: (store: { id: string }) => {
        console.log(
          '[original-subgraph] Store.someConfigOrig called for store:',
          store.id,
        );
        return { status: 'from-original-subgraph' };
      },
      someConfigNonProg: (store: { id: string }) => {
        console.log(
          '[original-subgraph] Store.someConfigNonProg called for store:',
          store.id,
        );
        return { status: 'from-original-subgraph' };
      },
      someConfigProg0: (store: { id: string }) => {
        console.log(
          '[original-subgraph] Store.someConfigProg0 called for store:',
          store.id,
        );
        return { status: 'from-original-subgraph' };
      },
      someConfigProg100: (store: { id: string }) => {
        console.log(
          '[original-subgraph] Store.someConfigProg100 called for store:',
          store.id,
        );
        return { status: 'from-original-subgraph' };
      },
      someConfigProgCustom: (store: { id: string }) => {
        console.log(
          '[original-subgraph] Store.someConfigProgCustom called for store:',
          store.id,
        );
        return { status: 'from-original-subgraph' };
      },
    },
  };

  const port = Opts(process.argv).getServicePort('original-subgraph');

  const app = express();
  app.use(express.json());

  const originalSchema = buildSubgraphSchema([
    { typeDefs: originalTypeDefs, resolvers: originalResolvers },
  ]);
  const originalServer = new ApolloServer({ schema: originalSchema });
  await originalServer.start();
  app.use('/graphql', expressMiddleware(originalServer));
  app.listen(port, () => {
    console.log(
      `[original-subgraph] Server is running on http://localhost:${port}/graphql`,
    );
  });
}

main().catch((error) => {
  console.error('Error starting original subgraph:', error);
  process.exit(1);
});
