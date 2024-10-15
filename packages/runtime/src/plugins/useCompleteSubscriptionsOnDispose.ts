import { createGraphQLError, isAsyncIterable, Repeater } from 'graphql-yoga';
import type { GatewayPlugin } from '../types';

export function useCompleteSubscriptionsOnDispose(
  disposableStack: AsyncDisposableStack,
): GatewayPlugin {
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
  return {
    onSubscribe() {
      return {
        onSubscribeResult({ result, setResult }) {
          if (isAsyncIterable(result)) {
            // If shutdown has already been initiated, return an error immediately
            if (disposableStack.disposed) {
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
                  stop.then(() => result.return?.());
                  // If shutdown has already been initiated, complete the subscription immediately
                  if (disposableStack.disposed) {
                    stop(createShutdownError());
                  } else {
                    // If shutdown is initiated after this point, attach it to the disposable stack
                    disposableStack.defer(() => {
                      stop(createShutdownError());
                    });
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
