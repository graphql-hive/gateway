import { IntrospectAndCompose, LocalGraphQLDataSource } from '@apollo/gateway';
import { GraphQLSchema } from 'graphql';

export interface ComposeLocalSchemaWithApolloSubgraphOpts {
  name: string;
  schema: GraphQLSchema;
  url?: string;
}

export async function composeLocalSchemasWithApollo(
  subgraphs: ComposeLocalSchemaWithApolloSubgraphOpts[],
) {
  let { supergraphSdl, cleanup } = await new IntrospectAndCompose({
    subgraphs,
  }).initialize({
    update(updatedSupergraphSdl: string) {
      supergraphSdl = updatedSupergraphSdl;
    },
    healthCheck: async () => {},
    getDataSource({ name }) {
      const subgraph = subgraphs.find((subgraph) => subgraph.name === name);
      if (!subgraph) {
        throw new Error(`Subgraph ${name} not found`);
      }
      return new LocalGraphQLDataSource(subgraph.schema);
    },
  });
  await cleanup();
  return supergraphSdl;
}
