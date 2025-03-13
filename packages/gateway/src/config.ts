import { lstat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  GatewayConfig,
  GatewayPlugin,
} from '@graphql-hive/gateway-runtime';
import type { KeyValueCache, Logger, MeshPubSub } from '@graphql-mesh/types';
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
        if (!importedConfig) {
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
    logger: Logger;
    pubsub: MeshPubSub;
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
    plugins.push(
      useOpenTelemetry({
        logger: ctx.logger,
        ...config.openTelemetry,
      }),
    );
  }

  if (config.rateLimiting) {
    const { default: useMeshRateLimit } = await import(
      '@graphql-mesh/plugin-rate-limit'
    );
    plugins.push(
      useMeshRateLimit({
        ...config.rateLimiting,
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

  return plugins;
}

/**
 * This is an internal API and might have breaking changes in the future.
 * So use it with caution.
 */
export async function getCacheInstanceFromConfig(
  config: GatewayCLIBuiltinPluginConfig,
  ctx: { logger: Logger; pubsub: MeshPubSub; cwd: string },
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
      ctx.logger.warn(
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
