import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
// by importing the router query planner binaries here
// we allow leak tests to not fail when detecting open handles
// showing that jest wouldn't close due to napi-rs customgc
import * as HIVE_ROUTER_QP from '@graphql-hive/router-query-planner';
import type { Config } from 'jest';
import JSON5 from 'json5';
import { pathsToModuleNameMapper } from 'ts-jest';

const isCI = () => !!process.env['CI'];
const rootDir = process.cwd();
const tsconfigPath = resolve(rootDir, 'tsconfig.json');
const tsconfigContents = readFileSync(tsconfigPath, 'utf8');
const tsconfig = JSON5.parse(tsconfigContents);
const ESM_PACKAGES = [
  '@graphql-hive/federation-gateway-audit',
  'parse-duration',
  'change-case',
  'extract-files',
  'is-plain-obj',
  'array-shuffle',
  // babel 8 is esm only and required from cjs graphql-tag-pluck
  '@babel',
  'obug',
  'js-tokens',
  // node-fetch v3 and its deps are esm only
  'node-fetch',
  'fetch-blob',
  'formdata-polyfill',
  'data-uri-to-buffer',
];

export default {
  testEnvironment: 'node',
  rootDir,
  restoreMocks: true,
  reporters: ['default'],
  modulePathIgnorePatterns: ['dist'],
  collectCoverage: false,
  cacheDirectory: resolve(
    rootDir,
    `${isCI() ? '' : 'node_modules/'}.cache/jest`,
  ),
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    // resolve the root babel-jest so it peers with root babel 8. the bare 'babel-jest'
    // string makes jest pick its own nested copy which runs on babel 7
    '^.+\\.m?(t|j)s?$': fileURLToPath(import.meta.resolve('babel-jest')),
  },
  moduleNameMapper: {
    '^graphql$': '<rootDir>/node_modules/graphql/index.js',
    vitest: '<rootDir>/vitest-jest.js',
    ...pathsToModuleNameMapper(tsconfig.compilerOptions.paths, {
      prefix: `${rootDir}/`,
      useESM: true,
    }),
  },
  // only check the last node_modules segment so nested esm packages get transformed too
  transformIgnorePatterns: [
    `node_modules/(?!.*node_modules/)(?!(${ESM_PACKAGES.join('|')})/)`,
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    // we don't care about leaks in internal tests
    // furthermore, some internal files use ESM (and import.meta) which jest does not support
    'internal/',
  ],
  testMatch: ['**/*.(test|spec).ts'],
  globals: {
    HIVE_ROUTER_QP,
  },
} satisfies Config;
