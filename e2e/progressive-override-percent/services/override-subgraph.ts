import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import express from 'express';
import gql from 'graphql-tag';

async function main() {
  const overrideTypeDefs = gql`
    extend schema
      @link(
        url: "https://specs.apollo.dev/federation/v2.7"
        import: ["@key", "@override", "@shareable"]
      )

    type Store @key(fields: "id") {
      id: ID!
      someConfigNonProg: SomeConfig! @override(from: "original-subgraph")
      someConfigProg0: SomeConfig!
        @override(from: "original-subgraph", label: "percent(0)")
      someConfigProg100: SomeConfig!
        @override(from: "original-subgraph", label: "percent(100)")
      someConfigProgCustom: SomeConfig!
        @override(from: "original-subgraph", label: "test-custom")
    }

    type SomeConfig @shareable {
      status: String!
    }
  `;

  const overrideResolvers = {
    Store: {
      __resolveReference: (ref: { id: string }) => {
        console.log(
          '[override-subgraph] Store.__resolveReference called for:',
          ref.id,
        );
        return ref;
      },
      someConfigNonProg: (store: { id: string }) => {
        console.log(
          '[override-subgraph] Store.someConfigNonProg called for store:',
          store.id,
        );
        return { status: 'from-override-subgraph' };
      },
      someConfigProg0: (store: { id: string }) => {
        console.log(
          '[override-subgraph] Store.someConfigProg0 called for store:',
          store.id,
        );
        return { status: 'from-override-subgraph' };
      },
      someConfigProg100: (store: { id: string }) => {
        console.log(
          '[override-subgraph] Store.someConfigProg100 called for store:',
          store.id,
        );
        return { status: 'from-override-subgraph' };
      },
      someConfigProgCustom: (store: { id: string }) => {
        console.log(
          '[override-subgraph] Store.someConfigProgCustom called for store:',
          store.id,
        );
        return { status: 'from-override-subgraph' };
      },
    },
  };

  const port = Opts(process.argv).getServicePort('override-subgraph');

  const app = express();
  app.use(express.json());

  const overrideSchema = buildSubgraphSchema([
    { typeDefs: overrideTypeDefs, resolvers: overrideResolvers },
  ]);
  const overrideServer = new ApolloServer({ schema: overrideSchema });
  await overrideServer.start();
  app.use('/graphql', expressMiddleware(overrideServer));

  app.listen(port, () => {
    console.log(
      `[override-subgraph] Server is running on http://localhost:${port}/graphql`,
    );
  });
}

main().catch((error) => {
  console.error('Error starting override subgraph:', error);
  process.exit(1);
});
