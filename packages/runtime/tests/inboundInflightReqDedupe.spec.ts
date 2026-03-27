import { setTimeout } from 'node:timers/promises';
import { envelop, useEngine, useSchema } from '@envelop/core';
import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { HTTPTransportOptions } from '@graphql-mesh/transport-http';
import { DeferredPromise } from '@whatwg-node/promise-helpers';
import { createDeferredPromise } from '@whatwg-node/server';
import { execute as graphqlExecute, parse } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useInboundInflightReqDedupeEnvelop,
  useInboundInflightReqDedupeForYoga,
} from '../src/plugins/useInboundInflightReqDedupe';

let helloCnt: number;
let greetCnt: number;
let updateMessageCnt: number;
let goodbyeCnt: number;
let helloDeferredCnt: number;
let helloDeferred: DeferredPromise<string>;
const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      hello: String
      greet(name: String!): String
      helloDeferred: String
      goodbye: String
    }

    type Mutation {
      updateMessage: String
    }
  `,
  resolvers: {
    Query: {
      async hello(_root, _args, _context, _info) {
        helloCnt++;
        await setTimeout(100); // Simulate some async work
        return 'world';
      },
      async greet(_root, args: { name: string }) {
        greetCnt++;
        await setTimeout(100); // Simulate some async work
        return `Hello, ${args.name}`;
      },
      helloDeferred() {
        helloDeferredCnt++;
        return helloDeferred.promise;
      },
      async goodbye() {
        goodbyeCnt++;
        await setTimeout(100); // Simulate some async work
        return 'farewell';
      },
    },
    Mutation: {
      async updateMessage() {
        updateMessageCnt++;
        await setTimeout(100); // Simulate some async work
        return 'updated';
      },
    },
  },
});
beforeEach(() => {
  helloCnt = 0;
  greetCnt = 0;
  updateMessageCnt = 0;
  goodbyeCnt = 0;
  helloDeferredCnt = 0;
  helloDeferred = createDeferredPromise<string>();
});

describe('useInboundInflightReqDedupeEnvelop', () => {
  it('deduplicates identical query requests', async () => {
    const getEnveloped = envelop({
      plugins: [
        useEngine({ parse, execute: graphqlExecute }),
        useSchema(schema),
        useInboundInflightReqDedupeEnvelop({
          enabled: () => true,
          getDeduplicationKeys: () => [],
        }),
      ],
    });

    const document = parse(/* GraphQL */ `
      query {
        hello
      }
    `);

    const { execute } = getEnveloped();

    // Execute the same query twice in parallel
    const [result1, result2] = await Promise.all([
      execute({ schema, document }),
      execute({ schema, document }),
    ]);

    expect(result1).toEqual({ data: { hello: 'world' } });
    expect(result2).toEqual({ data: { hello: 'world' } });

    // Should only execute once due to deduplication
    expect(helloCnt).toBe(1);
  });

  it('does not deduplicate mutations', async () => {
    const getEnveloped = envelop({
      plugins: [
        useEngine({ parse, execute: graphqlExecute }),
        useSchema(schema),
        useInboundInflightReqDedupeEnvelop({
          enabled: () => true,
          getDeduplicationKeys: () => [],
        }),
      ],
    });

    const document = parse(/* GraphQL */ `
      mutation {
        updateMessage
      }
    `);

    const { execute } = getEnveloped();

    // Execute the same mutation twice in parallel
    const [result1, result2] = await Promise.all([
      execute({ schema, document }),
      execute({ schema, document }),
    ]);

    expect(result1).toEqual({ data: { updateMessage: 'updated' } });
    expect(result2).toEqual({ data: { updateMessage: 'updated' } });

    // Should execute twice - mutations are not deduplicated
    expect(updateMessageCnt).toBe(2);
  });

  it('does not deduplicate when enabled returns false', async () => {
    const getEnveloped = envelop({
      plugins: [
        useEngine({ parse, execute: graphqlExecute }),
        useSchema(schema),
        useInboundInflightReqDedupeEnvelop({
          enabled: () => false, // Disabled
          getDeduplicationKeys: () => [],
        }),
      ],
    });

    const document = parse(/* GraphQL */ `
      query {
        hello
      }
    `);

    const { execute } = getEnveloped({
      request: new Request('http://localhost/graphql'),
    });

    // Execute the same query twice in parallel
    const [result1, result2] = await Promise.all([
      execute({ schema, document }),
      execute({ schema, document }),
    ]);

    expect(result1).toEqual({ data: { hello: 'world' } });
    expect(result2).toEqual({ data: { hello: 'world' } });

    // Should execute twice - deduplication is disabled
    expect(helloCnt).toBe(2);
  });

  it('distinguishes queries with different variables', async () => {
    const getEnveloped = envelop({
      plugins: [
        useEngine({ parse, execute: graphqlExecute }),
        useSchema(schema),
        useInboundInflightReqDedupeEnvelop({
          enabled: () => true,
          getDeduplicationKeys: () => [],
        }),
      ],
    });

    const document = parse(/* GraphQL */ `
      query Greet($name: String!) {
        greet(name: $name)
      }
    `);

    const { execute } = getEnveloped();

    // Execute with different variables in parallel
    const [result1, result2] = await Promise.all([
      execute({
        schema,
        document,
        variableValues: { name: 'Alice' },
        operationName: 'Greet',
      }),
      execute({
        schema,
        document,
        variableValues: { name: 'Bob' },
        operationName: 'Greet',
      }),
    ]);

    expect(result1).toEqual({ data: { greet: 'Hello, Alice' } });
    expect(result2).toEqual({ data: { greet: 'Hello, Bob' } });

    // Should execute twice - different variables
    expect(greetCnt).toBe(2);
  });

  it('uses custom deduplication keys', async () => {
    const getEnveloped = envelop({
      plugins: [
        useEngine({ parse, execute: graphqlExecute }),
        useSchema(schema),
        useInboundInflightReqDedupeEnvelop({
          enabled: () => true,
          getDeduplicationKeys: (args) => {
            // Use a custom context value as deduplication key
            return [(args.contextValue as any)?.userId || 'anonymous'];
          },
        }),
      ],
    });

    const document = parse(/* GraphQL */ `
      query {
        hello
      }
    `);

    const { execute: execute1 } = getEnveloped();
    const { execute: execute2 } = getEnveloped();

    // Execute same query with different user contexts
    const [result1, result2] = await Promise.all([
      execute1({ schema, document, contextValue: { userId: 'user1' } }),
      execute2({ schema, document, contextValue: { userId: 'user2' } }),
    ]);

    expect(result1).toEqual({ data: { hello: 'world' } });
    expect(result2).toEqual({ data: { hello: 'world' } });

    // Should execute twice - different custom keys (userId)
    expect(helloCnt).toBe(2);
  });

  it('cleans up inflight requests after completion', async () => {
    const getEnveloped = envelop({
      plugins: [
        useEngine({ parse, execute: graphqlExecute }),
        useSchema(schema),
        useInboundInflightReqDedupeEnvelop({
          enabled: () => true,
          getDeduplicationKeys: () => [],
        }),
      ],
    });

    const document = parse(/* GraphQL */ `
      query {
        helloDeferred
      }
    `);

    const { execute } = getEnveloped({
      request: new Request('http://localhost/graphql'),
    });

    // Start two queries
    const query1 = execute({ schema, document });
    const query2 = execute({ schema, document });

    // Resolve the deferred promise
    helloDeferred.resolve('world');

    const results = await Promise.all([query1, query2]);
    expect(results).toEqual([
      { data: { helloDeferred: 'world' } },
      { data: { helloDeferred: 'world' } },
    ]);
    expect(helloDeferredCnt).toBe(1); // Should only execute once due to deduplication

    // Start a new query after the previous ones completed
    helloDeferred = createDeferredPromise<string>(); // Reset deferred for the next query
    const query3 = execute({ schema, document });
    const query4 = execute({ schema, document });
    helloDeferred.resolve('Mars');

    const results2 = await Promise.all([query3, query4]);
    expect(results2).toEqual([
      { data: { helloDeferred: 'Mars' } },
      { data: { helloDeferred: 'Mars' } },
    ]);
    expect(helloDeferredCnt).toBe(2); // Should execute again since previous inflight request was cleaned up
  });

  it('deduplicates queries with operation names', async () => {
    const getEnveloped = envelop({
      plugins: [
        useEngine({ parse, execute: graphqlExecute }),
        useSchema(schema),
        useInboundInflightReqDedupeEnvelop({
          enabled: () => true,
          getDeduplicationKeys: () => [],
        }),
      ],
    });

    const document = parse(/* GraphQL */ `
      query Hello {
        hello
      }
      query Goodbye {
        goodbye
      }
    `);

    const { execute } = getEnveloped();

    // Execute the same operation twice
    const [result1, result2] = await Promise.all([
      execute({ schema, document, operationName: 'Hello' }),
      execute({ schema, document, operationName: 'Hello' }),
    ]);

    expect(result1).toEqual({ data: { hello: 'world' } });
    expect(result2).toEqual({ data: { hello: 'world' } });

    // Should only execute once due to deduplication
    expect(helloCnt).toBe(1);
  });

  it('does not deduplicate different operations in the same document', async () => {
    const getEnveloped = envelop({
      plugins: [
        useEngine({ parse, execute: graphqlExecute }),
        useSchema(schema),
        useInboundInflightReqDedupeEnvelop({
          enabled: () => true,
          getDeduplicationKeys: () => [],
        }),
      ],
    });

    const document = parse(/* GraphQL */ `
      query Hello {
        hello
      }
      query Goodbye {
        goodbye
      }
    `);

    const { execute } = getEnveloped();

    // Execute different operations from the same document
    const [result1, result2] = await Promise.all([
      execute({ schema, document, operationName: 'Hello' }),
      execute({ schema, document, operationName: 'Goodbye' }),
    ]);

    expect(result1).toEqual({ data: { hello: 'world' } });
    expect(result2).toEqual({ data: { goodbye: 'farewell' } });

    // Should execute twice - different operations
    expect(helloCnt).toBe(1);
    expect(goodbyeCnt).toBe(1);
  });
});

describe('useInboundInflightReqDedupeForYoga', () => {
  it('deduplicates identical requests from Yoga', async () => {
    await using yoga = createYoga({
      schema,
      plugins: [useInboundInflightReqDedupeForYoga()],
    });

    const query = /* GraphQL */ `
      query {
        hello
      }
    `;

    // Make two identical requests in parallel
    const [response1, response2] = await Promise.all([
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }),
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }),
    ]);

    const [json1, json2] = await Promise.all([
      response1.json(),
      response2.json(),
    ]);

    expect(json1).toEqual({ data: { hello: 'world' } });
    expect(json2).toEqual({ data: { hello: 'world' } });

    // Should execute only once due to deduplication
    expect(helloCnt).toBe(1);
  });

  it('does not deduplicate requests with different headers', async () => {
    await using yoga = createYoga({
      schema,
      plugins: [useInboundInflightReqDedupeForYoga()],
    });

    const query = /* GraphQL */ `
      query {
        hello
      }
    `;

    // Make requests with different headers
    const [response1, response2] = await Promise.all([
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-custom-header': 'value1',
        },
        body: JSON.stringify({ query }),
      }),
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-custom-header': 'value2',
        },
        body: JSON.stringify({ query }),
      }),
    ]);

    const [json1, json2] = await Promise.all([
      response1.json(),
      response2.json(),
    ]);

    expect(json1).toEqual({ data: { hello: 'world' } });
    expect(json2).toEqual({ data: { hello: 'world' } });

    // Should execute twice due to different headers
    expect(helloCnt).toBe(2);
  });

  it('filters headers with shouldIncludeHeader', async () => {
    await using yoga = createYoga({
      schema,
      plugins: [
        useInboundInflightReqDedupeForYoga({
          shouldIncludeHeader: (headerName) => {
            // Ignore authorization headers for deduplication
            return headerName !== 'authorization';
          },
        }),
      ],
    });

    const query = /* GraphQL */ `
      query {
        hello
      }
    `;

    // Make requests with different authorization headers (should be deduplicated)
    const [response1, response2] = await Promise.all([
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer token1',
        },
        body: JSON.stringify({ query }),
      }),
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer token2',
        },
        body: JSON.stringify({ query }),
      }),
    ]);

    const [json1, json2] = await Promise.all([
      response1.json(),
      response2.json(),
    ]);

    expect(json1).toEqual({ data: { hello: 'world' } });
    expect(json2).toEqual({ data: { hello: 'world' } });

    // Should execute only once since auth headers are ignored for deduplication
    expect(helloCnt).toBe(1);
  });

  it('respects custom enabled function', async () => {
    await using yoga = createYoga({
      schema,
      plugins: [
        useInboundInflightReqDedupeForYoga({
          enabled: (_args, request) => {
            // Only enable for requests with a specific header
            return request.headers.get('x-enable-dedupe') === 'true';
          },
        }),
      ],
    });

    const query = /* GraphQL */ `
      query {
        hello
      }
    `;

    // Make requests without the header (should not deduplicate)
    const [response1, response2] = await Promise.all([
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }),
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }),
    ]);

    await Promise.all([response1.json(), response2.json()]);

    // Should execute twice since deduplication is disabled
    expect(helloCnt).toBe(2);

    // Reset counter
    helloCnt = 0;

    // Make requests with the header (should deduplicate)
    const [response3, response4] = await Promise.all([
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-enable-dedupe': 'true',
        },
        body: JSON.stringify({ query }),
      }),
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-enable-dedupe': 'true',
        },
        body: JSON.stringify({ query }),
      }),
    ]);

    await Promise.all([response3.json(), response4.json()]);

    // Should execute only once with deduplication enabled
    expect(helloCnt).toBe(1);
  });

  it('uses custom deduplication keys from getDeduplicationKeys', async () => {
    await using yoga = createYoga({
      schema,
      plugins: [
        useInboundInflightReqDedupeForYoga({
          getDeduplicationKeys: (_args, request) => {
            // Only use user-id header for deduplication, ignore other headers
            const userId = request.headers.get('user-id');
            return userId ? [`user:${userId}`] : [];
          },
          shouldIncludeHeader: () => false, // Ignore all default headers
        }),
      ],
    });

    const query = /* GraphQL */ `
      query {
        hello
      }
    `;

    // Make requests with same user-id but different other headers (should deduplicate)
    const [response1, response2] = await Promise.all([
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-id': 'user123',
          'session-id': 'session1',
        },
        body: JSON.stringify({ query }),
      }),
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-id': 'user123',
          'session-id': 'session2',
        },
        body: JSON.stringify({ query }),
      }),
    ]);

    await Promise.all([response1.json(), response2.json()]);

    // Should execute only once since user-id is the same
    expect(helloCnt).toBe(1);
  });

  it('does not deduplicate mutations', async () => {
    await using yoga = createYoga({
      schema,
      plugins: [useInboundInflightReqDedupeForYoga()],
    });

    const mutation = /* GraphQL */ `
      mutation {
        updateMessage
      }
    `;

    // Make two identical mutation requests
    const [response1, response2] = await Promise.all([
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query: mutation }),
      }),
      yoga.fetch('http://localhost:4000/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query: mutation }),
      }),
    ]);

    const [json1, json2] = await Promise.all([
      response1.json(),
      response2.json(),
    ]);

    expect(json1).toEqual({ data: { updateMessage: 'updated' } });
    expect(json2).toEqual({ data: { updateMessage: 'updated' } });

    // Should execute twice - mutations are not deduplicated
    expect(updateMessageCnt).toBe(2);
  });
});
