import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const config = JSON.parse(process.argv[2]);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(root + '/package.json');
const graphqlEntry = pathToFileURL(require.resolve('graphql')).href;
const entries = [
  'packages/delegate/dist/index.js',
  'packages/executors/http/dist/index.js',
];
const expected = entries.map(
  (p) =>
    pathToFileURL(
      resolve(config.sourceVariant === 'base' ? config.baseBuild : root, p),
    ).href,
);
const loadedEntries = new Set();
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'graphql')
      return { url: graphqlEntry, shortCircuit: true };
    if (specifier.startsWith('graphql/'))
      return next(specifier, {
        ...context,
        parentURL: pathToFileURL(root + '/entry.mjs').href,
      });
    if (specifier === '@graphql-hive/gateway-runtime') {
      return {
        url: pathToFileURL(resolve(root, 'packages/runtime/dist/index.js'))
          .href,
        shortCircuit: true,
      };
    }
    const result = next(specifier, context);
    if (config.sourceVariant === 'base') {
      const i = entries.findIndex(
        (p) => result.url === pathToFileURL(resolve(root, p)).href,
      );
      if (i >= 0) return { ...result, url: expected[i] };
    }
    return result;
  },
  load(url, context, next) {
    if (expected.includes(url)) loadedEntries.add(url);
    return next(url, context);
  },
});
await import('../repro/outputs/bench/case.mjs');
assert.equal(
  loadedEntries.size,
  2,
  'Must execute both selected source-built packages',
);
const result = JSON.parse(readFileSync(config.resultPath));
result.sourceVariant = config.sourceVariant;
result.loadedBuiltEntries = [...loadedEntries];
writeFileSync(config.resultPath, JSON.stringify(result, null, 2));
