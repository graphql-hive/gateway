import { process } from '@graphql-mesh/cross-helpers';
import {
  getInterpolatedHeadersFactory,
  getInterpolatedStringFactory,
} from '@graphql-mesh/string-interpolation';
import {
  abortSignalAny,
  type DisposableExecutor,
  type Transport,
} from '@graphql-mesh/transport-common';
import { makeDisposable } from '@graphql-mesh/utils';
import { serializeExecutionRequest } from '@graphql-tools/executor-common';
import {
  createGraphQLError,
  type ExecutionRequest,
} from '@graphql-tools/utils';
import { Repeater, type Push } from '@repeaterjs/repeater';
import { crypto } from '@whatwg-node/fetch';
import { handleMaybePromise } from '@whatwg-node/promise-helpers';
import type { ExecutionResult, GraphQLError } from 'graphql';

export interface HTTPCallbackTransportOptions {
  /**
   * The gateway's public URL, which your subgraphs access, must include the path configured on the gateway.
   *
   * @default http://localhost:4000/callback
   */
  public_url?: string;
  /**
   * The path of the router's callback endpoint
   *
   * @default /callback
   */
  path?: string;
  /**
   * @default 5000
   */
  heartbeat_interval?: number;
}

type HTTPCallbackMessage =
  | {
      kind: 'subscription';
      action: 'check';
      id: string;
      verifier: string;
    }
  | {
      kind: 'subscription';
      action: 'next';
      id: string;
      verifier: string;
      payload: ExecutionResult;
    }
  | {
      kind: 'subscription';
      action: 'complete';
      id: string;
      verifier: string;
      errors?: GraphQLError[];
    };

function createTimeoutError() {
  return createGraphQLError('Subscription timed out', {
    extensions: {
      code: 'TIMEOUT_ERROR',
      http: {
        status: 504,
      },
    },
  });
}

