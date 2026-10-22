import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { useDeferStream } from '@graphql-yoga/plugin-defer-stream';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);

const schema = buildSubgraphSchema({
  typeDefs: parse(/* GraphQL */ `
    type AlphabetBox {
      letters: [String!]!
    }
    type Query {
      alphabet: [String!]!
      boxedAlphabet: AlphabetBox!
    }
  `),
  resolvers: {
    Query: {
      // Yields letters one at a time - mirrors the issue reproduction.
      async *alphabet() {
        for (const letter of ['a', 'b', 'c', 'd', 'e']) {
          yield letter;
        }
      },
      boxedAlphabet: () => ({}),
    },
    AlphabetBox: {
      async *letters() {
        for (const letter of ['a', 'b', 'c']) {
          yield letter;
        }
      },
    },
  },
});

const yoga = createYoga({
  schema,
  plugins: [useDeferStream()],
});

const server = createServer(yoga);

server.listen(opts.getServicePort('alphabet'), () => {
  console.log(
    `Alphabet subgraph running on http://localhost:${opts.getServicePort('alphabet')}/graphql`,
  );
});
