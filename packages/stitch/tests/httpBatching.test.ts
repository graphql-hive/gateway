import {
  ApolloClient,
  ApolloLink,
  gql,
  HttpLink,
  InMemoryCache,
} from '@apollo/client';
import { BatchHttpLink } from '@apollo/client/link/batch-http';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { stitchSchemas } from '@graphql-tools/stitch';
import { createYoga } from 'graphql-yoga';
import { describe, expect, test } from 'vitest';

// Same client path as the leftover report: Apollo Client `BatchHttpLink`
// against a stitched schema. The link posts a JSON *array* of operations.
// `express-graphql` rejects that array (`POST body sent invalid JSON`)
// before stitch runs. GraphQL Yoga (`batching: true`) and Apollo Server
// accept it.
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

  const OME_CLIENT_ASSESSMENTS = gql`
    query ome_client_assessments($uuid: ID!) {
      client_assessments(uuid: $uuid) {
        id
        name
      }
    }
  `;

  const SKU = gql`
    query sku($id: ID!) {
      sku(id: $id) {
        id
        title
      }
    }
  `;

  // Yoga's fetch is not `typeof fetch` (no `preconnect`). Apollo's links
  // still want the global signature, so wrap and assert at that boundary.
  function wrapFetch(yoga: ReturnType<typeof createYoga>) {
    const bodies: unknown[] = [];
    const yogaFetch = yoga.fetch as typeof globalThis.fetch;
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body) {
        bodies.push(JSON.parse(String(init.body)));
      }
      return yogaFetch(input, init);
    }) as typeof globalThis.fetch;
    return { fetch, bodies };
  }

  function batchClient(fetch: typeof globalThis.fetch) {
    return new ApolloClient({
      link: ApolloLink.from([
        new BatchHttpLink({
          uri: 'http://localhost:4000/graphql',
          fetch,
        }),
      ]),
      cache: new InMemoryCache(),
      defaultOptions: {
        query: { fetchPolicy: 'no-cache' },
      },
    });
  }

  async function runReporterQueries(client: ApolloClient<object>) {
    return Promise.all([
      client.query({
        query: OME_CLIENT_ASSESSMENTS,
        variables: { uuid: '12345' },
      }),
      client.query({
        query: SKU,
        variables: { id: 'sku-1' },
      }),
    ]);
  }

  test('BatchHttpLink fails against a stitched schema without HTTP batching', async () => {
    await using yoga = createYoga({ schema });
    const { fetch } = wrapFetch(yoga);
    const client = batchClient(fetch);

    await expect(runReporterQueries(client)).rejects.toThrow(/400|batch|JSON/i);
  });

  test('BatchHttpLink resolves both operations when the stitched server batches', async () => {
    await using yoga = createYoga({ schema, batching: true });
    const { fetch, bodies } = wrapFetch(yoga);
    const client = batchClient(fetch);

    const [assessments, sku] = await runReporterQueries(client);

    expect(bodies).toHaveLength(1);
    expect(Array.isArray(bodies[0])).toBe(true);
    expect(bodies[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationName: 'ome_client_assessments',
          variables: { uuid: '12345' },
        }),
        expect.objectContaining({
          operationName: 'sku',
          variables: { id: 'sku-1' },
        }),
      ]),
    );

    expect(assessments.data).toEqual({
      client_assessments: [
        { __typename: 'Assessment', id: '12345', name: 'intake' },
      ],
    });
    expect(sku.data).toEqual({
      sku: { __typename: 'Sku', id: 'sku-1', title: 'widget' },
    });
  });

  test('HttpLink still works with batching on', async () => {
    await using yoga = createYoga({ schema, batching: true });
    const { fetch, bodies } = wrapFetch(yoga);
    const client = new ApolloClient({
      link: ApolloLink.from([
        new HttpLink({
          uri: 'http://localhost:4000/graphql',
          fetch,
        }),
      ]),
      cache: new InMemoryCache(),
      defaultOptions: {
        query: { fetchPolicy: 'no-cache' },
      },
    });

    const result = await client.query({
      query: OME_CLIENT_ASSESSMENTS,
      variables: { uuid: '12345' },
    });

    expect(bodies).toHaveLength(1);
    expect(Array.isArray(bodies[0])).toBe(false);
    expect(result.data).toEqual({
      client_assessments: [
        { __typename: 'Assessment', id: '12345', name: 'intake' },
      ],
    });
  });
});
