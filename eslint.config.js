import importPlugin from 'eslint-plugin-import';
import nPlugin from 'eslint-plugin-n';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // all
  {
    languageOptions: { parser: tseslint.parser },
    files: ['packages/**/src/**/*.ts'], // match what's checked in check:lint script
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/no-extraneous-dependencies': 'error',
    },
  },
  // node
  {
    files: ['packages/gateway/src/**/*.ts'],
    plugins: {
      n: nPlugin,
    },
    rules: {
      'n/prefer-node-protocol': 'error',
    },
  },
  // edge
  {
    files: ['packages/runtime/src/**/*.ts'],
    plugins: {
      import: importPlugin,
      n: nPlugin,
    },
    rules: {
      'import/no-nodejs-modules': 'error',
      'n/prefer-global/process': ['error', 'never'], // in combination with 'import/no-nodejs-modules', usage of process is disallowed
      'import/no-extraneous-dependencies': 'error',
    },
  },
);
