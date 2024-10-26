import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';

const opts = Opts(process.argv);

createServer(
  createYoga({
    maskedErrors: false,
    schema: createSchema<any>({
      typeDefs: /* GraphQL */ `
        scalar Upload # intentionally not "File" to test scalar name independence
        type Query {
          hello: String!
        }
        type Mutation {
          readFile(file: Upload!): String
        }
      `,
      resolvers: {
        Query: {
          hello: () => 'world',
        },
        Mutation: {
          readFile(_parent, { file }: { file: File }) {
            return file.text();
          },
        },
      },
    }),
  }),
).listen(opts.getServicePort('bucket'));
