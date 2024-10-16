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
      'n/prefer-global/process': ['error', 'never'],
      'import/no-nodejs-modules': 'error',
      'import/no-extraneous-dependencies': 'error',
    },
  },
);
