import {
  createExampleSetup,
  createTenv,
  Gateway,
  Service,
} from '@internal/e2e';
import { benchConfig, getLocalhost } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { expect, test } from 'vitest';

test('Gateway', async ({ bench }) => {
  const { gateway, service: _service } = createTenv(__dirname);
  const example = createExampleSetup(__dirname, 1000);

  const supergraph = await example.supergraph();

  const gateways: Record<string, Gateway | Service> = {
    // TODO: tests are failing for whatever reason
    // 'Apollo Gateway': await service('apollo-gateway', {
    //   env: {
    //     SUPERGRAPH: supergraph,
    //   },
    // }),
    'Hive Gateway w/ Tools': await gateway({
      supergraph,
      env: {
        FORK: 1,
        NODE_ENV: 'production',
      },
    }),
    'Hive Gateway w/ Hive Router Query Planner': await gateway({
      supergraph,
      env: {
        FORK: 1,
        NODE_ENV: 'production',
        HIVE_ROUTER_RUNTIME: 1,
      },
    }),
  };

  const benches = [];
  for (const gwName in gateways) {
    const gw = gateways[gwName];
    if (!gw) {
      throw new Error(`Gateway ${gwName} not found`);
    }
    const gwPort = gw.port;
    const gwHost = await getLocalhost(gwPort, gw.protocol);
    const gwUrl = `${gwHost}:${gwPort}/graphql`;
    const body = JSON.stringify({
      query: example.query,
    });
    benches.push(
      bench(gwName, async () => {
        const response = await fetch(gwUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body,
        });
        const data = await response.json();
        expect(data).toEqual(example.result);
      }),
    );
  }

  await bench.compare(...benches, benchConfig);
});
