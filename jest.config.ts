import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Config } from 'jest';
import JSON5 from 'json5';
import { pathsToModuleNameMapper } from 'ts-jest';

const isCI = !!process.env['CI'];
const rootDir = __dirname;
const tsconfigPath = resolve(rootDir, 'tsconfig.json');
const tsconfigContents = readFileSync(tsconfigPath, 'utf8');
const tsconfig = JSON5.parse(tsconfigContents);
const ESM_PACKAGES = ['graphql-federation-gateway-audit'];

export default {
  testEnvironment: 'node',
  rootDir,
  restoreMocks: true,
  reporters: ['default'],
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
  transformIgnorePatterns: [`node_modules/(?!(${ESM_PACKAGES.join('|')})/)`],
  testMatch: ['**/*.(test|spec).ts'],
} satisfies Config;
