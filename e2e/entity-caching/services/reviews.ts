import { createServer } from 'node:http';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { Opts } from '@internal/testing';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';

const reviews = [
  {
    id: '1',
    productId: '1',
    author: 'Alice',
    body: 'Great sound quality!',
    rating: 5,
  },
  {
    id: '2',
    productId: '1',
    author: 'Bob',
    body: 'Comfortable to wear.',
    rating: 4,
  },
  {
    id: '3',
    productId: '2',
    author: 'Carol',
    body: 'Makes perfect coffee.',
    rating: 5,
  },
  {
    id: '4',
    productId: '3',
    author: 'Dave',
    body: 'Very durable shoes.',
    rating: 4,
  },
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

    type Review {
      id: ID!
      author: String!
      body: String!
      rating: Int! @cacheControl(maxAge: 60)
      product: Product!
    }

    type Product @key(fields: "id") {
      id: ID!
      reviews: [Review!]!
    }

    type Query {
      review(id: ID!): Review
      reviews: [Review!]!
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
        return { id: ref.id };
      },
      reviews: (parent: { id: string }) =>
        reviews.filter((r) => r.productId === parent.id),
    },
    Review: {
      product: (review: { productId: string }) => ({ id: review.productId }),
    },
    Query: {
      review: (_root, { id }: { id: string }) =>
        reviews.find((r) => r.id === id),
      reviews: () => {
        console.log('resolving reviews');
        return reviews;
      },
    },
  },
});

const yoga = createYoga({ schema });
const server = createServer(yoga);

const opts = Opts(process.argv);
const port = opts.getServicePort('reviews');

server.listen(port, () => {
  console.log(`Reviews service ready at http://localhost:${port}`);
});
