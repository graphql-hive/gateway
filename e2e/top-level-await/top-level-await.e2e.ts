import { createTenv } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { expect, it } from 'vitest';

const { gateway, fs } = createTenv(__dirname);

it('should start gateway', async () => {
  const proc = await gateway({
    supergraph: await fs.tempfile(
      'supergraph.graphql',
      'type Query { hello: String }',
    ),
  });
  const res = await fetch(`http://0.0.0.0:${proc.port}/healthcheck`);
  expect(res.ok).toBeTruthy();
});
