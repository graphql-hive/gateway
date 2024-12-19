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
  UnifiedGraphManagerOptions,
} from '@graphql-mesh/fusion-runtime';
import {
  getOnSubgraphExecute,
  getStitchingDirectivesTransformerForSubschema,
  handleFederationSubschema,
  handleResolveToDirectives,
  restoreExtraDirectives,
  UnifiedGraphManager,
} from '@graphql-mesh/fusion-runtime';
import { useHmacUpstreamSignature } from '@graphql-mesh/hmac-upstream-signature';
import useMeshHive from '@graphql-mesh/plugin-hive';
import useMeshResponseCache from '@graphql-mesh/plugin-response-cache';
import type { Logger, OnDelegateHook, OnFetchHook } from '@graphql-mesh/types';
import {
  DefaultLogger,
  getHeadersObj,
  getInContextSDK,
  isUrl,
  LogLevel,
  wrapFetchWithHooks,
} from '@graphql-mesh/utils';
import { batchDelegateToSchema } from '@graphql-tools/batch-delegate';
import {
  delegateToSchema,
  type SubschemaConfig,
} from '@graphql-tools/delegate';
import { fetchSupergraphSdlFromManagedFederation } from '@graphql-tools/federation';
import {
  asArray,
  getDirectiveExtensions,
  IResolvers,
  isDocumentNode,
  isValidPath,
  mapMaybePromise,
  mergeDeep,
  parseSelectionSet,
  type Executor,
  type MaybePromise,
  type TypeSource,
} from '@graphql-tools/utils';
import { schemaFromExecutor, wrapSchema } from '@graphql-tools/wrap';
import { useCSRFPrevention } from '@graphql-yoga/plugin-csrf-prevention';
import { useDeferStream } from '@graphql-yoga/plugin-defer-stream';
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations';
import {
  AsyncDisposableStack,
  DisposableSymbols,
} from '@whatwg-node/disposablestack';
import {
  buildSchema,
  GraphQLSchema,
  isSchema,
  parse,
  type ExecutionArgs,
} from 'graphql';
import {
  createYoga,
  isAsyncIterable,
  mergeSchemas,
  useExecutionCancellation,
  useReadinessCheck,
  type LandingPageRenderer,
  type YogaServerInstance,
} from 'graphql-yoga';
import type { GraphiQLOptions, PromiseOrValue } from 'graphql-yoga';
import { getProxyExecutor } from './getProxyExecutor';
import { getReportingPlugin } from './getReportingPlugin';
import {
  getUnifiedGraphSDL,
  handleUnifiedGraphConfig,
} from './handleUnifiedGraphConfig';
import landingPageHtml from './landing-page-html';
import { useChangingSchema } from './plugins/useChangingSchema';
import { useCompleteSubscriptionsOnDispose } from './plugins/useCompleteSubscriptionsOnDispose';
import { useCompleteSubscriptionsOnSchemaChange } from './plugins/useCompleteSubscriptionsOnSchemaChange';
import { useContentEncoding } from './plugins/useContentEncoding';
import { useCustomAgent } from './plugins/useCustomAgent';
import { useDelegationPlanDebug } from './plugins/useDelegationPlanDebug';
import { useFetchDebug } from './plugins/useFetchDebug';
import { usePropagateHeaders } from './plugins/usePropagateHeaders';
import { useRequestId } from './plugins/useRequestId';
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
  UnifiedGraphConfig,
} from './types';
import { checkIfDataSatisfiesSelectionSet, defaultQueryText } from './utils';

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
  let logger: Logger;
  if (config.logging == null) {
    logger = new DefaultLogger();
  } else if (typeof config.logging === 'boolean') {
    logger = config.logging
      ? new DefaultLogger()
      : new DefaultLogger('', LogLevel.silent);
  } else if (typeof config.logging === 'number') {
    logger = new DefaultLogger(undefined, config.logging);
  } /*  if (typeof config.logging === 'object') */ else {
    logger = config.logging;
  }

  const onFetchHooks: OnFetchHook<GatewayContext>[] = [];
  const wrappedFetchFn = wrapFetchWithHooks(onFetchHooks);

  const configContext: GatewayConfigContext = {
    fetch: wrappedFetchFn,
    logger,
    cwd: config.cwd || (typeof process !== 'undefined' ? process.cwd() : ''),
    ...('cache' in config ? { cache: config.cache } : {}),
    ...('pubsub' in config ? { pubsub: config.pubsub } : {}),
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
  let setSchema: (schema: GraphQLSchema) => void = (schema) => {
    unifiedGraph = schema;
  };
  let contextBuilder: <T>(context: T) => MaybePromise<T>;
  let readinessChecker: () => MaybePromise<boolean>;
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
    persistedDocumentsPlugin = useMeshHive({
      ...configContext,
      logger: configContext.logger.child('Hive'),
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
    });
    function createExecuteFnFromExecutor(executor: Executor) {
      return function executeFn(args: ExecutionArgs) {
        return executor({
          rootValue: args.rootValue,
          document: args.document,
          ...(args.operationName ? { operationName: args.operationName } : {}),
          ...(args.variableValues ? { variables: args.variableValues } : {}),
          ...(args.contextValue ? { context: args.contextValue } : {}),
        });
      };
    }
    const executeFn = createExecuteFnFromExecutor(proxyExecutor);

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
        logger: configContext.logger.child('Hive CDN'),
      });
      schemaFetcher = function fetchSchemaFromCDN() {
        pausePolling();
        initialFetch$ = mapMaybePromise(fetcher(), ({ sdl }) => {
          if (lastFetchedSdl == null || lastFetchedSdl !== sdl) {
            unifiedGraph = buildSchema(sdl, {
              assumeValid: true,
              assumeValidSDL: true,
            });
            setSchema(unifiedGraph);
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
        initialFetch$ = mapMaybePromise(
          handleUnifiedGraphConfig(
            // @ts-expect-error TODO: what's up with type narrowing
            config.schema,
            configContext,
          ),
          (schema) => {
            setSchema(schema);
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
        return mapMaybePromise(
          schemaFromExecutor(proxyExecutor, configContext, {
            assumeValid: true,
          }),
          (schema) => {
            unifiedGraph = schema;
            setSchema(schema);
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
        return mapMaybePromise(initialFetch$, () => unifiedGraph);
      }
      return mapMaybePromise(schemaFetcher(), () => unifiedGraph);
    };
    const shouldSkipValidation =
      'skipValidation' in config ? config.skipValidation : false;
    const executorPlugin: GatewayPlugin = {
      onExecute({ setExecuteFn }) {
        setExecuteFn(executeFn);
      },
      onSubscribe({ setSubscribeFn }) {
        setSubscribeFn(executeFn);
      },
      onValidate({ params, setResult }) {
        if (shouldSkipValidation || !params.schema) {
          setResult([]);
        }
      },
      [DisposableSymbols.asyncDispose]() {
        pausePolling();
        return transportExecutorStack.disposeAsync();
      },
    };
    unifiedGraphPlugin = executorPlugin;
    readinessChecker = () => {
      const res$ = proxyExecutor({
        document: parse(`query ReadinessCheck { __typename }`),
      });
      return mapMaybePromise(
        res$,
        (res) => !isAsyncIterable(res) && !!res.data?.__typename,
      );
    };
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
        getSubschemaConfig$ = mapMaybePromise(
          handleUnifiedGraphConfig(subgraphInConfig, configContext),
          (newUnifiedGraph) => {
            unifiedGraph = newUnifiedGraph;
            unifiedGraph = restoreExtraDirectives(unifiedGraph);
            subschemaConfig = {
              name: getDirectiveExtensions(unifiedGraph)?.['transport']?.[0]?.[
                'subgraph'
              ],
              schema: unifiedGraph,
            };
            const transportEntryMap: Record<string, TransportEntry> = {};
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
            });
            subschemaConfig = handleFederationSubschema({
              subschemaConfig,
              transportEntryMap,
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
            const finalTypeDefs = handleResolveToDirectives(
              parse(/* GraphQL */ `
                type Query {
                  _entities(representations: [_Any!]!): [_Entity]!
                  _service: _Service!
                }

                scalar _Any
                ${entitiesDef}
                type _Service {
                  sdl: String
                }
              `),
              additionalTypeDefs,
              additionalResolvers,
            );
            additionalResolvers.push({
              Query: {
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
                          return mapMaybePromise(
                            batchDelegateToSchema({
                              schema: subschemaConfig,
                              ...(satisfiedEntryPoint.fieldName
                                ? { fieldName: satisfiedEntryPoint.fieldName }
                                : {}),
                              key: satisfiedEntryPoint.key(representation),
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
                          return mapMaybePromise(
                            delegateToSchema({
                              schema: subschemaConfig,
                              ...(satisfiedEntryPoint.fieldName
                                ? { fieldName: satisfiedEntryPoint.fieldName }
                                : {}),
                              args: satisfiedEntryPoint.args(representation),
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
                _service() {
                  return {
                    sdl() {
                      return getUnifiedGraphSDL(newUnifiedGraph);
                    },
                  };
                },
              },
            });
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
    getSchema = () => mapMaybePromise(getSubschemaConfig(), () => unifiedGraph);
    schemaInvalidator = () => {
      getSubschemaConfig$ = undefined;
    };
    unifiedGraphPlugin = {
      [DisposableSymbols.asyncDispose]() {
        return transportExecutorStack.disposeAsync();
      },
    };
  } /** 'supergraph' in config */ else {
    let unifiedGraphFetcher: UnifiedGraphManagerOptions<unknown>['getUnifiedGraph'];
    let supergraphLoadedPlace: string;

    if (typeof config.supergraph === 'object' && 'type' in config.supergraph) {
      if (config.supergraph.type === 'hive') {
        // hive cdn
        const { endpoint, key } = config.supergraph;
        supergraphLoadedPlace = 'Hive CDN <br>' + endpoint;
        const fetcher = createSupergraphSDLFetcher({
          endpoint,
          key,
          logger: configContext.logger.child('Hive CDN'),
        });
        unifiedGraphFetcher = () =>
          fetcher().then(({ supergraphSdl }) => supergraphSdl);
      } else if (config.supergraph.type === 'graphos') {
        const opts = config.supergraph;
        supergraphLoadedPlace =
          'GraphOS Managed Federation <br>' + opts.graphRef || '';
        let lastSeenId: string;
        let lastSupergraphSdl: string;
        let minDelayMS = config.pollingInterval || 0;
        unifiedGraphFetcher = () =>
          mapMaybePromise(
            fetchSupergraphSdlFromManagedFederation({
              graphRef: opts.graphRef,
              apiKey: opts.apiKey,
              upLink: opts.upLink,
              lastSeenId,
              // @ts-expect-error TODO: what's up with type narrowing
              fetch: configContext.fetch,
              loggerByMessageLevel: {
                ERROR(message) {
                  configContext.logger.child('GraphOS').error(message);
                },
                INFO(message) {
                  configContext.logger.child('GraphOS').info(message);
                },
                WARN(message) {
                  configContext.logger.child('GraphOS').warn(message);
                },
              },
            }),
            async (result) => {
              if (minDelayMS) {
                await new Promise((resolve) => setTimeout(resolve, minDelayMS));
              }
              if (
                result.minDelaySeconds &&
                result.minDelaySeconds > minDelayMS
              ) {
                minDelayMS = result.minDelaySeconds;
              }
              if ('error' in result) {
                configContext.logger
                  .child('GraphOS')
                  .error(result.error.message);
                return lastSupergraphSdl;
              }
              if ('id' in result) {
                lastSeenId = result.id;
              }
              if ('supergraphSdl' in result) {
                lastSupergraphSdl = result.supergraphSdl;
                return result.supergraphSdl;
              }
              if (lastSupergraphSdl) {
                throw new Error('Failed to fetch supergraph SDL');
              }
              return lastSupergraphSdl;
            },
          );
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
      onSchemaChange(unifiedGraph) {
        setSchema(unifiedGraph);
      },
      ...(config.transports ? { transports: config.transports } : {}),
      ...(config.transportEntries
        ? { transportEntryAdditions: config.transportEntries }
        : {}),
      ...(config.pollingInterval
        ? { pollingInterval: config.pollingInterval }
        : {}),
      transportContext: configContext,
      onDelegateHooks,
      onSubgraphExecuteHooks,
      onDelegationPlanHooks,
      onDelegationStageExecuteHooks,
      ...(config.additionalTypeDefs
        ? { additionalTypeDefs: config.additionalTypeDefs }
        : {}),
      ...((config.additionalResolvers
        ? { additionalResolvers: config.additionalResolvers }
        : {}) as IResolvers),
    });
    getSchema = () => unifiedGraphManager.getUnifiedGraph();
    readinessChecker = () =>
      mapMaybePromise(
        unifiedGraphManager.getUnifiedGraph(),
        (schema) => {
          if (!schema) {
            logger.debug(
              `Readiness check failed because supergraph has not been loaded yet or failed to load`,
            );
            return false;
          }
          logger.debug(
            `Readiness check passed because supergraph has been loaded already`,
          );
          return true;
        },
        (err) => {
          logger.debug(
            `Readiness check failed due to errors on loading supergraph:\n${err.stack || err.message}`,
          );
          logger.error(err);
          return false;
        },
      );
    schemaInvalidator = () => unifiedGraphManager.invalidateUnifiedGraph();
    contextBuilder = (base) => unifiedGraphManager.getContext(base as any);
    unifiedGraphPlugin = {
      [DisposableSymbols.asyncDispose]() {
        return unifiedGraphManager[DisposableSymbols.asyncDispose]();
      },
    };
    subgraphInformationHTMLRenderer = async () => {
      const htmlParts: string[] = [];
      let loaded = false;
      let loadError!: unknown;
      let transportEntryMap: Record<string, TransportEntry> = {};
      try {
        transportEntryMap = await unifiedGraphManager.getTransportEntryMap();
        loaded = true;
      } catch (e) {
        loaded = false;
        loadError = e;
      }
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
    };
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
    onPluginInit({ plugins }) {
      onFetchHooks.splice(0, onFetchHooks.length);
      onSubgraphExecuteHooks.splice(0, onSubgraphExecuteHooks.length);
      onDelegateHooks.splice(0, onDelegateHooks.length);
      for (const plugin of plugins as GatewayPlugin[]) {
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
      }
    },
  };

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
    // @ts-expect-error PromiseLike is not compatible with Promise
    graphiqlOptionsOrFactory = function graphiqlOptionsFactoryForMesh(...args) {
      const options = userGraphiqlFactory(...args);
      return mapMaybePromise(options, (resolvedOpts) => {
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
      });
    };
  }

  let landingPageRenderer!: LandingPageRenderer | boolean;

  if (config.landingPage == null || config.landingPage === true) {
    landingPageRenderer = async function gatewayLandingPageRenderer(opts) {
      const subgraphHtml = await subgraphInformationHTMLRenderer();
      return new opts.fetchAPI.Response(
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
      );
    };
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
    useChangingSchema(getSchema, (_setSchema) => {
      setSchema = _setSchema;
    }),
    useCompleteSubscriptionsOnDispose(),
    useCompleteSubscriptionsOnSchemaChange(),
    useRequestId(),
  ];

  logger.debug(() => {
    basePlugins.push(
      useSubgraphExecuteDebug(configContext),
      useFetchDebug(configContext),
      useDelegationPlanDebug(configContext),
    );
    return 'Debug mode enabled';
  });

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

  const yoga = createYoga<any, GatewayContext & TContext>({
    fetchAPI: config.fetchAPI,
    logging: logger,
    plugins: [
      ...basePlugins,
      ...(config.plugins?.(configContext) || []),
      ...extraPlugins,
    ],
    // @ts-expect-error PromiseLike is not compatible with Promise
    context({ request, params, ...rest }) {
      // TODO: I dont like this cast, but it's necessary
      const { req, connectionParams } = rest as {
        req?: { headers?: Record<string, string> };
        connectionParams?: Record<string, string>;
      };
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
  });

  fetchAPI ||= yoga.fetchAPI;

  Object.defineProperties(yoga, {
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
    try {
      // sdl
      parse(schema);
      return false;
    } catch {}
  }
  // likely a dynamic schema that can be polled
  return true;
}
