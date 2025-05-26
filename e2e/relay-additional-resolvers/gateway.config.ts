import { defineConfig } from '@graphql-hive/gateway';
import { decodeGlobalID } from './id';

export const gatewayConfig = defineConfig({
  additionalTypeDefs: /* GraphQL */ `
    type Query {
      node(id: ID!): Node
      nodes(ids: [ID!]!): [Node]!
    }
  `,
  additionalResolvers: {
    Query: {
      node(_source: any, args: { id: string }, _context: any, _info: any) {
        const { type, localID } = decodeGlobalID(args.id);
        return {
          __typename: type,
          id: localID,
        };
      },
      nodes(_source: any, args: { ids: string[] }, _context: any, _info: any) {
        return args.ids.map((id) => {
          const { type, localID } = decodeGlobalID(id);
          return {
            __typename: type,
            id: localID,
          };
        });
      },
      _entities: (_: any, { representations }: any) => {
        return representations.map((ref) => {
          // Since all our entities just need id, we can return the reference as is
          // The __typename is already included in the reference
          return ref;
        });
      },
    },
    Node: {
      __resolveType(source: { __typename: string }) {
        return source.__typename;
      },
    },
  },
});
