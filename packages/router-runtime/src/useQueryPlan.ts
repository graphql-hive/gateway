import type { GatewayPlugin } from '@graphql-hive/gateway-runtime';
import type { QueryPlan } from '@graphql-hive/router-query-planner';
import { isAsyncIterable } from '@graphql-tools/utils';
import { queryPlanForExecutionRequestContext } from './utils';

export interface QueryPlanOptions {
  /** Callback when the query plan has been successfuly generated. */
  onQueryPlan?(queryPlan: QueryPlan): void;
  /** Exposing the query plan inside the GraphQL result extensions. */
  expose?: boolean | ((request: Request) => boolean);
}

export function useQueryPlan(opts: QueryPlanOptions = {}): GatewayPlugin {
  const { expose, onQueryPlan } = opts;
  return {
    onExecute({ context, args }) {
      return {
        onExecuteDone({ result, setResult }) {
          const queryPlan = queryPlanForExecutionRequestContext.get(
            // getter like setter
            context || args.document,
          );
          onQueryPlan?.(queryPlan!);
          const shouldExpose =
            typeof expose === 'function' ? expose(context.request) : expose;
          if (shouldExpose && !isAsyncIterable(result)) {
            setResult({
              ...result,
              extensions: {
                ...result.extensions,
                queryPlan,
              },
            });
          }
        },
      };
    },
  };
}
