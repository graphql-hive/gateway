import { ApolloGateway, LocalGraphQLDataSource } from '@apollo/gateway';
import { accounts, inventory, products, reviews } from '@internal/e2e';

const serviceMap = {
  accounts,
  inventory,
  products,
  reviews,
};

export default new ApolloGateway({
  localServiceList: Object.entries(serviceMap).map(([name, { typeDefs }]) => ({
    name,
    typeDefs,
  })),
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
  buildService: ({ name }) => {
    const serviceName = name as keyof typeof serviceMap;
    return new LocalGraphQLDataSource(serviceMap[serviceName].schema);
  },
});
