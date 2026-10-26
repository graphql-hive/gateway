import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { createYoga } from 'graphql-yoga';
import { describe, expect, test } from 'vitest';

// Apollo Client `BatchHttpLink` posts a JSON *array* of operations, e.g.
// `[{ query, variables }, { query, variables }]`. `express-graphql` treats
// that array as invalid (`POST body sent invalid JSON`) before stitching
// ever runs, so `HttpLink` works and `BatchHttpLink` 400s. The stitched
// schema itself is fine: serve it with Yoga / Hive Gateway `batching: true`
// and the same body returns one result per operation.
describe('HTTP request batching on a stitched schema', () => {
  const accounts = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        client_assessments(uuid: ID!): [Assessment!]!
      }
      type Assessment {
        id: ID!
        name: String!
      }
    `,
    resolvers: {
      Query: {
        client_assessments: (_root, { uuid }) => [{ id: uuid, name: 'intake' }],
      },
    },
  });

  const inventory = makeExecutableSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        sku(id: ID!): Sku
      }
      type Sku {
        id: ID!
        title: String!
      }
    `,
    resolvers: {
      Query: {
        sku: (_root, { id }) => ({ id, title: 'widget' }),
      },
    },
  });

  const schema = stitchSchemas({
    subschemas: [accounts, inventory],
  });

  const assessmentsQuery = /* GraphQL */ `
    query ome_client_assessments($uuid: ID!) {
      client_assessments(uuid: $uuid) {
        id
        name
      }
    }
  `;

  const skuQuery = /* GraphQL */ `
    query sku($id: ID!) {
      sku(id: $id) {
        id
        title
      }
    }
  `;

  const batchBody = JSON.stringify([
    { query: assessmentsQuery, variables: { uuid: '12345' } },
    { query: skuQuery, variables: { id: 'sku-1' } },
  ]);

  test('BatchHttpLink array is rejected without batching', async () => {
    await using yoga = createYoga({ schema });
    const res = await yoga.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: batchBody,
    });
    expect(res.status).toBe(400);
  });

  test('BatchHttpLink array returns one result per operation when batching is on', async () => {
    await using yoga = createYoga({ schema, batching: true });
    const res = await yoga.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: batchBody,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        data: {
          client_assessments: [{ id: '12345', name: 'intake' }],
        },
      },
      {
        data: {
          sku: { id: 'sku-1', title: 'widget' },
        },
      },
    ]);
  });

  test('a single HttpLink body still works with batching on', async () => {
    await using yoga = createYoga({ schema, batching: true });
    const res = await yoga.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: assessmentsQuery,
        variables: { uuid: '12345' },
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: {
        client_assessments: [{ id: '12345', name: 'intake' }],
      },
    });
  });
});
