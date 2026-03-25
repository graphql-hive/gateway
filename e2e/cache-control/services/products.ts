import { createServer } from 'node:http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const products = [
  {
    id: '1',
    name: 'Wireless Headphones',
    price: 79.99,
    category: 'Electronics',
  },
  { id: '2', name: 'Coffee Maker', price: 49.99, category: 'Kitchen' },
  { id: '3', name: 'Running Shoes', price: 119.99, category: 'Sports' },
];

const schema = buildSubgraphSchema({
  typeDefs: parse(/* GraphQL */ `
    enum CacheControlScope {
      PUBLIC
      PRIVATE
    }

    directive @cacheControl(
      maxAge: Int
      scope: CacheControlScope
      inheritMaxAge: Boolean
    ) on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

    type Product @key(fields: "id") @cacheControl(maxAge: 30) {
      id: ID!
      name: String!
      price: Float!
      category: String!
    }

    type Query {
      product(id: ID!): Product
      products: [Product!]!
    }

    extend schema
      @link(
        url: "https://specs.apollo.dev/federation/v2.1"
        import: ["@key", "@composeDirective"]
      )
      @link(url: "https://the-guild.dev/mesh/v1.0", import: ["@cacheControl"])
      @composeDirective(name: "@cacheControl") {
      query: Query
    }
  `),
  resolvers: {
    Product: {
      __resolveReference(ref: { id: string }) {
        console.log('resolving __resolveReference');
        return products.find((p) => p.id === ref.id);
      },
    },
    Query: {
      product: (_root, { id }: { id: string }) => {
        console.log('resolving Query.product');
        return products.find((p) => p.id === id);
      },
      products: () => products,
    },
  },
});

const yoga = createYoga({ schema });
const server = createServer(yoga);

const opts = Opts(process.argv);
const port = opts.getServicePort('products');

server.listen(port, () => {
  console.log(`Products service ready at http://localhost:${port}`);
});
