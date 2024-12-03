import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { setTimeout as setTimeout$ } from 'node:timers/promises';
import { Opts } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';

// Provide your schema
const yoga = createYoga({
  schema: createSchema({
    typeDefs: readFileSync(join(__dirname, './schema.graphql'), 'utf-8'),
    resolvers: {
      Query: {
        hello: () => 'world',
      },
      Subscription: {
        countdown: {
          // This will return the value on every 1 sec until it reaches 0
          async *subscribe(_, { from }) {
            for (let i = from; i >= 0; i--) {
              await setTimeout$(1000);
              yield { countdown: i };
            }
          },
        },
      },
    },
  }),
});

const server = createServer(yoga);
const opts = Opts(process.argv);
const port = opts.getServicePort('my-subgraph');
server.listen(port, () => {
  console.info(`Server is running on http://localhost:${port}/graphql`);
});
