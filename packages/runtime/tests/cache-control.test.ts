import { createServer, Server } from 'http';
import { AddressInfo, Socket } from 'net';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { createGatewayRuntime } from '@graphql-hive/gateway-runtime';
import InmemoryLRUCache from '@graphql-mesh/cache-inmemory-lru';
import useHttpCache from '@graphql-mesh/plugin-http-cache';
import { composeLocalSchemasWithApollo } from '@internal/testing';
import express from 'express';
import { parse } from 'graphql';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

describe('Cache Control directives w/ Apollo Server subgraph', () => {
  vi.useFakeTimers();
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

      type Product @key(fields: "id") @cacheControl(maxAge: 30) {
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
        @link(url: "https://the-guild.dev/mesh/v1.0", import: ["@cacheControl"])
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
  let productsServer: Server;
  let requestDidStart: Mock;
  const sockets = new Set<Socket>();
  beforeEach(async () => {
    requestDidStart = vi.fn();
    const app = express();
    productsServer = createServer(app);
    const apolloServer = new ApolloServer({
      schema: productsSchema,
      plugins: [
        {
          requestDidStart,
        },
      ],
    });
    await apolloServer.start();
    app.use(
      // @ts-expect-error - Express typings are wrong
      express.json(),
      expressMiddleware(apolloServer),
    );
    await new Promise<void>((resolve, reject) => {
      productsServer.once('error', reject);
      productsServer.listen(0, () => {
        resolve();
      });
    });
    productsServer.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => {
        sockets.delete(socket);
      });
    });
    supergraph = await composeLocalSchemasWithApollo([
      {
        schema: productsSchema,
        name: 'products',
        url: `http://localhost:${(productsServer.address() as AddressInfo).port}/graphql`,
      },
    ]);
  });
  afterEach(
    () =>
      new Promise<void>((resolve, reject) => {
        productsServer.closeAllConnections();
        productsServer.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      }),
  );
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
          ttl: 30_000,
        },
      },
    });
    // 15 seconds later
    await vi.advanceTimersByTimeAsync(15_000);
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
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(makeRequest()).resolves.toEqual({
      data: {
        products,
      },
      extensions: {
        responseCache: {
          didCache: true,
          hit: false,
          ttl: 30_000,
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
      plugins: (ctx) => [
        // @ts-expect-error - we need to fix the types
        useHttpCache(ctx),
      ],
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
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(makeRequest()).resolves.toEqual({
      data: {
        products,
      },
    });
    // 15 seconds later but the cache is expired
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(makeRequest()).resolves.toEqual({
      data: {
        products,
      },
    });
    // GW received 3 requests but only 2 were forwarded to the subgraph
    expect(requestDidStart).toHaveBeenCalledTimes(2);
  });
});
