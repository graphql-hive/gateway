import type { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import { isAsyncIterable } from '@graphql-tools/utils';
import {
  handleMaybePromise,
  mapAsyncIterator,
} from '@whatwg-node/promise-helpers';
import type { DocumentNode, ExecutionArgs } from 'graphql';
import { compileQuery, isCompiledQuery, type CompiledQuery } from 'graphql-jit';

function createExecuteFnWithJit() {
  const compiledQueryByDocument = new WeakMap<DocumentNode, CompiledQuery>();
  return function executeWithJit(args: ExecutionArgs) {
    let compiledQuery = compiledQueryByDocument.get(args.document);
    if (compiledQuery == null) {
      const compilationResult = compileQuery(
        args.schema,
        args.document,
        args.operationName || undefined,
        {
          disableLeafSerialization: true,
          customJSONSerializer: true,
        },
      );
      if (isCompiledQuery(compilationResult)) {
        compiledQuery = compilationResult;
        compiledQueryByDocument.set(args.document, compiledQuery);
      } else {
        return compilationResult;
      }
    }
    const executeFn = () =>
      compiledQuery.subscribe
        ? compiledQuery.subscribe(
            args.rootValue,
            args.contextValue,
            args.variableValues,
          )
        : compiledQuery.query(
            args.rootValue,
            args.contextValue,
            args.variableValues,
          );
    if (compiledQuery.stringify) {
      return handleMaybePromise(executeFn, (result) => {
        if (isAsyncIterable(result)) {
          return mapAsyncIterator(result, (result) => ({
            data: result.data,
            errors: result.errors,
            extensions: result.extensions,
            stringify: compiledQuery.stringify,
          }));
        }
        return {
          data: result.data,
          errors: result.errors,
          extensions: result.extensions,
          stringify: compiledQuery.stringify,
        };
      });
    }
    return executeFn();
  };
}

export function useJIT<
  TContext extends Record<string, any>,
>(): GatewayPlugin<TContext> {
  const executeFnWithJit = createExecuteFnWithJit();
  return {
    onExecute({ setExecuteFn }) {
      setExecuteFn(executeFnWithJit);
    },
    onSubscribe({ setSubscribeFn }) {
      setSubscribeFn(executeFnWithJit);
    },
  };
}
