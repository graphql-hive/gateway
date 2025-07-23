import { process } from '@graphql-mesh/cross-helpers';
import {
  getInterpolatedHeadersFactory,
  getInterpolatedStringFactory,
} from '@graphql-mesh/string-interpolation';
import {
  type Transport,
  type TransportEntry,
} from '@graphql-mesh/transport-common';
import {
  dispose,
  isDisposable,
  makeAsyncDisposable,
} from '@graphql-mesh/utils';
import {
  buildHTTPExecutor,
  type HTTPExecutorOptions,
} from '@graphql-tools/executor-http';
import { type ExecutionRequest, type Executor } from '@graphql-tools/utils';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';

export type HTTPTransportOptions<
  TSubscriptionTransportOptions extends Record<string, any> = Record<
    string,
    any
  >,
> = Pick<
  HTTPExecutorOptions,
  'useGETForQueries' | 'method' | 'timeout' | 'credentials' | 'retry' | 'apq'
> & {
  subscriptions?: TransportEntry<TSubscriptionTransportOptions>;
};

export default {
  getSubgraphExecutor(payload) {
    let headersInConfig: Record<string, string> | undefined;

    if (typeof payload.transportEntry.headers === 'string') {
      headersInConfig = JSON.parse(payload.transportEntry.headers);
    }
    if (Array.isArray(payload.transportEntry.headers)) {
      headersInConfig = Object.fromEntries(payload.transportEntry.headers);
    }

    const headersFactory = headersInConfig
      ? getInterpolatedHeadersFactory(headersInConfig)
      : undefined;

    const endpointFactory = payload.transportEntry.location
      ? getInterpolatedStringFactory(payload.transportEntry.location)
      : undefined;

    const httpExecutor = buildHTTPExecutor({
      endpoint: endpointFactory
        ? (execReq) =>
            endpointFactory({
              env: process.env as Record<string, string>,
              root: execReq?.rootValue,
              context: execReq?.context,
              info: execReq?.info,
            })
        : payload.transportEntry.location,
      headers: headersFactory
        ? (execReq) =>
            headersFactory({
              env: process.env as Record<string, string>,
              root: execReq?.rootValue,
              context: execReq?.context,
              info: execReq?.info,
            })
        : undefined,
      ...payload.transportEntry.options,
      getDisposeReason: payload.getDisposeReason,
      // @ts-expect-error - TODO: Fix this in executor-http
      fetch: payload.fetch,
    });

    if (
      payload.transportEntry.options &&
      'subscriptions' in payload.transportEntry.options &&
      payload.transportEntry.options.subscriptions != null
    ) {
      let subscriptionsExecutor: Executor = function (execReq) {
        const subscriptionsKind =
          payload.transportEntry.options?.subscriptions?.kind ||
          payload.transportEntry.kind;
        const subscriptionsLocation = payload.transportEntry.options
          ?.subscriptions?.location
          ? new URL(
              payload.transportEntry.options.subscriptions.location,
              payload.transportEntry.location,
            ).toString()
          : payload.transportEntry.location;
        return handleMaybePromise(
          () =>
            payload.getTransportExecutor({
              ...payload.transportEntry,
              kind: subscriptionsKind,
              headers:
                // WebSocket transport should not have any headers by default,
                // `connectionParams` should be preferred.
                subscriptionsKind === 'ws'
                  ? payload.transportEntry.options?.subscriptions?.headers
                  : (payload.transportEntry.options?.subscriptions?.headers ??
                    payload.transportEntry.headers),
              location: subscriptionsLocation,
              options: {
                ...payload.transportEntry.options,
                ...payload.transportEntry.options?.subscriptions?.options,
              },
            }),
          (resolvedSubscriptionsExecutor) => {
            subscriptionsExecutor = resolvedSubscriptionsExecutor;
            return subscriptionsExecutor(execReq);
          },
        );
      };
      return makeAsyncDisposable(
        function hybridExecutor(executionRequest: ExecutionRequest) {
          if (
            subscriptionsExecutor &&
            executionRequest.operationType === 'subscription'
          ) {
            return subscriptionsExecutor(executionRequest);
          }
          return httpExecutor(executionRequest);
        },
        () =>
          Promise.all([
            dispose(httpExecutor),
            isDisposable(subscriptionsExecutor) &&
              dispose(subscriptionsExecutor),
          ]).then(() => {}),
      );
    }

    return httpExecutor;
  },
} satisfies Transport<HTTPTransportOptions>;
