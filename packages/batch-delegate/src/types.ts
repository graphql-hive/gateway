import { IDelegateToSchemaOptions } from '@graphql-tools/delegate';
import DataLoader from 'dataloader';

export type BatchDelegateFn<TContext = Record<string, any>, K = any> = (
  batchDelegateOptions: BatchDelegateOptions<TContext, K>,
) => any;

export type BatchDelegateOptionsFn<TContext = Record<string, any>, K = any> = (
  batchDelegateOptions: BatchDelegateOptions<TContext, K>,
  keys: ReadonlyArray<K>,
) => IDelegateToSchemaOptions<TContext>;

export interface BatchDelegateOptions<
  TContext = Record<string, any>,
  K = any,
  V = any,
  C = K,
> extends Omit<IDelegateToSchemaOptions<TContext>, 'args'> {
  dataLoaderOptions?: DataLoader.Options<K, V, C>;
  key: K;
  argsFromKeys?: (keys: ReadonlyArray<K>) => Record<string, any>;
  valuesFromResults?: (results: any, keys: ReadonlyArray<K>) => Array<V>;
  lazyOptionsFn?: BatchDelegateOptionsFn<TContext, K>;
}

export interface CreateBatchDelegateFnOptions<
  TContext = Record<string, any>,
  K = any,
  V = any,
  C = K,
> extends Partial<Omit<IDelegateToSchemaOptions<TContext>, 'args' | 'info'>> {
  dataLoaderOptions?: DataLoader.Options<K, V, C>;
  argsFromKeys?: (keys: ReadonlyArray<K>) => Record<string, any>;
  valuesFromResults?: (results: any, keys: ReadonlyArray<K>) => Array<V>;
  lazyOptionsFn?: BatchDelegateOptionsFn<TContext, K>;
}
