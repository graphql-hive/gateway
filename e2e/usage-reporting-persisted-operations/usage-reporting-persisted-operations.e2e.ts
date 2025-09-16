import {
  createExampleSetup,
  createTenv,
  replaceLocalhostWithDockerHost,
} from '@internal/e2e';
import { createDisposableServer } from '@internal/testing';
import { Push, Repeater, Stop } from '@repeaterjs/repeater';
import { createServerAdapter } from '@whatwg-node/server';
import { expect, it } from 'vitest';

const { gateway, gatewayRunner } = createTenv(__dirname);
const { supergraph } = createExampleSetup(__dirname);

it('should execute persisted query and report usage', async () => {
  const hive = await createHiveConsole();

  const { execute } = await gateway({
    supergraph: await supergraph(),
    env: {
      HIVE_URL: hive.url,
    },
  });

  await expect(
    execute({
      query: '',
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: 'typename',
        },
      },
    }),
  ).resolves.toMatchInlineSnapshot(`
    {
      "data": {
        "__typename": "Query",
      },
    }
  `);

  for await (const req of hive.reqs) {
    expect(req.headers['authorization']).toMatchInlineSnapshot(
      `"Bearer great-token"`,
    );
    expect(req.headers['user-agent']).toMatchInlineSnapshot(
      `"hive-gateway/0.13.0"`,
    );

    expect(req.body.map).toMatchInlineSnapshot(`
      {
        "5d112fb0e85c9e113301e9354c39f36b2ee41d82": {
          "fields": [
            "Query.__typename",
          ],
          "operation": "{__typename}",
          "operationName": "anonymous",
        },
      }
    `);

    break; // we only make one request
  }
});

async function createHiveConsole() {
  type Req = {
    headers: Record<string, string>;
    body: any;
  };

  let push: Push<Req>;
  let stop: Stop;

  const reqs = new Repeater<Req>((_push, _stop) => {
    push = _push;
    stop = _stop;
  });
  const server = await createDisposableServer(
    createServerAdapter(async (req) => {
      const {
        host,
        'x-request-id': xReqId,
        ...stableHeaders
      } = Object.fromEntries(req.headers.entries());
      push({
        headers: stableHeaders,
        body: await req.json(),
      });
      return new Response('ok');
    }),
  );
  return {
    url: gatewayRunner.includes('docker')
      ? replaceLocalhostWithDockerHost(server.url)
      : server.url,
    reqs,
    [Symbol.asyncDispose]() {
      stop();
      return server[Symbol.asyncDispose]();
    },
  };
}
