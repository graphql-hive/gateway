import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig, Plugin } from 'vitest/config';
import { timeout as testTimeout } from './internal/e2e/src/timeout';
import { isCI, usingHiveRouterRuntime } from './internal/env/src/index';
import { isNotPlatform } from './internal/env/src/node';

// By default, Vite bypasses node_packages to native Node; meaning, imports to
// packages that match the tsconfig paths wont work because Node will require the
// packages as per the Node resolution spec.
//
// Vite will process inlined modules.
const inline = [/@graphql-mesh\/.*/, /@omnigraph\/.*/];

export default defineConfig({
  plugins: [tsconfigPaths(), injectRouterRuntime()],
  resolve: {
    alias: {
      graphql: 'graphql/index.js', // TODO: why duplicate graphql errors when there's no multiple graphqls installed? mistery
    },
  },
  test: {
    server: { deps: { inline } },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['**/*.(test|spec).ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: [
            '**/*.e2e.ts',
            ...(isCI() && isNotPlatform('linux')
              ? [
                  // TODO: containers are not starting on non-linux environments
                  '!**/e2e/auto-type-merging',
                  '!**/e2e/neo4j-example',
                  '!**/e2e/soap-demo',
                  '!**/e2e/mysql-employees',
                  '!**/e2e/opentelemetry',
                  '!**/e2e/graphos-polling',
                  '!**/e2e/distributed-subscriptions-webhooks',
                  '!**/e2e/event-driven-federated-subscriptions',
                ]
              : []),
          ],
          hookTimeout: testTimeout,
          testTimeout,
          retry: isCI() ? 3 : 0,
        },
      },
      {
        extends: true,
        test: {
          name: 'bench',
          hookTimeout: testTimeout,
          testTimeout,
          benchmark: {
            include: ['bench/**/*.bench.ts', 'e2e/**/*.bench.ts'],
            reporters: ['verbose'],
            outputJson: 'bench/results.json',
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'memtest',
          include: ['**/*.memtest.ts'],
          hookTimeout: testTimeout,
          testTimeout,
        },
      },
    ],
  },
});

function injectRouterRuntime(): Plugin {
  return {
    name: 'inject-router-runtime',
    enforce: 'pre',
    transform(code, id) {
      if (!usingHiveRouterRuntime()) {
        return; // disabled
      }

      const origCode = code;
      if (id.includes('unifiedGraphManager.ts')) {
        code = code.replace(
          `import { handleFederationSupergraph } from './federation/supergraph';`,
          `import { unifiedGraphHandler as handleFederationSupergraph } from '@graphql-hive/router-runtime';`,
        );
        if (origCode === code) {
          throw new Error(
            'Failed to inject router runtime. Code in "unifiedGraphManager.ts" stayed the same.',
          );
        }
      }
      return {
        code,
      };
    },
  };
}
