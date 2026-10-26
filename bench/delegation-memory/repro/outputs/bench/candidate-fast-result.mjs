import {registerHooks} from 'node:module';
import assert from 'node:assert/strict';
// Equivalent null-prototype objects, but V8 can keep properties in fast mode.
// Limit replacement to execution result maps; resolver/source objects are untouched.
export function enableFastResult() {
 return registerHooks({load(url,context,nextLoad){
  const result=nextLoad(url,context); let needle;
  if(url.endsWith('/@graphql-tools/executor/esm/execution/execute.js') || url.endsWith('/graphql-js/src/execution/Executor.ts')) needle='const results = Object.create(null);';
  if(url.endsWith('/@graphql-tools/executor/esm/execution/promiseForObject.js') || url.endsWith('/graphql-js/src/jsutils/promiseForObject.ts')) needle='const resolvedObject = Object.create(null);';
  if(!needle)return result;
  const source=String(result.source);assert.equal(source.split(needle).length,2,url);
  return {...result,source:source.replace(needle,needle.replace('Object.create(null)','Object.setPrototypeOf({}, null)'))};
 }});
}
