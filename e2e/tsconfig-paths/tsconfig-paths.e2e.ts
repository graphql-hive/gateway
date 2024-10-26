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
    env: {
      MESH_INCLUDE_TSCONFIG_SEARCH_PATH: 'tsconfig-paths.tsconfig.json',
    },
    runner: {
      docker: {
        volumes: [
          {
            host: './tsconfig-paths.tsconfig.json',
            container: '/gateway/tsconfig-paths.tsconfig.json',
          },
          {
            host: './mesh.config.ts',
            container: '/gateway/mesh.config.ts',
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
