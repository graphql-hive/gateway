import fs from 'node:fs';
import path from 'node:path';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import sucrase from '@rollup/plugin-sucrase';
import { defineConfig } from 'rollup';
import tsConfigPaths from 'rollup-plugin-tsconfig-paths';

console.log('Bundling...');

/**
 * Dependencies that need to be bundled and placed in the bundled node_modules. Modules that
 * are imported by the `mesh.config.ts` file need to exist here.
 *
 * Please note that the node_modules will not be in the WORKDIR of the docker image,
 * it will instead be one level up. This is because we want to keep the
 * bundled node_modules isolated from npm so that managing additional dependencies
 * wont have npm remove bundled ones.
 *
 * Needs to be used with the {@link packagejson} rollup plugin.
 *
 * Is a map of destination path to the source file to bundle.
 *
 * Include a plugin by adding to the {@link deps}:
 * ```json
 * {
 *   "node_modules/<package name>/index": "<relative path to main source file>"
 * }
 * ```
 *
 * For example, include the `@graphql-mesh/plugin-http-cache` plugin by adding:
 * ```json
 * {
 *   "node_modules/@graphql-mesh/plugin-http-cache/index": "../plugins/http-cache/src/index.ts"
 * }
 * ```
 *
 * @type {Record<string, string>}
 */
const deps = {
  'node_modules/@graphql-hive/gateway/index': 'src/index.ts',
  'node_modules/@graphql-hive/gateway/opentelemetry/index':
    'src/opentelemetry/index.ts',
  'node_modules/@graphql-hive/gateway/opentelemetry/api':
    'src/opentelemetry/api.ts',
  'node_modules/@graphql-hive/gateway/opentelemetry/setup':
    'src/opentelemetry/setup.ts',
  'node_modules/@graphql-hive/gateway-runtime/index': '../runtime/src/index.ts',
  // the hooks are dynamically registered on startup, we need to bundle them at path
  'node_modules/@graphql-hive/importer/hooks': '../importer/src/hooks.ts',
  // include envelop core for ease of usage in the config files
  'node_modules/@envelop/core/index':
    '../../node_modules/@envelop/core/esm/index.js',
  // default transports should be in the container because they're dynamically imported
  'node_modules/@graphql-mesh/transport-common/index':
    '../transports/common/src/index.ts',
  'node_modules/@graphql-mesh/transport-http/index':
    '../transports/http/src/index.ts',
  'node_modules/@graphql-mesh/transport-ws/index':
    '../transports/ws/src/index.ts',
  'node_modules/@graphql-mesh/transport-http-callback/index':
    '../transports/http-callback/src/index.ts',
  // security plugins are built-in but are dynamically imported
  'node_modules/@escape.tech/graphql-armor-max-tokens/index':
    '../../node_modules/@escape.tech/graphql-armor-max-tokens/dist/graphql-armor-max-tokens.esm.js',
  'node_modules/@escape.tech/graphql-armor-max-depth/index':
    '../../node_modules/@escape.tech/graphql-armor-max-depth/dist/graphql-armor-max-depth.esm.js',
  'node_modules/@escape.tech/graphql-armor-block-field-suggestions/index':
    '../../node_modules/@escape.tech/graphql-armor-block-field-suggestions/dist/graphql-armor-block-field-suggestions.esm.js',
  // OpenTelemetry plugin is sometimes imported, and not re-used from the gateway itself. we therefore need to bundle it into node_modules
  'node_modules/@graphql-mesh/plugin-opentelemetry/index':
    '../plugins/opentelemetry/src/index.ts',
  // Since `async_hooks` is not available in all runtime, it have to be bundle separately
  // The Async Local context manager of Opentelemetry can't be bundled correctly, so we use our own
  // proxy export file. It just re-export otel's package, which makes rollup happy
  'node_modules/@opentelemetry/context-async-hooks/index':
    '../plugins/opentelemetry/src/async-context-manager.ts',
  'node_modules/@opentelemetry/exporter-trace-otlp-grpc/index':
    '../plugins/opentelemetry/src/exporter-trace-otlp-grpc.ts',
  'node_modules/@opentelemetry/sdk-node/index':
    '../plugins/opentelemetry/src/sdk-node.ts',
  'node_modules/@opentelemetry/auto-instrumentations-node/index':
    '../plugins/opentelemetry/src/auto-instrumentations.ts',
  'node_modules/@graphql-mesh/plugin-opentelemetry/setup':
    '../plugins/opentelemetry/src/setup.ts',
  'node_modules/@graphql-mesh/plugin-opentelemetry/api':
    '../plugins/opentelemetry/src/api.ts',
  ...Object.fromEntries(
    // To ease the OTEL setup, we need to bundle some important OTEL packages.
    // Those are most used features.
    [
      // Common API base
      ['api'],
      ['api-logs'],
      ['core'],
      ['resources', 'esm/'],
      ['sdk-trace-base'],
      ['sdk-metrics'],
      ['sdk-logs'],
      ['semantic-conventions'],
      ['instrumentation'],

      // Exporters
      ['exporter-trace-otlp-http'],
      ['exporter-zipkin'],

      // Propagators
      ['propagator-b3'],
      ['propagator-jaeger'],

      // Context Managers
      ['context-zone'], // An incomplete but Web compatible async context manager based on zone.js
    ].map(([otelPackage, buildDir = 'esm']) => [
      `node_modules/@opentelemetry/${otelPackage}/index`,
      `../../node_modules/@opentelemetry/${otelPackage}/build/${buildDir}/index.js`,
    ]),
  ),
};

