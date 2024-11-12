#!/usr/bin/env node
import { DefaultLogger } from '@graphql-mesh/utils';
import { enableModuleCachingIfPossible, handleNodeWarnings, run } from './cli';
import 'dotenv/config'; // inject dotenv options to process.env

// @inject-version globalThis.__VERSION__ here

enableModuleCachingIfPossible();
handleNodeWarnings();

const log = new DefaultLogger();

run({ log }).catch((err) => {
  log.error(err);
  process.exit(1);
});
