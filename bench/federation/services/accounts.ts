import { buildSubgraphSchema } from '@apollo/subgraph';
import type { GraphQLResolverMap } from '@apollo/subgraph/dist/schema-helper';
import { gql } from 'graphql-tag';

const typeDefs = gql`
  extend type Query {
    me: User
    users: [User]
  }

  type User @key(fields: "id") {
    id: ID!
    name: String
    username: String
  }
`;

const resolvers: GraphQLResolverMap = {
  Query: {
    me() {
      return users[0];
    },
    users() {
      return users;
    },
  },
  User: {
    __resolveReference(object) {
      return users.find((user) => user.id === object.id);
    },
  },
};

const schema = buildSubgraphSchema([
  {
    typeDefs,
    resolvers,
  },
]);

export { typeDefs, resolvers, schema };

const users = [
  {
    id: '1',
    name: 'Ada Lovelace',
    birthDate: '1815-12-10',
    username: '@ada',
  },
  {
    id: '2',
    name: 'Alan Turing',
    birthDate: '1912-06-23',
    username: '@complete',
  },
];
