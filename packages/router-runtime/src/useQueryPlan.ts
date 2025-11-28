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
    onExecutionResult({ request, context, result, setResult }) {
      if (!result) return;
      const queryPlan = queryPlanForExecutionRequestContext.get(context);
      onQueryPlan?.(queryPlan!);
      const shouldExpose =
        typeof expose === 'function' ? expose(request) : expose;
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
}
