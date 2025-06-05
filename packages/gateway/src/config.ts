import { lstat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  GatewayConfig,
  GatewayPlugin,
} from '@graphql-hive/gateway-runtime';
import { LegacyLogger, type Logger } from '@graphql-hive/logger';
import { HivePubSub } from '@graphql-hive/pubsub';
import type { KeyValueCache } from '@graphql-mesh/types';
import type { GatewayCLIBuiltinPluginConfig } from './cli';
import type { ServerConfig } from './servers/types';

export const defaultConfigExtensions = [
  '.ts',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
];

export const defaultConfigFileName = 'gateway.config';

export function createDefaultConfigPaths(configFileName: string) {
  return defaultConfigExtensions.map((ext) => `${configFileName}${ext}`);
}

export async function loadConfig<
  TContext extends Record<string, any> = Record<string, any>,
>(opts: {
  quiet?: boolean;
  log: Logger;
  configPath: string | null | undefined;
  configFileName: string;
}) {
  let importedConfig: Partial<
    GatewayConfig<TContext> & ServerConfig & GatewayCLIBuiltinPluginConfig
  > | null = null;

  if (!opts.configPath) {
    !opts.quiet && opts.log.debug(`Searching for default config files`);
    const configPaths = [
      ...createDefaultConfigPaths(defaultConfigFileName),
      ...createDefaultConfigPaths(opts.configFileName),
      // For backwards compatibility of Mesh Compose users
      ...createDefaultConfigPaths('mesh.config'),
    ];
    for (const configPath of configPaths) {
      const absoluteConfigPath = join(process.cwd(), configPath);
      const exists = await lstat(absoluteConfigPath)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        !opts.quiet &&
          opts.log.info(`Found default config file ${absoluteConfigPath}`);
        const importUrl = pathToFileURL(absoluteConfigPath).toString();
        const module = await import(importUrl);
        importedConfig = Object(module).gatewayConfig || null;
        if (!importedConfig && !configPath.includes('mesh.config')) {
          !opts.quiet &&
            opts.log.warn(
              `No "gatewayConfig" exported from config file at ${absoluteConfigPath}`,
            );
        }
        break;
      }
    }
  } else {
    // using user-provided config
    const configPath = isAbsolute(opts.configPath)
      ? opts.configPath
      : join(process.cwd(), opts.configPath);
    !opts.quiet && opts.log.info(`Loading config file at path ${configPath}`);
    const exists = await lstat(configPath)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      throw new Error(`Cannot find config file at ${configPath}`);
    }
    const importUrl = pathToFileURL(configPath).toString();
    const module = await import(importUrl);
    importedConfig = Object(module).gatewayConfig || null;
    if (!importedConfig) {
      throw new Error(
        `No "gatewayConfig" exported from config file at ${configPath}`,
      );
    }
  }
  if (importedConfig) {
    !opts.quiet && opts.log.info('Loaded config');
  } else {
    !opts.quiet && opts.log.debug('No config loaded');
  }

  // TODO: validate imported config

  return importedConfig || {};
}

/**
 * This is an internal API and might have breaking changes in the future.
 * So use it with caution.
 */
