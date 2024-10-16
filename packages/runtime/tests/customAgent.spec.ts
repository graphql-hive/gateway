import { Agent } from 'http';
import { createDisposableServer } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';
import { describe, expect, it, vitest } from 'vitest';
import { createGatewayRuntime } from '../src/createGatewayRuntime';

function createDisposableAgent() {
  const agent = new Agent();
  return {
    agent,
    [Symbol.dispose]() {
      agent.destroy();
    },
  };
}

describe('Custom Agent', () => {
  it('should work', async () => {
    await using upstreamServer = await createDisposableServer(
      createYoga<any>({
        schema: createSchema({
          typeDefs: /* GraphQL */ `
            type Query {
              hello: String!
            }
          `,
          resolvers: {
            Query: {
              hello: () => 'Hello World!',
            },
          },
        }),
      }),
    );
    using disposableAgent = createDisposableAgent();
    const spy = vitest.spyOn(
      disposableAgent.agent,
      // @ts-expect-error - `createConnection` is not available in typings
      'createConnection',
    );
    await using serveRuntime = createGatewayRuntime({
      proxy: {
        endpoint: `http://localhost:${upstreamServer.address().port}/graphql`,
      },
      customAgent: () => disposableAgent.agent,
    });
    expect(spy.mock.calls.length).toBe(0);
    const res = await serveRuntime.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query {
            hello
          }
        `,
      }),
    });
    const body = await res.json();
    expect(body).toEqual({
      data: {
        hello: 'Hello World!',
      },
    });
    expect(spy.mock.calls.length).toBeGreaterThan(0);
  });
});
