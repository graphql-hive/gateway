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

/**
 * A schema-reload notice is the runtime aborting the operation because the
 * supergraph reloaded: a result whose errors all carry
 * `extensions.code: 'SCHEMA_RELOAD'` and whose data holds no non-null root
 * field. Results carrying real data or any other error are never treated as
 * a notice.
 */
function isSchemaReloadNotice(result: ExecutionResult): boolean {
  const { errors, data } = result;
  if (!errors || errors.length === 0) {
    return false;
  }
  if (!errors.every((e) => e.extensions?.['code'] === 'SCHEMA_RELOAD')) {
    return false;
  }
  return data == null || Object.values(data).every((value) => value == null);
}

export function useRetryOnSchemaReload<
  TContext extends Record<string, any>,
>(): GatewayPlugin<TContext> {
  const execHandlerByContext = new WeakMap<{}, ExecHandler>();
  const subscriptionContexts = new WeakSet<{}>();
  function handleOnExecute(args: ExecutionArgs) {
    if (args.contextValue) {
      const operation = getOperationAST(args.document, args.operationName);
      if (operation?.operation === 'subscription') {
        subscriptionContexts.add(args.contextValue);
      } else if (operation?.operation !== 'query') {
        // Mutations are never retried
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
  /**
   * A stream cannot be retried by swapping the result, so when the runtime
   * ends a subscription with a schema reload notice the operation is
   * re-executed against the new schema and the new stream is spliced in,
   * mirroring the retry queries get above. Without an exec handler the
   * stream just completes; a failed re-execution (e.g. the operation no
   * longer validates against the new schema) is delivered before the end.
   */
  function wrapStreamForRetry(
    source: AsyncIterable<ExecutionResult>,
    context: { log: Logger },
  ): AsyncIterable<ExecutionResult> {
    return (async function* () {
      for await (const result of source) {
        if (!isSchemaReloadNotice(result)) {
          yield result;
          continue;
        }
        const execHandler = execHandlerByContext.get(context);
        if (!execHandler) {
          return;
        }
        context.log.info(
          '[useRetryOnSchemaReload] The subscription has been aborted after the supergraph schema reloaded, re-subscribing...',
        );
        const next = await execHandler();
        if (!isAsyncIterable(next)) {
          yield next;
          return;
        }
        // The re-executed stream went through the request pipeline again, so
        // it is already wrapped for the next reload.
        yield* next;
        return;
      }
    })();
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
        if (subscriptionContexts.has(context)) {
          setResult(wrapStreamForRetry(result, context));
        }
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
