import { createServer } from 'node:http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);

const port = opts.getServicePort('upstreamGood');

createServer(
  createYoga({
    schema: buildSubgraphSchema({
      typeDefs: parse(/* GraphQL */ `
        type Query {
          foo: String
        }
      `),
      resolvers: {
        Query: {
          foo() {
            console.log('foo on upstreamGood');
            return 'bar';
          },
        },
      },
    }),
  }),
).listen(port, () => {
  console.log('Upstream good server running on port ' + port);
});
