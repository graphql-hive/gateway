import { createServer } from 'http';
import { Opts } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';

export const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      scalar BigInt

      type Query {
        pet_by_id(id: BigInt!): Pet
      }

      type Pet {
        id: BigInt!
        vaccinated: Boolean!
      }
    `,
    resolvers: {
      Query: {
        pet_by_id: async (_root, args, _context, _info) => {
          return {
            id: args.id,
            vaccinated: false,
          };
        },
      },
    },
  }),
});

const port = Opts(process.argv).getServicePort('vaccination', true);

createServer(yoga).listen(port, () => {
  console.log(`Vaccination service listening on http://localhost:${port}`);
});
