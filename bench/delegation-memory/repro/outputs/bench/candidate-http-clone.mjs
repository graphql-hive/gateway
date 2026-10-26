import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
export function enableCandidateHTTPClone() {
  return registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.endsWith('/@graphql-tools/executor-http/dist/index.js')) return result;
    let source = String(result.source);
    const replace = (before, after) => {
      assert.equal(source.split(before).length, 2, `Expected exactly one HTTP executor patch site: ${before}`);
      source = source.replace(before, after);
    };
    replace('const inflightRequests = /* @__PURE__ */ new Map();',
      'const inflightRequests = /* @__PURE__ */ new Map();\nconst sharedInflightRequests = new WeakSet();');
    replace('      if (!inflightRequest) {\n        inflightRequest = runInflightRequest();',
      '      if (inflightRequest) sharedInflightRequests.add(inflightRequest);\n      if (!inflightRequest) {\n        inflightRequest = runInflightRequest();');
    replace('          if (result == null || !result.data) {\n            return result;\n          }\n          const clonedResult = {',
      '          if (result == null || !result.data || !sharedInflightRequests.has(inflightRequest)) {\n            return result;\n          }\n          const clonedResult = {');
    return { ...result, source };
  } });
}
