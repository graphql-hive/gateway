import { setTimeout } from 'timers/promises';
import { createGraphQLError } from '@graphql-tools/utils';
import { assertAsyncIterable, createDisposableServer } from '@internal/testing';
import { Repeater } from '@repeaterjs/repeater';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { ReadableStream, Request, Response } from '@whatwg-node/fetch';
import {
  createDeferredPromise,
  createServerAdapter,
} from '@whatwg-node/server';
import { GraphQLError, parse } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import { describe, expect, it } from 'vitest';
import { buildHTTPExecutor } from '../src/index.js';

describe('buildHTTPExecutor', () => {
  it('method should be POST for mutations even if useGETForQueries=true', async () => {
    await using executor = buildHTTPExecutor({
      useGETForQueries: true,
      fetch(_url, init) {
        return Response.json({ data: init });
      },
    });

    const mutation = parse(/* GraphQL */ `
      mutation {
        doSomething
      }
    `);

    await expect(
      executor({
        document: mutation,
      }),
    ).resolves.toMatchObject({
      data: { method: 'POST' },
    });
  });
  it('handle unexpected json responses', async () => {
    await using executor = buildHTTPExecutor({
      fetch: () => new Response('NOT JSON'),
    });
    await expect(
      executor({
        document: parse(/* GraphQL */ `
          query {
            hello
          }
        `),
      }),
    ).resolves.toMatchObject({
      errors: [
        {
          message: 'Unexpected response: "NOT JSON"',
        },
      ],
    });
  });
  it.each([
    { data: null, errors: null },
    { data: null },
    { data: null, errors: [] },
    { errors: null },
    { errors: [] },
  ])(
    'should error when both data and errors fields are empty %s',
    async (body) => {
      await using executor = buildHTTPExecutor({
        fetch: () => Response.json(body),
      });
      await expect(
        executor({
          document: parse(/* GraphQL */ `
            query {
              hello
            }
          `),
        }),
      ).resolves.toMatchObject({
        errors: [
          {
            message: expect.stringContaining(
              'Unexpected empty "data" and "errors" fields',
            ),
          },
        ],
      });
    },
  );
  it('should use GET for subscriptions by default', async () => {
    expect.assertions(2);
    let method: string = '';
    await using executor = buildHTTPExecutor({
      endpoint: 'https://my.schema/graphql',
      fetch: (info, init) => {
        const request = new Request(info, init);
        method = request.method;
        return new Response(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(
                `data: ${JSON.stringify({ data: { hello: 'world' } })}\n\n`,
              );
              await setTimeout(100);
              controller.close();
            },
          }),
          {
            headers: { 'Content-Type': 'text/event-stream' },
          },
        );
      },
    });
    const result = await executor({
      document: parse(/* GraphQL */ `
        subscription {
          hello
        }
      `),
    });
    assertAsyncIterable(result);
    for await (const item of result) {
      expect(item).toMatchObject({
        data: { hello: 'world' },
      });
      break;
    }
    expect(method).toBe('GET');
  });
  it('should use POST if method is specified', async () => {
    let method: string = '';
    await using executor = buildHTTPExecutor({
      method: 'POST',
      endpoint: 'https://my.schema/graphql',
      fetch: (info, init) => {
        const request = new Request(info, init);
        method = request.method;
        return new Response(
          new ReadableStream({
            async start(controller) {
              controller.enqueue(
                `data: ${JSON.stringify({ data: { hello: 'world' } })}\n\n`,
              );
              await setTimeout(100);
              controller.close();
            },
          }),
          {
            headers: { 'Content-Type': 'text/event-stream' },
          },
        );
      },
    });
    const result = await executor({
      document: parse(/* GraphQL */ `
        subscription {
          hello
        }
      `),
    });
    assertAsyncIterable(result);
    const iterator = result[Symbol.asyncIterator]();
    const first = await iterator.next();
    await iterator?.return?.();
    expect(first).toMatchObject({
      value: { data: { hello: 'world' } },
    });
    expect(method).toBe('POST');
  });

  it('should not encode headers from extensions', async () => {
    await using executor = buildHTTPExecutor({
      useGETForQueries: true,
      fetch(url) {
        expect(url).not.toMatch(/(Authorization|headers)/i);
        return new Response(JSON.stringify({ data: { hello: 'world!' } }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    await expect(
      executor({
        document: parse(/* GraphQL */ `
          query {
            hello
          }
        `),
        extensions: {
          headers: {
            Authorization: 'Token',
          },
        },
      }),
    ).resolves.toEqual({
      data: { hello: 'world!' },
    });
  });

  it('should allow setting a custom content-type header in introspection', async () => {
    expect.assertions(2);

    await using executor = buildHTTPExecutor({
      endpoint: 'https://my.schema/graphql',
      fetch(_url, options: any) {
        expect(options?.headers?.['content-type']).toBe(
          'application/vnd.api+json',
        );
        return Response.json({ data: { hello: 'world' } });
      },
      headers: { 'content-type': 'application/vnd.api+json' },
    });
    await expect(
      executor({
        document: parse(/* GraphQL */ `
          query IntrospectionQuery {
            __schema {
              queryType {
                name
              }
              mutationType {
                name
              }
              subscriptionType {
                name
              }
            }
          }
        `),
      }),
    ).resolves.toEqual({
      data: expect.any(Object),
    });
  });
  it('stops existing requests when the executor is disposed', async () => {
    // Create a server that never responds
    const neverResolves = createDeferredPromise<Response>();
    await using server = await createDisposableServer(
      createServerAdapter(() => neverResolves.promise),
    );
    await using executor = buildHTTPExecutor({
      endpoint: server.url,
    });
    const result = executor({
      document: parse(/* GraphQL */ `
        query {
          hello
        }
      `),
    });
    await executor[Symbol.asyncDispose]();
    await expect(result).resolves.toMatchObject({
      errors: [
        {
          message: expect.stringContaining('Executor was disposed'),
        },
      ],
    });
    neverResolves.resolve(Response.error());
  });
  it('does not allow new requests when the executor is disposed', async () => {
    await using executor = buildHTTPExecutor({
      fetch: () => Response.json({ data: { hello: 'world' } }),
    });
    executor[DisposableSymbols.asyncDispose]?.();
    expect(
      executor({
        document: parse(/* GraphQL */ `
          query {
            hello
          }
        `),
      }),
    ).toMatchObject({
      errors: [
        createGraphQLError(
          'The operation was aborted. reason: Error: Executor was disposed.',
        ),
      ],
    });
  });
  it('should return return GraphqlError instances', async () => {
    await using executor = buildHTTPExecutor({
      useGETForQueries: true,
      fetch() {
        return Response.json({ errors: [{ message: 'test error' }] });
      },
    });

    await expect(
      executor({
        document: parse(/* GraphQL */ `
          query {
            hello
          }
        `),
      }),
    ).resolves.toMatchObject({
      errors: expect.arrayContaining([
        expect.any(GraphQLError),
        expect.objectContaining({
          extensions: {
            code: 'DOWNSTREAM_SERVICE_ERROR',
          },
        }),
      ]),
    });
  });

  it('should abort stream when SSE gets cancelled while waiting for next event', async () => {
    // we use yoga intentionally here because simulating the proper response object locally is tricky
    await using yoga = createYoga({
      schema: createSchema({
        typeDefs: /* GraphQL */ `
          scalar Upload # intentionally not "File" to test scalar name independence
          type Query {
            hello: String!
          }
          type Subscription {
            emitsOnceAndStalls: String
          }
        `,
        resolvers: {
          Query: {
            hello: () => 'world',
          },
          Subscription: {
            emitsOnceAndStalls: {
              subscribe: () =>
                new Repeater(async (push, stop) => {
                  push({ emitsOnceAndStalls: '👋' });
                  await stop;
                }),
            },
          },
        },
      }),
    });

    // we start a server to simulate a real-world request
    await using server = await createDisposableServer(yoga);

    await using executor = buildHTTPExecutor({
      endpoint: `${server.url}/graphql`,
    });

    const result = await executor({
      document: parse(/* GraphQL */ `
        subscription {
          emitsOnceAndStalls
        }
      `),
    });

    assertAsyncIterable(result);
    const iter = result[Symbol.asyncIterator]();

    const nextValue = await iter.next();
    expect(nextValue).toEqual({
      done: false,
      value: {
        data: {
          emitsOnceAndStalls: '👋',
        },
      },
    });

    // request another one ☝️ (we dont await because there wont be another event)
    iter.next();

    // then cancel
    await iter.return?.();
  });
});
