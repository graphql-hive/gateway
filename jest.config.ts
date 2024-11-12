import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Config } from 'jest';
import JSON5 from 'json5';
import { pathsToModuleNameMapper } from 'ts-jest';

const isCI = !!process.env['CI'];
const rootDir = __dirname;
const tsconfigPath = resolve(rootDir, 'tsconfig.json');
const tsconfigStr = readFileSync(tsconfigPath, 'utf8');
const tsconfig = JSON5.parse(tsconfigStr);

export default {
  testEnvironment: 'node',
  rootDir,
  restoreMocks: true,
  reporters: ['default'],
  verbose: isCI,
  modulePathIgnorePatterns: ['dist'],
  collectCoverage: false,
  cacheDirectory: resolve(rootDir, `${isCI ? '' : 'node_modules/'}.cache/jest`),
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
  testMatch: ['**/*.(test|spec).ts'],
} satisfies Config;
