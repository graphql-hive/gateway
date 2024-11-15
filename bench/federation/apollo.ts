import { ApolloGateway, LocalGraphQLDataSource } from '@apollo/gateway';
import accounts from './services/accounts';
import inventory from './services/inventory';
import products from './services/products';
import reviews from './services/reviews';

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
  buildService: ({ name }) => {
    const serviceName = name as keyof typeof serviceMap;
    return new LocalGraphQLDataSource(serviceMap[serviceName].schema);
  },
});