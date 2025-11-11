import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
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
            ...(usingHiveRouterRuntime()
              ? [
                  // TODO: fix these tests with router runtime
                  '!**/e2e/js-config', // has additional resolvers
                  '!**/e2e/apq-subgraphs', // query is included in request and seems to be different
                  '!**/e2e/auto-type-merging', // has transforms
                  '!**/e2e/distributed-subscriptions-webhooks', // has additional typedefs (using @resolveTo)
                  '!**/e2e/event-driven-federated-subscriptions', // has additional typedefs (using @resolveTo)
                  '!**/e2e/federation-batching-plan', // uses stitching plan
                  '!**/e2e/extra-fields', // has additional typedefs
                  '!**/e2e/federation-rate-limiting', // rate-limits using the executable schema
                  '!**/e2e/federation-mixed', // has transforms
                  '!**/e2e/hoist-and-prefix-transform', // has transforms
                  '!**/e2e/interface-additional-resolvers', // has additional resolvers
                  '!**/e2e/naming-convention-additional-typedefs', // has additional typedefs and transforms
                  '!**/e2e/openapi-additional-resolvers', // has additional resolvers
                  '!**/e2e/openapi-arg-rename', // has transforms
                  '!**/e2e/openapi-naming-convention', // has transforms
                  '!**/e2e/programmatic-batching', // has additional resolvers and is specific to stitching
                  '!**/e2e/subscriptions-with-transforms', // has transforms
                  '!**/e2e/type-merging-batching', // has transforms
                  '!**/e2e/progressive-override', // has progressive override
                  '!**/e2e/subscriptions-data-other-subgraph', // cannot "stitch" together from other subgraphs
                  '!**/e2e/federation-subscriptions-passthrough', // cannot "stitch" together from other subgraphs
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
