import { readFileSync } from 'fs';
import { resolve } from 'path';
import JSON5 from 'json5';
import { pathsToModuleNameMapper } from 'ts-jest';
import type { Config } from 'jest';

const CI = !!process.env['CI'];
const ROOT_DIR = __dirname;
const TSCONFIG = resolve(ROOT_DIR, 'tsconfig.json');
const tsconfigStr = readFileSync(TSCONFIG, 'utf8');
const tsconfig = JSON5.parse(tsconfigStr);

export default {
  testEnvironment: 'node',
  rootDir: ROOT_DIR,
  restoreMocks: true,
  reporters: ['default'],
  verbose: CI,
  modulePathIgnorePatterns: ['dist'],
  collectCoverage: false,
  cacheDirectory: resolve(ROOT_DIR, `${CI ? '' : 'node_modules/'}.cache/jest`),
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.m?(t|j)s?$': 'babel-jest',
  },
  moduleNameMapper: {
    '^graphql$': '<rootDir>/node_modules/graphql/index.js',
    vitest: '<rootDir>/vitest-jest.js',
    ...pathsToModuleNameMapper(tsconfig.compilerOptions.paths, {
      prefix: `${ROOT_DIR}/`,
      useESM: true,
    }),
  },
  testMatch: ['**/*.(test|spec).ts'],
} satisfies Config;
