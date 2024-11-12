const { patchSymbols } = require('@whatwg-node/disposablestack');
patchSymbols();

module.exports = new Proxy(
  {},
  {
    get(_, prop) {
      if (prop === 'vitest') {
        return jest;
      }
      if (prop === 'describe') {
        return function describe(name, ...args) {
          if (typeof name === 'string') {
            return globalThis.describe(`${name} >`, ...args);
          }
          return globalThis.describe(name, ...args);
        };
      }
      return globalThis[prop];
    },
  },
);
