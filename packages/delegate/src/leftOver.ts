import { FieldNode } from 'graphql';
import { Subschema } from './Subschema.js';
import { DelegationPlanBuilder, ExternalObject } from './types.js';

export type Deferred<T = unknown> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
};

/** @deprecated Use `Promise.withResolvers()` (Node 22+). */
export function createDeferred<T = unknown>(): Deferred<T> {
  return Promise.withResolvers<T>();
}

export interface DelegationPlanLeftOver {
  unproxiableFieldNodes: Array<FieldNode>;
  nonProxiableSubschemas: Array<Subschema>;
  missingFieldsParentMap: Map<ExternalObject, Array<FieldNode>>;
  missingFieldsParentDeferredMap: Map<ExternalObject, Map<string, Deferred>>;
}
export const leftOverByDelegationPlan = new WeakMap<
  ReturnType<DelegationPlanBuilder>,
  DelegationPlanLeftOver
>();
export const PLAN_LEFT_OVER: symbol = Symbol('PLAN_LEFT_OVER');
export function getPlanLeftOverFromParent(
  parent: any,
): DelegationPlanLeftOver | undefined {
  if (parent != null && typeof parent === 'object') {
    return parent[PLAN_LEFT_OVER];
  }
  return undefined;
}
