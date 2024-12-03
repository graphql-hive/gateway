import { defineWorkspace } from 'vitest/config';
import { timeout as testTimeout } from './internal/e2e/src/timeout';
import { isCI, isNotPlatform } from './internal/testing/src/env';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['**/*.(test|spec).ts'],
    },
  },
  {
    extends: './vitest.config.ts',
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
            ]
          : []),
      ],
      hookTimeout: testTimeout,
      testTimeout,
    },
  },
  {
    extends: './vitest.config.ts',
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
]);
