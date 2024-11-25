import { MaybePromise } from '@graphql-tools/utils';
import { DisposableSymbols } from '@whatwg-node/disposablestack';
import { createGraphQLError, isAsyncIterable, Repeater } from 'graphql-yoga';
import type { GatewayPlugin } from '../types';

export function useCompleteSubscriptionsOnDispose(): GatewayPlugin {
  function createShutdownError() {
    return createGraphQLError(
      'subscription has been closed because the server is shutting down',
      {
        extensions: {
          code: 'SHUTTING_DOWN',
        },
      },
    );
  }
  let disposed = false;
  const stopFns = new Set<() => MaybePromise<void>>();
  return {
    [DisposableSymbols.asyncDispose]() {
      disposed = true;
      if (stopFns.size) {
        return Promise.all([...stopFns].map((fn) => fn())).then(() => {});
      }
      return undefined;
    },
    onSubscribe() {
      return {
        onSubscribeResult({ result, setResult }) {
          if (isAsyncIterable(result)) {
            // If shutdown has already been initiated, return an error immediately
            if (disposed) {
              // Complete the subscription immediately
              result.return?.();
              setResult({
                errors: [createShutdownError()],
              });
            }
            setResult(
              Repeater.race([
                result,
                new Repeater<never>((_push, stop) => {
                  const stopFn = () => {
                    return stop(createShutdownError());
                  };
                  stop.then(() => {
                    stopFns.delete(stopFn);
                    return result.return?.();
                  });
                  // If shutdown has already been initiated, complete the subscription immediately
                  if (disposed) {
                    return stop(createShutdownError());
                  } else {
                    // If shutdown is initiated after this point, attach it to the disposable stack
                    stopFns.add(stopFn);
                  }
                }),
              ]),
            );
          }
        },
      };
    },
  };
}
