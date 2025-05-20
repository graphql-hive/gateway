export const UNPATHED_ERRORS_SYMBOL = Symbol.for('subschemaErrors');
export const OBJECT_SUBSCHEMA_SYMBOL = Symbol.for('initialSubschema');
export const FIELD_SUBSCHEMA_MAP_SYMBOL = Symbol.for('subschemaMap');
/**
 * A symbol in the {@link DelegationContext.context delegation request execution contexts} to the number of times the next result was emitted.
 *
 * Counts how many times the next result was emitted from a {@link delegateRequest delegated request} iterable result.
 * this is useful for breaking the dataloader cache in streaming operations, likes subscriptions or queries with
 * `@defer` or `@stream` directives.
 *
 * @see /packages/batch-delegate/src/getLoader.ts#getLoader
 */
export const DELEGATED_RESPONSE_ITERABLE_NEXT_COUNTER = Symbol.for(
  'delegatedResponseIterableNextCounter',
);
