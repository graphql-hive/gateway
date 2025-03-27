import type { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
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
    if (compiledQuery.subscribe) {
      return compiledQuery.subscribe(
        args.rootValue,
        args.contextValue,
        args.variableValues,
      );
    }
    if (compiledQuery.stringify) {
      return handleMaybePromise(
        () =>
          compiledQuery.query(
            args.rootValue,
            args.contextValue,
            args.variableValues,
          ),
        (result) => {
          // @ts-expect-error - stringify is a custom property added by graphql-jit
          result.stringify = compiledQuery.stringify;
          return result;
        },
      );
    }
    return compiledQuery.query(
      args.rootValue,
      args.contextValue,
      args.variableValues,
    );
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
