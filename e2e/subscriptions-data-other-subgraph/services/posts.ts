import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

let postsRevision = 0;
const postsRevisions = [
  {
    title: 'Hello world',
    content: 'This is a post',
  },
  {
    title: 'Hello again',
    content: 'This is another post',
  },
  {
    title: 'Hello again again',
    content: 'This is another post again',
  },
];

const typeDefs = parse(/* GraphQL */ `
  type Query {
    hello: String!
  }
  type Post @key(fields: "id") {
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
      return {
        ...post,
        ...postsRevisions[
          // serve a new revision on every request
          postsRevision++
        ],
      };
    },
  },
};

const yoga = createYoga({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
});

const opts = Opts(process.argv);

createServer(yoga).listen(opts.getServicePort('posts'));
