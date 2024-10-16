import importPlugin from // @ts-expect-error no defs
'eslint-plugin-import';
import nPlugin from 'eslint-plugin-n';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // all
  {
    languageOptions: { parser: tseslint.parser },
    files: ['**/*.ts'],
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
