import { getInContextSDK } from '@graphql-mesh/runtime';
import type {
  TransportContext,
  TransportEntry,
} from '@graphql-mesh/transport-common';
import type { Logger, OnDelegateHook } from '@graphql-mesh/types';
import { requestIdByRequest } from '@graphql-mesh/utils';
import type {
  DelegationPlanBuilder,
  StitchingInfo,
  SubschemaConfig,
} from '@graphql-tools/delegate';
import type {
  IResolvers,
  MaybePromise,
  TypeSource,
} from '@graphql-tools/utils';
import { isDocumentNode, mapMaybePromise } from '@graphql-tools/utils';
import {
  AsyncDisposableStack,
  DisposableSymbols,
} from '@whatwg-node/disposablestack';
import type { DocumentNode, GraphQLSchema } from 'graphql';
import { buildASTSchema, buildSchema, isSchema } from 'graphql';
import { handleFederationSupergraph } from './federation/supergraph';
import {
  compareSchemas,
  compareSubgraphNames,
  getOnSubgraphExecute,
  OnDelegationPlanDoneHook,
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

export type UnifiedGraphHandler = (
  opts: UnifiedGraphHandlerOpts,
) => UnifiedGraphHandlerResult;

export interface UnifiedGraphHandlerOpts {
  unifiedGraph: GraphQLSchema;
  additionalTypeDefs?: TypeSource;
  additionalResolvers?: IResolvers<unknown, any> | IResolvers<unknown, any>[];
  onSubgraphExecute: ReturnType<typeof getOnSubgraphExecute>;
  onDelegationStageExecuteHooks?: OnDelegationStageExecuteHook<any>[];
  transportEntryAdditions?: TransportEntryAdditions;
  /**
   * Whether to batch the subgraph executions.
   * @default true
   */
  batch?: boolean;

  logger?: Logger;
}

export interface UnifiedGraphHandlerResult {
  unifiedGraph: GraphQLSchema;
  transportEntryMap: Record<string, TransportEntry>;
  subschemas: SubschemaConfig[];
  additionalResolvers: IResolvers[];
}

export interface UnifiedGraphManagerOptions<TContext> {
  getUnifiedGraph(
    ctx: TransportContext,
  ): MaybePromise<GraphQLSchema | string | DocumentNode>;
  // Handle the unified graph by any specification
  handleUnifiedGraph?: UnifiedGraphHandler;
  onSchemaChange?(unifiedGraph: GraphQLSchema): void;
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
}

export class UnifiedGraphManager<TContext> {
  private batch: boolean;
  private handleUnifiedGraph: UnifiedGraphHandler;
  private unifiedGraph?: GraphQLSchema;
  private lastLoadedUnifiedGraph?: string | GraphQLSchema | DocumentNode;
  private onSubgraphExecuteHooks: OnSubgraphExecuteHook<TContext>[];
  private onDelegationPlanHooks: OnDelegationPlanHook<TContext>[];
  private onDelegationStageExecuteHooks: OnDelegationStageExecuteHook<TContext>[];
  private currentTimeout: ReturnType<typeof setTimeout> | undefined;
  private inContextSDK: any;
  private initialUnifiedGraph$?: MaybePromise<true>;
  private disposableStack = new AsyncDisposableStack();
  private _transportEntryMap?: Record<string, TransportEntry>;
  private _transportExecutorStack?: AsyncDisposableStack;
  constructor(private opts: UnifiedGraphManagerOptions<TContext>) {
    this.batch = opts.batch ?? true;
    this.handleUnifiedGraph =
      opts.handleUnifiedGraph || handleFederationSupergraph;
    this.onSubgraphExecuteHooks = opts?.onSubgraphExecuteHooks || [];
    this.onDelegationPlanHooks = opts?.onDelegationPlanHooks || [];
    this.onDelegationStageExecuteHooks =
      opts?.onDelegationStageExecuteHooks || [];
    this.disposableStack.defer(() => {
      this.unifiedGraph = undefined;
      this.lastLoadedUnifiedGraph = undefined;
      this.inContextSDK = undefined;
      this.initialUnifiedGraph$ = undefined;
      this.pausePolling();
      return this._transportExecutorStack?.disposeAsync();
    });
  }

  private pausePolling() {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = undefined;
    }
  }

  private continuePolling() {
    if (this.opts.pollingInterval) {
      this.currentTimeout = setTimeout(() => {
        this.currentTimeout = undefined;
        return this.getAndSetUnifiedGraph();
      }, this.opts.pollingInterval);
    }
  }

  private ensureUnifiedGraph(): MaybePromise<true> {
    if (this.unifiedGraph) {
      return true;
    }
    if (!this.initialUnifiedGraph$) {
      this.initialUnifiedGraph$ = this.getAndSetUnifiedGraph();
    }
    return this.initialUnifiedGraph$;
  }

  private getAndSetUnifiedGraph(): MaybePromise<true> {
    this.pausePolling();
    try {
      return mapMaybePromise(
        this.opts.getUnifiedGraph(this.opts.transportContext || {}),
        (loadedUnifiedGraph: string | GraphQLSchema | DocumentNode) => {
          if (
            loadedUnifiedGraph != null &&
            this.lastLoadedUnifiedGraph != null &&
            compareSchemas(loadedUnifiedGraph, this.lastLoadedUnifiedGraph)
          ) {
            this.opts.transportContext?.logger?.debug(
              'Unified Graph has not changed, skipping...',
            );
            this.continuePolling();
            return true;
          }
          if (this.lastLoadedUnifiedGraph != null) {
            this.opts.transportContext?.logger?.debug(
              'Unified Graph changed, updating...',
            );
          }
          let cleanupJob$: MaybePromise<void> | undefined;
          if (this._transportExecutorStack) {
            cleanupJob$ = this._transportExecutorStack.disposeAsync();
          }
          return mapMaybePromise(cleanupJob$, () => {
            this._transportExecutorStack = new AsyncDisposableStack();
            this.lastLoadedUnifiedGraph ||= loadedUnifiedGraph;
            this.lastLoadedUnifiedGraph = loadedUnifiedGraph;
            this.unifiedGraph = ensureSchema(loadedUnifiedGraph);
            const {
              unifiedGraph: newUnifiedGraph,
              transportEntryMap,
              subschemas,
              additionalResolvers,
            } = this.handleUnifiedGraph({
              unifiedGraph: this.unifiedGraph,
              additionalTypeDefs: this.opts.additionalTypeDefs,
              additionalResolvers: this.opts.additionalResolvers,
              onSubgraphExecute(subgraphName, execReq) {
                return onSubgraphExecute(subgraphName, execReq);
              },
              onDelegationStageExecuteHooks: this.onDelegationStageExecuteHooks,
              transportEntryAdditions: this.opts.transportEntryAdditions,
              batch: this.batch,
              logger: this.opts.transportContext?.logger,
            });
            this.unifiedGraph = newUnifiedGraph;
            const onSubgraphExecute = getOnSubgraphExecute({
              onSubgraphExecuteHooks: this.onSubgraphExecuteHooks,
              transports: this.opts.transports,
              transportContext: this.opts.transportContext,
              transportEntryMap,
              getSubgraphSchema(subgraphName) {
                const subgraph = subschemas.find(
                  (s) => s.name && compareSubgraphNames(s.name, subgraphName),
                );
                if (!subgraph) {
                  throw new Error(`Subgraph ${subgraphName} not found`);
                }
                return subgraph.schema;
              },
              transportExecutorStack: this._transportExecutorStack,
            });
            if (this.opts.additionalResolvers || additionalResolvers.length) {
              this.inContextSDK = getInContextSDK(
                this.unifiedGraph,
                // @ts-expect-error Legacy Mesh RawSource is not compatible with new Mesh
                subschemas,
                this.opts.transportContext?.logger,
                this.opts.onDelegateHooks || [],
              );
            }
            this.continuePolling();
            this._transportEntryMap = transportEntryMap;
            this.opts.onSchemaChange?.(this.unifiedGraph);
            const stitchingInfo = this.unifiedGraph?.extensions?.[
              'stitchingInfo'
            ] as StitchingInfo;
            if (stitchingInfo && this.onDelegationPlanHooks?.length) {
              for (const typeName in stitchingInfo.mergedTypes) {
                const mergedTypeInfo = stitchingInfo.mergedTypes[typeName];
                if (mergedTypeInfo) {
                  const originalDelegationPlanBuilder =
                    mergedTypeInfo.nonMemoizedDelegationPlanBuilder;
                  mergedTypeInfo.nonMemoizedDelegationPlanBuilder = (
                    supergraph,
                    sourceSubschema,
                    variables,
                    fragments,
                    fieldNodes,
                    context,
                    info,
                  ) => {
                    let delegationPlanBuilder = originalDelegationPlanBuilder;
                    function setDelegationPlanBuilder(
                      newDelegationPlanBuilder: DelegationPlanBuilder,
                    ) {
                      delegationPlanBuilder = newDelegationPlanBuilder;
                    }
                    const onDelegationPlanDoneHooks: OnDelegationPlanDoneHook[] =
                      [];
                    let logger = this.opts.transportContext?.logger;
                    let requestId: string | undefined;
                    if (context?.request) {
                      requestId = requestIdByRequest.get(context.request);
                      if (requestId) {
                        logger = logger?.child(requestId);
                      }
                    }
                    if (sourceSubschema.name) {
                      logger = logger?.child(sourceSubschema.name);
                    }
                    for (const onDelegationPlan of this.onDelegationPlanHooks) {
                      const onDelegationPlanDone = onDelegationPlan({
                        supergraph,
                        subgraph: sourceSubschema.name!,
                        sourceSubschema,
                        typeName: mergedTypeInfo.typeName,
                        variables,
                        fragments,
                        fieldNodes,
                        logger,
                        context,
                        info,
                        delegationPlanBuilder,
                        setDelegationPlanBuilder,
                      });
                      if (onDelegationPlanDone) {
                        onDelegationPlanDoneHooks.push(onDelegationPlanDone);
                      }
                    }
                    let delegationPlan = delegationPlanBuilder(
                      supergraph,
                      sourceSubschema,
                      variables,
                      fragments,
                      fieldNodes,
                      context,
                    );
                    function setDelegationPlan(
                      newDelegationPlan: ReturnType<DelegationPlanBuilder>,
                    ) {
                      delegationPlan = newDelegationPlan;
                    }
                    for (const onDelegationPlanDone of onDelegationPlanDoneHooks) {
                      onDelegationPlanDone({
                        delegationPlan,
                        setDelegationPlan,
                      });
                    }
                    return delegationPlan;
                  };
                }
              }
            }
            return true;
          });
        },
        (err) => {
          this.opts.transportContext?.logger?.error(
            'Failed to load Supergraph',
            err,
          );
          this.continuePolling();
          if (!this.unifiedGraph) {
            throw err;
          }
          return true;
        },
      );
    } catch (e) {
      this.opts.transportContext?.logger?.error('Failed to load Supergraph', e);
      this.continuePolling();
      if (!this.unifiedGraph) {
        throw e;
      }
      return true;
    }
  }

  public getUnifiedGraph(): MaybePromise<GraphQLSchema> {
    return mapMaybePromise(this.ensureUnifiedGraph(), () => {
      return this.unifiedGraph!;
    });
  }

  public getContext<T extends {} = {}>(base: T = {} as T) {
    return mapMaybePromise(this.ensureUnifiedGraph(), () => {
      if (this.inContextSDK) {
        Object.assign(base, this.inContextSDK);
      }
      Object.assign(base, this.opts.transportContext);
      return base;
    });
  }

  public getTransportEntryMap() {
    return mapMaybePromise(this.ensureUnifiedGraph(), () => {
      if (!this._transportEntryMap) {
        throw new Error(`This should not happen!`);
      }
      return this._transportEntryMap;
    });
  }

  invalidateUnifiedGraph() {
    return this.getAndSetUnifiedGraph();
  }

  [DisposableSymbols.asyncDispose]() {
    return this.disposableStack.disposeAsync();
  }
}
