import {
  createExampleSetup,
  createTenv,
  replaceLocalhostWithDockerHost,
} from '@internal/e2e';
import { createDisposableServer } from '@internal/testing';
import { Push, Repeater, Stop } from '@repeaterjs/repeater';
import { createServerAdapter, DisposableSymbols } from '@whatwg-node/server';
import { createClient } from 'graphql-ws';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';

const { gateway, gatewayRunner } = createTenv(__dirname);
const { supergraph } = createExampleSetup(__dirname);

describe('Usage Reporting with Persisted Operations', () => {
  it('should execute persisted query and report usage', async () => {
    expect.assertions(4);

    await using hive = await createHiveConsole();

    await using gw = await gateway({
      supergraph: await supergraph(),
      env: {
        HIVE_URL: hive.url,
      },
    });

    const result = await gw.execute({
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: '5d112fb0e85c9e113301e9354c39f36b2ee41d82',
        },
      },
    });

    expect(result).toMatchInlineSnapshot(`
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
      expect(req.headers['user-agent']).toContain('hive-gateway/');

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

  it('executes persisted query via WS and reports usage', async () => {
    expect.assertions(4);

    await using hive = await createHiveConsole();

    await using gw = await gateway({
      supergraph: await supergraph(),
      env: {
        HIVE_URL: hive.url,
      },
    });

    const client = createClient({
      url: `ws://0.0.0.0:${gw.port}/graphql`,
      webSocketImpl: WebSocket,
      retryAttempts: 0,
    });

    await using _ = {
      async [DisposableSymbols.asyncDispose]() {
        return client.dispose();
      },
    };

    const iterable = client.iterate({
      query: '',
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: '5d112fb0e85c9e113301e9354c39f36b2ee41d82',
        },
      },
    });

    for await (const msg of iterable) {
      expect(msg).toMatchInlineSnapshot(`
      {
        "data": {
          "__typename": "Query",
        },
      }
    `);
      break; // we only want the first message
    }

    for await (const req of hive.reqs) {
      expect(req.headers['authorization']).toMatchInlineSnapshot(
        `"Bearer great-token"`,
      );
      expect(req.headers['user-agent']).toContain('hive-gateway/');

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
