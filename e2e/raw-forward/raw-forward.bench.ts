import { createTenv } from '@internal/e2e';
import { benchConfig } from '@internal/testing';
import { bench, describe, expect } from 'vitest';

const { service, gateway } = createTenv(__dirname);

const query = /* GraphQL */ `
  query ($first: Int, $mode: String) {
    catalog(first: $first, mode: $mode) {
      id
      total
      products {
        id
        name
        price
      }
    }
  }
`;

// `first` values that give response bodies of about 6 KB, 600 KB and 6 MB.
const sizes = [
  { name: '6 KB', first: 128, minBytes: 5_000 },
  { name: '600 KB', first: 11_500, minBytes: 500_000 },
  { name: '6 MB', first: 110_000, minBytes: 5_000_000 },
];

// Every request carries a different `mode` (the catalog only treats "bad"
// specially), so the gateway cannot share one in-flight subgraph request
// between clients.
let counter = 0;

describe('Raw forward', async () => {
  // Compact subgraph bytes equal what the gateway serializer writes, so both
  // modes send the same body to the client.
  const catalog = await service('catalog', { env: { COMPACT: 1 } });
  const supergraph = { with: 'apollo' as const, services: [catalog] };
  // One process per gateway (no FORK), so each bench entry measures one event
  // loop. The only difference between the two is the option.
  const regular = await gateway({
    supergraph,
    env: { NODE_ENV: 'production', RAW_FORWARD: 0 },
  });
  const rawForward = await gateway({
    supergraph,
    env: { NODE_ENV: 'production', RAW_FORWARD: 1 },
  });

  for (const { name, first, minBytes } of sizes) {
    describe(name, () => {
      for (const [label, gw] of [
        ['regular', regular],
        ['raw forward', rawForward],
      ] as const) {
        bench(
          label,
          async () => {
            const body = JSON.stringify({
              query,
              variables: { first, mode: `r${counter++}` },
            });
            const res = await fetch(`http://localhost:${gw.port}/graphql`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body,
            });
            // Read the bytes only: parsing on the client would dominate.
            const bytes = await res.arrayBuffer();
            expect(res.ok).toBe(true);
            expect(bytes.byteLength).toBeGreaterThan(minBytes);
          },
          benchConfig,
        );
      }
    });
  }
});
