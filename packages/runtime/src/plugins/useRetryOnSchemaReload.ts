import type { MaybeAsyncIterable } from '@graphql-tools/utils';
import {
  handleMaybePromise,
  type MaybePromise,
} from '@whatwg-node/promise-helpers';
import { getOperationAST, type ExecutionResult } from 'graphql';
import { isAsyncIterable, YogaInitialContext } from 'graphql-yoga';
import type { GatewayPlugin } from '../types';

export function useRetryOnSchemaReload<
  TContext extends Record<string, any>,
>(): GatewayPlugin<TContext> {
  const execHandlerByContext = new WeakMap<
    {},
    () => MaybePromise<MaybeAsyncIterable<ExecutionResult>>
  >();
  return {
    onParams({ request, params, context, paramsHandler }) {
      execHandlerByContext.set(context, () =>
        paramsHandler({
          request,
          params,
          context: context as YogaInitialContext,
        }),
      );
    },
    onExecute({ args }) {
      const operation = getOperationAST(args.document, args.operationName);
      // Only queries will be retried
      if (operation?.operation !== 'query') {
        execHandlerByContext.delete(args.contextValue);
      }
    },
    onExecutionResult({ context, result, setResult }) {
      const execHandler = execHandlerByContext.get(context);
      if (
        execHandler &&
        !isAsyncIterable(result) &&
        result?.errors?.some((e) => e.extensions?.['code'] === 'SCHEMA_RELOAD')
      ) {
        if (execHandler) {
          return handleMaybePromise(execHandler, (newResult) =>
            setResult(newResult),
          );
        }
      }
    },
  };
}
