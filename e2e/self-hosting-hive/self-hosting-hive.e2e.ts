import { setTimeout } from 'node:timers/promises';
import { createTenv } from '@internal/e2e';
import { isCI } from '~internal/env';
import { createClient as sseCreateClient } from 'graphql-sse';
import { createClient as wsCreateClient } from 'graphql-ws';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';

const { gateway, service, gatewayRunner, composeWithApollo } =
  createTenv(__dirname);

describe('Self Hosting Hive', () => {
  const TEST_TOKEN = 'my-token';
  const TEST_KEY = 'my-key';

  it('usage reporting of queries', async () => {
    const supergraph = await composeWithApollo({
      services: [await service('posts'), await service('users')],
    });
    const selfHostingHive = await service('selfHostingHive', {
      env: {
        SUPERGRAPH_PATH: supergraph.output,
      },
    });
    const HIVE_URL = `http://${
      gatewayRunner.includes('docker')
        ? isCI()
          ? '172.17.0.1'
          : 'host.docker.internal'
        : 'localhost'
    }:${selfHostingHive.port}`;
    const gw = await gateway({
      supergraph: `${HIVE_URL}/supergraph`,
      args: [
        `--hive-registry-token=${TEST_TOKEN}`,
        `--hive-cdn-key=${TEST_KEY}`,
      ],
      env: {
        HIVE_URL,
      },
    });
    await expect(
      gw.execute({
        query: /* GraphQL */ `
          {
            allPosts {
              title
            }
          }
        `,
      }),
    ).resolves.toMatchInlineSnapshot(`
      {
        "data": {
          "allPosts": [
            {
              "title": "Hello world",
            },
          ],
        },
      }
    `);
    await setTimeout(300);
    const incomingData = selfHostingHive.getStd('out');
    // Check if `/supergraph` endpoint receives the GET request
    expect(incomingData).toContain('GET /supergraph');
    expect(incomingData).toContain(`"x-hive-cdn-key":"${TEST_KEY}"`);
    // Check if `/usage` endpoint receives the POST request
    expect(incomingData).toContain('POST /usage');
    expect(incomingData).toContain(`"authorization":"Bearer ${TEST_TOKEN}"`);
    // Check if appropriate logs
    const gwLogs = gw.getStd('out');
    expect(gwLogs).toMatch(
      /\[hiveSupergraphFetcher\] GET .* succeeded with status 200/,
    );
    expect(gwLogs).toMatch(
      /\[useHiveConsole\] POST .*\/usage .* succeeded with status 200/,
    );
  });

  it.describe.each(['sse', 'ws'] as const)(
    'usage reporting of subscriptions with subgraphs over %s',
    (subProtocol) => {
      it.each(['sse', 'ws'] as const)(
        'and clients over %s',
        async (clProtocol) => {
          const users = await service('users');
          const supergraph = await composeWithApollo({
            services: [await service('posts'), users],
          });
          const selfHostingHive = await service('selfHostingHive', {
            env: {
              SUPERGRAPH_PATH: supergraph.output,
            },
          });
          const HIVE_URL = `http://${
            gatewayRunner.includes('docker')
              ? isCI()
                ? '172.17.0.1'
                : 'host.docker.internal'
              : 'localhost'
          }:${selfHostingHive.port}`;
          const gw = await gateway({
            supergraph: `${HIVE_URL}/supergraph`,
            args: [
              `--hive-registry-token=${TEST_TOKEN}`,
              `--hive-cdn-key=${TEST_KEY}`,
            ],
            env: {
              HIVE_URL,
              OVER_WS: subProtocol === 'ws' ? 'true' : 'false',
            },
          });

          const client =
            clProtocol === 'ws'
              ? wsCreateClient({
                  url: `http://0.0.0.0:${gw.port}/graphql`,
                  webSocketImpl: WebSocket,
                  retryAttempts: 0,
                })
              : sseCreateClient({
                  url: `http://0.0.0.0:${gw.port}/graphql`,
                  fetchFn: fetch,
                  retryAttempts: 0,
                });

          const iter = client.iterate({
            query: /* GraphQL */ `
              # TODO: when operation name is the same as the subscription - the subgraph never responds
              # subscription userPostChanged { userPostChanged { ... } }
              subscription {
                userPostChanged {
                  name
                  posts {
                    title
                    content
                  }
                }
              }
            `,
          });

          const msgsCount = 3;

          (async () => {
            for (let i = 0; i < msgsCount; i++) {
              await fetch(`http://localhost:${users.port}/userPostChanged`);
            }
          })();

          const msgs: unknown[] = [];
          for await (const msg of iter) {
            msgs.push(msg);
            if (msgs.length >= msgsCount) {
              break;
            }
          }

          expect(msgs).toMatchInlineSnapshot(`
          [
            {
              "data": {
                "userPostChanged": {
                  "name": "John Doe",
                  "posts": [
                    {
                      "content": "This is a post",
                      "title": "Hello world",
                    },
                  ],
                },
              },
            },
            {
              "data": {
                "userPostChanged": {
                  "name": "John Doe",
                  "posts": [
                    {
                      "content": "This is another post",
                      "title": "Hello again",
                    },
                  ],
                },
              },
            },
            {
              "data": {
                "userPostChanged": {
                  "name": "John Doe",
                  "posts": [
                    {
                      "content": "This is another post again",
                      "title": "Hello again again",
                    },
                  ],
                },
              },
            },
          ]
        `);

          await setTimeout(300);

          const incomingData = selfHostingHive.getStd('out');
          // Check if `/usage` endpoint receives the POST request
          expect(incomingData).toContain('POST /usage');
          expect(incomingData).toContain(
            `"authorization":"Bearer ${TEST_TOKEN}"`,
          );
          expect(incomingData).toContain(
            '"fields":["Subscription.userPostChanged","User.name","User.posts","Post.title","Post.content"]',
          );
          // Check if appropriate logs
          const gwLogs = gw.getStd('out');
          expect(gwLogs).toMatch(
            /\[useHiveConsole\] POST .*\/usage .* succeeded with status 200/,
          );
        },
      );
    },
  );

  it('usage reporting of subscriptions must not have empty fields when genericAuth strips them', async () => {
    const users = await service('users');
    const supergraph = await composeWithApollo({
      services: [await service('posts'), users],
    });
    const selfHostingHive = await service('selfHostingHive', {
      env: {
        SUPERGRAPH_PATH: supergraph.output,
      },
    });
    const HIVE_URL = `http://${
      gatewayRunner.includes('docker')
        ? isCI()
          ? '172.17.0.1'
          : 'host.docker.internal'
        : 'localhost'
    }:${selfHostingHive.port}`;
    const gw = await gateway({
      supergraph: `${HIVE_URL}/supergraph`,
      args: [
        `--hive-registry-token=${TEST_TOKEN}`,
        `--hive-cdn-key=${TEST_KEY}`,
      ],
      env: {
        HIVE_URL,
        GENERIC_AUTH: 'true',
      },
    });

    const client = sseCreateClient({
      url: `http://0.0.0.0:${gw.port}/graphql`,
      fetchFn: fetch,
      retryAttempts: 0,
    });

    const iter = client.iterate({
      query: /* GraphQL */ `
        subscription {
          userPostChanged {
            name
            posts {
              title
              content
            }
          }
        }
      `,
    });

    // genericAuth strips the whole selection set here, so the subscription
    // never actually starts streaming (the executor rejects the now-empty
    // document) - we only care about the usage report that still gets sent
    // for it
    await iter.next().catch(() => {});
    await iter.return?.().catch(() => {});

    await setTimeout(300);

    const incomingData = selfHostingHive.getStd('out');
    expect(incomingData).toContain('POST /usage');
    expect(incomingData).not.toContain('"fields":[]');
    expect(incomingData).toContain(
      '"fields":["Subscription.userPostChanged","User.name","User.posts","Post.title","Post.content"]',
    );
  });
});
