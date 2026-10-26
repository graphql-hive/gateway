import {registerHooks} from 'node:module';
import assert from 'node:assert/strict';
export function enableCompactResult(){
 return registerHooks({load(url,context,nextLoad){
  const result=nextLoad(url,context);let needle;
  if(url.endsWith('/@graphql-tools/executor/esm/execution/execute.js')||url.endsWith('/graphql-js/src/execution/Executor.ts'))needle='const results = Object.create(null);';
  if(url.endsWith('/@graphql-tools/executor/esm/execution/promiseForObject.js')||url.endsWith('/graphql-js/src/jsutils/promiseForObject.ts'))needle='const resolvedObject = Object.create(null);';
  if(!needle)return result;
  const source=String(result.source);assert.equal(source.split(needle).length,2,url);
  return {...result,source:'function CompactExecutionResultMap() {}\n'+source.replace(needle,needle.replace('Object.create(null)','Object.setPrototypeOf(new CompactExecutionResultMap(), null)'))};
 }});
}
export function enableCompactMetadata(){
 return registerHooks({load(url,context,nextLoad){
  const result=nextLoad(url,context);if(!url.endsWith('/@graphql-tools/delegate/dist/index.js'))return result;
  const source=String(result.source);
  const annotation=/annotateExternalObject\(\s*object,\s*unpathedErrors,\s*subschema,\s*\/\* @__PURE__ \*\/ Object\.create\(null\)\s*\)/g;
  assert.equal([...source.matchAll(annotation)].length,1);
  return {...result,source:'function CompactFieldSubschemaMap() {}\n'+source.replace(annotation,'annotateExternalObject(object, unpathedErrors, subschema, Object.setPrototypeOf(new CompactFieldSubschemaMap(), null))')};
 }});
}
// Redirect the existing, frozen installers without changing their files.
export function enableCompactInstallers(){
 const moduleURL=import.meta.url;
 return registerHooks({load(url,context,nextLoad){
  if(url.endsWith('/bench/candidate-fast-result.mjs'))return {format:'module',shortCircuit:true,source:`export {enableCompactResult as enableFastResult} from ${JSON.stringify(moduleURL)};`};
  if(url.endsWith('/bench/candidate-fast-metadata.mjs'))return {format:'module',shortCircuit:true,source:`export {enableCompactMetadata as enableFastMetadata} from ${JSON.stringify(moduleURL)};`};
  return nextLoad(url,context);
 }});
}
