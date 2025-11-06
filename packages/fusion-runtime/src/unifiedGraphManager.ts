import type { Logger } from '@graphql-hive/logger';
import { unifiedGraphHandler as routerUnifiedGraphHandler } from '@graphql-hive/router-runtime';
import {
  defaultPrintFn,
  type TransportContext,
  type TransportEntry,
} from '@graphql-mesh/transport-common';
import type { OnDelegateHook } from '@graphql-mesh/types';
import { dispose, isDisposable } from '@graphql-mesh/utils';
import { CRITICAL_ERROR } from '@graphql-tools/executor';
import type {
  ExecutionRequest,
  Executor,
  IResolvers,
  TypeSource,
} from '@graphql-tools/utils';
import {
  createGraphQLError,
  isDocumentNode,
  printSchemaWithDirectives,
} from '@graphql-tools/utils';
import {
  AsyncDisposableStack,
  DisposableSymbols,
} from '@whatwg-node/disposablestack';
import {
  handleMaybePromise,
  isPromise,
  MaybePromise,
} from '@whatwg-node/promise-helpers';
import { usingHiveRouterRuntime } from '~internal/env';
import type { DocumentNode, GraphQLError, GraphQLSchema } from 'graphql';
import { buildASTSchema, buildSchema, isSchema } from 'graphql';
import { handleFederationSupergraph as stitchingUnifiedGraphHandler } from './federation/supergraph';
import {
  compareSchemas,
  getOnSubgraphExecute,
  getTransportEntryMapUsingFusionAndFederationDirectives,
  millisecondsToStr,
  OnDelegationPlanHook,
  OnDelegationStageExecuteHook,
  type OnSubgraphExecuteHook,
  type Transports,
} from './utils';

export type TransportEntryAdditions = {
  [subgraph: '*' | string]: Partial<TransportEntry>;
};

export function ensureSchema(source: GraphQLSchema | DocumentNode | string) {
  if (isSchema(source)) {
    return source;
  }
  if (typeof source === 'string') {
    return buildSchema(source, { assumeValid: true, assumeValidSDL: true });
  }
  if (isDocumentNode(source)) {
    return buildASTSchema(source, { assumeValid: true, assumeValidSDL: true });
  }
  return source;
}
/**
 * Configure the batch delegation options for all merged types in all subschemas.
 */
export interface BatchDelegateOptions {
  /**
   * Limits the number of items that get requested when performing batch delegation.
   * @default Infinity
   */
  maxBatchSize?: number;
}

export type UnifiedGraphHandler = (
  opts: UnifiedGraphHandlerOpts,
) => UnifiedGraphHandlerResult;

export interface UnifiedGraphHandlerOpts {
  unifiedGraph: GraphQLSchema;
  getUnifiedGraphSDL(): string;
  additionalTypeDefs?: TypeSource;
  additionalResolvers?: IResolvers<unknown, any> | IResolvers<unknown, any>[];
  onSubgraphExecute: ReturnType<typeof getOnSubgraphExecute>;
  handleProgressiveOverride?(label: string, context: any): boolean;
  onDelegationPlanHooks?: OnDelegationPlanHook<any>[];
  onDelegationStageExecuteHooks?: OnDelegationStageExecuteHook<any>[];
  onDelegateHooks?: OnDelegateHook<unknown>[];
  /**
   * Configure the batch delegation options for all merged types in all subschemas.
   */
  batchDelegateOptions?: BatchDelegateOptions;

  log?: Logger;
}

export interface UnifiedGraphHandlerResult {
  unifiedGraph: GraphQLSchema;
  executor?: Executor;
  getSubgraphSchema(subgraphName: string): GraphQLSchema;
  inContextSDK?: any;
}

