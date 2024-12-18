const { patchSymbols } = require('@whatwg-node/disposablestack');
patchSymbols();

module.exports = new Proxy(require('@jest/globals'), {
  get(jestGlobals, prop, receiver) {
    if (prop === 'vitest' || prop === 'vi') {
      return jestGlobals.jest;
    }
    if (prop === 'describe') {
      const describeFn = function describe(name, ...args) {
        return jestGlobals.describe(name, ...args);
      };
      describeFn.skipIf = function describeSkipIf(condition) {
        return condition ? describeFn.skip : describeFn;
      };
      describeFn.skip = function describeSkip(name, ...args) {
        return jestGlobals.describe.skip(name, ...args);
      };
      describeFn.only = function describeOnly(name, ...args) {
        return jestGlobals.describe.only(name, ...args);
      };
      return describeFn;
    }
    if (prop === 'it') {
      const itFn = function it(name, ...args) {
        return jestGlobals.it(name, ...args);
      };
      itFn.skipIf = function itSkipIf(condition) {
        return condition ? itFn.skip : itFn;
      };
      itFn.skip = function itSkip(name, ...args) {
        return jestGlobals.it.skip(name, ...args);
      };
      itFn.only = function itOnly(name, ...args) {
        return jestGlobals.it.only(name, ...args);
      };
      return itFn;
    }
    return Reflect.get(jestGlobals, prop, receiver);
  },
});
