import { ApolloGateway } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { createExampleSetup, createTenv, Gateway } from '@internal/e2e';
import { benchConfig } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { bench, describe, expect } from 'vitest';

describe('Gateway', async () => {
  const { gateway, fs } = createTenv(__dirname);
  const example = createExampleSetup(__dirname);

  const supergraph = await example.supergraph();
  const supergraphSdl = await fs.read(supergraph);

  let apolloGw: ApolloServer;
  let apolloGwUrl: string;
  let ctrl: AbortController;
  bench(
    'Apollo Gateway',
    async () => {
      const res = await fetch(`${apolloGwUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: example.query,
        }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      expect(data).toEqual(example.result);
    },
    {
      async setup() {
        ctrl = new AbortController();
        apolloGw = new ApolloServer({
          gateway: new ApolloGateway({
            supergraphSdl,
          }),
        });
        const { url } = await startStandaloneServer(apolloGw, {
          listen: { port: 0 },
        });
        apolloGwUrl = url;
      },
      teardown() {
        ctrl.abort();
        return apolloGw.stop();
      },
      ...benchConfig,
    },
  );

  let hiveGw: Gateway;
  bench(
    'Hive Gateway',
    async () => {
      const res = await hiveGw.execute({
        query: example.query,
      });
      expect(res).toEqual(example.result);
    },
    {
      async setup() {
        hiveGw = await gateway({
          supergraph,
          args: ['--jit'],
          env: {
            NODE_ENV: 'production',
            JIT: 'true',
          },
        });
      },
      async teardown() {
        return hiveGw[Symbol.asyncDispose]();
      },
      ...benchConfig,
    },
  );
});