export interface UnifiedGraphManagerOptions<TContext> {
  getUnifiedGraph(
    ctx: TransportContext | undefined,
  ): MaybePromise<GraphQLSchema | string | DocumentNode>;
  // Handle the unified graph by any specification
  handleUnifiedGraph?: UnifiedGraphHandler;
  transports?: Transports;
  transportEntryAdditions?: TransportEntryAdditions;
  /** Schema polling interval in milliseconds. */
  pollingInterval?: number;
  additionalTypeDefs?: TypeSource;
  additionalResolvers?:
    | IResolvers<unknown, TContext>
    | IResolvers<unknown, TContext>[];
  transportContext?: TransportContext;
  onSubgraphExecuteHooks?: OnSubgraphExecuteHook<TContext>[];
  // TODO: Will be removed later once we get rid of v0
  onDelegateHooks?: OnDelegateHook<unknown>[];
  onDelegationPlanHooks?: OnDelegationPlanHook<TContext>[];
  onDelegationStageExecuteHooks?: OnDelegationStageExecuteHook<TContext>[];
  /**
   * Whether to batch the subgraph executions.
   * @default true
   */
  batch?: boolean;
  /**
   * Configure the batch delegation options for all merged types in all subschemas.
   */
  batchDelegateOptions?: BatchDelegateOptions;

  instrumentation?: () => Instrumentation | undefined;
  onUnifiedGraphChange?(newUnifiedGraph: GraphQLSchema): void;

  handleProgressiveOverride?(
    label: string,
    context: any,
  ): MaybePromise<boolean>;
}

export type Instrumentation = {
  /**
   * Wrap each subgraph execution request. This can happen multiple time for the same graphql operation.
   */
  subgraphExecute?: (
    payload: { executionRequest: ExecutionRequest; subgraphName: string },
    wrapped: () => MaybePromise<void>,
  ) => MaybePromise<void>;
  /**
   * Wrap each supergraph schema loading.
   *
   * Note: this span is only available when an Async compatible context manager is available
   */
  schema?: (
    payload: null,
    wrapped: () => MaybePromise<void>,
  ) => MaybePromise<void>;
};

const UNIFIEDGRAPH_CACHE_KEY = 'hive-gateway:supergraph';

export class UnifiedGraphManager<TContext> implements AsyncDisposable {
  private batch: boolean;
  private handleUnifiedGraph: UnifiedGraphHandler;
  private unifiedGraph?: GraphQLSchema;
  private lastLoadedUnifiedGraph?: string | GraphQLSchema | DocumentNode;
  private onSubgraphExecuteHooks: OnSubgraphExecuteHook<TContext>[];
  private onDelegationPlanHooks: OnDelegationPlanHook<TContext>[];
  private onDelegationStageExecuteHooks: OnDelegationStageExecuteHook<TContext>[];
  private inContextSDK: any;
  private initialUnifiedGraph$?: MaybePromise<GraphQLSchema>;
  private polling$?: MaybePromise<void>;
  private _transportEntryMap?: Record<string, TransportEntry>;
  private _transportExecutorStack?: AsyncDisposableStack;
  private lastLoadTime?: number;
  private executor?: Executor;
  private instrumentation: () => Instrumentation | undefined;
  private overrideLabelsByContext: WeakMap<any, Set<string>> = new WeakMap();

  constructor(private opts: UnifiedGraphManagerOptions<TContext>) {
    this.batch = opts.batch ?? true;
    this.handleUnifiedGraph =
      opts.handleUnifiedGraph ||
      (usingHiveRouterRuntime()
        ? routerUnifiedGraphHandler
        : stitchingUnifiedGraphHandler);
    this.instrumentation = opts.instrumentation ?? (() => undefined);
    this.onSubgraphExecuteHooks = opts?.onSubgraphExecuteHooks || [];
    this.onDelegationPlanHooks = opts?.onDelegationPlanHooks || [];
    this.onDelegationStageExecuteHooks =
      opts?.onDelegationStageExecuteHooks || [];
    if (opts.pollingInterval != null) {
      opts.transportContext?.log.debug(
        `Starting polling to Supergraph with interval ${millisecondsToStr(opts.pollingInterval)}`,
      );
    }
  }

