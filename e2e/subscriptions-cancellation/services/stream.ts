import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { createSchema, createYoga, Repeater } from 'graphql-yoga';

const opts = Opts(process.argv);

const schema = createSchema<any>({
  typeDefs: /* GraphQL */ `
    type Query {
      hello: String!
    }
    type Subscription {
      emitsOnceAndStalls: String!
    }
  `,
  resolvers: {
    Query: {
      hello: () => 'world',
    },
    Subscription: {
      emitsOnceAndStalls: {
        subscribe: () =>
          new Repeater(async (push, stop) => {
            process.stdout.write('__ITERABLE__');
            push({ emitsOnceAndStalls: '👋' });
            process.stdout.write('__NEXT__');
            await stop;
            process.stdout.write('__END__');
          }),
      },
    },
  },
});

createServer(
  createYoga({
    maskedErrors: false,
    schema,
  }),
).listen(opts.getServicePort('stream'));
