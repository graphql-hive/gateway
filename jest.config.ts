import { readFileSync } from 'fs';
import { resolve } from 'path';
// by importing the router query planner binaries here
// we allow leak tests to not get fail when detecting open handles
// showing that jest wouldnt close due to napi-rs customgc
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
  'graphql-federation-gateway-audit',
  'parse-duration',
  'change-case',
  'extract-files',
  'is-plain-obj',
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
    '^.+\\.m?(t|j)s?$': 'babel-jest',
  },
  moduleNameMapper: {
    '^graphql$': '<rootDir>/node_modules/graphql/index.js',
    vitest: '<rootDir>/vitest-jest.js',
    ...pathsToModuleNameMapper(tsconfig.compilerOptions.paths, {
      prefix: `${rootDir}/`,
      useESM: true,
    }),
  },
  transformIgnorePatterns: [`node_modules/(?!(${ESM_PACKAGES.join('|')})/)`],
  testPathIgnorePatterns: [
    '/node_modules/',
    // we dont care about leaks in internal tests
    // furthermore, some internal files use ESM (and import.meta) which jest does not support
    'internal/',
  ],
  testMatch: ['**/*.(test|spec).ts'],
  globals: {
    HIVE_ROUTER_QP,
  },
} satisfies Config;
