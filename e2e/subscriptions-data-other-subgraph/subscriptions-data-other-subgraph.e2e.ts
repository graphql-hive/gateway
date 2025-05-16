import { setTimeout } from 'node:timers/promises';
import { createTenv } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { createClient } from 'graphql-sse';
import { expect, it } from 'vitest';

const { gateway, service } = createTenv(__dirname);

it('should pull related data from other subgraph after emit', async () => {
  const users = await service('users');

  const gw = await gateway({
    supergraph: {
      with: 'apollo',
      services: [users, await service('posts')],
    },
  });

  const client = createClient({
    url: `http://0.0.0.0:${gw.port}/graphql`,
    fetchFn: fetch,
    retryAttempts: 0,
  });

  const emitter = (async () => {
    for (let i = 0; i <= 3; i++) {
      await setTimeout(100);
      await fetch(`http://localhost:${users.port}/userPostChanged`);
    }
  })();

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

  emitter.then(() => {
    iter.return!();
  });

  const msgs: unknown[] = [];
  for await (const msg of iter) {
    msgs.push(msg);
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
});
