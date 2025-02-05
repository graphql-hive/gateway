export type * from './types';
export * from './ObjMap';
export { executorFromSchema as createDefaultExecutor } from '@graphql-tools/executor';
export { getDocumentString } from '@envelop/core';
export { defaultPrintFn } from '@graphql-tools/executor-common';
export function abortSignalAny(signals: AbortSignal[]): AbortSignal {
  return AbortSignal.any(signals);
}
