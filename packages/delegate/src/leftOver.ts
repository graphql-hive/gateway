import { createDeferred, PromiseWithResolvers } from '@graphql-tools/utils';
import { FieldNode } from 'graphql';
import { Subschema } from './Subschema.js';
import { DelegationPlanBuilder, ExternalObject } from './types.js';

export type Deferred<T = unknown> = PromiseWithResolvers<T>;

// TODO: Remove this after Node 22
export { createDeferred };

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
export const PLAN_LEFT_OVER = Symbol('PLAN_LEFT_OVER');
export function getPlanLeftOverFromParent(
  parent: any,
): DelegationPlanLeftOver | undefined {
  if (parent != null && typeof parent === 'object') {
    return parent[PLAN_LEFT_OVER];
  }
  return undefined;
}
