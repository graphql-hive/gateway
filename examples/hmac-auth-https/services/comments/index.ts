import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ApolloServer, ApolloServerPlugin } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { defaultParamsSerializer } from '@graphql-mesh/hmac-upstream-signature';
import { parse } from 'graphql';

const comments = [
  { id: '1', text: 'Great post!', author: { id: '1' } },
  { id: '2', text: 'Thanks for the info!', author: { id: '2' } },
];

const verifyHmacPlugin = {
  async requestDidStart({ request }) {
    const signature = request.extensions?.['hmac-signature'];

    if (!signature) {
      throw new Error('HMAC signature is missing');
    }

    const serializedParams = defaultParamsSerializer({
      query: request.query,
      variables: request.variables,
    });

    const incomingReqSignature =
      serializedParams &&
      createHmac('sha256', 'HMAC_SIGNING_SECRET')
        .update(serializedParams)
        .digest('base64');

    if (incomingReqSignature !== signature) {
      throw new Error('HMAC signature is invalid');
    }
  },
} satisfies ApolloServerPlugin<{}>;

const extractJwtPlugin = {
  async requestDidStart({ request, contextValue }) {
    contextValue.jwt = request.extensions?.['jwt'];
  },
} satisfies ApolloServerPlugin<{ jwt?: { payload: Record<string, any> } }>;

const server = new ApolloServer({
  plugins: [verifyHmacPlugin, extractJwtPlugin],
  schema: buildSubgraphSchema({
    typeDefs: parse(readFileSync(join(__dirname, 'typeDefs.graphql'), 'utf-8')),
    resolvers: {
      Query: {
        comments: () => comments,
      },
      User: {
        comments(user, _args, context) {
          console.log('User.comments resolver called, context:', context);
          return comments.filter((comment) => comment.author.id === user.id);
        },
      },
    },
  }),
});

startStandaloneServer(server, {
  listen: { port: 4002 },
})
  .then(({ url }) => {
    console.log(`Comments subgraph is running on ${url}`);
  })
  .catch((error) => {
    console.error('Failed to start Comments subgraph', error);
    process.exit(1);
  });
