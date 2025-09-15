import { Agent } from 'http';
import { createDisposableServer } from '@internal/testing';
import { createSchema, createYoga } from 'graphql-yoga';
import { describe, expect, it, vi } from 'vitest';
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

const skipIfBun = globalThis.Bun ? it.skip : it;

describe('Custom Agent', () => {
  // TODO: Agents don't work well with Bun yet
  skipIfBun('should work', async () => {
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
    const spy = vi.spyOn(
      disposableAgent.agent,
      'createConnection',
    );
    await using gateway = createGatewayRuntime({
      proxy: {
        endpoint: `${upstreamServer.url}/graphql`,
      },
      customAgent: () => disposableAgent.agent,
    });
    expect(spy.mock.calls.length).toBe(0);
    const res = await gateway.fetch('http://localhost:4000/graphql', {
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
