import { OnExecuteEventPayload, OnSubscribeEventPayload } from '@envelop/core';
import { useDisableIntrospection } from '@envelop/disable-introspection';
import { useGenericAuth } from '@envelop/generic-auth';
import {
  createSchemaFetcher,
  createSupergraphSDLFetcher,
} from '@graphql-hive/core';
import type {
  OnDelegationPlanHook,
  OnDelegationStageExecuteHook,
  OnSubgraphExecuteHook,
  TransportEntry,
} from '@graphql-mesh/fusion-runtime';
import {
  getOnSubgraphExecute,
  getStitchingDirectivesTransformerForSubschema,
  getTransportEntryMapUsingFusionAndFederationDirectives,
  handleFederationSubschema,
  handleResolveToDirectives,
  restoreExtraDirectives,
  UnifiedGraphManager,
} from '@graphql-mesh/fusion-runtime';
import { useHmacUpstreamSignature } from '@graphql-mesh/hmac-upstream-signature';
import useMeshResponseCache from '@graphql-mesh/plugin-response-cache';
import { TransportContext } from '@graphql-mesh/transport-common';
import type {
  KeyValueCache,
  OnDelegateHook,
  OnFetchHook,
} from '@graphql-mesh/types';
import {
  dispose,
  getHeadersObj,
  getInContextSDK,
  isDisposable,
  isUrl,
  LogLevel,
  wrapFetchWithHooks,
} from '@graphql-mesh/utils';
import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import {
  delegateToSchema,
  type SubschemaConfig,
} from '@graphql-tools/delegate';
import { defaultPrintFn } from '@graphql-tools/executor-common';
import {
  asArray,
  getDirectiveExtensions,
  IResolvers,
  isDocumentNode,
  isValidPath,
  mergeDeep,
  parseSelectionSet,
  printSchemaWithDirectives,
  type Executor,
  type TypeSource,
} from '@graphql-tools/utils';
import { schemaFromExecutor, wrapSchema } from '@graphql-tools/wrap';
import { useCSRFPrevention } from '@graphql-yoga/plugin-csrf-prevention';
import { useDeferStream } from '@graphql-yoga/plugin-defer-stream';
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { handleMaybePromise, MaybePromise } from '@whatwg-node/promise-helpers';
import {
  buildASTSchema,
  buildSchema,
  GraphQLSchema,
  isSchema,
  parse,
} from 'graphql';
import {
  chain,
  createYoga,
  isAsyncIterable,
  mergeSchemas,
  useExecutionCancellation,
  useReadinessCheck,
  type LandingPageRenderer,
  type YogaServerInstance,
} from 'graphql-yoga';
import type { GraphiQLOptions, PromiseOrValue } from 'graphql-yoga';
import { createGraphOSFetcher } from './fetchers/graphos';
import { handleLoggingConfig } from './getDefaultLogger';
import { getProxyExecutor } from './getProxyExecutor';
import { getReportingPlugin } from './getReportingPlugin';
import {
  handleUnifiedGraphConfig,
  UnifiedGraphSchema,
} from './handleUnifiedGraphConfig';
import landingPageHtml from './landing-page-html';
import { useCacheDebug } from './plugins/useCacheDebug';
import { useContentEncoding } from './plugins/useContentEncoding';
import { useCustomAgent } from './plugins/useCustomAgent';
import { useDelegationPlanDebug } from './plugins/useDelegationPlanDebug';
import { useDemandControl } from './plugins/useDemandControl';
import { useFetchDebug } from './plugins/useFetchDebug';
import useHiveConsole from './plugins/useHiveConsole';
import { usePropagateHeaders } from './plugins/usePropagateHeaders';
import { useRequestId } from './plugins/useRequestId';
import { useRetryOnSchemaReload } from './plugins/useRetryOnSchemaReload';
import { useSubgraphErrorPlugin } from './plugins/useSubgraphErrorPlugin';
import { useSubgraphExecuteDebug } from './plugins/useSubgraphExecuteDebug';
import { useUpstreamCancel } from './plugins/useUpstreamCancel';
import { useUpstreamRetry } from './plugins/useUpstreamRetry';
import { useUpstreamTimeout } from './plugins/useUpstreamTimeout';
import { useWebhooks } from './plugins/useWebhooks';
import { defaultProductLogo } from './productLogo';
import type {
  GatewayConfig,
  GatewayConfigContext,
  GatewayContext,
  GatewayHiveCDNOptions,
  GatewayPlugin,
  OnCacheDeleteHook,
  OnCacheGetHook,
  OnCacheSetHook,
  UnifiedGraphConfig,
} from './types';
import {
  checkIfDataSatisfiesSelectionSet,
  defaultQueryText,
  getExecuteFnFromExecutor,
  wrapCacheWithHooks,
} from './utils';

// TODO: this type export is not properly accessible from graphql-yoga
//       "graphql-yoga/typings/plugins/use-graphiql.js" is an illegal path
export type GraphiQLOptionsOrFactory<TServerContext> =
  | GraphiQLOptions
  | ((
      request: Request,
      ...args: {} extends TServerContext
        ? [serverContext?: TServerContext | undefined]
        : [serverContext: TServerContext]
    ) => PromiseOrValue<GraphiQLOptions | boolean>)
  | boolean;

