import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import { timeout as testTimeout } from './internal/e2e/src/timeout';
import { boolEnv, isCI, isNotPlatform } from './internal/testing/src/env';

// By default, Vite bypasses node_packages to native Node; meaning, imports to
// packages that match the tsconfig paths wont work because Node will require the
// packages as per the Node resolution spec.
//
// Vite will process inlined modules.
const inline = [/@graphql-mesh\/.*/, /@omnigraph\/.*/];

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      graphql: 'graphql/index.js', // TODO: why duplicate graphql errors when there's no multiple graphqls installed? mistery
    },
  },
  test: {
    server: { deps: { inline } },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['**/*.(test|spec).ts'],
        },
      },
      {
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
                ]
              : []),
          ],
          hookTimeout: testTimeout,
          testTimeout,
          retry: boolEnv('CI') ? 3 : 0,
        },
      },
      {
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
