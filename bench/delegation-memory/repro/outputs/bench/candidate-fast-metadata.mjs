import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
export function enableFastMetadata() {
  return registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.endsWith('/@graphql-tools/delegate/dist/index.js')) return result;
    const source = String(result.source);
    const annotation = /annotateExternalObject\(\s*object,\s*unpathedErrors,\s*subschema,\s*\/\* @__PURE__ \*\/ Object\.create\(null\)\s*\)/g;
    assert.equal([...source.matchAll(annotation)].length, 1, 'expected exactly one annotation map allocation');
    return { ...result, source: source.replace(annotation, 'annotateExternalObject(object, unpathedErrors, subschema, Object.setPrototypeOf({}, null))') };
  } });
}
