import path from 'node:path';
import { createTenv } from '@internal/e2e';
import { expect, it } from 'vitest';

const { gateway } = createTenv(__dirname);

it('should load the supergraph on init', async () => {
  await expect(
    gateway({
      supergraph: path.join(__dirname, 'malformed.graphql'),
    }),
  ).rejects.toThrow(/Syntax Error: Unexpected Name \\"skema\\"./);
});

it('should load the subgraph on init', async () => {
  await expect(
    gateway({
      subgraph: path.join(__dirname, 'malformed.graphql'),
    }),
  ).rejects.toThrow(/Syntax Error: Unexpected Name \\"skema\\"./);
});

it('should load the proxy schema on init', async () => {
  await expect(
    gateway({
      args: ['proxy', 'http://localhost:65432'],
    }),
  ).rejects.toThrow(/DOWNSTREAM_SERVICE_ERROR/);
});