if (
  process.env['E2E_GATEWAY_RUNNER'] === 'docker' ||
  process.env['E2E_GATEWAY_RUNNER'] === 'bun-docker'
) {
  // extras specific to the docker serve runner in e2e tests
  console.warn('⚠️ Bundling extra modules for e2e tests!');
  deps['e2e/node_modules/@internal/testing/index'] =
    '../../internal/testing/src/index.ts';
  deps['e2e/node_modules/@graphql-mesh/transport-rest/index'] =
    '../../node_modules/@graphql-mesh/transport-rest/esm/index.js';
  deps['e2e/node_modules/@graphql-mesh/plugin-live-query/index'] =
    '../../node_modules/@graphql-mesh/plugin-live-query/esm/index.js';
}

export default defineConfig({
  input: {
    'dist/bin': 'src/bin.ts',
    ...deps,
  },
  output: {
    dir: 'bundle',
    format: 'esm',
    // having an .mjs extension will make sure that node treats the files as ES modules always
    entryFileNames: '[name].mjs',
    // we want the chunks (common files) to be in the node_modules to avoid name
    // collisions with system files. the node_modules will be in the root of the
    // system (`/node_modules`)
    chunkFileNames: 'node_modules/.chunk/[name]-[hash].mjs',
  },
  external: ['tuql'],
  plugins: [
    tsConfigPaths(), // use tsconfig paths to resolve modules
    nodeResolve({
      preferBuiltins: true,
      mainFields: ['esnext', 'module', 'main'],
      exportConditions: ['esnext'],
    }), // resolve node_modules and bundle them too
    graphql(), // handle graphql imports
    commonjs({ strictRequires: true }), // convert commonjs to esm
    json(), // support importing json files to esm (needed for commonjs() plugin)
    sucrase({ transforms: ['typescript'] }), // transpile typescript
    packagejson(), // add package jsons
  ],
});

/**
 * Adds package.json files to the bundle and its dependencies.
 *
 * @type {import('rollup').PluginImpl}
 */
function packagejson() {
  return {
    name: 'packagejson',
    generateBundle(_outputs, bundles) {
      /** @type {string[]} */
      const e2eModules = [];
      /** @type Record<string, {type?: string, exports?: Record<string, string>, main?: string}> */
      const packages = {};

      for (const bundle of Object.values(bundles).filter((bundle) => {
        const bundleName = String(bundle.name);
        return (
          !!deps[bundleName] &&
          (bundleName.includes('node_modules/') ||
            bundleName.includes('node_modules\\'))
        );
      })) {
        if (bundle.name?.startsWith('e2e/')) {
          const module = bundle.name.match(/node_modules\/(.*)\/index/)?.[1];
          if (!module) {
            throw new Error(
              `Unable to extract module name in the bundle "${bundle.name}"`,
            );
          }
          e2eModules.push(module);
        }
        const dir = path.dirname(bundle.fileName);
        const bundledFile = path.basename(bundle.fileName).replace(/\\/g, '/');
        const pkgFileName = path.join(dir, 'package.json');
        const pkg = packages[pkgFileName] ?? { type: 'module' };
        const mjsFile =
          bundledFile === 'index.mjs'
            ? '.'
            : './' + path.basename(bundle.fileName, '.mjs').replace(/\\/g, '/');
        // if the bundled file is not "index", then it's an package.json exports path
        pkg.exports = { ...pkg.exports, [mjsFile]: `./${bundledFile}` };
        packages[pkgFileName] = pkg;
      }

      for (const [fileName, pkg] of Object.entries(packages)) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: JSON.stringify(pkg),
        });
      }

      this.emitFile({
        type: 'asset',
        fileName: path.join('e2e', 'package.json'),
        source: JSON.stringify({
          dependencies: e2eModules.reduce(
            (acc, module) => ({
              ...acc,
              [module]: '', // empty version means "any" version, it'll keep the local module
            }),
            {},
          ),
        }),
      });
    },
  };
}

