#!/usr/bin/env node
/**
 * Bulk-bump package.json engines / peers / Yoga+Tools majors for the
 * graphql-yoga@6 / @graphql-tools/utils@13 / executor@4 migration.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const NODE_ENGINE = '>=22.18.0';
const GRAPHQL_PEER = '^16.0.0 || ^17.0.0';

const DEP_BUMPS = {
  '@graphql-tools/utils': '^13.1.3',
  '@graphql-tools/executor': '^4.1.4',
  '@graphql-tools/schema': '^11.0.6',
  '@graphql-tools/merge': '^10.0.6',
  'graphql-yoga': '^6.0.0',
  '@graphql-yoga/plugin-defer-stream': '^4.0.0',
  '@graphql-yoga/plugin-csrf-prevention': '^4.0.0',
  '@graphql-yoga/plugin-apollo-usage-report': '^1.0.0',
  '@graphql-yoga/render-graphiql': '^6.0.0',
  '@graphql-yoga/typed-event-target': '^4.0.0',
  '@whatwg-node/server': '^0.13.0',
  '@whatwg-node/fetch': '^0.12.1',
  '@whatwg-node/promise-helpers': '^2.0.0',
  '@graphql-hive/logger': '^1.1.1',
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (
      name === 'node_modules' ||
      name === 'dist' ||
      name === '.git' ||
      name === '.yarn'
    ) {
      continue;
    }
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name === 'package.json') out.push(p);
  }
  return out;
}

function bumpRange(current, next) {
  if (current == null) return next;
  if (current === 'workspace:*' || current.startsWith('workspace:')) {
    return current;
  }
  return next;
}

let changed = 0;
for (const file of walk(root)) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  let dirty = false;

  if (pkg.engines?.node && pkg.engines.node !== NODE_ENGINE) {
    pkg.engines.node = NODE_ENGINE;
    dirty = true;
  }

  for (const section of [
    'peerDependencies',
    'dependencies',
    'devDependencies',
    'optionalDependencies',
  ]) {
    const deps = pkg[section];
    if (!deps) continue;
    if (
      typeof deps.graphql === 'string' &&
      (deps.graphql.includes('14') || deps.graphql.includes('15'))
    ) {
      deps.graphql = GRAPHQL_PEER;
      dirty = true;
    }
    for (const [name, version] of Object.entries(DEP_BUMPS)) {
      if (deps[name] != null) {
        const next = bumpRange(deps[name], version);
        if (deps[name] !== next) {
          deps[name] = next;
          dirty = true;
        }
      }
    }
  }

  if (dirty) {
    writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
    changed++;
    console.log('updated', file.replace(root + '/', ''));
  }
}

console.log(`done: ${changed} package.json files`);
