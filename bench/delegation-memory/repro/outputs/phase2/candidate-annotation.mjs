import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';

export function enableAnnotation() {
  return registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.endsWith('/@graphql-tools/delegate/dist/index.js')) return result;
    const source = String(result.source);
    const before = `  Object.defineProperties(object, {
    [OBJECT_SUBSCHEMA_SYMBOL]: { value: subschema, writable: true },
    [FIELD_SUBSCHEMA_MAP_SYMBOL]: { value: subschemaMap, writable: true },
    [UNPATHED_ERRORS_SYMBOL]: { value: errors, writable: true }
  });`;
    assert.equal(source.split(before).length, 2, 'expected exactly one annotation descriptor pack');
    const after = `  if ('enumerable' in Object.prototype || 'configurable' in Object.prototype || 'get' in Object.prototype || 'set' in Object.prototype) {
${before}
  } else {
  const defineProperty = Object.defineProperty;
  const descriptor = Object.setPrototypeOf({ value: subschema, writable: true }, null);
  defineProperty(object, OBJECT_SUBSCHEMA_SYMBOL, descriptor);
  descriptor.value = subschemaMap;
  defineProperty(object, FIELD_SUBSCHEMA_MAP_SYMBOL, descriptor);
  descriptor.value = errors;
  defineProperty(object, UNPATHED_ERRORS_SYMBOL, descriptor);
  }`;
    return { ...result, source: source.replace(before, after) };
  } });
}