/**
 * Marks all "graphql*" module imports as external and fixes the imports to match
 * the node 16 style (append `.js` and `/index.js` for directories) where necessary.
 *
 * Furthermore, it also converts all default imports of the "graphql*" modules to
 * separate namespace imports, essentially:
 *
 * ```ts
 * import gql, { some, other, imports } from 'graphql*'
 * ```
 *
 * transforms to:
 *
 * ```ts
 * import * as gql from 'graphql'
 * import { some, other, imports } from 'graphql*'
 * ```
 *
 * @type {import('rollup').PluginImpl}
 */
function graphql() {
  return {
    name: 'graphql',
    async resolveId(source, importer) {
      if (source === 'graphql') {
        // import 'graphql'
        return { id: source, external: true };
      }
      if (!source.startsWith('graphql/') && !source.startsWith('graphql\\')) {
        // not import 'graphql/*'
        return null;
      }
      if (source.endsWith('.js')) {
        // proper node 16 import
        return { id: source, external: true };
      }

      const relPath = source.replace('graphql/', '').replace('graphql\\', '');
      if (!relPath) {
        throw new Error(
          `Importing "${source}" from "${importer}" is not a graphql module relative import`,
        );
      }

      // NOTE: cwd must be here
      // NOTE: the installed graphql must match the graphql in the Dockerfile
      const graphqlModulePath = path.resolve(
        '..',
        '..',
        'node_modules',
        'graphql',
      );
      try {
        fs.lstatSync(graphqlModulePath);
      } catch (e) {
        console.error(
          `"graphql" module not found in ${graphqlModulePath}. Have you run "yarn"?`,
        );
        throw e;
      }

      try {
        if (fs.lstatSync(path.join(graphqlModulePath, relPath)).isDirectory()) {
          // isdir
          return {
            id: source + '/index.js',
            external: true,
          };
        }
      } catch {
        // noop
      }

      // isfile or doesnt exist
      return {
        id: source + '.js',
        external: true,
      };
    },
    renderChunk(code) {
      if (!code.includes("from 'graphql")) {
        // code doesnt include a "graphql*" import
        return null;
      }

      let augmented = code;
      for (const line of code.split('\n')) {
        if (!line.startsWith('import ')) {
          // not an import line
          continue;
        }
        if (!line.includes("from 'graphql")) {
          // line doesnt include a "graphql*" import
          continue;
        }
        if (line.startsWith('import {')) {
          // no default import, ok
          continue;
        }

        let defaultImportPart = line.match(/import(.*) {/)?.[1]; // default + named
        const hasNamedImports = !!defaultImportPart;
        defaultImportPart ??= line.match(/import(.*) from/)?.[1]; // just default
        if (!defaultImportPart) {
          throw new Error(`Unable to match default import on:\n${line}`);
        }

        const module = line.split(' from ')?.[1];
        if (!module) {
          throw new Error(`Unable to detect module on:\n${line}`);
        }

        const namespaceImportLine = `import * as ${
          defaultImportPart
            .trim() // remove spaces
            .replace(/,$/, '') // remove last comma
        } from ${module}`;
        const lineWithoutDefaultImport = line.replace(defaultImportPart, '');

        augmented = augmented.replace(
          line,
          // NOTE: we use replacer instead because strings can mess up dollar signs
          //       see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_the_replacement
          () => {
            if (hasNamedImports) {
              return `${lineWithoutDefaultImport}\n${namespaceImportLine}`;
            } else {
              // no named imports, so we just need the namespace import line
              return namespaceImportLine;
            }
          },
        );
      }
      return augmented;
    },
  };
}
