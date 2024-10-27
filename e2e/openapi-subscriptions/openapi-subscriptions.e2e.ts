import { createTenv } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { createClient } from 'graphql-sse';
import { expect, it } from 'vitest';

const { service, gateway } = createTenv(__dirname);

it('should listen for webhooks', async () => {
  const { execute, port } = await gateway({
    supergraph: {
      with: 'mesh',
      services: [await service('api')],
    },
  });

  const res = await execute({
    query: /* GraphQL */ `
      mutation StartWebhook($url: URL!) {
        post_streams(input: { callbackUrl: $url }) {
          subscriptionId
        }
      }
    `,
    variables: {
      url: `http://0.0.0.0:${port.toString()}/callback`,
    },
  });

  const subscriptionId = res.data?.post_streams?.subscriptionId;
  expect(subscriptionId).toBeTruthy();

  const sse = createClient({
    url: `http://0.0.0.0:${port}/graphql`,
    retryAttempts: 0,
    fetchFn: fetch,
  });

  const msgs: unknown[] = [];
  for await (const msg of sse.iterate({
    query: /* GraphQL */ `
      subscription ListenWebhook($subscriptionId: String!) {
        onData(subscriptionId: $subscriptionId) {
          userData
        }
      }
    `,
    variables: {
      subscriptionId,
    },
  })) {
    msgs.push(msg);
    if (msgs.length === 3) {
      break;
    }
  }

  expect(msgs).toMatchInlineSnapshot(`
[
  {
    "data": {
      "onData": {
        "userData": "RANDOM_DATA",
      },
    },
  },
  {
    "data": {
      "onData": {
        "userData": "RANDOM_DATA",
      },
    },
  },
  {
    "data": {
      "onData": {
        "userData": "RANDOM_DATA",
      },
    },
  },
]
`);
});
