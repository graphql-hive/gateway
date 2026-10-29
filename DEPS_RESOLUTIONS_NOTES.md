# Notes about dependency resolutions in [package.json](/package.json)

Here we collect reasons and write explanations about why some resolutions or patches have been added.

### pkgroll

1. https://github.com/privatenumber/pkgroll/issues/101 (added `interop: "auto"` to `getRollupConfigs` outputs)
2. Skip libchecking while generating type declarations because we never bundle `@types` by disabling `respectExternal` ([read more](https://github.com/Swatinem/rollup-plugin-dts?tab=readme-ov-file#what-to-expect))

### tsx

1. https://github.com/privatenumber/tsx/issues/159#issuecomment-2473632866 (did what was suggested)

### @opentelemetry/otlp-exporter-base

1. Use `import` instead of `require` for dynamic resolution in ES Module

### @rollup/plugin-node-resolve

1. Give priority to additional `exportConditions` provided in configuration. This allows to not patch most OTEL packages to point to esnext build.

### ansi-color

1. Used by OTEl packages (NodeSDK).
2. Contains a legacy byte code syntax, forbidden in strict mode used by Hive Gateway.

### @babel/template

1. Applies only to Babel 8 (`@babel/template@npm:^8.0.0`). Babel 7 consumers are left untouched.
2. For every template it builds, `extendedTrace` keeps an unformatted `new Error()`. V8 keeps the call sites of an unformatted error, including their receivers, alive until the stack is read. When Babel builds templates during a Jest transform, that stack includes Jest's module executor, so the whole test environment of the suite stays in memory and `yarn test:leaks` reports a leak.
3. The patch formats the stack to a string as soon as the template is built and keeps only the string. Babel 7 behaves the same way.

### jest-circus

1. jest-circus runs every test and hook inside an `AsyncLocalStorage` whose store holds the test, hook and describe block.
2. Every timer, socket or other async resource created during a test captures the current async context. Some of them live for the whole process and keep the last captured context, for example the fast timer in Node's bundled undici (used by the global `fetch`) and the default DNS resolver channel. Through the store they keep the test environment of a finished suite alive, so `yarn test:leaks` reports a leak.
3. Storing weak references or objects with getters is not enough. Any object or function created inside jest-circus belongs to the test realm, and the realm references the test environment.
4. The patch stores only a numeric id in the `AsyncLocalStorage`. The contexts live in a `Map` inside the jest-circus module, which is released together with the suite's runtime. `getTestExecutionContext` returns the same objects as before, so attributing errors to tests behaves the same.

### jest-leak-detector

1. Triggers garbage collection with `%CollectGarbage(true)` on every tick instead of exposing `gc` once.
2. Some Node internals keep short-lived timers, for example the HTTP server's `Date` header cache, which lives for up to 1 second. Through the captured async context, such a timer keeps the test environment alive until it fires, which makes leak detection flaky.
3. If the environment is still held after the first collection, the detector waits 1.1 seconds and collects again. Only references that outlive these timers are reported as leaks. Suites that do not leak are not slowed down.
