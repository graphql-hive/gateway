import { isAsyncIterable, MaybeAsyncIterable } from '@graphql-tools/utils';
import { handleMaybePromise, MaybePromise } from '@whatwg-node/promise-helpers';
import { ExecutionResult } from 'graphql';
import { YogaInitialContext } from 'graphql-yoga';
import { GatewayPlugin } from '../types';

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
    onExecutionResult({ context, result, setResult }) {
      if (
        !isAsyncIterable(result) &&
        result?.errors?.some(
          (e) => e.extensions?.['code'] === 'SUBSCRIPTION_SCHEMA_RELOAD',
        )
      ) {
        const execHandler = execHandlerByContext.get(context);
        if (execHandler) {
          return handleMaybePromise(execHandler, (newResult) =>
            setResult(newResult),
          );
        }
      }
    },
  };
}
