import { setTimeout } from 'node:timers/promises';
import { createTenv } from '@internal/e2e';
import { isCI } from '~internal/env';
import { createClient } from 'graphql-sse';
import { describe, expect, it } from 'vitest';

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

  it('usage reporting of subscriptions', async () => {
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
      },
    });

    const client = createClient({
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
    expect(incomingData).toContain(`"authorization":"Bearer ${TEST_TOKEN}"`);
    expect(incomingData).toContain(
      '"fields":["Subscription.userPostChanged","User.name","User.posts","Post.title","Post.content"]',
    );
    // Check if appropriate logs
    const gwLogs = gw.getStd('out');
    expect(gwLogs).toMatch(
      /\[useHiveConsole\] POST .*\/usage .* succeeded with status 200/,
    );
  });
});
