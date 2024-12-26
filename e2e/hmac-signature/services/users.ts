import { readFileSync } from 'fs';
import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { useHmacSignatureValidation } from '@graphql-mesh/hmac-upstream-signature';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const users = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
];

const yoga = createYoga({
  schema: buildSubgraphSchema({
    typeDefs: parse(readFileSync(__dirname + '/users.graphql', 'utf-8')),
    resolvers: {
      Query: {
        users: () => users,
        user: (_, { id }) => users.find((user) => user.id === id),
      },
      User: {
        __resolveReference: (reference) => {
          return users.find((user) => user.id === reference.id);
        },
      },
    },
  }),
  plugins: [
    useHmacSignatureValidation({
      secret: 'HMAC_SIGNING_SECRET',
    }),
  ],
});

const opts = Opts(process.argv);

const port = opts.getServicePort('users');

createServer(yoga).listen(port, () => {
  console.log('Users subgraph is running on http://localhost:' + port);
});
