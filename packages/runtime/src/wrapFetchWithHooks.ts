import { getInstrumented } from '@envelop/instrumentation';
import type {
  MeshFetch,
  OnFetchHook,
  OnFetchHookDone,
} from '@graphql-mesh/types';
import { type ExecutionRequest, type MaybePromise } from '@graphql-tools/utils';
import { handleMaybePromise, iterateAsync } from '@whatwg-node/promise-helpers';

export type FetchInstrumentation = {
  fetch?: (
    payload: { executionRequest?: ExecutionRequest },
    wrapped: () => MaybePromise<void>,
  ) => MaybePromise<void>;
};

export function wrapFetchWithHooks<TContext>(
  onFetchHooks: OnFetchHook<TContext>[],
  instrumentation?: () => FetchInstrumentation | undefined,
): MeshFetch {
  let wrappedFetchFn = function wrappedFetchFn(url, options, context, info) {
    let fetchFn: MeshFetch;
    let response$: MaybePromise<Response>;
    const onFetchDoneHooks: OnFetchHookDone[] = [];
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
              // @ts-expect-error TODO: why?
              info,
              get executionRequest() {
                return info?.executionRequest;
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
