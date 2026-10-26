import {registerHooks} from 'node:module';
import assert from 'node:assert/strict';
export const helpers=`
function normalizeCompositeResult(value) {
  if (value && isActualPromise(value)) return unfakePromise(value);
  if (isPromise(value)) {
    return unfakePromise({
      then: (resolve, reject) => fakePromise(value.then(resolve, reject)),
      catch: reject => fakePromise(value.then(res => res, reject)),
      finally: cb => fakePromise(cb ? promiseLikeFinally(value, cb) : value),
      [Symbol.toStringTag]: 'Promise',
    });
  }
  return value;
}
function validateCompositeResult(value, type, info) {
  if (info && isAbstractType(type)) {
    if (value.__typename != null) {
      const resolvedType = info.schema.getType(value.__typename);
      if (!resolvedType) return null;
    }
    return value;
  }
  return value;
}
function finishCompositeResult(value, type, info) {
  if (value && isActualPromise(value)) {
    return unfakePromise(value.then(result => validateCompositeResult(result, type, info), undefined));
  }
  if (isPromise(value)) {
    return unfakePromise(fakePromise(value.then(result => validateCompositeResult(result, type, info), undefined)));
  }
  return normalizeCompositeResult(validateCompositeResult(value, type, info));
}
`;
export function enableInlineComposite(){return registerHooks({load(url,context,nextLoad){
 const loaded=nextLoad(url,context);if(!url.endsWith('/@graphql-tools/delegate/dist/index.js'))return loaded;
 let source=String(loaded.source);
 const start='} else if (isCompositeType(type)) {',end='  } else if (isListType(type)) {';
 assert.equal(source.split(start).length,2);
 const a=source.indexOf(start),b=source.indexOf(end,a);assert(b>a);
 assert(source.slice(a,b).includes('return handleMaybePromise('));
 source=source.slice(0,a)+start+`
    const resolved = resolveExternalObject(type, result, unpathedErrors, subschema, context, info, skipTypeMerging);
    return finishCompositeResult(resolved, type, info);
`+source.slice(b);
 return {...loaded,source:"import {isActualPromise, fakePromise, unfakePromise, promiseLikeFinally} from '@whatwg-node/promise-helpers';\n"+helpers+source};
 }});}
