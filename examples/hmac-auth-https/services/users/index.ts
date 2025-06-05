import { readFileSync } from 'fs';
import { createServer } from 'https';
import { join } from 'path';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Logger } from '@graphql-hive/logger';
import { useHmacSignatureValidation } from '@graphql-mesh/hmac-upstream-signature';
import {
  JWTExtendContextFields,
  useForwardedJWT,
} from '@graphql-mesh/plugin-jwt-auth';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const users = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
];

const yoga = createYoga({
  logging: true,
  plugins: [
    useHmacSignatureValidation({
      log: new Logger({ level: 'debug' }),
      secret: 'HMAC_SIGNING_SECRET',
    }),
    useForwardedJWT({}),
  ],
  schema: buildSubgraphSchema({
    typeDefs: parse(readFileSync(join(__dirname, 'typeDefs.graphql'), 'utf-8')),
    resolvers: {
      Query: {
        me: (_, __, context: any) => {
          const jwtPayload: JWTExtendContextFields = context.jwt;
          return users.find((user) => user.id === jwtPayload?.payload?.sub);
        },
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
});

const port = 4001;

createServer(
  {
    key: readFileSync(join(__dirname, 'key.pem')),
    cert: readFileSync(join(__dirname, 'cert.pem')),
  },
  yoga,
).listen(port, () => {
  console.log('Users subgraph is running on https://localhost:' + port);
});
