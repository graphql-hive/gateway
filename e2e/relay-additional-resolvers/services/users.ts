import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const users: { id: string; name: string; posts: { id: string }[] }[] = [
  {
    id: 'user-1',
    name: 'John Doe',
    posts: [{ id: 'post-2' }],
  },
  {
    id: 'user-2',
    name: 'Jane Doe',
    posts: [{ id: 'post-3' }, { id: 'post-1' }],
  },
];

const typeDefs = parse(/* GraphQL */ `
  type Query {
    hello: String!
  }
  interface Node {
    id: ID!
  }
  type User implements Node @key(fields: "id") {
    id: ID!
    name: String!
    posts: [Post!]!
  }
  type Post implements Node {
    id: ID!
  }
`);

const resolvers = {
  Query: {
    hello: () => 'world',
  },
  User: {
    __resolveReference(user: { id: string }) {
      return users.find((u) => u.id === user.id);
    },
  },
};

const yoga = createYoga({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
});

const opts = Opts(process.argv);

createServer(yoga).listen(opts.getServicePort('users'));
