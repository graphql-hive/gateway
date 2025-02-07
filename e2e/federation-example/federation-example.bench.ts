import { ApolloGateway } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { createExampleSetup, createTenv } from '@internal/e2e';
import { benchConfig } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { bench, describe, expect } from 'vitest';

describe('Gateway', async () => {
  const { gateway, fs } = createTenv(__dirname);
  const example = createExampleSetup(__dirname);

  const supergraph = await example.supergraph();
  const supergraphSdl = await fs.read(supergraph);

  const ctrl = new AbortController();
  const apolloGw = new ApolloServer({
    gateway: new ApolloGateway({
      supergraphSdl,
    }),
  });
  const { url } = await startStandaloneServer(apolloGw, {
    listen: { port: 0 },
  });
  const apolloGwUrl = url;
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
      const resJson = await res.json();
      expect(resJson).toEqual(example.result);
    },
    benchConfig,
  );

  const hiveGw = await gateway({
    supergraph,
    env: {
      NODE_ENV: 'production',
      FORK: 0,
    },
  });

  bench(
    'Hive Gateway w/ QP',
    async () => {
      const res = await hiveGw.execute({
        query: example.query,
      });
      expect(res).toEqual(example.result);
    },
    benchConfig,
  );

  const hiveGwWithTools = await gateway({
    supergraph,
    env: {
      NODE_ENV: 'production',
      FORK: 0,
      JIT: 1,
      TOOLS_FEDERATION: 1,
    },
    args: ['--jit'],
  });

  bench(
    'Hive Gateway w/ Tools',
    async () => {
      const res = await hiveGwWithTools.execute({
        query: example.query,
      });
      expect(res).toEqual(example.result);
    },
    benchConfig,
  );
});
