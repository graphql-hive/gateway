import { createServer } from 'node:http';
import { Opts } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);

let supergraphSDL: string | undefined;
let id: number | undefined;

const graphosSchema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      routerConfig(
        ref: String
        apiKey: String
        ifAfterId: ID
      ): RouterConfigResults
    }

    type Mutation {
      setSupergraphSDL(sdl: String!): String
    }

    union RouterConfigResults = FetchError | Unchanged | RouterConfigResult

    type RouterConfigResult {
      id: ID
      supergraphSDL: String
      minDelaySeconds: Float
      messages: [Message!]
    }

    type FetchError {
      code: String
      message: String
      minDelaySeconds: Float
    }

    type Unchanged {
      id: ID
      minDelaySeconds: Float
    }

    type Message {
      level: String
      body: String
    }
  `,
  resolvers: {
    RouterConfigResults: {
      __resolveType: (obj: { __typename: string }) => obj.__typename,
    },
    Query: {
      routerConfig: (_, { ifAfterId }) => {
        if (ifAfterId === id) {
          return {
            __typename: 'Unchanged',
            id,
            minDelaySeconds: 10,
          };
        }
        return {
          __typename: 'RouterConfigResult',
          id,
          supergraphSDL,
          minDelaySeconds: 10,
          messages: [],
        };
      },
    },
    Mutation: {
      setSupergraphSDL: (_root, { sdl }) => {
        supergraphSDL = sdl;
        id = Date.now();
        return 'ok';
      },
    },
  },
});

const graphosYoga = createYoga({
  schema: graphosSchema,
  plugins: [
    {
      onRequest({ url, fetchAPI, endResponse }) {
        if (url.pathname.includes('usage')) {
          return endResponse(new fetchAPI.Response('ok'));
        }
      },
    },
  ],
});

createServer(graphosYoga).listen(opts.getServicePort('graphos'), () => {
  console.log(
    `Graphos server running on port ${opts.getServicePort('graphos')}`,
  );
});
