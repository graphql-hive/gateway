import { createGraphQLError, isAsyncIterable, Repeater } from 'graphql-yoga';
import type { GatewayPlugin } from '../types';

export function useCompleteSubscriptionsOnSchemaChange(): GatewayPlugin {
  const activeSubs = new Set<() => void>();
  return {
    onSchemaChange() {
      for (const activeSub of activeSubs) {
        activeSub();
      }
    },
    onSubscribe() {
      return {
        onSubscribeResult({ result, setResult }) {
          if (isAsyncIterable(result)) {
            setResult(
              Repeater.race([
                result,
                new Repeater<never>((_push, stop) => {
                  function complete() {
                    stop(
                      createGraphQLError(
                        'subscription has been closed due to a schema reload',
                        {
                          extensions: {
                            code: 'SUBSCRIPTION_SCHEMA_RELOAD',
                          },
                        },
                      ),
                    );
                  }
                  activeSubs.add(complete);

                  stop.then(() => {
                    result.return?.();
                    activeSubs.delete(complete);
                  });
                }),
              ]),
            );
          }
        },
      };
    },
  };
}