export default {
  getSubgraphExecutor({
    transportEntry,
    fetch,
    pubsub,
    logger,
  }): DisposableExecutor {
    let headersInConfig: Record<string, string> | undefined;
    if (typeof transportEntry.headers === 'string') {
      headersInConfig = JSON.parse(transportEntry.headers);
    }
    if (Array.isArray(transportEntry.headers)) {
      headersInConfig = Object.fromEntries(transportEntry.headers);
    }

    const endpointFactory = transportEntry.location
      ? getInterpolatedStringFactory(transportEntry.location)
      : undefined;
    const headersFactory = getInterpolatedHeadersFactory(headersInConfig);

    const verifier = crypto.randomUUID();
    if (!pubsub) {
      throw new Error(`HTTP Callback Transport: You must provide a pubsub instance to http-callbacks transport!
    Example:
      import { PubSub } from '@graphql-hive/gateway'
      export const gatewayConfig = defineConfig({
        pubsub: new PubSub(),
      })
    See documentation: https://graphql-hive.com/docs/gateway/pubsub`);
    }
    const heartbeats = new Map<string, ReturnType<typeof setTimeout>>();
    const stopFnSet = new Set<VoidFunction>();
    const publicUrl =
      transportEntry.options?.public_url || 'http://localhost:4000';
    const callbackPath = transportEntry.options?.path || '/callback';
    const heartbeatIntervalMs =
      transportEntry.options?.heartbeat_interval || 50000;
    const httpCallbackExecutor = function httpCallbackExecutor(
      executionRequest: ExecutionRequest,
    ) {
      const subscriptionId = crypto.randomUUID();
      const subscriptionLogger = logger?.child({
        executor: 'http-callback',
        subscription: subscriptionId,
      });
      const callbackUrl = `${publicUrl}${callbackPath}/${subscriptionId}`;
      const subscriptionCallbackPath = `${callbackPath}/${subscriptionId}`;
      const serializedParams = serializeExecutionRequest({
        executionRequest,
      });
      const fetchBody = JSON.stringify({
        ...serializedParams,
        extensions: {
          ...(serializedParams || {}),
          subscription: {
            callbackUrl,
            subscriptionId,
            verifier,
            heartbeatIntervalMs,
          },
        },
      });
      let stopSubscription: (error?: Error) => void = (error) => {
        if (error) {
          throw error;
        }
      };
      heartbeats.set(
        subscriptionId,
        setTimeout(() => {
          stopSubscription(createTimeoutError());
        }, heartbeatIntervalMs),
      );
      subscriptionLogger?.debug(
        `Subscribing to ${transportEntry.location} with callbackUrl: ${callbackUrl}`,
      );
      let pushFn: Push<ExecutionResult> = () => {
        throw new Error(
          'HTTP Callback Transport: Subgraph does not look like configured correctly. Check your subgraph setup.',
        );
      };
      const reqAbortCtrl = new AbortController();
      if (!fetch) {
        throw new Error(
          'HTTP Callback Transport: `fetch` implementation is missing!',
        );
      }
      if (!transportEntry.location) {
        throw new Error(
          `HTTP Callback Transport: \`location\` is missing in the transport entry!`,
        );
      }
      let signal = executionRequest.signal || executionRequest.info?.signal;
      if (signal) {
        signal = abortSignalAny([reqAbortCtrl.signal, signal]);
      }
      const subFetchCall$ = handleMaybePromise(
        () => {
          const factoryContext = {
            env: process.env as Record<string, string>,
            root: executionRequest.rootValue,
            context: executionRequest.context,
            info: executionRequest.info,
          };

          return fetch(
            endpointFactory
              ? endpointFactory(factoryContext)
              : transportEntry.location!,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...headersFactory(factoryContext),
                Accept: 'application/json;callbackSpec=1.0; charset=utf-8',
              },
              body: fetchBody,
              signal,
            },
            executionRequest.context,
            executionRequest.info,
          );
        },
        (res) =>
          handleMaybePromise(
            () => res.text(),
            (resText) => {
              let resJson: ExecutionResult;
              try {
                resJson = JSON.parse(resText);
              } catch (e) {
                if (!res.ok) {
                  stopSubscription(
                    new Error(
                      `Subscription request failed with an HTTP Error: ${res.status} ${resText}`,
                    ),
                  );
                } else {
                  stopSubscription(e as Error);
                }
                return;
              }
              logger?.debug(`Subscription request received`, resJson);
              if (resJson.errors) {
                if (resJson.errors.length === 1 && resJson.errors[0]) {
                  const error = resJson.errors[0];
                  stopSubscription(createGraphQLError(error.message, error));
                } else {
                  stopSubscription(
                    new AggregateError(
                      resJson.errors.map((err) =>
                        createGraphQLError(err.message, err),
                      ),
                      resJson.errors.map((err) => err.message).join('\n'),
                    ),
                  );
                }
              } else if (resJson.data != null) {
                pushFn(resJson.data);
                stopSubscription();
              }
            },
          ),
        (e) => {
          logger?.debug(`Subscription request failed`, e);
          stopSubscription(e);
        },
      );
      executionRequest.context?.waitUntil?.(subFetchCall$);
      return new Repeater<ExecutionResult>((push, stop) => {
        if (signal) {
          if (signal.aborted) {
            stop(signal?.reason);
            return;
          }
          signal.addEventListener(
            'abort',
            () => {
              stop(signal?.reason);
            },
            { once: true },
          );
        }
        pushFn = push;
        stopSubscription = stop;
        stopFnSet.add(stop);
        logger?.debug(`Listening to ${subscriptionCallbackPath}`);
        const subId = pubsub.subscribe(
          `webhook:post:${subscriptionCallbackPath}`,
          (message: HTTPCallbackMessage) => {
            logger?.debug(
              `Received message from ${subscriptionCallbackPath}`,
              message,
            );
            if (message.verifier !== verifier) {
              return;
            }
            const existingHeartbeat = heartbeats.get(subscriptionId);
            if (existingHeartbeat) {
              clearTimeout(existingHeartbeat);
            }
            heartbeats.set(
              subscriptionId,
              setTimeout(() => {
                stopSubscription(createTimeoutError());
              }, heartbeatIntervalMs),
            );
            switch (message.action) {
              case 'check':
                break;
              case 'next':
                push(message.payload);
                break;
              case 'complete':
                if (message.errors) {
                  if (message.errors.length === 1) {
                    stopSubscription(message.errors[0]);
                  } else {
                    stopSubscription(new AggregateError(message.errors));
                  }
                } else {
                  stopSubscription();
                }
                break;
            }
          },
        );
        stop.finally(() => {
          pubsub.unsubscribe(subId);
          clearTimeout(heartbeats.get(subscriptionId));
          heartbeats.delete(subscriptionId);
          stopFnSet.delete(stop);
          if (!reqAbortCtrl.signal.aborted) {
            reqAbortCtrl.abort();
          }
        });
      });
    };
    function disposeFn() {
      for (const stop of stopFnSet) {
        stop();
      }
      for (const interval of heartbeats.values()) {
        clearTimeout(interval);
      }
    }
    return makeDisposable(httpCallbackExecutor, disposeFn);
  },
} satisfies Transport<HTTPCallbackTransportOptions>;
