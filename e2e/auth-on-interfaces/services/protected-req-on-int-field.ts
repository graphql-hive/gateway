import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);

const schema = buildSubgraphSchema([
  {
    typeDefs: parse(/* GraphQL */ `
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.8"
          import: ["@requiresScopes"]
        )

      type Query {
        a: A
        i: I
      }
      interface I {
        id: ID @requiresScopes(scopes: ["i"])
      }
      type A implements I @requiresScopes(scopes: ["a"]) {
        id: ID
        a: String
      }
      type B implements I @requiresScopes(scopes: ["b"]) {
        id: ID
        b: String
      }
    `),
    resolvers: {
      Query: {
        a: () => ({ id: 'a', a: 'valueA' }),
        i: () => ({ id: 'b', b: 'valueB' }), // Assuming it returns a B for example
      },
      I: {
        __resolveType: (obj: any) => {
          if ('a' in obj) return 'A';
          if ('b' in obj) return 'B';
          return null;
        },
      },
    },
  },
]);

const yoga = createYoga({ schema });

const httpServer = createServer(yoga);

httpServer.listen(opts.getServicePort('protected-req-on-int-field'));