export async function getBuiltinPluginsFromConfig(
  config: GatewayCLIBuiltinPluginConfig,
  ctx: {
    cache: KeyValueCache;
    log: Logger;
    pubsub: HivePubSub;
    cwd: string;
  },
) {
  const plugins: GatewayPlugin[] = [];
  if (config.jwt) {
    const { useJWT } = await import('@graphql-mesh/plugin-jwt-auth');
    plugins.push(useJWT(config.jwt));
  }
  if (config.prometheus) {
    const { default: useMeshPrometheus } = await import(
      '@graphql-mesh/plugin-prometheus'
    );
    plugins.push(useMeshPrometheus(config.prometheus));
  }
  if (config.openTelemetry) {
    const { useOpenTelemetry } = await import(
      '@graphql-mesh/plugin-opentelemetry'
    );
    plugins.push(useOpenTelemetry({ ...config.openTelemetry, log: ctx.log }));
  }

  if (config.rateLimiting) {
    const { default: useMeshRateLimit } = await import(
      '@graphql-mesh/plugin-rate-limit'
    );
    plugins.push(
      useMeshRateLimit({
        config: Array.isArray(config.rateLimiting)
          ? config.rateLimiting
          : typeof config.rateLimiting === 'object'
            ? config.rateLimiting.config
            : [],
        cache: ctx.cache,
      }),
    );
  }

  if (config.jit) {
    const { useJIT } = await import('@graphql-mesh/plugin-jit');
    plugins.push(useJIT());
  }

  if (config.awsSigv4) {
    const { useAWSSigv4 } = await import('@graphql-hive/plugin-aws-sigv4');
    plugins.push(useAWSSigv4(config.awsSigv4));
  }

  if (config.maxTokens) {
    const { maxTokensPlugin: useMaxTokens } = await import(
      '@escape.tech/graphql-armor-max-tokens'
    );
    const maxTokensPlugin = useMaxTokens({
      n: config.maxTokens === true ? 1000 : config.maxTokens,
    });
    plugins.push(
      // @ts-expect-error the armor plugin does not inherit the context
      maxTokensPlugin,
    );
  }

  if (config.maxDepth) {
    const { maxDepthPlugin: useMaxDepth } = await import(
      '@escape.tech/graphql-armor-max-depth'
    );
    const maxDepthPlugin = useMaxDepth({
      n: config.maxDepth === true ? 6 : config.maxDepth,
    });
    plugins.push(
      // @ts-expect-error the armor plugin does not inherit the context
      maxDepthPlugin,
    );
  }

  if (config.blockFieldSuggestions) {
    const { blockFieldSuggestionsPlugin: useBlockFieldSuggestions } =
      await import('@escape.tech/graphql-armor-block-field-suggestions');
    const blockFieldSuggestionsPlugin = useBlockFieldSuggestions();
    plugins.push(
      // @ts-expect-error the armor plugin does not inherit the context
      blockFieldSuggestionsPlugin,
    );
  }

  return plugins;
}

/**
 * This is an internal API and might have breaking changes in the future.
 * So use it with caution.
 */
export async function getCacheInstanceFromConfig(
  config: GatewayCLIBuiltinPluginConfig,
  ctx: { log: Logger; pubsub: HivePubSub; cwd: string },
): Promise<KeyValueCache> {
  if (typeof config.cache === 'function') {
    return config.cache(ctx);
  }

  if (config.cache && 'type' in config.cache) {
    switch (config.cache.type) {
      case 'redis': {
        const { default: RedisCache } = await import(
          '@graphql-mesh/cache-redis'
        );
        return new RedisCache({
          ...ctx,
          ...config.cache,
          // TODO: use new logger
          logger: LegacyLogger.from(ctx.log),
        }) as KeyValueCache;
      }
      case 'cfw-kv': {
        const { default: CloudflareKVCacheStorage } = await import(
          '@graphql-mesh/cache-cfw-kv'
        );
        return new CloudflareKVCacheStorage({
          ...ctx,
          ...config.cache,
        });
      }
      case 'upstash-redis': {
        const { default: UpstashRedisCache } = await import(
          '@graphql-mesh/cache-upstash-redis'
        );
        return new UpstashRedisCache({
          ...ctx,
          ...config.cache,
        });
      }
    }
    if (config.cache.type !== 'localforage') {
      ctx.log.warn(
        'Unknown cache type, falling back to localforage',
        config.cache,
      );
    }
    const { default: LocalforageCache } = await import(
      '@graphql-mesh/cache-localforage'
    );
    return new LocalforageCache({
      ...ctx,
      ...config.cache,
    });
  }
  if (config.cache) {
    return config.cache as KeyValueCache;
  }
  const { default: LocalforageCache } = await import(
    '@graphql-mesh/cache-localforage'
  );
  return new LocalforageCache(ctx);
}