  private ensureUnifiedGraph(): MaybePromise<GraphQLSchema> {
    if (
      this.polling$ == null &&
      this.opts?.pollingInterval != null &&
      this.lastLoadTime != null &&
      Date.now() - this.lastLoadTime >= this.opts.pollingInterval
    ) {
      this.opts?.transportContext?.log.debug(`Polling Supergraph`);
      this.polling$ = handleMaybePromise(
        () => this.getAndSetUnifiedGraph(),
        () => {
          this.polling$ = undefined;
        },
        (err) => {
          this.opts.transportContext?.log.error(
            err,
            'Failed to poll Supergraph',
          );
          this.polling$ = undefined;
        },
      );
    }
    if (!this.unifiedGraph) {
      if (!this.initialUnifiedGraph$) {
        this.opts?.transportContext?.log.debug(
          'Fetching the initial Supergraph',
        );
        if (this.opts.transportContext?.cache) {
          this.opts.transportContext?.log.debug(
            { key: UNIFIEDGRAPH_CACHE_KEY },
            'Searching for Supergraph in cache...',
          );
          this.initialUnifiedGraph$ = handleMaybePromise(
            () =>
              this.opts.transportContext?.cache?.get(UNIFIEDGRAPH_CACHE_KEY),
            (cachedUnifiedGraph) => {
              if (cachedUnifiedGraph) {
                this.opts.transportContext?.log.debug(
                  { key: UNIFIEDGRAPH_CACHE_KEY },
                  'Found Supergraph in cache',
                );
                return this.handleLoadedUnifiedGraph(cachedUnifiedGraph, true);
              }
              return this.getAndSetUnifiedGraph();
            },
            () => {
              return this.getAndSetUnifiedGraph();
            },
          );
        } else {
          this.initialUnifiedGraph$ = this.getAndSetUnifiedGraph();
        }
        this.initialUnifiedGraph$ = handleMaybePromise(
          () => this.initialUnifiedGraph$!,
          (v) => {
            this.initialUnifiedGraph$ = undefined;
            this.opts.transportContext?.log.debug(
              { key: UNIFIEDGRAPH_CACHE_KEY },
              'Initial Supergraph fetched',
            );
            return v;
          },
        );
      }
      return this.initialUnifiedGraph$ || this.unifiedGraph;
    }
    return this.unifiedGraph;
  }

  private disposeReason: GraphQLError | undefined;

