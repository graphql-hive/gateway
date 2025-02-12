#!/usr/bin/env node
import 'dotenv/config'; // inject dotenv options to process.env

import module from 'node:module';
import { JSONLogger } from '@graphql-hive/gateway-runtime';
import type { InitializeData } from '@graphql-hive/importer/hooks';
import { enableModuleCachingIfPossible, handleNodeWarnings, run } from './cli';

// @inject-version globalThis.__VERSION__ here

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

const log = new JSONLogger();

run({ log }).catch((err) => {
  log.error(err);
  process.exit(1);
});
