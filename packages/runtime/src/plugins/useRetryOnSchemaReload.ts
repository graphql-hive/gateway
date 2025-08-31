import type { Logger } from '@graphql-hive/logger';
import type { MaybeAsyncIterable } from '@graphql-tools/utils';
import {
  handleMaybePromise,
  type MaybePromise,
} from '@whatwg-node/promise-helpers';
import { ExecutionArgs, getOperationAST, type ExecutionResult } from 'graphql';
import { isAsyncIterable, YogaInitialContext } from 'graphql-yoga';
import type { GatewayConfigContext, GatewayPlugin } from '../types';

type ExecHandler = () => MaybePromise<MaybeAsyncIterable<ExecutionResult>>;

export function useRetryOnSchemaReload<
  TContext extends Record<string, any>,
>(): GatewayPlugin<TContext> {
  const execHandlerByContext = new WeakMap<{}, ExecHandler>();
  function handleOnExecute(args: ExecutionArgs) {
    if (args.contextValue) {
      const operation = getOperationAST(args.document, args.operationName);
      // Only queries will be retried
      if (operation?.operation !== 'query') {
        execHandlerByContext.delete(args.contextValue);
      }
    }
  }
  function handleExecutionResult({
    context,
    result,
    setResult,
  }: {
    context: { log: Logger };
    result?: ExecutionResult;
    setResult: (result: MaybeAsyncIterable<ExecutionResult>) => void;
    // request wont be available over websockets
    request: Request | undefined;
  }) {
    const execHandler = execHandlerByContext.get(context);
    if (
      execHandler &&
      result?.errors?.some((e) => e.extensions?.['code'] === 'SCHEMA_RELOAD')
    ) {
      context.log.info(
        '[useRetryOnSchemaReload] The operation has been aborted after the supergraph schema reloaded, retrying the operation...',
      );
      if (execHandler) {
        return handleMaybePromise(execHandler, (newResult) =>
          setResult(newResult),
        );
      }
    }
  }
  return {
    onParams({ request, params, context, paramsHandler }) {
      execHandlerByContext.set(context, () =>
        paramsHandler({
          request,
          params,
          context: context as YogaInitialContext & GatewayConfigContext,
        }),
      );
    },
    onExecute({ args }) {
      handleOnExecute(args);
    },
    onSubscribe({ args }) {
      handleOnExecute(args);
    },
    onExecutionResult({ request, context, result, setResult }) {
      if (isAsyncIterable(result)) {
        return;
      }
      return handleExecutionResult({ context, result, setResult, request });
    },
    onResultProcess({ result, setResult, serverContext, request }) {
      if (isAsyncIterable(result) || Array.isArray(result)) {
        return;
      }
      return handleExecutionResult({
        context: serverContext,
        result,
        setResult,
        request,
      });
    },
  };
}
