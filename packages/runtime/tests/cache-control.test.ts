import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import InmemoryLRUCache from '@graphql-mesh/cache-inmemory-lru';
import useHttpCache from '@graphql-mesh/plugin-http-cache';
import { composeLocalSchemasWithApollo } from '@internal/testing';
import { parse } from 'graphql';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { useFakeTimers } from '../../../internal/testing/src/fake-timers';

// ApolloServer is not playing nice with Leak Tests
describe.skipIf(process.env['LEAK_TEST'])(
  'Cache Control directives w/ Apollo Server subgraph',
  () => {
    const advanceTimersByTimeAsync = useFakeTimers();
    const products = [
      { id: '1', name: 'Product 1', price: 100 },
      { id: '2', name: 'Product 2', price: 200 },
      { id: '3', name: 'Product 3', price: 300 },
    ];
    const productsSchema = buildSubgraphSchema({
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

        type Product @key(fields: "id") @cacheControl(maxAge: 3) {
          id: ID!
          name: String!
          price: Int!
        }

        extend type Query {
          products: [Product!]!
          product(id: ID!): Product
        }

        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.6"
            import: ["@key", "@composeDirective"]
          )
          @link(
            url: "https://the-guild.dev/mesh/v1.0"
            import: ["@cacheControl"]
          )
          @composeDirective(name: "@cacheControl") {
          query: Query
        }
      `),
      resolvers: {
        Query: {
          product(_root, { id }) {
            return products.find((product) => product.id === id);
          },
          products() {
            return products;
          },
        },
      },
    });
    let supergraph: string;
    let apolloServer: ApolloServer;
    let requestDidStart: Mock;
    beforeEach(async () => {
      requestDidStart = vi.fn();
      apolloServer = new ApolloServer({
        schema: productsSchema,
        plugins: [
          {
            requestDidStart,
          },
        ],
      });
      const { url } = await startStandaloneServer(apolloServer, {
        listen: { port: 0 },
      });
      supergraph = await composeLocalSchemasWithApollo([
        {
          schema: productsSchema,
          name: 'products',
          url,
        },
      ]);
    });
    it('response caching plugin respect @cacheControl(maxAge:) w/ @composeDirective', async () => {
      await using cache = new InmemoryLRUCache();
      await using gw = createGatewayRuntime({
        supergraph,
        cache,
        responseCaching: {
          session: () => null,
          includeExtensionMetadata: true,
        },
      });
      async function makeRequest() {
        const res = await gw.fetch('http://localhost:4000/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: /* GraphQL */ `
              query {
                products {
                  id
                  name
                  price
                }
              }
            `,
          }),
        });
        return res.json();
      }
      await expect(makeRequest()).resolves.toEqual({
        data: {
          products,
        },
        extensions: {
          responseCache: {
            didCache: true,
            hit: false,
            ttl: 3_000,
          },
        },
      });
      // 15 seconds later
      await advanceTimersByTimeAsync(1_000);
      await expect(makeRequest()).resolves.toEqual({
        data: {
          products,
        },
        extensions: {
          responseCache: {
            hit: true,
          },
        },
      });
      // 15 seconds later but the cache is expired
      await advanceTimersByTimeAsync(2_000);
      await expect(makeRequest()).resolves.toEqual({
        data: {
          products,
        },
        extensions: {
          responseCache: {
            didCache: true,
            hit: false,
            ttl: 3_000,
          },
        },
      });
      // GW received 3 requests but only 2 were forwarded to the subgraph
      expect(requestDidStart).toHaveBeenCalledTimes(2);
    });
    it('http caching plugin should respect cache control headers', async () => {
      await using cache = new InmemoryLRUCache();
      await using gw = createGatewayRuntime({
        supergraph,
        cache,
        plugins: (ctx) => [useHttpCache(ctx)],
      });
      async function makeRequest() {
        const res = await gw.fetch('http://localhost:4000/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: /* GraphQL */ `
              query {
                products {
                  id
                  name
                  price
                }
              }
            `,
          }),
        });
        return res.json();
      }
      await expect(makeRequest()).resolves.toEqual({
        data: {
          products,
        },
      });
      // 15 seconds later
      await advanceTimersByTimeAsync(1_000);
      await expect(makeRequest()).resolves.toEqual({
        data: {
          products,
        },
      });
      // 15 seconds later but the cache is expired
      await advanceTimersByTimeAsync(2_000);
      await expect(makeRequest()).resolves.toEqual({
        data: {
          products,
        },
      });
      // GW received 3 requests but only 2 were forwarded to the subgraph
      expect(requestDidStart).toHaveBeenCalledTimes(2);
    });
  },
);
