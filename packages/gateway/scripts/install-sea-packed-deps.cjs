// ONLY run in Node SEA environments
// ONLY bundled for binary, see rollup.binary.config.js
// CANNOT be a part of the source code because importing
//        modules with node:sea is not supported

/** Intentionally IIFE, should run immediately on CLI boot. */
(function installSeaPackedDeps() {
  const shouldCleanPackedDeps = ['1', 'y', 'yes', 't', 'true'].includes(
    String(process.env['SEA_CLEAN_PACKED_DEPS']),
  );
  const isDebug = ['1', 'y', 'yes', 't', 'true'].includes(
    String(process.env['DEBUG']),
  );
  /**
   * Will log only when DEBUG env is set to a truthy value.
   *
   * @param {string} msg
   * @param  {...unknown} args
   */
  function debug(msg, ...args) {
    if (isDebug) {
      console.debug(`[${new Date().toISOString()}] SEA ${msg}`, ...args);
    }
  }

  const fs = require('node:fs');
  const Module = require('node:module');
  const path = require('node:path');
  /**
   * @param {string} assetName
   */
  function getAsset(assetName) {
    if (globalThis.Bun) {
      const file = globalThis.Bun.embeddedFiles.find((f) =>
        f.name.includes(assetName),
      );
      if (!file) {
        throw new Error(`Asset "${assetName}" not found`);
      }
      return file.arrayBuffer();
    }
    const sea = require('node:sea');
    return sea.getAsset(assetName);
  }
  const os = require('node:os');

  // NOTE that the path is stable for modules hash and system,
  // we should NEVER install modules in multiple places to avoid
  // spamming user's devices
  globalThis.__PACKED_DEPS_PATH__ = `${os.tmpdir()}${path.sep}mesh-serve_${
    // @ts-expect-error INJECTED DURING BUNDLE (check rollup.binary.config.js)
    __MODULES_HASH__
  }_node_modules`;

  const modulesPath = globalThis.__PACKED_DEPS_PATH__;
  let packedDepsInstalled = fs.existsSync(modulesPath);
  if (packedDepsInstalled) {
    debug(`Packed dependencies already installed at "${modulesPath}"`);
    if (shouldCleanPackedDeps) {
      debug(`Removing existing packed dependencies`);
      fs.rmSync(modulesPath, { recursive: true });
      packedDepsInstalled = false;
    }
  }
  if (!packedDepsInstalled) {
    debug(`Extracting packed dependencies to "${modulesPath}"`);
    /**
     * @param {ArrayBuffer} arrayBuffer
     */
    function handleAsset(arrayBuffer) {
      const ADMZip = require('adm-zip'); // THIS IS BUNDLED AND INJECTED
      const zip = new ADMZip(Buffer.from(arrayBuffer));
      zip.extractAllTo(modulesPath);
    }
    const arrayBuffer$ = getAsset('node_modules.zip');
    if ('then' in arrayBuffer$) {
      arrayBuffer$.then(handleAsset);
    } else {
      handleAsset(arrayBuffer$);
    }
  }

  debug('Registering packed dependencies');
  // @ts-expect-error
  const originalResolveFilename = Module._resolveFilename;
  // @ts-expect-error
  Module._resolveFilename = (id, ...rest) => {
    if (id.startsWith('node_modules/') || id.startsWith('node_modules\\')) {
      id = id
        .replace('node_modules/', '')
        .replace('node_modules\\', '')
        .replace(/\\/g, '/');
    }
    if (id.startsWith('node:')) {
      return originalResolveFilename(id, ...rest);
    }
    if (Module.builtinModules.includes(id)) {
      return originalResolveFilename(id, ...rest);
    }
    if (id.startsWith('.')) {
      return originalResolveFilename(id, ...rest);
    }
    try {
      debug(`Resolving packed dependency "${id}"`);
      const resolvedPath = path.join(modulesPath, id);
      debug(`Resolved to "${resolvedPath}"`);
      // always try to import from necessary modules first
      return originalResolveFilename(resolvedPath, ...rest);
    } catch (e) {
      debug(
        `Failed to resolve packed dependency "${id}"; Falling back to the original resolver...`,
      );
      // fall back to the original resolver
      return originalResolveFilename(id, ...rest);
    }
  };
})();
