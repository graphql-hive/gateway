export {};

declare global {
  /**
   * Available ONLY in SEA environment.
   * See `scripts/install-sea-packed-deps.cjs` and `rollup.binary.config.js`
   */
  var __PACKED_DEPS_PATH__: string | undefined;
  /** Gets injected during build by `scripts/inject-version.ts`. */
  var __VERSION__: string | undefined;
}
