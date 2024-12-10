import { IntrospectAndCompose, LocalGraphQLDataSource } from '@apollo/gateway';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { fakePromise } from '@graphql-tools/utils';
import { accounts, inventory, products, reviews } from '@internal/e2e';
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
  const serviceInputs = getServiceInputs();
  const { supergraphSdl, cleanup } = await new IntrospectAndCompose({
    subgraphs: serviceInputs.map(({ name }) => ({
      name,
      url: `http://localhost/${name}`,
    })),
  }).initialize({
    update() {},
    healthCheck: () => fakePromise(undefined),
    getDataSource({ name }) {
      const serviceInput = serviceInputs.find((input) => input.name === name);
      if (!serviceInput) {
        throw new Error(`Service ${name} not found`);
      }
      return new LocalGraphQLDataSource(serviceInput.schema);
    },
  });
  await cleanup();
  return supergraphSdl;
}
