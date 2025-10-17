import { deepmerge } from '@fastify/deepmerge';

// copied from https://github.com/fastify/deepmerge?tab=readme-ov-file#mergearray
function deepmergeArray(options: any): any {
  const mergeDeep = options.deepmerge;
  const clone = options.clone;
  return function (target: any, source: any) {
    let i = 0;
    const sl = source.length;
    const il = Math.max(target.length, source.length);
    const result = new Array(il);
    for (i = 0; i < il; ++i) {
      if (i < sl) {
        result[i] = mergeDeep(target[i], source[i]);
      } else {
        result[i] = clone(target[i]);
      }
    }
    return result;
  };
}

export const mergeDeep = deepmerge({
  mergeArray: deepmergeArray,
});
