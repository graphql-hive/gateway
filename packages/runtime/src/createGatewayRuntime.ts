import {
  getInstrumented,
  OnExecuteEventPayload,
  OnSubscribeEventPayload,
} from '@envelop/core';
import { useDisableIntrospection } from '@envelop/disable-introspection';
import { useGenericAuth } from '@envelop/generic-auth';
import { createCDNArtifactFetcher, joinUrl } from '@graphql-hive/core';
import { LegacyLogger } from '@graphql-hive/logger';
import type {
  OnDelegationPlanHook,
  OnDelegationStageExecuteHook,
  OnSubgraphExecuteHook,
} from '@graphql-mesh/fusion-runtime';
import { UnifiedGraphManager } from '@graphql-mesh/fusion-runtime';
import { useHmacUpstreamSignature } from '@graphql-mesh/hmac-upstream-signature';
import useMeshResponseCache from '@graphql-mesh/plugin-response-cache';
import { TransportContext } from '@graphql-mesh/transport-common';
import type { KeyValueCache, OnDelegateHook } from '@graphql-mesh/types';
import {
  dispose,
  getHeadersObj,
  isDisposable,
  isUrl,
} from '@graphql-mesh/utils';
import {
  IResolvers,
  isDocumentNode,
  isValidPath,
  type Executor,
} from '@graphql-tools/utils';
import { schemaFromExecutor } from '@graphql-tools/wrap';
import { useCSRFPrevention } from '@graphql-yoga/plugin-csrf-prevention';
import { useDeferStream } from '@graphql-yoga/plugin-defer-stream';
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations';
import { AsyncDisposableStack } from '@whatwg-node/disposablestack';
import { handleMaybePromise, MaybePromise } from '@whatwg-node/promise-helpers';
import { ServerAdapterPlugin } from '@whatwg-node/server';
import { useCookies } from '@whatwg-node/server-plugin-cookies';
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
  useExecutionCancellation,
  useReadinessCheck,
  Plugin as YogaPlugin,
  type GraphiQLOptionsOrFactory,
  type LandingPageRenderer,
  type YogaServerInstance,
} from 'graphql-yoga';
import { createLoggerFromLogging } from './createLoggerFromLogging';
import { createGraphOSFetcher } from './fetchers/graphos';
import { getProxyExecutor } from './getProxyExecutor';
import { getReportingPlugin } from './getReportingPlugin';
import {
  handleUnifiedGraphConfig,
  UnifiedGraphSchema,
} from './handleUnifiedGraphConfig';
import {
  iconBase64,
  html as landingPageHtml,
  logoSvg,
} from './landing-page.generated';
import { createPersistedDocumentsCache } from './persistedDocumentsCache';
import { useCacheDebug } from './plugins/useCacheDebug';
import { useConfigInServerContext } from './plugins/useConfigInServerContext';
import { useContentEncoding } from './plugins/useContentEncoding';
import { useCustomAgent } from './plugins/useCustomAgent';
import { useMaybeDelegationPlanDebug } from './plugins/useDelegationPlanDebug';
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
import { serveSubgraph } from './serveSubgraph';
import type {
  GatewayConfig,
  GatewayConfigContext,
  GatewayContext,
  GatewayHiveCDNOptions,
  GatewayPlugin,
  OnCacheDeleteHook,
  OnCacheGetHook,
  OnCacheSetHook,
  OnFetchHook,
  UnifiedGraphConfig,
} from './types';
import {
  defaultExtractPersistedOperationId,
  defaultQueryText,
  getExecuteFnFromExecutor,
  wrapCacheWithHooks,
} from './utils';
import { wrapFetchWithHooks } from './wrapFetchWithHooks';

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
  const log = createLoggerFromLogging(config.logging);

  let instrumentation: GatewayPlugin['instrumentation'];

  const onFetchHooks: OnFetchHook<GatewayContext>[] = [];
  const onCacheGetHooks: OnCacheGetHook[] = [];
  const onCacheSetHooks: OnCacheSetHook[] = [];
  const onCacheDeleteHooks: OnCacheDeleteHook[] = [];
  const wrappedFetchFn = wrapFetchWithHooks(
    onFetchHooks,
    log,
    () => instrumentation,
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
    log,
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
  let contextBuilder: <T>(context: T) => MaybePromise<T> | undefined;
  let readinessChecker: () => MaybePromise<boolean>;
  let getExecutor: (() => MaybePromise<Executor | undefined>) | undefined;
  let replaceSchema: (schema: GraphQLSchema) => void = (newSchema) => {
    unifiedGraph = newSchema;
  };
  let allowArbitraryDocumentsForPersistedDocuments:
    | boolean
    | ((request: Request) => MaybePromise<boolean>) = false;
  if (config.persistedDocuments?.allowArbitraryDocuments != null) {
    allowArbitraryDocumentsForPersistedDocuments =
      config.persistedDocuments?.allowArbitraryDocuments;
  } else if (config.persistedDocuments?.allowArbitraryOperations) {
    allowArbitraryDocumentsForPersistedDocuments =
      config.persistedDocuments?.allowArbitraryOperations;
  }
  // when using hive reporting and hive persisted documents,
  // this plugin will contain both the registry and the persisted
  // documents plugin
  const reportingWithMaybePersistedDocumentsPlugin = getReportingPlugin(
    config,
    configContext,
    allowArbitraryDocumentsForPersistedDocuments,
  );
  let persistedDocumentsPlugin: GatewayPlugin<GatewayContext> = {};
  if (
    config.reporting?.type !== 'hive' &&
    config.persistedDocuments &&
    'type' in config.persistedDocuments &&
    config.persistedDocuments?.type === 'hive'
  ) {
    // Create layer2 cache if configured (requires gateway cache to be available)
    const specifiedCacheOptions = [
      config.persistedDocuments.cacheTtlSeconds !== undefined &&
        'cacheTtlSeconds',
      config.persistedDocuments.cacheNotFoundTtlSeconds !== undefined &&
        'cacheNotFoundTtlSeconds',
      config.persistedDocuments.cacheKeyPrefix !== undefined &&
        'cacheKeyPrefix',
    ].filter(Boolean);
    const hasCacheConfig = specifiedCacheOptions.length > 0;
    if (hasCacheConfig && !configContext.cache) {
      configContext.log.warn(
        'Persisted documents cache options (%s) were specified but no gateway cache is configured. ' +
          'Cache will be disabled. Configure a cache using the "cache" option to enable caching.',
        specifiedCacheOptions.join(', '),
      );
    }
    const layer2Cache =
      hasCacheConfig && configContext.cache
        ? createPersistedDocumentsCache(
            {
              ttlSeconds: config.persistedDocuments.cacheTtlSeconds,
              notFoundTtlSeconds:
                config.persistedDocuments.cacheNotFoundTtlSeconds,
              keyPrefix: config.persistedDocuments.cacheKeyPrefix,
            },
            configContext.cache,
          )
        : undefined;

    const hiveConsolePlugin = useHiveConsole({
      ...configContext,
      enabled: false, // disables only usage reporting
      log: configContext.log.child('[useHiveConsole.persistedDocuments] '),
      experimental__persistedDocuments: {
        cdn: {
          endpoint: config.persistedDocuments.endpoint,
          accessToken: config.persistedDocuments.token,
        },
        circuitBreaker: config.persistedDocuments.circuitBreaker,
        // @ts-expect-error - Hive Console plugin options are not compatible yet
        allowArbitraryDocuments: allowArbitraryDocumentsForPersistedDocuments,
        layer2Cache,
      },
    });

    persistedDocumentsPlugin = hiveConsolePlugin;
  } else if (
    config.persistedDocuments &&
    'getPersistedOperation' in config.persistedDocuments
  ) {
    const plugin = usePersistedOperations<GatewayContext>({
      extractPersistedOperationId: defaultExtractPersistedOperationId,
      ...configContext,
      ...config.persistedDocuments,
      allowArbitraryOperations: allowArbitraryDocumentsForPersistedDocuments,
    });
    // @ts-expect-error the ServerContext does not match
    persistedDocumentsPlugin = plugin;
  }

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
        currentTimeout = setTimeout(schemaFetcher.fetch, pollingInterval);
      }
    }
    function pausePolling() {
      if (currentTimeout) {
        clearTimeout(currentTimeout);
      }
    }
    let lastFetchedSdl: string | undefined;
    let initialFetch$: MaybePromise<true>;
    let schemaFetcher: {
      fetch: () => MaybePromise<true>;
      dispose?: () => void | PromiseLike<void>;
    };

    if (
      config.schema &&
      typeof config.schema === 'object' &&
      'type' in config.schema
    ) {
      // hive cdn
      const { endpoint, key, circuitBreaker } = config.schema;
      function ensureSdl(endpoint: string): string {
        // the services path returns the sdl and the service name,
        // we only care about the sdl so always use the sdl
        endpoint = endpoint.replace(/\/services$/, '/sdl');
        if (!/\/sdl(\.graphql)*$/.test(endpoint)) {
          // ensure ends with /sdl
          endpoint = joinUrl(endpoint, 'sdl');
        }
        return endpoint;
      }
      const fetcher = createCDNArtifactFetcher({
        endpoint: Array.isArray(endpoint)
          ? // no endpoint.map just to make ts happy without casting
            [ensureSdl(endpoint[0]), ensureSdl(endpoint[1])]
          : ensureSdl(endpoint),
        accessKey: key,
        logger: configContext.log.child('[hiveSchemaFetcher] '),
        // @ts-expect-error - MeshFetch is not compatible with `typeof fetch`
        fetch: configContext.fetch,
        circuitBreaker,
        name: 'hive-gateway',
        version: globalThis.__VERSION__,
      });
      schemaFetcher = {
        fetch: function fetchSchemaFromCDN() {
          pausePolling();
          initialFetch$ = handleMaybePromise(
            fetcher.fetch,
            ({ contents }): true => {
              if (lastFetchedSdl == null || lastFetchedSdl !== contents) {
                unifiedGraph = buildSchema(contents, {
                  assumeValid: true,
                  assumeValidSDL: true,
                });
              }
              continuePolling();
              return true;
            },
          );
          return initialFetch$;
        },
        dispose: () => fetcher.dispose(),
      };
    } else if (config.schema) {
      // local or remote

      if (!isDynamicUnifiedGraphSchema(config.schema)) {
        // no polling for static schemas
        delete config.pollingInterval;
      }

      schemaFetcher = {
        fetch: function fetchSchema() {
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
        },
      };
    } else {
      // introspect endpoint
      schemaFetcher = {
        fetch: function fetchSchemaWithExecutor() {
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
          );
        },
      };
    }

    const instrumentedFetcher = schemaFetcher.fetch;
    schemaFetcher = {
      ...schemaFetcher,
      fetch: (...args) =>
        getInstrumented(null).asyncFn(
          instrumentation?.schema,
          instrumentedFetcher,
        )(...args),
    };

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
      return handleMaybePromise(schemaFetcher.fetch, () => unifiedGraph);
    };
    const shouldSkipValidation =
      'skipValidation' in config ? config.skipValidation : false;
    unifiedGraphPlugin = {
      onValidate({ params, setResult }) {
        if (shouldSkipValidation || !params.schema) {
          setResult([]);
        }
      },
      onDispose() {
        pausePolling();
        return handleMaybePromise(
          () => transportExecutorStack.disposeAsync(),
          () => schemaFetcher.dispose?.(),
        );
      },
    };
    readinessChecker = () =>
      handleMaybePromise(
        () =>
          proxyExecutor({
            document: parse(`query ReadinessCheck { __typename }`, {
              noLocation: true,
            }),
          }),
        (res) => !isAsyncIterable(res) && !!res.data?.__typename,
      );
    schemaInvalidator = () => {
      // @ts-expect-error TODO: this is illegal but somehow we want it
      unifiedGraph = undefined;
      initialFetch$ = schemaFetcher.fetch();
    };
  } else if ('subgraph' in config) {
    const result = serveSubgraph(
      config,
      configContext,
      () => unifiedGraph,
      (newUnifiedGraph) => {
        unifiedGraph = newUnifiedGraph;
      },
      onSubgraphExecuteHooks,
      onDelegateHooks,
      instrumentation,
    );
    getSchema = result.getSchema;
    schemaInvalidator = result.schemaInvalidator;
    unifiedGraphPlugin = result.unifiedGraphPlugin;
    contextBuilder = result.contextBuilder;
  } /** 'supergraph' in config */ else {
    let unifiedGraphFetcher: {
      fetch: (
        transportCtx: TransportContext,
      ) => MaybePromise<UnifiedGraphSchema>;
      dispose?: () => void | PromiseLike<void>;
    };

    if (typeof config.supergraph === 'object' && 'type' in config.supergraph) {
      if (config.supergraph.type === 'hive') {
        // hive cdn
        const { endpoint, key, circuitBreaker } = config.supergraph;
        function ensureSupergraph(endpoint: string): string {
          if (!/\/supergraph(\.graphql)*$/.test(endpoint)) {
            // ensure ends with /supergraph
            endpoint = joinUrl(endpoint, 'supergraph');
          }
          return endpoint;
        }
        const fetcher = createCDNArtifactFetcher({
          endpoint: Array.isArray(endpoint)
            ? // no endpoint.map just to make ts happy without casting
              [ensureSupergraph(endpoint[0]), ensureSupergraph(endpoint[1])]
            : ensureSupergraph(endpoint),
          accessKey: key,
          logger: configContext.log.child('[hiveSupergraphFetcher] '),
          // @ts-expect-error - MeshFetch is not compatible with `typeof fetch`
          fetch: configContext.fetch,
          circuitBreaker,
          name: 'hive-gateway',
          version: globalThis.__VERSION__,
        });
        unifiedGraphFetcher = {
          fetch: () => fetcher.fetch().then(({ contents }) => contents),
          dispose: () => fetcher.dispose(),
        };
      } else if (config.supergraph.type === 'graphos') {
        const graphosFetcherContainer = createGraphOSFetcher({
          graphosOpts: config.supergraph,
          configContext,
          pollingInterval: config.pollingInterval,
        });
        unifiedGraphFetcher = {
          fetch: graphosFetcherContainer.unifiedGraphFetcher,
        };
      } else {
        unifiedGraphFetcher = {
          fetch: () => {
            throw new Error(
              `Unknown supergraph configuration: ${config.supergraph}`,
            );
          },
        };
      }
    } else {
      // local or remote
      if (!isDynamicUnifiedGraphSchema(config.supergraph)) {
        // no polling for static schemas
        log.debug(`Disabling polling for static supergraph`);
        delete config.pollingInterval;
      } else if (!config.pollingInterval) {
        log.debug(
          `Polling interval not set for supergraph, if you want to get updates of supergraph, we recommend setting a polling interval`,
        );
      }

      unifiedGraphFetcher = {
        fetch: () =>
          handleUnifiedGraphConfig(
            // @ts-expect-error TODO: what's up with type narrowing
            config.supergraph,
            configContext,
          ),
      };
    }

    const instrumentedGraphFetcher = unifiedGraphFetcher.fetch;
    unifiedGraphFetcher = {
      ...unifiedGraphFetcher,
      fetch: (...args) =>
        getInstrumented(null).asyncFn(
          instrumentation?.schema,
          instrumentedGraphFetcher,
        )(...args),
    };

    const unifiedGraphManager = new UnifiedGraphManager<GatewayContext>({
      handleUnifiedGraph: config.unifiedGraphHandler,
      getUnifiedGraph: unifiedGraphFetcher.fetch,
      onUnifiedGraphChange(newUnifiedGraph: GraphQLSchema) {
        unifiedGraph = newUnifiedGraph;
        replaceSchema(newUnifiedGraph);
      },
      transports: config.transports,
      transportEntryAdditions: config.transportEntries,
      pollingInterval: config.pollingInterval,
      transportContext: {
        ...configContext,
        logger: LegacyLogger.from(configContext.log),
      },
      onDelegateHooks,
      onSubgraphExecuteHooks,
      onDelegationPlanHooks,
      onDelegationStageExecuteHooks,
      additionalTypeDefs: config.additionalTypeDefs,
      additionalResolvers: config.additionalResolvers as IResolvers[],
      instrumentation: () => instrumentation,
      batch: config.__experimental__batchExecution,
      batchDelegateOptions: config.__experimental__batchDelegateOptions,
      handleProgressiveOverride: config.progressiveOverride,
    });
    getSchema = () => unifiedGraphManager.getUnifiedGraph();
    readinessChecker = () => {
      const log = configContext.log.child('[readiness] ');
      log.debug('checking');
      return handleMaybePromise(
        () => unifiedGraphManager.getUnifiedGraph(),
        (schema) => {
          if (!schema) {
            log.debug(
              'failed because supergraph has not been loaded yet or failed to load',
            );
            return false;
          }
          log.debug('passed');
          return true;
        },
        (err) => {
          log.error(err, 'loading supergraph failed due to errors');
          return false;
        },
      );
    };
    schemaInvalidator = () => unifiedGraphManager.invalidateUnifiedGraph();
    contextBuilder = (base) => unifiedGraphManager.getContext(base as any);
    getExecutor = () => unifiedGraphManager.getExecutor();
    unifiedGraphPlugin = {
      onDispose() {
        return handleMaybePromise(
          () => dispose(unifiedGraphManager),
          () => unifiedGraphFetcher.dispose?.(),
        );
      },
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
    config.productDescription ||
    'Unify and accelerate your data graph across diverse services with Hive Gateway, which seamlessly integrates with Apollo Federation.';
  const productPackageName =
    config.productPackageName || '@graphql-hive/gateway';
  const productLink =
    config.productLink || 'https://the-guild.dev/graphql/hive/docs/gateway';

  let graphiqlOptionsOrFactory!: GraphiQLOptionsOrFactory<unknown> | false;
  const graphiqlLogo = `<div style="height: 20px;display: flex;margin: 0 5px 0 auto">${logoSvg}</div>`;

  if (config.graphiql == null || config.graphiql === true) {
    graphiqlOptionsOrFactory = {
      title: productName,
      logo: graphiqlLogo,
      favicon: `data:image/png;base64,${iconBase64}`,
      defaultQuery: defaultQueryText,
    };
  } else if (config.graphiql === false) {
    graphiqlOptionsOrFactory = false;
  } else if (typeof config.graphiql === 'object') {
    graphiqlOptionsOrFactory = {
      title: productName,
      logo: graphiqlLogo,
      favicon: `data:image/png;base64,${iconBase64}`,
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
              logo: graphiqlLogo,
              defaultQuery: defaultQueryText,
            };
          }
          return {
            title: productName,
            logo: graphiqlLogo,
            favicon: `data:image/png;base64,${iconBase64}`,
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
      new opts.fetchAPI.Response(
        landingPageHtml
          .replace(/__GRAPHIQL_PATHNAME__/g, opts.graphqlEndpoint)
          .replace(/__REQUEST_PATHNAME__/g, opts.url.pathname)
          .replace(/__GRAPHQL_URL__/g, opts.url.origin + opts.graphqlEndpoint)
          .replaceAll(/__PRODUCT_NAME__/g, productName)
          .replaceAll(/__PRODUCT_DESCRIPTION__/g, productDescription)
          .replaceAll(/__PRODUCT_PACKAGE_NAME__/g, productPackageName)
          .replace(/__PRODUCT_LINK__/, productLink),
        {
          status: 200,
          statusText: 'OK',
          headers: {
            'Content-Type': 'text/html',
          },
        },
      );
  } else if (typeof config.landingPage === 'function') {
    landingPageRenderer = config.landingPage;
  } else if (config.landingPage === false) {
    landingPageRenderer = false;
  }

  const basePlugins: (
    | ServerAdapterPlugin<any>
    | YogaPlugin<any>
    | GatewayPlugin<any>
  )[] = [
    useConfigInServerContext({ configContext }),
    defaultGatewayPlugin,
    unifiedGraphPlugin,
    readinessCheckPlugin,
    persistedDocumentsPlugin,
    reportingWithMaybePersistedDocumentsPlugin,
    useRetryOnSchemaReload(),
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

  const extraPlugins: (
    | ServerAdapterPlugin<any>
    | YogaPlugin<any>
    | GatewayPlugin<any>
  )[] = [];

  if (config.webhooks) {
    extraPlugins.push(useWebhooks(configContext));
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
    if ('proxy' in config && config.schema == null) {
      log.warn(
        [
          '`demandControl` is enabled in proxy mode without a defined schema',
          'If you use directives like "@cost" or "@listSize", these won\'t be available for cost calculation.',
          'You have to define "schema" in the gateway config to make them available.',
        ].join(' '),
      );
    }
    extraPlugins.push(useDemandControl(config.demandControl));
  }

  if (config.cookies) {
    extraPlugins.push(useCookies());
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

  // we load the debug plugins, but they wont log unless the log level is set to debug
  // this allows for dynamic log level switching without needing a server restart
  extraPlugins.push(
    useSubgraphExecuteDebug(),
    useFetchDebug(),
    useMaybeDelegationPlanDebug({ log: configContext.log }),
    useCacheDebug({ log: configContext.log }),
  );

  const yoga = createYoga({
    // @ts-expect-error Types???
    schema: unifiedGraph,
    // @ts-expect-error MeshFetch is not compatible with YogaFetch
    fetchAPI: config.fetchAPI,
    logging: LegacyLogger.from(log),
    plugins: [
      ...basePlugins,
      ...extraPlugins,
      ...(config.plugins?.(configContext) || []),
    ],
    context(ctx) {
      // @ts-expect-error - ctx.headers might be present
      if (!ctx.headers) {
        // context will change, for example: when we have an operation happening over WebSockets,
        // there wont be a fetch Request - there'll only be the upgrade http node request
        ctx['headers'] = getHeadersObj(
          ctx['req']?.headers || ctx?.request?.headers,
        );
      }
      if (ctx['connectionParams']) {
        ctx['headers'] = { ...ctx['headers'], ...ctx['connectionParams'] };
      }
      return contextBuilder?.(ctx) ?? ctx;
    },
    cors: config.cors,
    graphiql: graphiqlOptionsOrFactory,
    renderGraphiQL: config.renderGraphiQL,
    batching: config.batching,
    graphqlEndpoint: config.graphqlEndpoint,
    maskedErrors: config.maskedErrors,
    healthCheckEndpoint: config.healthCheckEndpoint || '/healthcheck',
    landingPage: landingPageRenderer,
    disposeOnProcessTerminate: true,
    multipart: config.multipart ?? false,
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
      parse(schema, { noLocation: true });
      // valid AST
      return false;
    } catch (e) {
      // invalid AST
    }
  }
  // anything else is dynamic
  return true;
}
