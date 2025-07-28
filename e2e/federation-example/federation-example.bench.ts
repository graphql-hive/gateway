import {
  createExampleSetup,
  createTenv,
  Gateway,
  Service,
} from '@internal/e2e';
import { benchConfig, getLocalhost } from '@internal/testing';
import { fetch } from '@whatwg-node/fetch';
import { bench, describe, expect } from 'vitest';

describe('Gateway', async () => {
  const { gateway, service } = createTenv(__dirname);
  const example = createExampleSetup(__dirname, 1000);

  const supergraph = await example.supergraph();

  const gateways: Record<string, Gateway | Service> = {
    'Apollo Gateway': await service('apollo-gateway', {
      env: {
        SUPERGRAPH: supergraph,
      },
    }),
    'Hive Gateway w/ Tools': await gateway({
      supergraph,
      env: {
        NODE_ENV: 'production',
        TOOLS_FEDERATION: 1,
      },
    }),
    'Hive Gateway w/ Query Planner': await gateway({
      supergraph,
      env: {
        NODE_ENV: 'production',
        TOOLS_FEDERATION: 0,
      },
    }),
  };

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
    bench(
      gwName,
      async () => {
        const response = await fetch(gwUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body,
        });
        const data = await response.json();
        expect(data).toEqual(example.result);
      },
      benchConfig,
    );
  }
});
