const { patchSymbols } = require('@whatwg-node/disposablestack');
patchSymbols();

module.exports = new Proxy(require('@jest/globals'), {
  get(jestGlobals, prop, receiver) {
    if (prop === 'vitest') {
      return jestGlobals.jest;
    }
    if (prop === 'describe') {
      const describeFn = function describe(name, ...args) {
        if (typeof name === 'string') {
          return jestGlobals.describe(`${name} >`, ...args);
        }
        return jestGlobals.describe(name, ...args);
      };
      describeFn.skip = jestGlobals.describe.skip;
      describeFn.only = jestGlobals.describe.only;
      return describeFn;
    }
    return Reflect.get(jestGlobals, prop, receiver);
  },
});
