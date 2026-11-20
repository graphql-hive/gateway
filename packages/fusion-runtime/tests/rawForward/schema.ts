import { buildSchema } from 'graphql';

export const typeDefs = /* GraphQL */ `
  scalar JSON
  enum Currency {
    USD
    EUR
    GBP
  }
  interface Node {
    id: ID!
  }
  type Review implements Node {
    id: ID!
    body: String
    rating: Int
  }
  type Product implements Node {
    id: ID!
    name: String
    price: Float
    stock: Int
    inStock: Boolean
    currency: Currency
    currencies: [Currency!]
    tags: [String!]!
    attributes: JSON
    reviews: [Review!]
    related: Product
    matrix: [[String]]
  }
  union SearchResult = Product | Review
  type Catalog {
    products: [Product!]!
    featured: Product
  }
  type Query {
    catalog: Catalog!
    product(id: ID): Product
    products: [Product!]
    node: Node
    search: SearchResult
  }
  type Mutation {
    touch: Product
  }
  type Subscription {
    changed: Product
  }
`;

export function buildExampleSchema() {
  return buildSchema(typeDefs);
}
