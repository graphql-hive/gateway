#!/usr/bin/env node
import { DefaultLogger } from '@graphql-mesh/utils';
import { enableModuleCachingIfPossible, handleNodeWarnings, run } from './cli';
import 'dotenv/config'; // inject dotenv options to process.env
import type { InitializeData } from '@graphql-mesh/include/hooks';
import { register } from 'node:module';

// @inject-version globalThis.__VERSION__ here

register('@graphql-mesh/include/hooks', {
  parentURL:
    // @ts-ignore bob will complain when bundling for cjs
    import.meta.url,
  data: {
    packedDepsPath: globalThis.__PACKED_DEPS_PATH__ || '',
  } satisfies InitializeData,
});

enableModuleCachingIfPossible();
handleNodeWarnings();

const log = new DefaultLogger();

run({ log }).catch((err) => {
  log.error(err);
  process.exit(1);
});
