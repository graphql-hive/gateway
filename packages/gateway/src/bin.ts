#!/usr/bin/env node
import module from 'node:module';
import type { InitializeData } from '@graphql-hive/importer/hooks';
import { Logger } from '@graphql-hive/logger';
import { enableModuleCachingIfPossible, handleNodeWarnings, run } from './cli';

// inject dotenv options to process.env
try {
  process.loadEnvFile?.();
} catch (err) {
  // ignore if dotenv is not available
}

globalThis.__VERSION__ = 'dev';

module.register('@graphql-hive/importer/hooks', {
  parentURL:
    // @ts-ignore bob will complain when bundling for cjs
    import.meta.url,
  data: {
    packedDepsPath: globalThis.__PACKED_DEPS_PATH__ || '',
  } satisfies InitializeData,
});

enableModuleCachingIfPossible();
handleNodeWarnings();

const log = new Logger();

run({ log }).catch((err) => {
  log.error(err);
  process.exit(1);
});