  private handleLoadedUnifiedGraph(
    loadedUnifiedGraph: string | GraphQLSchema | DocumentNode,
    doNotCache?: boolean,
  ): MaybePromise<GraphQLSchema> {
    if (loadedUnifiedGraph != null) {
      if (
        this.lastLoadedUnifiedGraph != null &&
        compareSchemas(loadedUnifiedGraph, this.lastLoadedUnifiedGraph)
      ) {
        this.opts.transportContext?.log.debug(
          'Supergraph has not been changed, skipping...',
        );
        this.lastLoadTime = Date.now();
        if (!this.unifiedGraph) {
          throw new Error(`This should not happen!`);
        }
        return this.unifiedGraph;
      }
      let serializedUnifiedGraph: string | undefined;
      if (!doNotCache && this.opts.transportContext?.cache) {
        serializedUnifiedGraph =
          serializeLoadedUnifiedGraph(loadedUnifiedGraph);
        if (serializedUnifiedGraph != null) {
          try {
            const ttl = this.opts.pollingInterval
              ? this.opts.pollingInterval * 0.001
              : // if no polling interval (cache TTL) is configured, default to
                // 60 seconds making sure the unifiedgraph is not kept forever
                // NOTE: we default to 60s because Cloudflare KV TTL does not accept anything less
                60;
            this.opts.transportContext?.log.debug(
              { ttl, key: UNIFIEDGRAPH_CACHE_KEY },
              'Caching Supergraph',
            );
            const logCacheSetError = (err: unknown) => {
              this.opts.transportContext?.log.debug(
                { err, ttl, key: UNIFIEDGRAPH_CACHE_KEY },
                'Unable to cache Supergraph',
              );
            };
            try {
              const cacheSet$ = this.opts.transportContext?.cache.set(
                UNIFIEDGRAPH_CACHE_KEY,
                serializedUnifiedGraph,
                { ttl },
              );
              if (isPromise(cacheSet$)) {
                cacheSet$.then(() => {}, logCacheSetError);
                this._transportExecutorStack?.defer(() => cacheSet$);
              }
            } catch (e) {
              logCacheSetError(e);
            }
          } catch (err: any) {
            this.opts.transportContext?.log.error(
              err,
              'Failed to initiate caching of Supergraph',
            );
          }
        }
      }
      const ensuredSchema = ensureSchema(loadedUnifiedGraph);
      const transportEntryMap =
        getTransportEntryMapUsingFusionAndFederationDirectives(
          ensuredSchema,
          this.opts.transportEntryAdditions,
        );

      const {
        unifiedGraph: newUnifiedGraph,
        inContextSDK,
        getSubgraphSchema,
        executor,
      } = this.handleUnifiedGraph({
        unifiedGraph: ensuredSchema,
        getUnifiedGraphSDL() {
          serializedUnifiedGraph ||=
            serializeLoadedUnifiedGraph(loadedUnifiedGraph);
          return serializedUnifiedGraph;
        },
        additionalTypeDefs: this.opts.additionalTypeDefs,
        additionalResolvers: this.opts.additionalResolvers,
        onSubgraphExecute(subgraphName, execReq) {
          return onSubgraphExecute(subgraphName, execReq);
        },
        onDelegationPlanHooks: this.onDelegationPlanHooks,
        onDelegationStageExecuteHooks: this.onDelegationStageExecuteHooks,
        onDelegateHooks: this.opts.onDelegateHooks,
        batchDelegateOptions: this.opts.batchDelegateOptions,
        log: this.opts.transportContext?.log,
        handleProgressiveOverride: this.opts.handleProgressiveOverride
          ? (label, context) => {
              const labels = this.overrideLabelsByContext.get(context);
              if (labels?.has(label)) {
                return true;
              }
              return false;
            }
          : undefined,
      });
      const transportExecutorStack = new AsyncDisposableStack();
      const onSubgraphExecute = getOnSubgraphExecute({
        onSubgraphExecuteHooks: this.onSubgraphExecuteHooks,
        transports: this.opts.transports,
        transportContext: this.opts.transportContext,
        transportEntryMap,
        getSubgraphSchema,
        transportExecutorStack,
        getDisposeReason: () => this.disposeReason,
        batch: this.batch,
        instrumentation: () => this.instrumentation(),
      });

      const previousTransportExecutorStack = this._transportExecutorStack;
      const previousExecutor = this.executor;
      const previousUnifiedGraph = this.lastLoadedUnifiedGraph;

      this.lastLoadedUnifiedGraph = loadedUnifiedGraph;
      this.unifiedGraph = newUnifiedGraph;
      this.executor = executor;
      this._transportExecutorStack = transportExecutorStack;
      this.inContextSDK = inContextSDK;
      this.lastLoadTime = Date.now();
      this._transportEntryMap = transportEntryMap;
      this.opts?.onUnifiedGraphChange?.(newUnifiedGraph);

      this.polling$ = undefined;
      if (previousUnifiedGraph != null) {
        this.disposeReason = createGraphQLError(
          'operation has been aborted due to a schema reload',
          {
            extensions: {
              code: 'SCHEMA_RELOAD',
              http: {
                status: 503,
              },
              [CRITICAL_ERROR]: true,
            },
          },
        );
        this.opts.transportContext?.log.debug(
          'Supergraph has been changed, updating...',
        );
      }
      return handleMaybePromise(
        () => disposeAll([previousTransportExecutorStack, previousExecutor]),
        () => {
          this.disposeReason = undefined;
          return this.unifiedGraph!;
        },
        (err) => {
          this.disposeReason = undefined;
          this.opts.transportContext?.log.error(
            err,
            'Failed to dispose the existing transports and executors',
          );
          return this.unifiedGraph!;
        },
      );
    } else if (!this.unifiedGraph) {
      throw new Error(
        `Failed to fetch the supergraph, check your supergraph configuration.`,
      );
    }
    this.disposeReason = undefined;
    this.polling$ = undefined;
    this.lastLoadTime = Date.now();
    return this.unifiedGraph;
  }

  private getAndSetUnifiedGraph(): MaybePromise<GraphQLSchema> {
    return handleMaybePromise(
      () => this.opts.getUnifiedGraph(this.opts.transportContext),
      (loadedUnifiedGraph: string | GraphQLSchema | DocumentNode) =>
        this.handleLoadedUnifiedGraph(loadedUnifiedGraph),
      (err) => {
        this.opts.transportContext?.log.error(err, 'Failed to load Supergraph');
        this.lastLoadTime = Date.now();
        this.disposeReason = undefined;
        this.polling$ = undefined;
        if (!this.unifiedGraph) {
          throw err;
        }
        return this.unifiedGraph;
      },
    );
  }

