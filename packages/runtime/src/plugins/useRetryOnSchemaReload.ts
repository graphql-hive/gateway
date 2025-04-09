import type { Logger } from '@graphql-hive/logger';
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
  const logForRequest = new WeakMap<Request, Logger>();
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
      let log = logForRequest.get(request)!; // must exist at this point
      const requestId = requestIdByRequest.get(request);
      if (requestId) {
        log = log.child({ requestId });
      }
      log.info(
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
    onExecute({ args, context }) {
      // we set the logger here because it most likely contains important attributes (like the request-id)
      logForRequest.set(context.request, context.log);
      handleOnExecute(args);
    },
    onSubscribe({ args, context }) {
      // we set the logger here because it most likely contains important attributes (like the request-id)
      logForRequest.set(context.request, context.log);
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
