const { patchSymbols } = require('@whatwg-node/disposablestack');
patchSymbols();

module.exports = new Proxy(require('@jest/globals'), {
  get(jestGlobals, prop, receiver) {
    if (prop === 'vitest') {
      return jestGlobals.jest;
    }
    if (prop === 'describe') {
      return function describe(name, ...args) {
        if (typeof name === 'string') {
          return jestGlobals.describe(`${name} >`, ...args);
        }
        return jestGlobals.describe(name, ...args);
      };
    }
    return Reflect.get(jestGlobals, prop, receiver);
  },
});
