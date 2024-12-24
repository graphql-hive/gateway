import { IntrospectAndCompose, LocalGraphQLDataSource } from '@apollo/gateway';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { fakePromise } from '@graphql-tools/utils';
import { accounts, inventory, products, reviews } from '@internal/e2e';
import { composeLocalSchemasWithApollo } from '@internal/testing';
import { DocumentNode, GraphQLSchema } from 'graphql';

const services = {
  accounts,
  inventory,
  products,
  reviews,
} as const;

export interface ServiceInput {
  name: string;
  typeDefs: DocumentNode;
  schema: GraphQLSchema;
}

export function getServiceInputs() {
  return Object.entries(services).map(([name, module]) => ({
    name,
    typeDefs: module.typeDefs,
    schema: buildSubgraphSchema(module),
  }));
}

export async function getSupergraph() {
  return composeLocalSchemasWithApollo(getServiceInputs());
}
