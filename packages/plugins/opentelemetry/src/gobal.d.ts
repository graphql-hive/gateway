export {};

declare global {
  /** Gets injected during build by `scripts/inject-version.ts`. */
  var __OTEL_PLUGIN_VERSION__: string | undefined;
}
