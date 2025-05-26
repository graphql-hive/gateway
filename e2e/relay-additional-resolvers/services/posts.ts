import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const posts: { id: string; title: string; content: string }[] = [
  {
    id: 'post-1',
    title: 'Hello world',
    content: 'This is a post',
  },
  {
    id: 'post-2',
    title: 'Hello again',
    content: 'This is another post',
  },
  {
    id: 'post-3',
    title: 'Hello again again',
    content: 'This is another post again',
  },
];

const typeDefs = parse(/* GraphQL */ `
  type Query {
    hello: String!
  }
  interface Node {
    id: ID!
  }
  type Post implements Node @key(fields: "id") {
    id: ID!
    title: String!
    content: String!
  }
`);

const resolvers = {
  Query: {
    hello: () => 'world',
  },
  Post: {
    __resolveReference(post: { id: string }) {
      return posts.find((p) => p.id === post.id);
    },
  },
};

const yoga = createYoga({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
});

const opts = Opts(process.argv);

createServer(yoga).listen(opts.getServicePort('posts'));
