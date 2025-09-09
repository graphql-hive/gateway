import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  createGatewayRuntime,
  useCustomFetch,
} from '@graphql-hive/gateway-runtime';
import { getUnifiedGraphGracefully } from '@graphql-mesh/fusion-composition';
import { parse } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';

describe('Persisted Documents', () => {
  const store: Record<string, string> = {
    '1': 'query { foo }',
  };
  const subgraphSchema = buildSubgraphSchema({
    typeDefs: parse(/* GraphQL */ `
      type Query {
        foo: String
      }
    `),
    resolvers: {
      Query: {
        foo: () => 'bar',
      },
    },
  });

  const subgraphServer = createYoga({
    schema: subgraphSchema,
  });
  const gateway = createGatewayRuntime({
    supergraph: getUnifiedGraphGracefully([
      {
        name: 'foo',
        schema: subgraphSchema,
        url: 'http://localhost:4001/graphql',
      },
    ]),
    plugins: () => [
      // @ts-expect-error
      useCustomFetch(subgraphServer.fetch),
    ],
    persistedDocuments: {
      getPersistedOperation(id) {
        return store[id] || null;
      },
    },
  });
  it('supports Apollo Spec', async () => {
    const response = await gateway.fetch('http://gateway/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: '1',
          },
        },
      }),
    });
    const result = await response.json();
    expect(result).toEqual({
      data: {
        foo: 'bar',
      },
    });
  });
  it('supports Hive spec with JSON body', async () => {
    const response = await gateway.fetch('http://gateway/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId: '1',
      }),
    });
    const result = await response.json();
    expect(result).toEqual({
      data: {
        foo: 'bar',
      },
    });
  });
  it('supports Hive spec with GET request', async () => {
    const response = await gateway.fetch(
      'http://gateway/graphql?documentId=1',
      {
        method: 'GET',
      },
    );
    const result = await response.json();
    expect(result).toEqual({
      data: {
        foo: 'bar',
      },
    });
  });
  it('supports `allowArbitraryDocuments` option with custom store', async () => {
    const gatewayWithArbitraryDocs = createGatewayRuntime({
      supergraph: getUnifiedGraphGracefully([
        {
          name: 'foo',
          schema: subgraphSchema,
          url: 'http://localhost:4001/graphql',
        },
      ]),
      plugins: () => [
        // @ts-expect-error
        useCustomFetch(subgraphServer.fetch),
      ],
      persistedDocuments: {
        allowArbitraryDocuments: true,
        getPersistedOperation(id) {
          return store[id] || null;
        },
      },
    });
    const response = await gatewayWithArbitraryDocs.fetch(
      'http://gateway/graphql',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: '{ foo }',
        }),
      },
    );
    const result = await response.json();
    expect(result).toEqual({
      data: {
        foo: 'bar',
      },
    });
  });
});
