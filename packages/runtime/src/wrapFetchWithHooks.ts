import { getInstrumented } from '@envelop/instrumentation';
import { LegacyLogger, type Logger } from '@graphql-hive/logger';
import type { MeshFetch } from '@graphql-mesh/types';
import type { ExecutionRequest, MaybePromise } from '@graphql-tools/utils';
import { handleMaybePromise, iterateAsync } from '@whatwg-node/promise-helpers';
import { OnFetchHook, OnFetchHookDone } from './types';

export type FetchInstrumentation = {
  fetch?: (
    payload: { executionRequest?: ExecutionRequest },
    wrapped: () => MaybePromise<void>,
  ) => MaybePromise<void>;
};

export function wrapFetchWithHooks<TContext>(
  onFetchHooks: OnFetchHook<TContext>[],
  log: Logger,
  instrumentation?: () => FetchInstrumentation | undefined,
): MeshFetch {
  let wrappedFetchFn = function wrappedFetchFn(url, options, context, info) {
    let fetchFn: MeshFetch;
    let response$: MaybePromise<Response>;
    const onFetchDoneHooks: OnFetchHookDone[] = [];
    context.log ||= log;
    return handleMaybePromise(
      () =>
        iterateAsync(
          onFetchHooks,
          (onFetch, endEarly) =>
            onFetch({
              fetchFn,
              setFetchFn(newFetchFn) {
                fetchFn = newFetchFn;
              },
              url,
              setURL(newUrl) {
                url = String(newUrl);
              },
              // @ts-expect-error TODO: why?
              options,
              setOptions(newOptions) {
                options = newOptions;
              },
              context,
              logger: LegacyLogger.from(log),
              // @ts-expect-error TODO: why?
              info,
              get executionRequest() {
                return (
                  info?.executionRequest ||
                  // @ts-expect-error might be in the root value, see packages/fusion-runtime/src/utils.ts
                  info?.rootValue?.executionRequest
                );
              },
              endResponse(newResponse) {
                response$ = newResponse;
                endEarly();
              },
            }),
          onFetchDoneHooks,
        ),
      function handleIterationResult() {
        if (response$) {
          return response$;
        }
        return handleMaybePromise(
          () => fetchFn(url, options, context, info),
          function (response: Response) {
            return handleMaybePromise(
              () =>
                iterateAsync(onFetchDoneHooks, (onFetchDone) =>
                  onFetchDone({
                    response,
                    setResponse(newResponse) {
                      response = newResponse;
                    },
                  }),
                ),
              function handleOnFetchDone() {
                return response;
              },
            );
          },
        );
      },
    );
  } as MeshFetch;

  if (instrumentation) {
    const originalWrappedFetch = wrappedFetchFn;
    wrappedFetchFn = function wrappedFetchFn(url, options, context, info) {
      const fetchInstrument = instrumentation()?.fetch;
      const instrumentedFetch = fetchInstrument
        ? getInstrumented({
            get executionRequest() {
              return info?.executionRequest;
            },
          }).asyncFn(fetchInstrument, originalWrappedFetch)
        : originalWrappedFetch;

      return instrumentedFetch(url, options, context, info);
    };
  }

  return wrappedFetchFn;
}
