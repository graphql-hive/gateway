import { defineWorkspace } from 'vitest/config';

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
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'loadtest',
      include: ['**/*.loadtest.ts'],
    },
  },
]);
