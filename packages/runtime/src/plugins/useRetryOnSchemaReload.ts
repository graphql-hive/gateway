import { Logger } from '@graphql-mesh/types';
import { requestIdByRequest } from '@graphql-mesh/utils';
import type { MaybeAsyncIterable } from '@graphql-tools/utils';
import {
  handleMaybePromise,
  type MaybePromise,
} from '@whatwg-node/promise-helpers';
import { ExecutionArgs, getOperationAST, type ExecutionResult } from 'graphql';
import { isAsyncIterable, YogaInitialContext } from 'graphql-yoga';
import type { GatewayPlugin } from '../types';

type ExecHandler = () => MaybePromise<MaybeAsyncIterable<ExecutionResult>>;

export function useRetryOnSchemaReload<TContext extends Record<string, any>>({
  logger,
}: {
  logger: Logger;
}): GatewayPlugin<TContext> {
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
    request,
  }: {
    context: {};
    result?: ExecutionResult;
    setResult: (result: MaybeAsyncIterable<ExecutionResult>) => void;
    request: Request;
  }) {
    const execHandler = execHandlerByContext.get(context);
    if (
      execHandler &&
      result?.errors?.some((e) => e.extensions?.['code'] === 'SCHEMA_RELOAD')
    ) {
      let requestLogger = logger;
      const requestId = requestIdByRequest.get(request);
      if (requestId) {
        requestLogger = logger.child({ requestId });
      }
      requestLogger.info(
        'The operation has been aborted after the supergraph schema reloaded, retrying the operation...',
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
          context: context as YogaInitialContext,
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
