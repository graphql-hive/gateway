import { createSchema, createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';
import { useCustomFetch } from '../src/plugins/useCustomFetch';

describe('Body Truncation Bug', () => {
  it('WITHOUT propagateHeaders - body gets normalized', async () => {
    const receivedBodies: string[] = [];

    const upstream = createYoga({
      schema: createSchema({
        typeDefs: /* GraphQL */ `
          type Query {
            field1: String
            field2: String
            field3: String
          }
        `,
        resolvers: {
          Query: {
            field1: () => 'value1',
            field2: () => 'value2',
            field3: () => 'value3',
          },
        },
      }),
      plugins: [
        {
          async onRequest({ request }) {
            const cloned = request.clone();
            receivedBodies.push(await cloned.text());
          },
        },
      ],
    });

    await using gateway = createGatewayRuntime({
      proxy: {
        endpoint: 'http://localhost:4001/graphql',
      },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
          upstream.fetch,
        ),
      ],
    });

    // Create large query with aliased fields
    let queryFields = '';
    for (let i = 0; i < 200; i++) {
      queryFields += `
        alias${i}_field1: field1
        alias${i}_field2: field2
        alias${i}_field3: field3
      `;
    }

    const query = `query Test { ${queryFields} }`;
    const requestBody = JSON.stringify({ query });

    await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: requestBody,
    });

    // Get last received body (skip introspection)
    const receivedBody = receivedBodies[receivedBodies.length - 1];
    const parsedReceived = JSON.parse(receivedBody);
    const parsedSent = JSON.parse(requestBody);

    // Body is re-serialized, so it won't match exactly
    expect(receivedBody).not.toBe(requestBody);

    // But it should be valid JSON
    expect(() => JSON.parse(receivedBody)).not.toThrow();

    // Query is normalized (whitespace removed)
    expect(parsedReceived.query).not.toBe(parsedSent.query);
    expect(parsedReceived.query).not.toContain('\n'); // Whitespace removed
  });

  it('WITH propagateHeaders - body gets truncated to INVALID JSON', async () => {
    const receivedBodies: string[] = [];

    const upstream = createYoga({
      schema: createSchema({
        typeDefs: /* GraphQL */ `
          type Query {
            field1: String
            field2: String
            field3: String
          }
        `,
        resolvers: {
          Query: {
            field1: () => 'value1',
            field2: () => 'value2',
            field3: () => 'value3',
          },
        },
      }),
      plugins: [
        {
          async onRequest({ request }) {
            const cloned = request.clone();
            receivedBodies.push(await cloned.text());
          },
        },
      ],
    });

    await using gateway = createGatewayRuntime({
      proxy: {
        endpoint: 'http://localhost:4001/graphql',
      },
      propagateHeaders: {
        fromClientToSubgraphs({ request }) {
          return { 'x-test': request.headers.get('x-test') || '' };
        },
      },
      plugins: () => [
        useCustomFetch(
          // @ts-expect-error TODO: MeshFetch is not compatible with @whatwg-node/server fetch
          upstream.fetch,
        ),
      ],
    });

    // Create VERY large query to trigger hard truncation (not just GraphQL-level truncation)
    // Need to exceed whatever buffer limit exists
    let queryFields = '';
    for (let i = 0; i < 1000; i++) {
      queryFields += `
        alias${i}_field1: field1
        alias${i}_field2: field2
        alias${i}_field3: field3
      `;
    }

    const query = `query Test { ${queryFields} }`;
    const requestBody = JSON.stringify({ query });

    console.log('Sending body size:', requestBody.length, 'bytes');

    await gateway.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test': 'test-value',
      },
      body: requestBody,
    });

    // Get last received body (skip introspection)
    const receivedBody = receivedBodies[receivedBodies.length - 1];

    console.log('Received body size:', receivedBody.length, 'bytes');
    console.log('Body ends with:', JSON.stringify(receivedBody.slice(-100)));

    // Production bug: body is truncated mid-stream to invalid JSON
    let isValidJSON = true;
    let parseError = '';
    try {
      JSON.parse(receivedBody);
    } catch (e) {
      isValidJSON = false;
      parseError = (e as Error).message;
      console.log('JSON parse error:', parseError);
    }

    // The bug: body is truncated to invalid JSON
    expect(isValidJSON).toBe(false);
    expect(receivedBody.length).toBeLessThan(requestBody.length);
  });
});
