import { buildSubgraphSchema } from '@apollo/subgraph';
import { normalizedExecutor } from '@graphql-tools/executor';
import { parse, print } from 'graphql';
import { expect, it } from 'vitest';
import { getStitchedSchemaFromLocalSchemas } from './getStitchedSchemaFromLocalSchemas';

const products = [
  {
    upc: 'p1',
    name: 'p-name-1',
    price: 11,
    weight: 1,
    category: {
      averagePrice: 11,
    },
  },
  {
    upc: 'p2',
    name: 'p-name-2',
    price: 22,
    weight: 2,
    category: {
      averagePrice: 22,
    },
  },
];

const supergraph = await getStitchedSchemaFromLocalSchemas({
  localSchemas: {
    a: buildSubgraphSchema([
      {
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key", "@external", "@requires"]
            )

          type Product @key(fields: "upc") {
            upc: String!
            weight: Int @external
            price(currency: String!): Int @external
            shippingEstimate: Int
              @requires(
                fields: """
                price(currency: "USD") weight
                """
              )
            shippingEstimateEUR: Int
              @requires(
                fields: """
                price(currency: "EUR") weight
                """
              )
            category: Category @external
            isExpensiveCategory: Boolean
              @requires(
                fields: """
                category { averagePrice(currency: "USD") }
                """
              )
          }

          type Category @external {
            averagePrice(currency: String!): Int
          }
        `),
        resolvers: {
          Product: {
            __resolveReference(
              key:
                | { upc: string; price: number; weight: number }
                | { upc: string },
            ) {
              const product = products.find((p) => p.upc === key.upc);

              if (!product) {
                return null;
              }

              if ('weight' in key && 'price' in key) {
                return {
                  upc: product.upc,
                  weight: key.weight,
                  price: key.price,
                  category: product.category,
                };
              }

              return {
                upc: product.upc,
                category: product.category,
              };
            },
            shippingEstimate(product: { price: number; weight: number }) {
              const value = product.price * product.weight * 10;
              return value;
            },
            shippingEstimateEUR(product: { price: number; weight: number }) {
              const value = product.price * product.weight * 10;
              return value;
            },
            isExpensiveCategory(product: {
              category: { averagePrice: number };
            }) {
              return product.category.averagePrice > 11;
            },
          },
        },
      },
    ]),
    b: buildSubgraphSchema([
      {
        typeDefs: parse(/* GraphQL */ `
          extend schema
            @link(
              url: "https://specs.apollo.dev/federation/v2.3"
              import: ["@key"]
            )

          type Query {
            products: [Product]
          }

          type Product @key(fields: "upc") {
            upc: String!
            name: String
            price(currency: String!): Int
            weight: Int
            category: Category
          }

          type Category {
            averagePrice(currency: String!): Int
          }
        `),
        resolvers: {
          Query: {
            products() {
              return products.map((p) => ({
                upc: p.upc,
                name: p.name,
                price: p.price,
                weight: p.weight,
                category: p.category,
              }));
            },
          },
          Product: {
            __resolveReference(key: { upc: string }) {
              const product = products.find((p) => p.upc === key.upc);

              if (!product) {
                return null;
              }

              return {
                upc: product.upc,
                name: product.name,
                price: product.price,
                weight: product.weight,
                category: product.category,
              };
            },
            price(parent, args) {
              if (args.currency === 'EUR') return parent.price * 2;
              if (args.currency === 'USD') return parent.price;
              throw new Error('Unsupported currency ' + args.currency);
            },
          },
        },
      },
    ]),
  },
  onSubgraphExecute(subgraph, executionRequest, result) {
    const query = print(executionRequest.document);
    console.log(subgraph, query, executionRequest.variables);
    console.dir(result, { depth: 3000 });
  },
});

it('test-query-0', { timeout: 1000 }, async () => {
  await expect(
    normalizedExecutor({
      schema: supergraph,
      document: parse(/* GraphQL */ `
        query {
          products {
            upc
            name
            shippingEstimate
            shippingEstimateEUR
            isExpensiveCategory
          }
        }
      `),
    }),
  ).resolves.toEqual({
    data: {
      products: [
        {
          upc: 'p1',
          name: 'p-name-1',
          shippingEstimate: 110, // 11 * 1 * 10
          shippingEstimateEUR: 220, // (11 * 2) * 1 * 10
          isExpensiveCategory: false,
        },
        {
          upc: 'p2',
          name: 'p-name-2',
          shippingEstimate: 440, // 22 * 2 * 10
          shippingEstimateEUR: 880, // (22 * 2) * 2 * 10
          isExpensiveCategory: true,
        },
      ],
    },
  });
});
