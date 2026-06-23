import { createServer } from 'http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

let post1RevisionIndex = 0;
const post1Revisions = [
  {
    id: '1',
    title: 'Hello world',
    content: 'This is a post',
  },
  {
    id: '1',
    title: 'Hello again',
    content: 'This is another post',
  },
  {
    id: '1',
    title: 'Hello again again',
    content: 'This is another post again',
  },
];

const typeDefs = parse(/* GraphQL */ `
  type Query {
    allPosts: [Post!]!
  }
  type Post @key(fields: "id") {
    id: ID!
    title: String!
    content: String!
  }
`);

const resolvers = {
  Query: {
    allPosts: () => [post1Revisions[0]],
  },
  Post: {
    __resolveReference(post: { id: string }) {
      return {
        ...post,
        ...post1Revisions[
          // serve a new revision on every request
          post1RevisionIndex++
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
