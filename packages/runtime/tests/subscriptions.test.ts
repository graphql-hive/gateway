import { createGatewayTester } from '@graphql-hive/gateway-testing';
import { createDeferred, type MaybePromise } from '@graphql-tools/utils';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { createClient as createSSEClient } from 'graphql-sse';
import { createSchema, Repeater } from 'graphql-yoga';
import { afterAll, describe, expect, it } from 'vitest';

describe('Subscriptions', () => {
  const leftovers: (() => MaybePromise<void>)[] = [];
  afterAll(() => Promise.all(leftovers.map((l) => l())));
  const upstreamSchema = createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        foo: String
      }

      type Subscription {
        neverEmits: String
      }
    `,
    resolvers: {
      Query: {
        foo: () => 'bar',
      },
      Subscription: {
        neverEmits: {
          subscribe: () =>
            new Repeater((_push, stop) => {
              leftovers.push(stop);
            }),
        },
      },
    },
  });

  it('should terminate subscriptions gracefully on shutdown', async () => {
    await using serve = createGatewayTester({
      subgraphs: [
        {
          name: 'upstream',
          schema: upstreamSchema,
        },
      ],
    });

    const sse = createSSEClient({
      url: 'http://mesh/graphql',
      fetchFn: serve.fetch,
      on: {
        connected() {
          setImmediate(() => {
            serve[DisposableSymbols.asyncDispose]();
          });
        },
      },
    });

    const sub = sse.iterate({
      query: /* GraphQL */ `
        subscription {
          neverEmits
        }
      `,
    });

    const msgs: unknown[] = [];
    for await (const msg of sub) {
      msgs.push(msg);
    }

    expect(msgs[msgs.length - 1]).toMatchObject({
      errors: [
        {
          extensions: {
            code: 'SHUTTING_DOWN',
          },
          message:
            'operation has been aborted because the server is shutting down',
        },
      ],
    });
  });

  it('should terminate subscriptions gracefully on schema update', async () => {
    let changeSchema = false;

    await using serve = createGatewayTester({
      pollingInterval: 500,
      subgraphs: () => {
        if (changeSchema) {
          return [
            {
              name: 'upstream',
              schema: {
                typeDefs: /* GraphQL */ `
                  type Query {
                    foo: String!
                  }
                `,
                resolvers: {
                  Query: {
                    foo: () => 'bar',
                  },
                },
              },
            },
          ];
        }
        changeSchema = true;
        return [
          {
            name: 'upstream',
            schema: upstreamSchema,
          },
        ];
      },
    });

    const sse = createSSEClient({
      url: 'http://mesh/graphql',
      fetchFn: serve.fetch,
    });

    const sub = sse.iterate({
      query: /* GraphQL */ `
        subscription {
          neverEmits
        }
      `,
    });

    const msgs: unknown[] = [];
    globalThis.setTimeout(async () => {
      await expect(
        serve.execute({
          query: /* GraphQL */ `
            query {
              foo
            }
          `,
        }),
      ).resolves.toMatchObject({
        data: {
          foo: 'bar',
        },
      });
    }, 1000);
    for await (const msg of sub) {
      msgs.push(msg);
    }

    expect(msgs[msgs.length - 1]).toMatchObject({
      errors: [
        {
          extensions: {
            code: 'SCHEMA_RELOAD',
          },
          message: 'operation has been aborted due to a schema reload',
        },
      ],
    });
  });

  it('terminates subscriptions on schema update even when graceful reload is enabled', async () => {
    let changeSchema = false;

    await using serve = createGatewayTester({
      pollingInterval: 500,
      // Graceful reload keeps in-flight queries/mutations alive across a reload,
      // but long-lived subscriptions are never pinned — with nothing draining
      // here, the superseded generation is disposed at reload and the
      // subscription must end right away so the client reconnects against the
      // new schema.
      gracefulSchemaReload: { drainTimeout: 10_000 },
      subgraphs: () => {
        if (changeSchema) {
          return [
            {
              name: 'upstream',
              schema: {
                typeDefs: /* GraphQL */ `
                  type Query {
                    foo: String!
                  }
                `,
                resolvers: {
                  Query: {
                    foo: () => 'bar',
                  },
                },
              },
            },
          ];
        }
        changeSchema = true;
        return [
          {
            name: 'upstream',
            schema: upstreamSchema,
          },
        ];
      },
    });

    const sse = createSSEClient({
      url: 'http://mesh/graphql',
      fetchFn: serve.fetch,
    });

    const sub = sse.iterate({
      query: /* GraphQL */ `
        subscription {
          neverEmits
        }
      `,
    });

    const msgs: unknown[] = [];
    globalThis.setTimeout(() => {
      void serve.execute({
        query: /* GraphQL */ `
          query {
            foo
          }
        `,
      });
    }, 1000);
    for await (const msg of sub) {
      msgs.push(msg);
    }

    expect(msgs[msgs.length - 1]).toMatchObject({
      errors: [
        {
          extensions: {
            code: 'SCHEMA_RELOAD',
          },
          message: 'operation has been aborted due to a schema reload',
        },
      ],
    });
  });

  it('releases the generation pin of an aborted operation so the superseded generation still drains', async () => {
    let changeSchema = false;
    const blockingEntered = createDeferred<void>();
    const releaseBlocking = createDeferred<string>();
    const subscribed = createDeferred<void>();

    await using serve = createGatewayTester({
      pollingInterval: 500,
      executionCancellation: true,
      // Long drain: if the aborted (rejected) operation leaked its pin, the
      // superseded generation — and the subscription still running on it —
      // would be held alive this long.
      gracefulSchemaReload: { drainTimeout: 30_000 },
      subgraphs: () => {
        if (changeSchema) {
          return [
            {
              name: 'upstream',
              schema: {
                typeDefs: /* GraphQL */ `
                  type Query {
                    foo: String
                  }
                `,
                resolvers: {
                  Query: {
                    foo: () => 'bar',
                  },
                },
              },
            },
          ];
        }
        return [
          {
            name: 'upstream',
            schema: {
              typeDefs: /* GraphQL */ `
                type Query {
                  foo: String
                  blocking: String
                }
                type Subscription {
                  neverEmits: String
                }
              `,
              resolvers: {
                Query: {
                  foo: () => 'bar',
                  blocking: () => {
                    blockingEntered.resolve();
                    return releaseBlocking.promise;
                  },
                },
                Subscription: {
                  neverEmits: {
                    subscribe: () =>
                      new Repeater((_push, stop) => {
                        leftovers.push(stop);
                      }),
                  },
                },
              },
            },
          },
        ];
      },
    });

    const sse = createSSEClient({
      url: 'http://mesh/graphql',
      fetchFn: serve.fetch,
      on: {
        connected() {
          subscribed.resolve();
        },
      },
    });

    const sub = sse.iterate({
      query: /* GraphQL */ `
        subscription {
          neverEmits
        }
      `,
    });

    const msgs: unknown[] = [];
    const consumed = (async () => {
      for await (const msg of sub) {
        msgs.push(msg);
      }
    })();
    await subscribed.promise;

    // Pin the current generation with an operation blocked inside the
    // upstream, then abort it: the execution rejects (execution
    // cancellation), and the pin must be released.
    const ctrl = new AbortController();
    const aborted = serve
      .fetch('http://mesh/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ blocking }' }),
        signal: ctrl.signal,
      })
      .then(
        (res) => res.text(),
        () => 'aborted',
      );
    await blockingEntered.promise;
    ctrl.abort();
    await aborted;

    // Reload. Nothing is legitimately in flight on the previous generation
    // anymore, so it must be disposed right away — ending the subscription
    // with SCHEMA_RELOAD well before the 30s drain timeout.
    changeSchema = true;
    globalThis.setTimeout(() => {
      void serve.execute({
        query: /* GraphQL */ `
          query {
            foo
          }
        `,
      });
    }, 1000);
    await consumed;

    expect(msgs[msgs.length - 1]).toMatchObject({
      errors: [
        {
          extensions: {
            code: 'SCHEMA_RELOAD',
          },
          message: 'operation has been aborted due to a schema reload',
        },
      ],
    });

    // Unblock the upstream resolver so everything can settle.
    releaseBlocking.resolve('late');
  }, 20_000);

  it('keeps a subscription on a draining generation until the last pinned operation finishes', async () => {
    let changeSchema = false;
    const blockingEntered = createDeferred<void>();
    const releaseBlocking = createDeferred<string>();
    const subscribed = createDeferred<void>();

    await using serve = createGatewayTester({
      pollingInterval: 500,
      gracefulSchemaReload: { drainTimeout: 30_000 },
      subgraphs: () => {
        if (changeSchema) {
          return [
            {
              name: 'upstream',
              schema: {
                typeDefs: /* GraphQL */ `
                  type Query {
                    foo: String
                  }
                `,
                resolvers: {
                  Query: {
                    foo: () => 'bar2',
                  },
                },
              },
            },
          ];
        }
        return [
          {
            name: 'upstream',
            schema: {
              typeDefs: /* GraphQL */ `
                type Query {
                  foo: String
                  blocking: String
                }
                type Subscription {
                  neverEmits: String
                }
              `,
              resolvers: {
                Query: {
                  foo: () => 'bar',
                  blocking: () => {
                    blockingEntered.resolve();
                    return releaseBlocking.promise;
                  },
                },
                Subscription: {
                  neverEmits: {
                    subscribe: () =>
                      new Repeater((_push, stop) => {
                        leftovers.push(stop);
                      }),
                  },
                },
              },
            },
          },
        ];
      },
    });

    const sse = createSSEClient({
      url: 'http://mesh/graphql',
      fetchFn: serve.fetch,
      on: {
        connected() {
          subscribed.resolve();
        },
      },
    });

    const sub = sse.iterate({
      query: /* GraphQL */ `
        subscription {
          neverEmits
        }
      `,
    });

    const msgs: unknown[] = [];
    let subEnded = false;
    const consumed = (async () => {
      for await (const msg of sub) {
        msgs.push(msg);
      }
      subEnded = true;
    })();
    await subscribed.promise;

    // Pin the current generation with an operation blocked inside the
    // upstream, then reload: the generation drains instead of being
    // disposed.
    const pinned = serve.execute({
      query: /* GraphQL */ `
        query {
          blocking
        }
      `,
    });
    await blockingEntered.promise;

    changeSchema = true;
    // Drive the lazy poller until the gateway serves the new generation.
    for (let i = 0; i < 40; i++) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
      const result = await serve.execute({
        query: /* GraphQL */ `
          query {
            foo
          }
        `,
      });
      if (!(Symbol.asyncIterator in result) && result.data?.foo === 'bar2') {
        break;
      }
    }

    // The old generation is draining (one pinned operation in flight), so
    // the subscription must NOT have been terminated at reload time...
    expect(subEnded).toBe(false);

    // ...but disposing the drained generation — right after its last pinned
    // operation completes — must end it with SCHEMA_RELOAD.
    releaseBlocking.resolve('done');
    const pinnedResult = await pinned;
    if (!(Symbol.asyncIterator in pinnedResult)) {
      expect(pinnedResult.data?.blocking).toBe('done');
    }
    await consumed;

    expect(msgs[msgs.length - 1]).toMatchObject({
      errors: [
        {
          extensions: {
            code: 'SCHEMA_RELOAD',
          },
          message: 'operation has been aborted due to a schema reload',
        },
      ],
    });
  }, 20_000);
});
