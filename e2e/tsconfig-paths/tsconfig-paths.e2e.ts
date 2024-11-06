import { createTenv, getAvailablePort } from '@internal/e2e';
import { fetch } from '@whatwg-node/fetch';
import { expect, it } from 'vitest';

const { gateway, fs, gatewayRunner } = createTenv(__dirname);

it.skipIf(gatewayRunner.includes('bun'))('should start gateway', async () => {
  const port = await getAvailablePort();
  const proc = await gateway({
    port,
    supergraph: await fs.tempfile(
      'supergraph.graphql',
      'type Query { hello: String }',
    ),
    env: {
      MESH_INCLUDE_TSCONFIG_SEARCH_PATH: 'tsconfig-paths.tsconfig.json',
    },
    runner: {
      docker: {
        healthcheck: ['CMD-SHELL', `wget --spider http://0.0.0.0:${port}/helt`],
        volumes: [
          {
            host: './tsconfig-paths.tsconfig.json',
            container: '/gateway/tsconfig-paths.tsconfig.json',
          },
          {
            host: './folder',
            container: '/gateway/folder',
          },
        ],
      },
    },
  });
  const res = await fetch(`http://0.0.0.0:${proc.port}/helt`);
  expect(res.ok).toBeTruthy();
});
