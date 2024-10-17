import { defineWorkspace } from 'vitest/config';
import { timeout as testTimeout } from './internal/e2e/src/timeout';

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
      include: ['**/*.e2e.ts'],
      testTimeout,
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'e2e:bench',
      benchmark: {
        include: ['e2e/**/*.bench.ts'],
      },
    },
  },
]);
