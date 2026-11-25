import { useCustomFetch } from '@graphql-hive/gateway-runtime';
import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { composeServices } from '@theguild/federation-composition';
import { parse } from 'graphql';
import { expect, it } from 'vitest';
import { unifiedGraphHandler } from '../src/index';

// composed here because the gateway tester's subgraphs lose the `@oneOf`
const { supergraphSdl } = composeServices([
  {
    name: 's0',
    url: 'http://s0/graphql',
    typeDefs: parse(/* GraphQL */ `
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])
      input OrderBy @oneOf {
        id: Int
        name: String
      }
      type Query {
        order(id: Int!): String
        orderBy(by: OrderBy!): String
        orders: [String]
      }
    `),
  },
]);

function createGateway(fetchFn: Parameters<typeof useCustomFetch>[0]) {
  return createGatewayTester({
    unifiedGraphHandler,
    supergraph: supergraphSdl!,
    plugins: () => [useCustomFetch(fetchFn)],
  });
}

function post(gw: ReturnType<typeof createGateway>, body: object) {
  return gw.fetch('http://gateway/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

it.each([
  {
    name: 'an invalid variable',
    query: 'query ($id: Int!) { order(id: $id) }',
    variables: { id: 'not a number' },
    message: 'Int cannot represent non-integer value: "not a number"',
  },
  {
    name: 'a oneOf input with two keys',
    query: 'query ($by: OrderBy!) { orderBy(by: $by) }',
    variables: { by: { id: 1, name: 'order' } },
    // graphql 16 says "key", 17 says "field"
    message: /exactly one (field|key) must be specified/i,
  },
])('responds with 400 to $name', async ({ query, variables, message }) => {
  await using gw = createGateway(() => {
    throw new Error('Subgraph should not be called');
  });

  const res = await post(gw, { query, variables });

  expect(res.status).toBe(400);
  await expect(res.json()).resolves.toEqual({
    errors: [
      {
        message: expect.stringMatching(message),
        locations: [{ line: 1, column: 8 }],
      },
    ],
  });
});

it('responds with 200 and nulls the fields of a subgraph whose connection dropped', async () => {
  await using gw = createGateway(() => {
    throw new Error('socket hang up');
  });

  const res = await post(gw, { query: '{ orders }' });

  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({
    data: { orders: null },
    errors: [
      {
        message: 'socket hang up',
        path: ['orders'],
        extensions: expect.objectContaining({
          code: 'SUBREQUEST_HTTP_ERROR',
          serviceName: 's0',
        }),
      },
    ],
  });
});

it('sends the operation name of the client to the subgraph', async () => {
  const bodies: unknown[] = [];
  await using gw = createGateway(async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ data: { orders: ['order'] } });
  });

  const res = await post(gw, {
    query: 'query Orders { orders }',
    operationName: 'Orders',
  });

  await expect(res.json()).resolves.toEqual({ data: { orders: ['order'] } });
  expect(bodies).toEqual([
    { query: 'query Orders{orders}', operationName: 'Orders' },
  ]);
});
