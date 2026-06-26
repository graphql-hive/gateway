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
) => MaybePromise<UnifiedGraphHandlerResult>;

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
  overrideLabels?: Iterable<string>;
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

  /**
   * When greater than 0, enables "generation overlap" on schema reload: a
   * superseded generation (executor + transports) is kept alive so in-flight
   * single-result operations can finish, instead of being disposed (and
   * aborted) immediately. This is the maximum time, in milliseconds, a
   * superseded generation is kept alive before it is force-disposed.
   *
   * Defaults to disposing immediately (previous behavior).
   */
  schemaReloadDrainTimeout?: number;
  /**
   * Maximum number of schema generations kept alive simultaneously (current +
   * draining) when {@link schemaReloadDrainTimeout} is enabled. When exceeded,
   * the oldest draining generation is force-disposed.
   *
   * @default 10
   */
  maxConcurrentSchemaGenerations?: number;
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

/** Default cap on the number of schema generations kept alive simultaneously. */
const DEFAULT_MAX_CONCURRENT_GENERATIONS = 10;

function createSchemaReloadError(): GraphQLError {
  return createGraphQLError(
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
}

/**
 * A single "generation" of the unified graph: the executor and subgraph
 * transports built for one supergraph schema. When the schema reloads, a new
 * generation is created and becomes the one serving new requests; the previous
 * generation may be kept alive ("draining") so that operations already in flight
 * on it can finish before it is disposed. See {@link GracefulSchemaReloadConfig}.
 */
interface SchemaGeneration {
  /**
   * The executor for this generation, when the unified graph handler produces
   * one (e.g. the router runtime). The default stitching/federation handler
   * executes through the schema's resolvers and returns no executor, so this is
   * undefined there; it is kept only so it can be disposed alongside the
   * transports.
   */
  executor: Executor | undefined;
  /** The subgraph transports built for this generation. */
  transportExecutorStack: AsyncDisposableStack;
  /**
   * Number of in-flight operations pinned to this generation. Incremented once
   * per operation (in the gateway's onExecute) and held until that operation
   * fully completes — i.e. across all of its subgraph hops. A superseded
   * generation is disposed once this reaches zero.
   */
  inFlight: number;
  /** Whether a newer generation has replaced this one. */
  superseded: boolean;
  /** Whether this generation's resources have already been disposed. */
  disposed: boolean;
  /**
   * Abort reason (SCHEMA_RELOAD) attached as soon as this generation is
   * superseded. It is only *consulted* when the transports are actually
   * disposed (drain timeout, cap eviction, or shutdown), so operations that
   * finish while the generation drains are never affected by it.
   */
  disposeReason?: GraphQLError;
  /** Timer that force-disposes this generation once the drain timeout elapses. */
  forceDisposeTimer?: ReturnType<typeof setTimeout>;
}

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
  private overrideLabels: Iterable<string> | undefined;
  /** The generation currently serving new requests. */
  private currentGeneration?: SchemaGeneration;
  /** Superseded generations being kept alive until their in-flight work drains. */
  private drainingGenerations = new Set<SchemaGeneration>();
  /** Maps each built unified schema to its generation, so an operation can pin
   * the generation it executes against for its whole lifetime. */
  private generationBySchema = new WeakMap<GraphQLSchema, SchemaGeneration>();
  /** Latch so the "schema not tracked → graceful reload has no effect" warning
   * is emitted at most once instead of per request. */
  private warnedUntrackedSchema = false;

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

      let onSubgraphExecute: ReturnType<typeof getOnSubgraphExecute>;
      return handleMaybePromise(
        () =>
          this.handleUnifiedGraph({
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
          }),
        ({
          unifiedGraph: newUnifiedGraph,
          inContextSDK,
          getSubgraphSchema,
          executor,
          overrideLabels,
        }) => {
          this.overrideLabels = overrideLabels;
          const transportExecutorStack = new AsyncDisposableStack();
          const generation: SchemaGeneration = {
            executor,
            transportExecutorStack,
            inFlight: 0,
            superseded: false,
            disposed: false,
          };
          onSubgraphExecute = getOnSubgraphExecute({
            onSubgraphExecuteHooks: this.onSubgraphExecuteHooks,
            transports: this.opts.transports,
            transportContext: this.opts.transportContext,
            transportEntryMap,
            getSubgraphSchema,
            transportExecutorStack,
            // Each generation aborts its own in-flight requests with its own
            // reason; `this.disposeReason` carries the shutdown reason, which
            // applies to every generation.
            getDisposeReason: () =>
              generation.disposeReason ?? this.disposeReason,
            batch: this.batch,
            instrumentation: () => this.instrumentation(),
          });

          const previousGeneration = this.currentGeneration;
          const previousUnifiedGraph = this.lastLoadedUnifiedGraph;

          this.currentGeneration = generation;
          this.generationBySchema.set(newUnifiedGraph, generation);
          this.lastLoadedUnifiedGraph = loadedUnifiedGraph;
          this.unifiedGraph = newUnifiedGraph;
          this.executor = executor;
          this._transportExecutorStack = transportExecutorStack;
          this.inContextSDK = inContextSDK;
          this.lastLoadTime = Date.now();
          this._transportEntryMap = transportEntryMap;
          this.opts?.onUnifiedGraphChange?.(newUnifiedGraph);

          this.polling$ = undefined;
          if (previousGeneration && previousUnifiedGraph != null) {
            this.opts.transportContext?.log.debug(
              'Supergraph has been changed, updating...',
            );
            return handleMaybePromise(
              () => this.retirePreviousGeneration(previousGeneration),
              () => this.unifiedGraph!,
              (err) => {
                this.opts.transportContext?.log.error(
                  err,
                  'Failed to dispose the existing transports and executors',
                );
                return this.unifiedGraph!;
              },
            );
          }
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

  /**
   * Pin the generation serving `schema` for the lifetime of one operation, so it
   * is not disposed while the operation is still running across all of its
   * subgraph hops. Returns an idempotent release callback. If `schema` is not a
   * known live generation, retention is a no-op and disposal falls back to the
   * drain timeout.
   *
   * Long-lived streaming operations (subscriptions) are intentionally NOT pinned
   * by the caller — they end on reload (and reconnect) rather than overlapping.
   */
  public retainGenerationFor(schema: GraphQLSchema): () => void {
    const generation = this.generationBySchema.get(schema);
    if (!generation) {
      // The schema isn't one we built (e.g. a plugin returned a wrapped/rebuilt
      // schema object). Graceful reload then silently has no effect for this
      // traffic, so warn once — not per request — to make it visible.
      if (!this.warnedUntrackedSchema) {
        this.warnedUntrackedSchema = true;
        this.opts.transportContext?.log.warn(
          'Graceful reload: operations are executing against a schema that is not a tracked generation ' +
            '(a plugin likely returned a wrapped schema); operations will not be pinned across reloads',
        );
      }
      return () => {};
    }
    if (generation.disposed) {
      // The operation outlived its generation (already disposed). Benign — it
      // proceeds unpinned; not warned, as this is expected around reloads.
      return () => {};
    }
    generation.inFlight++;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.releaseGeneration(generation);
    };
  }

  private releaseGeneration(generation: SchemaGeneration): void {
    generation.inFlight--;
    if (
      generation.superseded &&
      generation.inFlight <= 0 &&
      !generation.disposed
    ) {
      // The superseded generation's last pinned operation has finished; dispose
      // it now. This also tears down any unpinned long-lived streams (e.g.
      // subscriptions) still running on it, aborting them with the SCHEMA_RELOAD
      // reason.
      void this.disposeGeneration(generation);
    }
  }

  /**
   * Retire a generation that has just been superseded by a reload. With graceful
   * reload disabled it is disposed immediately (aborting in-flight operations,
   * the previous behavior). Otherwise it is kept alive so in-flight operations
   * can finish, bounded by a hard-stop timer and a cap on live generations.
   */
  private retirePreviousGeneration(
    generation: SchemaGeneration,
  ): MaybePromise<void> {
    generation.superseded = true;
    // Whenever this generation is finally disposed, anything still running on it
    // (in-flight work past the drain timeout, or long-lived subscriptions which
    // are never overlapped) must be aborted with SCHEMA_RELOAD. The reason is
    // only consulted when the transports are actually disposed, so it does not
    // disturb operations that finish while the generation drains.
    generation.disposeReason = createSchemaReloadError();
    const drainTimeout = this.opts.schemaReloadDrainTimeout;
    if (!drainTimeout || drainTimeout <= 0) {
      return this.disposeGeneration(generation);
    }
    if (generation.inFlight <= 0) {
      return this.disposeGeneration(generation);
    }
    this.drainingGenerations.add(generation);
    const forceDisposeTimer = setTimeout(() => {
      void this.forceDisposeGeneration(generation);
    }, drainTimeout);
    (forceDisposeTimer as { unref?: () => void }).unref?.();
    generation.forceDisposeTimer = forceDisposeTimer;
    // Enforce the cap after registering this generation; if it is exceeded the
    // oldest draining generation is force-disposed immediately — the cap takes
    // precedence over its drain timer. Fall back to the default for any invalid
    // value (including NaN, which would make `size + 1 > cap` always false and
    // silently disable the cap).
    const configuredCap = this.opts.maxConcurrentSchemaGenerations;
    const maxGenerations =
      Number.isFinite(configuredCap) && (configuredCap as number) >= 1
        ? (configuredCap as number)
        : DEFAULT_MAX_CONCURRENT_GENERATIONS;
    this.enforceGenerationCap(maxGenerations);
    return undefined;
  }

  /**
   * Force-dispose the oldest draining generations until the number of live
   * generations (the current one plus draining ones) is within the cap.
   */
  private enforceGenerationCap(maxConcurrentGenerations: number): void {
    // Sets iterate in insertion order, so the first draining generation is the
    // oldest. With a cap of 1 the only draining entry is the one just retired,
    // so it is force-disposed here — i.e. overlap is effectively off. The guard
    // also handles a non-positive cap (drain everything).
    while (this.drainingGenerations.size + 1 > maxConcurrentGenerations) {
      const oldest = this.drainingGenerations.values().next().value;
      if (!oldest) {
        break;
      }
      void this.forceDisposeGeneration(oldest);
    }
  }

  private forceDisposeGeneration(
    generation: SchemaGeneration,
  ): MaybePromise<void> {
    if (generation.disposed) {
      return undefined;
    }
    // `disposeReason` (SCHEMA_RELOAD) was already set when the generation was
    // retired; disposing it now aborts whatever is still in flight on it.
    return this.disposeGeneration(generation);
  }

  private disposeGeneration(generation: SchemaGeneration): MaybePromise<void> {
    if (generation.disposed) {
      return undefined;
    }
    generation.disposed = true;
    if (generation.forceDisposeTimer) {
      clearTimeout(generation.forceDisposeTimer);
      generation.forceDisposeTimer = undefined;
    }
    this.drainingGenerations.delete(generation);
    // Most callers dispose fire-and-forget (`void this.disposeGeneration(...)`),
    // so swallow-and-log here rather than letting a transport that fails to
    // close escape as an unhandled rejection with no context.
    return handleMaybePromise(
      () =>
        disposeAll([generation.transportExecutorStack, generation.executor]),
      () => undefined,
      (err) => {
        this.opts.transportContext?.log.error(
          err,
          'Graceful reload: failed to dispose a superseded schema generation; its transports may be leaked',
        );
      },
    );
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
        if (handleProgressiveOverride && this.overrideLabels) {
          const jobs$: MaybePromise<void>[] = [];
          for (const label of this.overrideLabels) {
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
    // Dispose every live generation — the current one and any still draining —
    // so no transports or in-flight executors are leaked on shutdown.
    const generations: SchemaGeneration[] = [];
    if (this.currentGeneration) {
      generations.push(this.currentGeneration);
    }
    for (const generation of this.drainingGenerations) {
      generations.push(generation);
    }
    const disposables: unknown[] = [];
    for (const generation of generations) {
      if (generation.forceDisposeTimer) {
        clearTimeout(generation.forceDisposeTimer);
        generation.forceDisposeTimer = undefined;
      }
      generation.disposed = true;
      // Clear any per-generation SCHEMA_RELOAD reason so in-flight work on a
      // draining generation aborts with SHUTTING_DOWN (via the `?? this.disposeReason`
      // fallback) rather than SCHEMA_RELOAD — otherwise clients might retry into
      // a shutting-down gateway instead of failing over.
      generation.disposeReason = undefined;
      disposables.push(generation.transportExecutorStack, generation.executor);
    }
    this.drainingGenerations.clear();
    return handleMaybePromise(
      () => disposeAll(disposables),
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
        this.currentGeneration = undefined;
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