export type GatewayRuntime<
  TContext extends Record<string, any> = Record<string, any>,
> = YogaServerInstance<any, TContext> & {
  invalidateUnifiedGraph(): void;
  getSchema(): MaybePromise<GraphQLSchema>;
};

export function createGatewayRuntime<
  TContext extends Record<string, any> = Record<string, any>,
>(config: GatewayConfig<TContext>): GatewayRuntime<TContext> {
  let fetchAPI = config.fetchAPI;
  const logger = handleLoggingConfig(config.logging);

  let instrumentation: GatewayPlugin['instrumentation'];

  const onFetchHooks: OnFetchHook<GatewayContext>[] = [];
  const onCacheGetHooks: OnCacheGetHook[] = [];
  const onCacheSetHooks: OnCacheSetHook[] = [];
  const onCacheDeleteHooks: OnCacheDeleteHook[] = [];
  const wrappedFetchFn = wrapFetchWithHooks(
    onFetchHooks,
    () => instrumentation,
    logger,
  );
  const wrappedCache: KeyValueCache | undefined = config.cache
    ? wrapCacheWithHooks({
        cache: config.cache,
        onCacheGet: onCacheGetHooks,
        onCacheSet: onCacheSetHooks,
        onCacheDelete: onCacheDeleteHooks,
      })
    : undefined;

  const pubsub = config.pubsub;

  const configContext: GatewayConfigContext = {
    fetch: wrappedFetchFn,
    logger,
    cwd: config.cwd || (typeof process !== 'undefined' ? process.cwd() : ''),
    cache: wrappedCache,
    pubsub,
  };

  let unifiedGraphPlugin: GatewayPlugin;

  const readinessCheckEndpoint = config.readinessCheckEndpoint || '/readiness';
  const onSubgraphExecuteHooks: OnSubgraphExecuteHook[] = [];
  // TODO: Will be deleted after v0
  const onDelegateHooks: OnDelegateHook<unknown>[] = [];

  const onDelegationPlanHooks: OnDelegationPlanHook<GatewayContext>[] = [];
  const onDelegationStageExecuteHooks: OnDelegationStageExecuteHook<GatewayContext>[] =
    [];

  let unifiedGraph: GraphQLSchema;
  let schemaInvalidator: () => void;
  let getSchema: () => MaybePromise<GraphQLSchema> = () => unifiedGraph;
  let contextBuilder: <T>(context: T) => MaybePromise<T>;
  let readinessChecker: () => MaybePromise<boolean>;
  let getExecutor: (() => MaybePromise<Executor | undefined>) | undefined;
  let replaceSchema: (schema: GraphQLSchema) => void = (newSchema) => {
    unifiedGraph = newSchema;
  };
  const { name: reportingTarget, plugin: registryPlugin } = getReportingPlugin(
    config,
    configContext,
  );
  let persistedDocumentsPlugin: GatewayPlugin = {};
  if (
    config.reporting?.type !== 'hive' &&
    config.persistedDocuments &&
    'type' in config.persistedDocuments &&
    config.persistedDocuments?.type === 'hive'
  ) {
    persistedDocumentsPlugin = useHiveConsole({
      ...configContext,
      enabled: false, // disables only usage reporting
      logger: configContext.logger.child({
        plugin: 'Hive Persisted Documents',
      }),
      experimental__persistedDocuments: {
        cdn: {
          endpoint: config.persistedDocuments.endpoint,
          accessToken: config.persistedDocuments.token,
        },
        allowArbitraryDocuments:
          !!config.persistedDocuments.allowArbitraryDocuments,
      },
    });
  } else if (
    config.persistedDocuments &&
    'getPersistedOperation' in config.persistedDocuments
  ) {
    persistedDocumentsPlugin = usePersistedOperations<GatewayContext>({
      ...configContext,
      ...config.persistedDocuments,
    });
  }
  let subgraphInformationHTMLRenderer: () => MaybePromise<string> = () => '';

  if ('proxy' in config) {
    const transportExecutorStack = new AsyncDisposableStack();
    const proxyExecutor = getProxyExecutor({
      config,
      configContext,
      getSchema() {
        return unifiedGraph;
      },
      onSubgraphExecuteHooks,
      transportExecutorStack,
      instrumentation: () => instrumentation,
    });

    getExecutor = () => proxyExecutor;

    let currentTimeout: ReturnType<typeof setTimeout>;
    const pollingInterval = config.pollingInterval;
    function continuePolling() {
      if (currentTimeout) {
        clearTimeout(currentTimeout);
      }
      if (pollingInterval) {
        currentTimeout = setTimeout(schemaFetcher, pollingInterval);
      }
    }
    function pausePolling() {
      if (currentTimeout) {
        clearTimeout(currentTimeout);
      }
    }
    let lastFetchedSdl: string | undefined;
    let initialFetch$: MaybePromise<true>;
    let schemaFetcher: () => MaybePromise<true>;

    if (
      config.schema &&
      typeof config.schema === 'object' &&
      'type' in config.schema
    ) {
      // hive cdn
      const { endpoint, key } = config.schema;
      const fetcher = createSchemaFetcher({
        endpoint,
        key,
        logger: configContext.logger.child({ source: 'Hive CDN' }),
      });
      schemaFetcher = function fetchSchemaFromCDN() {
        pausePolling();
        initialFetch$ = handleMaybePromise(fetcher, ({ sdl }) => {
          if (lastFetchedSdl == null || lastFetchedSdl !== sdl) {
            unifiedGraph = buildSchema(sdl, {
              assumeValid: true,
              assumeValidSDL: true,
            });
          }
          continuePolling();
          return true;
        });
        return initialFetch$;
      };
    } else if (config.schema) {
      // local or remote

      if (!isDynamicUnifiedGraphSchema(config.schema)) {
        // no polling for static schemas
        delete config.pollingInterval;
      }

      schemaFetcher = function fetchSchema() {
        pausePolling();
        initialFetch$ = handleMaybePromise(
          () =>
            handleUnifiedGraphConfig(
              // @ts-expect-error TODO: what's up with type narrowing
              config.schema,
              configContext,
            ),
          (schema) => {
            if (isSchema(schema)) {
              unifiedGraph = schema;
            } else if (isDocumentNode(schema)) {
              unifiedGraph = buildASTSchema(schema, {
                assumeValid: true,
                assumeValidSDL: true,
              });
            } else {
              unifiedGraph = buildSchema(schema, {
                noLocation: true,
                assumeValid: true,
                assumeValidSDL: true,
              });
            }
            continuePolling();
            return true;
          },
        );
        return initialFetch$;
      };
    } else {
      // introspect endpoint
      schemaFetcher = function fetchSchemaWithExecutor() {
        pausePolling();
        return handleMaybePromise(
          () =>
            schemaFromExecutor(proxyExecutor, configContext, {
              assumeValid: true,
            }),
          (schema) => {
            unifiedGraph = schema;
            continuePolling();
            return true;
          },
          (err) => {
            configContext.logger.warn(`Failed to introspect schema`, err);
            return true;
          },
        );
      };
    }
    getSchema = () => {
      if (unifiedGraph != null) {
        return unifiedGraph;
      }
      if (initialFetch$ != null) {
        return handleMaybePromise(
          () => initialFetch$,
          () => unifiedGraph,
        );
      }
      return handleMaybePromise(schemaFetcher, () => unifiedGraph);
    };
    const shouldSkipValidation =
      'skipValidation' in config ? config.skipValidation : false;
    const executorPlugin: GatewayPlugin = {
      onValidate({ params, setResult }) {
        if (shouldSkipValidation || !params.schema) {
          setResult([]);
        }
      },
      onDispose() {
        pausePolling();
        return transportExecutorStack.disposeAsync();
      },
    };
    unifiedGraphPlugin = executorPlugin;
    readinessChecker = () =>
      handleMaybePromise(
        () =>
          proxyExecutor({
            document: parse(`query ReadinessCheck { __typename }`),
          }),
        (res) => !isAsyncIterable(res) && !!res.data?.__typename,
      );
    schemaInvalidator = () => {
      // @ts-expect-error TODO: this is illegal but somehow we want it
      unifiedGraph = undefined;
      initialFetch$ = schemaFetcher();
    };
    subgraphInformationHTMLRenderer = () => {
      const endpoint = config.proxy.endpoint;
      const htmlParts: string[] = [];
      htmlParts.push(`<section class="supergraph-information">`);
      htmlParts.push(`<h3>Proxy: <a href="${endpoint}">${endpoint}</a></h3>`);
      if (config.schema) {
        if (typeof config.schema === 'object' && 'type' in config.schema) {
          htmlParts.push(
            `<p><strong>Source: </strong> <i>${config.schema.type === 'hive' ? 'Hive' : 'Unknown'} CDN</i></p>`,
          );
        } else if (isValidPath(config.schema) || isUrl(String(config.schema))) {
          htmlParts.push(
            `<p><strong>Source: </strong> <i>${config.schema}</i></p>`,
          );
        } else {
          htmlParts.push(
            `<p><strong>Source: </strong> <i>GraphQL schema in config</i></p>`,
          );
        }
      }
      if (reportingTarget) {
        htmlParts.push(
          `<p><strong>Usage Reporting: </strong> <i>${reportingTarget}</i></p>`,
        );
      }
      htmlParts.push(`</section>`);
      return htmlParts.join('');
    };
  } else if ('subgraph' in config) {
    const subgraphInConfig = config.subgraph;
    let getSubschemaConfig$: MaybePromise<boolean> | undefined;
    let subschemaConfig: SubschemaConfig;
    const transportExecutorStack = new AsyncDisposableStack();
    function getSubschemaConfig() {
      if (getSubschemaConfig$ == null) {
        getSubschemaConfig$ = handleMaybePromise(
          () => handleUnifiedGraphConfig(subgraphInConfig, configContext),
          (newUnifiedGraph) => {
            if (isSchema(newUnifiedGraph)) {
              unifiedGraph = newUnifiedGraph;
            } else if (isDocumentNode(newUnifiedGraph)) {
              unifiedGraph = buildASTSchema(newUnifiedGraph, {
                assumeValid: true,
                assumeValidSDL: true,
              });
            } else {
              unifiedGraph = buildSchema(newUnifiedGraph, {
                noLocation: true,
                assumeValid: true,
                assumeValidSDL: true,
              });
            }
            unifiedGraph = restoreExtraDirectives(unifiedGraph);
            subschemaConfig = {
              name: getDirectiveExtensions(unifiedGraph)?.['transport']?.[0]?.[
                'subgraph'
              ],
              schema: unifiedGraph,
            };
            const transportEntryMap: Record<string, TransportEntry> =
              getTransportEntryMapUsingFusionAndFederationDirectives(
                unifiedGraph,
                config.transportEntries,
              );
            const additionalTypeDefs: TypeSource[] = [];

            const stitchingDirectivesTransformer =
              getStitchingDirectivesTransformerForSubschema();
            const onSubgraphExecute = getOnSubgraphExecute({
              onSubgraphExecuteHooks,
              ...(config.transports ? { transports: config.transports } : {}),
              transportContext: configContext,
              transportEntryMap,
              getSubgraphSchema() {
                return unifiedGraph;
              },
              transportExecutorStack,
              instrumentation: () => instrumentation,
            });
            subschemaConfig = handleFederationSubschema({
              subschemaConfig,
              additionalTypeDefs,
              stitchingDirectivesTransformer,
              onSubgraphExecute,
            });
            // TODO: Find better alternative later
            unifiedGraph = wrapSchema(subschemaConfig);
            const entities = Object.keys(subschemaConfig.merge || {});
            let entitiesDef = 'union _Entity';
            if (entities.length) {
              entitiesDef += ` = ${entities.join(' | ')}`;
            }
            const additionalResolvers: IResolvers[] = asArray(
              'additionalResolvers' in config ? config.additionalResolvers : [],
            ).filter((r) => r != null);
            const queryTypeName = unifiedGraph.getQueryType()?.name || 'Query';
            const finalTypeDefs = handleResolveToDirectives(
              parse(/* GraphQL */ `
                type ${queryTypeName} {
                  ${entities.length ? '_entities(representations: [_Any!]!): [_Entity]!' : ''}
                  _service: _Service!
                }

                scalar _Any
                ${entities.length ? entitiesDef : ''}
                type _Service {
                  sdl: String
                }
              `),
              additionalTypeDefs,
              additionalResolvers,
            );
            additionalResolvers.push({
              [queryTypeName]: {
                _service() {
                  return {
                    sdl() {
                      if (isSchema(newUnifiedGraph)) {
                        return printSchemaWithDirectives(newUnifiedGraph);
                      }
                      if (isDocumentNode(newUnifiedGraph)) {
                        return defaultPrintFn(newUnifiedGraph);
                      }
                      return newUnifiedGraph;
                    },
                  };
                },
              },
            });
            if (entities.length) {
              additionalResolvers.push({
                [queryTypeName]: {
                  _entities(_root, args, context, info) {
                    if (Array.isArray(args.representations)) {
                      return args.representations.map((representation: any) => {
                        const typeName = representation.__typename;
                        const mergeConfig = subschemaConfig.merge?.[typeName];
                        const entryPoints = mergeConfig?.entryPoints || [
                          mergeConfig,
                        ];
                        const satisfiedEntryPoint = entryPoints.find(
                          (entryPoint) => {
                            if (entryPoint?.selectionSet) {
                              const selectionSet = parseSelectionSet(
                                entryPoint.selectionSet,
                                {
                                  noLocation: true,
                                },
                              );
                              return checkIfDataSatisfiesSelectionSet(
                                selectionSet,
                                representation,
                              );
                            }
                            return true;
                          },
                        );
                        if (satisfiedEntryPoint) {
                          if (satisfiedEntryPoint.key) {
                            return handleMaybePromise(
                              () =>
                                batchDelegateToSchema({
                                  schema: subschemaConfig,
                                  ...(satisfiedEntryPoint.fieldName
                                    ? {
                                        fieldName:
                                          satisfiedEntryPoint.fieldName,
                                      }
                                    : {}),
                                  key: satisfiedEntryPoint.key!(representation),
                                  ...(satisfiedEntryPoint.argsFromKeys
                                    ? {
                                        argsFromKeys:
                                          satisfiedEntryPoint.argsFromKeys,
                                      }
                                    : {}),
                                  ...(satisfiedEntryPoint.valuesFromResults
                                    ? {
                                        valuesFromResults:
                                          satisfiedEntryPoint.valuesFromResults,
                                      }
                                    : {}),
                                  context,
                                  info,
                                }),
                              (res) => mergeDeep([representation, res]),
                            );
                          }
                          if (satisfiedEntryPoint.args) {
                            return handleMaybePromise(
                              () =>
                                delegateToSchema({
                                  schema: subschemaConfig,
                                  ...(satisfiedEntryPoint.fieldName
                                    ? {
                                        fieldName:
                                          satisfiedEntryPoint.fieldName,
                                      }
                                    : {}),
                                  args: satisfiedEntryPoint.args!(
                                    representation,
                                  ),
                                  context,
                                  info,
                                }),
                              (res) => mergeDeep([representation, res]),
                            );
                          }
                        }
                        return representation;
                      });
                    }
                    return [];
                  },
                },
              });
            }
            unifiedGraph = mergeSchemas({
              assumeValid: true,
              assumeValidSDL: true,
              schemas: [unifiedGraph],
              typeDefs: finalTypeDefs,
              resolvers: additionalResolvers,
            });
            contextBuilder = (base) =>
              // @ts-expect-error - Typings are wrong in legacy Mesh
              Object.assign(
                // @ts-expect-error - Typings are wrong in legacy Mesh
                base,
                getInContextSDK(
                  unifiedGraph,
                  // @ts-expect-error - Typings are wrong in legacy Mesh
                  [subschemaConfig],
                  configContext.logger,
                  onDelegateHooks,
                ),
              );
            return true;
          },
        );
      }
      return getSubschemaConfig$;
    }
    getSchema = () =>
      handleMaybePromise(getSubschemaConfig, () => unifiedGraph);
    schemaInvalidator = () => {
      getSubschemaConfig$ = undefined;
    };
    unifiedGraphPlugin = {
      onDispose() {
        return transportExecutorStack.disposeAsync();
      },
    };
  } /** 'supergraph' in config */ else {
    let unifiedGraphFetcher: (
      transportCtx: TransportContext,
    ) => MaybePromise<UnifiedGraphSchema>;
    let supergraphLoadedPlace: string;

    if (typeof config.supergraph === 'object' && 'type' in config.supergraph) {
      if (config.supergraph.type === 'hive') {
        // hive cdn
        const { endpoint, key } = config.supergraph;
        supergraphLoadedPlace = 'Hive CDN <br>' + endpoint;
        const fetcher = createSupergraphSDLFetcher({
          endpoint,
          key,
          logger: configContext.logger.child({ source: 'Hive CDN' }),
          // @ts-expect-error - MeshFetch is not compatible with `typeof fetch`
          fetchImplementation: configContext.fetch,
        });
        unifiedGraphFetcher = () =>
          fetcher().then(({ supergraphSdl }) => supergraphSdl);
      } else if (config.supergraph.type === 'graphos') {
        const graphosFetcherContainer = createGraphOSFetcher({
          graphosOpts: config.supergraph,
          configContext,
          pollingInterval: config.pollingInterval,
        });
        unifiedGraphFetcher = graphosFetcherContainer.unifiedGraphFetcher;
        supergraphLoadedPlace = graphosFetcherContainer.supergraphLoadedPlace;
      } else {
        unifiedGraphFetcher = () => {
          throw new Error(
            `Unknown supergraph configuration: ${config.supergraph}`,
          );
        };
      }
    } else {
      // local or remote
      if (!isDynamicUnifiedGraphSchema(config.supergraph)) {
        // no polling for static schemas
        logger.debug(`Disabling polling for static supergraph`);
        delete config.pollingInterval;
      } else if (!config.pollingInterval) {
        logger.debug(
          `Polling interval not set for supergraph, if you want to get updates of supergraph, we recommend setting a polling interval`,
        );
      }

      unifiedGraphFetcher = () =>
        handleUnifiedGraphConfig(
          // @ts-expect-error TODO: what's up with type narrowing
          config.supergraph,
          configContext,
        );
      if (typeof config.supergraph === 'function') {
        const fnName = config.supergraph.name || '';
        supergraphLoadedPlace = `a custom loader ${fnName}`;
      } else if (typeof config.supergraph === 'string') {
        supergraphLoadedPlace = config.supergraph;
      }
    }

    const unifiedGraphManager = new UnifiedGraphManager<GatewayContext>({
      getUnifiedGraph: unifiedGraphFetcher,
      onUnifiedGraphChange(newUnifiedGraph: GraphQLSchema) {
        unifiedGraph = newUnifiedGraph;
        replaceSchema(newUnifiedGraph);
      },
      transports: config.transports,
      transportEntryAdditions: config.transportEntries,
      pollingInterval: config.pollingInterval,
      transportContext: configContext,
      onDelegateHooks,
      onSubgraphExecuteHooks,
      onDelegationPlanHooks,
      onDelegationStageExecuteHooks,
      additionalTypeDefs: config.additionalTypeDefs,
      additionalResolvers: config.additionalResolvers as IResolvers[],
      instrumentation: () => instrumentation,
      batch: config.__experimental__batchDelegation,
    });
    getSchema = () => unifiedGraphManager.getUnifiedGraph();
    readinessChecker = () => {
      const logger = configContext.logger.child('readiness');
      logger.debug(`checking`);
      return handleMaybePromise(
        () => unifiedGraphManager.getUnifiedGraph(),
        (schema) => {
          if (!schema) {
            logger.debug(
              `failed because supergraph has not been loaded yet or failed to load`,
            );
            return false;
          }
          logger.debug('passed');
          return true;
        },
        (err) => {
          logger.error(
            `failed due to errors on loading supergraph:\n${err.stack || err.message}`,
          );
          return false;
        },
      );
    };
    schemaInvalidator = () => unifiedGraphManager.invalidateUnifiedGraph();
    contextBuilder = (base) => unifiedGraphManager.getContext(base as any);
    getExecutor = () => unifiedGraphManager.getExecutor();
    unifiedGraphPlugin = {
      onDispose() {
        return dispose(unifiedGraphManager);
      },
    };
    subgraphInformationHTMLRenderer = () =>
      handleMaybePromise(
        () =>
          handleMaybePromise(
            () => unifiedGraphManager.getTransportEntryMap(),
            (transportEntryMap) => ({
              transportEntryMap,
              loadError: undefined,
              loaded: true,
            }),
            (loadError) => ({
              transportEntryMap: {} as Record<
                string,
                TransportEntry<Record<string, any>>
              >,
              loadError,
              loaded: false,
            }),
          ),
        ({ transportEntryMap, loaded, loadError }) => {
          const htmlParts: string[] = [];
          if (loaded) {
            htmlParts.push(`<h3>Supergraph Status: Loaded ✅</h3>`);
            if (supergraphLoadedPlace) {
              htmlParts.push(
                `<p><strong>Source: </strong> <i>${supergraphLoadedPlace}</i></p>`,
              );
              if (reportingTarget) {
                htmlParts.push(
                  `<p><strong>Usage Reporting: </strong> <i>${reportingTarget}</i></p>`,
                );
              }
            }
            htmlParts.push(`<table>`);
            htmlParts.push(
              `<tr><th>Subgraph</th><th>Transport</th><th>Location</th></tr>`,
            );
            for (const subgraphName in transportEntryMap) {
              const transportEntry = transportEntryMap[subgraphName]!;
              htmlParts.push(`<tr>`);
              htmlParts.push(`<td>${subgraphName}</td>`);
              htmlParts.push(`<td>${transportEntry.kind}</td>`);
              htmlParts.push(
                `<td><a href="${transportEntry.location}">${transportEntry.location}</a></td>`,
              );
              htmlParts.push(`</tr>`);
            }
            htmlParts.push(`</table>`);
          } else if (loadError) {
            htmlParts.push(`<h3>Status: Failed ❌</h3>`);
            if (supergraphLoadedPlace) {
              htmlParts.push(
                `<p><strong>Source: </strong> <i>${supergraphLoadedPlace}</i></p>`,
              );
            }
            htmlParts.push(`<h3>Error:</h3>`);
            htmlParts.push(
              `<pre>${loadError instanceof Error ? loadError.stack : JSON.stringify(loadError, null, '  ')}</pre>`,
            );
          } else {
            htmlParts.push(`<h3>Status: Unknown</h3>`);
            if (supergraphLoadedPlace) {
              htmlParts.push(
                `<p><strong>Source: </strong> <i>${supergraphLoadedPlace}</i></p>`,
              );
            }
          }
          return `<section class="supergraph-information">${htmlParts.join('')}</section>`;
        },
      );
  }

  const readinessCheckPlugin = useReadinessCheck({
    endpoint: readinessCheckEndpoint,
    // @ts-expect-error PromiseLike is not compatible with Promise
    check: readinessChecker,
  });

  const defaultGatewayPlugin: GatewayPlugin = {
    onFetch({ setFetchFn }) {
      if (fetchAPI?.fetch) {
        setFetchFn(fetchAPI.fetch);
      }
    },
    onRequestParse() {
      return handleMaybePromise(getSchema, (schema) => {
        replaceSchema(schema);
      });
    },
    onPluginInit({ plugins, setSchema }) {
      replaceSchema = setSchema;
      onFetchHooks.splice(0, onFetchHooks.length);
      onSubgraphExecuteHooks.splice(0, onSubgraphExecuteHooks.length);
      onDelegateHooks.splice(0, onDelegateHooks.length);
      for (const plugin of plugins as GatewayPlugin[]) {
        if (plugin.instrumentation) {
          instrumentation = instrumentation
            ? chain(instrumentation, plugin.instrumentation)
            : plugin.instrumentation;
        }
        if (plugin.onFetch) {
          onFetchHooks.push(plugin.onFetch);
        }
        if (plugin.onSubgraphExecute) {
          onSubgraphExecuteHooks.push(plugin.onSubgraphExecute);
        }
        // @ts-expect-error For backward compatibility
        if (plugin.onDelegate) {
          // @ts-expect-error For backward compatibility
          onDelegateHooks.push(plugin.onDelegate);
        }
        if (plugin.onDelegationPlan) {
          onDelegationPlanHooks.push(plugin.onDelegationPlan);
        }
        if (plugin.onDelegationStageExecute) {
          onDelegationStageExecuteHooks.push(plugin.onDelegationStageExecute);
        }
        if (plugin.onCacheGet) {
          onCacheGetHooks.push(plugin.onCacheGet);
        }
        if (plugin.onCacheSet) {
          onCacheSetHooks.push(plugin.onCacheSet);
        }
        if (plugin.onCacheDelete) {
          onCacheDeleteHooks.push(plugin.onCacheDelete);
        }
      }
    },
  };

  if (getExecutor) {
    const onExecute = ({
      setExecuteFn,
    }: OnExecuteEventPayload<GatewayContext>) =>
      handleMaybePromise(
        () => getExecutor?.(),
        (executor) => {
          if (executor) {
            const executeFn = getExecuteFnFromExecutor(executor);
            setExecuteFn(executeFn);
          }
        },
      );
    const onSubscribe = ({
      setSubscribeFn,
    }: OnSubscribeEventPayload<GatewayContext>) =>
      handleMaybePromise(
        () => getExecutor?.(),
        (executor) => {
          if (executor) {
            const subscribeFn = getExecuteFnFromExecutor(executor);
            setSubscribeFn(subscribeFn);
          }
        },
      );
    defaultGatewayPlugin.onExecute = onExecute;
    defaultGatewayPlugin.onSubscribe = onSubscribe;
  }

  const productName = config.productName || 'Hive Gateway';
  const productDescription =
    config.productDescription || 'Federated GraphQL Gateway';
  const productPackageName =
    config.productPackageName || '@graphql-hive/gateway';
  const productLogo = config.productLogo || defaultProductLogo;
  const productLink =
    config.productLink || 'https://the-guild.dev/graphql/hive/docs/gateway';

  let graphiqlOptionsOrFactory!: GraphiQLOptionsOrFactory<unknown> | false;

  if (config.graphiql == null || config.graphiql === true) {
    graphiqlOptionsOrFactory = {
      title: productName,
      defaultQuery: defaultQueryText,
    };
  } else if (config.graphiql === false) {
    graphiqlOptionsOrFactory = false;
  } else if (typeof config.graphiql === 'object') {
    graphiqlOptionsOrFactory = {
      title: productName,
      defaultQuery: defaultQueryText,
      ...config.graphiql,
    };
  } else if (typeof config.graphiql === 'function') {
    const userGraphiqlFactory = config.graphiql;
    graphiqlOptionsOrFactory = function graphiqlOptionsFactoryForMesh(...args) {
      return handleMaybePromise(
        () => userGraphiqlFactory(...args),
        (resolvedOpts) => {
          if (resolvedOpts === false) {
            return false;
          }
          if (resolvedOpts === true) {
            return {
              title: productName,
              defaultQuery: defaultQueryText,
            };
          }
          return {
            title: productName,
            defaultQuery: defaultQueryText,
            ...resolvedOpts,
          };
        },
      );
    };
  }

  let landingPageRenderer!: LandingPageRenderer | boolean;

  if (config.landingPage == null || config.landingPage === true) {
    landingPageRenderer = (opts) =>
      handleMaybePromise(
        subgraphInformationHTMLRenderer,
        (subgraphHtml) =>
          new opts.fetchAPI.Response(
            landingPageHtml
              .replace(/__GRAPHIQL_LINK__/g, opts.graphqlEndpoint)
              .replace(/__REQUEST_PATH__/g, opts.url.pathname)
              .replace(/__SUBGRAPH_HTML__/g, subgraphHtml)
              .replaceAll(/__PRODUCT_NAME__/g, productName)
              .replaceAll(/__PRODUCT_DESCRIPTION__/g, productDescription)
              .replaceAll(/__PRODUCT_PACKAGE_NAME__/g, productPackageName)
              .replace(/__PRODUCT_LINK__/, productLink)
              .replace(/__PRODUCT_LOGO__/g, productLogo),
            {
              status: 200,
              statusText: 'OK',
              headers: {
                'Content-Type': 'text/html',
              },
            },
          ),
      );
  } else if (typeof config.landingPage === 'function') {
    landingPageRenderer = config.landingPage;
  } else if (config.landingPage === false) {
    landingPageRenderer = false;
  }

  const basePlugins = [
    defaultGatewayPlugin,
    unifiedGraphPlugin,
    readinessCheckPlugin,
    registryPlugin,
    persistedDocumentsPlugin,
    useRetryOnSchemaReload({ logger }),
  ];

  if (config.subgraphErrors !== false) {
    basePlugins.push(
      useSubgraphErrorPlugin(
        typeof config.subgraphErrors === 'object'
          ? config.subgraphErrors
          : undefined,
      ),
    );
  }

  if (config.requestId !== false) {
    const reqIdPlugin = useRequestId(
      typeof config.requestId === 'object' ? config.requestId : undefined,
    );
    basePlugins.push(reqIdPlugin);
  }

  if (isDisposable(wrappedCache)) {
    const cacheDisposePlugin = {
      onDispose() {
        return dispose(wrappedCache);
      },
    };
    basePlugins.push(cacheDisposePlugin);
  }

  if (isDisposable(pubsub)) {
    const cacheDisposePlugin = {
      onDispose() {
        return dispose(pubsub);
      },
    };
    basePlugins.push(cacheDisposePlugin);
  }

  const extraPlugins = [];

  if (config.webhooks) {
    extraPlugins.push(useWebhooks(configContext));
  }

  if (config.responseCaching) {
    extraPlugins.push(
      // @ts-expect-error TODO: what's up with type narrowing
      useMeshResponseCache({
        ...configContext,
        ...config.responseCaching,
      }),
    );
  }

  if (config.contentEncoding) {
    extraPlugins.push(
      useContentEncoding(
        typeof config.contentEncoding === 'object'
          ? config.contentEncoding
          : {},
      ),
    );
  }

  if (config.deferStream) {
    extraPlugins.push(useDeferStream());
  }

  if (config.executionCancellation) {
    extraPlugins.push(useExecutionCancellation());
  }

  if (config.upstreamCancellation) {
    extraPlugins.push(useUpstreamCancel());
  }

  if (config.disableIntrospection) {
    extraPlugins.push(
      useDisableIntrospection(
        // @ts-expect-error - Should be fixed in the envelop plugin
        typeof config.disableIntrospection === 'object'
          ? config.disableIntrospection
          : {},
      ),
    );
  }

  if (config.csrfPrevention) {
    extraPlugins.push(
      useCSRFPrevention(
        typeof config.csrfPrevention === 'object' ? config.csrfPrevention : {},
      ),
    );
  }

  if (config.customAgent) {
    extraPlugins.push(useCustomAgent<{}>(config.customAgent));
  }

  if (config.genericAuth) {
    extraPlugins.push(useGenericAuth(config.genericAuth));
  }

  if (config.hmacSignature) {
    extraPlugins.push(useHmacUpstreamSignature(config.hmacSignature));
  }

  if (config.propagateHeaders) {
    extraPlugins.push(usePropagateHeaders(config.propagateHeaders));
  }

  if (config.upstreamTimeout) {
    extraPlugins.push(useUpstreamTimeout(config.upstreamTimeout));
  }

  if (config.upstreamRetry) {
    extraPlugins.push(useUpstreamRetry(config.upstreamRetry));
  }

  if (config.demandControl) {
    extraPlugins.push(useDemandControl(config.demandControl));
  }

  let isDebug: boolean = false;

  if ('level' in logger) {
    if (logger.level === 'debug' || logger.level === LogLevel.debug) {
      isDebug = true;
    }
  } else {
    logger.debug(() => {
      isDebug = true;
      return 'Debug mode enabled';
    });
  }

  if (isDebug) {
    extraPlugins.push(
      useSubgraphExecuteDebug(configContext),
      useFetchDebug(configContext),
      useDelegationPlanDebug(configContext),
      useCacheDebug(configContext),
    );
  }

  const yoga = createYoga({
    // @ts-expect-error Types???
    schema: unifiedGraph,
    // @ts-expect-error MeshFetch is not compatible with YogaFetch
    fetchAPI: config.fetchAPI,
    logging: logger,
    plugins: [
      ...basePlugins,
      ...extraPlugins,
      ...(config.plugins?.(configContext) || []),
    ],
    context({ request, params, req, connectionParams }) {
      let headers = // Maybe Node-like environment
        req?.headers
          ? getHeadersObj(req.headers)
          : // Fetch environment
            request?.headers
            ? getHeadersObj(request.headers)
            : // Unknown environment
              {};
      if (connectionParams) {
        headers = { ...headers, ...connectionParams };
      }
      const baseContext = {
        ...configContext,
        request,
        params,
        headers,
        connectionParams: headers,
      };
      if (contextBuilder) {
        return contextBuilder(baseContext);
      }
      return baseContext;
    },
    cors: config.cors,
    graphiql: graphiqlOptionsOrFactory,
    batching: config.batching,
    graphqlEndpoint: config.graphqlEndpoint,
    maskedErrors: config.maskedErrors,
    healthCheckEndpoint: config.healthCheckEndpoint || '/healthcheck',
    landingPage: landingPageRenderer,
    disposeOnProcessTerminate: true,
  });

  fetchAPI ||= yoga.fetchAPI;

  Object.defineProperties(yoga, {
    version: {
      get() {
        return globalThis.__VERSION__;
      },
    },
    invalidateUnifiedGraph: {
      value: schemaInvalidator,
      configurable: true,
    },
    getSchema: {
      value: getSchema,
      configurable: true,
    },
  });

  return yoga as GatewayRuntime<TContext>;
}

function isDynamicUnifiedGraphSchema(
  schema: UnifiedGraphConfig | GatewayHiveCDNOptions,
) {
  if (isSchema(schema)) {
    // schema object
    return false;
  }
  if (isDocumentNode(schema)) {
    // document node that could be a schema
    return false;
  }
  if (typeof schema === 'string') {
    if (isUrl(schema)) {
      // remote url is dynamic
      return true;
    }
    if (isValidPath(schema)) {
      // local file path
      return false;
    }
    try {
      parse(schema);
      // valid AST
      return false;
    } catch (e) {
      // invalid AST
    }
  }
  // anything else is dynamic
  return true;
}
