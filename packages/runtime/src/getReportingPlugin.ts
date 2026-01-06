import { MaybePromise } from '@graphql-tools/utils';
import { useApolloUsageReport } from '@graphql-yoga/plugin-apollo-usage-report';
import { createPersistedDocumentsCache } from './persistedDocumentsCache';
import useHiveConsole, {
  HiveConsolePluginOptions,
} from './plugins/useHiveConsole';
import type {
  GatewayConfig,
  GatewayConfigContext,
  GatewayPlugin,
} from './types';

export function getReportingPlugin<TContext extends Record<string, any>>(
  config: GatewayConfig<TContext>,
  configContext: GatewayConfigContext,
  allowArbitraryDocuments:
    | boolean
    | ((request: Request) => MaybePromise<boolean>) = false,
): GatewayPlugin<TContext> {
  if (config.reporting?.type === 'hive') {
    const { target, ...reporting } = config.reporting;
    let usage: HiveConsolePluginOptions['usage'] = reporting.usage;
    if (usage === false) {
      // explicitly disabled, leave disabled
    } else {
      // user specified a target, extend the usage with the given target
      usage = {
        target,
        ...(typeof usage === 'object' ? { ...usage } : {}),
      };
    }

    // Create layer2 cache if configured (requires gateway cache to be available)
    const persistedDocs =
      config.persistedDocuments &&
      'type' in config.persistedDocuments &&
      config.persistedDocuments?.type === 'hive'
        ? config.persistedDocuments
        : undefined;
    const specifiedCacheOptions = [
      persistedDocs?.cacheTtlSeconds !== undefined && 'cacheTtlSeconds',
      persistedDocs?.cacheNotFoundTtlSeconds !== undefined &&
        'cacheNotFoundTtlSeconds',
      persistedDocs?.cacheKeyPrefix !== undefined && 'cacheKeyPrefix',
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
      persistedDocs && hasCacheConfig && configContext.cache
        ? createPersistedDocumentsCache(
            {
              ttlSeconds: persistedDocs.cacheTtlSeconds,
              notFoundTtlSeconds: persistedDocs.cacheNotFoundTtlSeconds,
              keyPrefix: persistedDocs.cacheKeyPrefix,
            },
            configContext.cache,
            configContext.log.child('[persistedDocumentsCache] '),
          )
        : undefined;

    const hiveConsolePlugin = useHiveConsole({
      log: configContext.log.child('[useHiveConsole] '),
      fetch: configContext.fetch,
      enabled: true,
      ...reporting,
      ...(usage ? { usage } : {}),
      ...(config.persistedDocuments &&
      'type' in config.persistedDocuments &&
      config.persistedDocuments?.type === 'hive'
        ? {
            experimental__persistedDocuments: {
              cdn: {
                endpoint: config.persistedDocuments.endpoint,
                accessToken: config.persistedDocuments.token,
              },
              circuitBreaker: config.persistedDocuments.circuitBreaker,
              allowArbitraryDocuments: allowArbitraryDocuments as boolean,
              layer2Cache,
            },
          }
        : {}),
    });

    return hiveConsolePlugin as GatewayPlugin<TContext>;
  } else if (
    config.reporting?.type === 'graphos' ||
    (!config.reporting &&
      'supergraph' in config &&
      typeof config.supergraph === 'object' &&
      'type' in config.supergraph &&
      config.supergraph.type === 'graphos')
  ) {
    if (
      'supergraph' in config &&
      typeof config.supergraph === 'object' &&
      'type' in config.supergraph &&
      config.supergraph.type === 'graphos'
    ) {
      if (!config.reporting) {
        config.reporting = {
          type: 'graphos',
          apiKey: config.supergraph.apiKey,
          graphRef: config.supergraph.graphRef,
        };
      } else {
        config.reporting.apiKey ||= config.supergraph.apiKey;
        config.reporting.graphRef ||= config.supergraph.graphRef;
      }
    }

    const plugin = useApolloUsageReport({
      agentVersion: `hive-gateway@${globalThis.__VERSION__}`,
      ...config.reporting,
    });

    // @ts-expect-error - TODO: Fix types
    return plugin;
  }
  return {};
}
