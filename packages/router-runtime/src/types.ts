import { QueryPlan } from '@graphql-hive/router-query-planner';
import { ExecutionRequest, MaybePromise } from '@graphql-tools/utils';

export type OnQueryPlanHook<TContext> = (
  payload: OnQueryPlanHookPayload<TContext>,
) => MaybePromise<OnQueryPlanDoneHook | void>;

export type QueryPlanFn = (
  executionRequest: ExecutionRequest,
) => MaybePromise<QueryPlan>;

export interface OnQueryPlanHookPayload<TContext> {
  queryPlanFn: QueryPlanFn;
  setQueryPlanFn(newQueryPlanFn: QueryPlanFn): void;
  endQueryPlan(queryPlan: MaybePromise<QueryPlan>): void;
  executionRequest: ExecutionRequest<any, TContext>;
}

export type OnQueryPlanDoneHook = (
  payload: OnQueryPlanDoneHookPayload,
) => MaybePromise<void>;

export interface OnQueryPlanDoneHookPayload {
  queryPlan: QueryPlan;
  setQueryPlan(queryPlan: QueryPlan): void;
}
