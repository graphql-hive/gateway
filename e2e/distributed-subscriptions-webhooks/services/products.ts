import { createServer } from 'node:http';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginSubscriptionCallback } from '@apollo/server/plugin/subscriptionCallback';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { expressMiddleware } from '@as-integrations/express5';
import { Opts } from '@internal/testing';
import { Repeater } from '@repeaterjs/repeater';
import express from 'express';
import { parse } from 'graphql';

let push:
  | ((_data: { newProduct: { name: string; price: number } }) => void)
  | null = null;

const apollo = new ApolloServer({
  schema: buildSubgraphSchema([
    {
      typeDefs: parse(/* GraphQL */ `
        type Query {
          hello: String!
        }
        type Product {
          name: String!
          price: Float!
        }

        type Subscription {
          newProduct: Product!
        }
      `),
      resolvers: {
        Query: {
          hello: () => 'world',
        },
        Subscription: {
          newProduct: {
            subscribe: () =>
              new Repeater(async (_push, stop) => {
                push = _push;
                await stop;
                push = null;
              }),
          },
        },
      },
    },
  ]),
  plugins: [ApolloServerPluginSubscriptionCallback()],
});

(async function start() {
  await apollo.start();

  const app = express();

  let ver = 10;

  app.use('/graphql', express.json(), expressMiddleware(apollo));
  app.use('/product-released', (_req, res) => {
    if (!push) {
      res.status(503).send();
      return;
    }
    push({
      newProduct: {
        name:
          ver % 2 === 0 ? `iPhone ${ver++} Pro` : `Samsung Galaxy S${ver++}`,
        price: ver + 99.99,
      },
    });
    res.status(200).send();
  });

  const opts = Opts(process.argv);

  createServer(app).listen(opts.getServicePort('products', true));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
