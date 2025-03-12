import { createServer } from 'node:http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);
const port = opts.getServicePort('upstreamStuck');

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
          foo: () =>
            new Promise(() => {
              console.log('foo on upstreamStuck');
              // never resolves
            }),
        },
      },
    }),
  }),
).listen(port, () => {
  console.log('Upstream stuck server running on port ' + port);
});