  public getUnifiedGraph(): MaybePromise<GraphQLSchema> {
    // TODO: error is not bubbled up here
    return handleMaybePromise(
      () => this.ensureUnifiedGraph(),
      () => {
        if (!this.unifiedGraph) {
          throw new Error(`This should not happen!`);
        }
        return this.unifiedGraph;
      },
    );
  }

  public getExecutor(): MaybePromise<Executor | undefined> {
    return handleMaybePromise(
      () => this.ensureUnifiedGraph(),
      () => this.executor,
    );
  }

  public getContext<T extends {} = {}>(base: T = {} as T) {
    return handleMaybePromise(
      () => this.ensureUnifiedGraph(),
      () => {
        if (this.inContextSDK) {
          Object.assign(base, this.inContextSDK);
        }
        // we want to set only missing keys from transport context to avoid overwriting existing context values.
        // like for example the `log` which already contains context-relevant metadata
        for (const [key, value] of Object.entries(
          this.opts.transportContext ?? {},
        )) {
          if (!(key in base)) {
            (base as any)[key] = value;
          }
        }
        const handleProgressiveOverride = this.opts.handleProgressiveOverride;
        if (handleProgressiveOverride) {
          const overrideLabels = this.unifiedGraph?.extensions?.[
            'overrideLabels'
          ] as Set<string> | undefined;
          if (overrideLabels) {
            const jobs$: MaybePromise<void>[] = [];
            for (const label of overrideLabels) {
              const result$ = handleProgressiveOverride(label, base);
              const handleResult = (shouldEnable: boolean) => {
                if (shouldEnable) {
                  let labels = this.overrideLabelsByContext.get(base);
                  if (!labels) {
                    labels = new Set<string>();
                    this.overrideLabelsByContext.set(base, labels);
                  }
                  labels.add(label);
                }
              };
              if (isPromise(result$)) {
                jobs$.push(result$.then(handleResult));
              } else {
                handleResult(result$);
              }
            }
            if (jobs$.length > 0) {
              return Promise.all(jobs$).then(() => base);
            }
          }
        }
        return base;
      },
    );
  }

  public getTransportEntryMap() {
    return handleMaybePromise(
      () => this.ensureUnifiedGraph(),
      () => {
        if (!this._transportEntryMap) {
          throw new Error(`This should not happen!`);
        }
        return this._transportEntryMap;
      },
    );
  }

  invalidateUnifiedGraph() {
    return this.getAndSetUnifiedGraph();
  }

  [DisposableSymbols.asyncDispose]() {
    this.disposeReason = createGraphQLError(
      'operation has been aborted because the server is shutting down',
      {
        extensions: {
          code: 'SHUTTING_DOWN',
          [CRITICAL_ERROR]: true,
        },
      },
    );
    return handleMaybePromise(
      () => disposeAll([this._transportExecutorStack, this.executor]),
      () => {
        this.unifiedGraph = undefined;
        this.initialUnifiedGraph$ = undefined;
        this.lastLoadedUnifiedGraph = undefined;
        this.inContextSDK = undefined;
        this.lastLoadTime = undefined;
        this.polling$ = undefined;
        this.executor = undefined;
        this._transportEntryMap = undefined;
        this._transportExecutorStack = undefined;
        this.executor = undefined;
      },
    ) as Promise<void>;
  }
}

function disposeAll(disposables: unknown[]) {
  const disposalJobs = disposables
    .map((disposable) =>
      isDisposable(disposable) ? dispose(disposable) : undefined,
    )
    .filter(isPromise);
  if (disposalJobs.length === 0) {
    return undefined;
  } else if (disposalJobs.length === 1) {
    return disposalJobs[0];
  }
  return Promise.all(disposalJobs).then(() => {});
}

function serializeLoadedUnifiedGraph(
  loadedUnifiedGraph: string | GraphQLSchema | DocumentNode,
): string {
  if (typeof loadedUnifiedGraph === 'string') {
    return loadedUnifiedGraph;
  }
  if (isSchema(loadedUnifiedGraph)) {
    return printSchemaWithDirectives(loadedUnifiedGraph);
  }
  return defaultPrintFn(loadedUnifiedGraph);
}
