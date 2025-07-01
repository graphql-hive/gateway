# Notes about dependency resolutions in [package.json](/package.json)

Here we collect reasons and write explanations about why some resolutions or patches have been added.

### pkgroll

1. https://github.com/privatenumber/pkgroll/issues/101 (added `interop: "auto"` to `getRollupConfigs` outputs)
2. Skip libchecking while generating type declarations because we never bundle `@types` by disabling `respectExternal` ([read more](https://github.com/Swatinem/rollup-plugin-dts?tab=readme-ov-file#what-to-expect))

### tsx

1. https://github.com/privatenumber/tsx/issues/159#issuecomment-2473632866 (did what was suggested)

### vitest-tsconfig-paths

1. Resolve tsconfig paths in modules that have been [inlined](https://vitest.dev/config/#server-deps-inline).

### @memlab/core

1. Define package.json#export for `@memlab/core/Types`
2. Define package.json#export for `@memlab/core/Utils`

### @opentelemetry/otlp-exporter-base

1. Use `import` instead of `require` for dynamic resolution in ES Module

### @rollup/plugin-node-resolve

1. Give priority to additional `exportConditions` provided in configuration. This allows to not patch most OTEL packages to point to esnext build.

### ansi-color

1. Used by OTEl packages (NodeSDK).
2. Contains a legacy byte code syntax, forbidden in strict mode used by Hive Gateway.
