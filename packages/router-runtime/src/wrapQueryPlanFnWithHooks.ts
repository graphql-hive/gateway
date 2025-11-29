import { QueryPlan } from '@graphql-hive/router-query-planner';
import { ExecutionRequest } from '@graphql-tools/utils';
import { handleMaybePromise, iterateAsync } from '@whatwg-node/promise-helpers';
import { MaybePromise } from 'bun';
import { OnQueryPlanDoneHook, OnQueryPlanHook, QueryPlanFn } from './types';

export function wrapQueryPlanFnWithHooks<TContext>(
  defaultQueryPlanFn: QueryPlanFn,
  onQueryPlanHooks: OnQueryPlanHook<TContext>[],
): QueryPlanFn {
  return function wrappedQueryPlanFn(
    executionRequest: ExecutionRequest,
  ): MaybePromise<QueryPlan> {
    let queryPlanFn: QueryPlanFn = defaultQueryPlanFn;
    let queryPlan$: MaybePromise<QueryPlan>;
    const onQueryPlanDoneHooks: OnQueryPlanDoneHook[] = [];
    return handleMaybePromise(
      () =>
        iterateAsync(
          onQueryPlanHooks,
          (onQueryPlanHook, endEarly) =>
            onQueryPlanHook({
              queryPlanFn,
              setQueryPlanFn(newQueryPlanFn) {
                queryPlanFn = newQueryPlanFn;
              },
              endQueryPlan(newQueryPlan) {
                queryPlan$ = newQueryPlan;
                endEarly();
              },
              executionRequest,
            }),
          onQueryPlanDoneHooks,
        ),
      () => {
        if (queryPlan$) {
          return queryPlan$;
        }
        return handleMaybePromise(
          () => queryPlanFn(executionRequest),
          (queryPlan) =>
            handleMaybePromise(
              () =>
                iterateAsync(onQueryPlanDoneHooks, (onQueryPlanDoneHook) =>
                  onQueryPlanDoneHook({
                    queryPlan,
                    setQueryPlan(newQueryPlan) {
                      queryPlan = newQueryPlan;
                    },
                  }),
                ),
              () => queryPlan,
            ),
        );
      },
    );
  };
}
