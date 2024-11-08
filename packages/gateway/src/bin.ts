#!/usr/bin/env node
import 'dotenv/config'; // inject dotenv options to process.env
import { DefaultLogger } from '@graphql-mesh/utils';
import { enableModuleCachingIfPossible, handleNodeWarnings, run } from './cli';

// @inject-version globalThis.__VERSION__ here

enableModuleCachingIfPossible();
handleNodeWarnings();

const log = new DefaultLogger();

run({ log }).catch((err) => {
  log.error(err);
  process.exit(1);
});
