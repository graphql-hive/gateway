import cluster from 'node:cluster';
import module from 'node:module';
import { platform, release } from 'node:os';
import { join } from 'node:path';
import {
  Command,
  InvalidArgumentError,
  Option,
} from '@commander-js/extra-typings';
import type {
  GatewayConfigContext,
  GatewayConfigProxy,
  GatewayConfigSubgraph,
  GatewayConfigSupergraph,
} from '@graphql-hive/gateway-runtime';
import type { JWTAuthPluginOptions } from '@graphql-mesh/plugin-jwt-auth';
import type { OpenTelemetryMeshPluginOptions } from '@graphql-mesh/plugin-opentelemetry';
import type { PrometheusPluginOptions } from '@graphql-mesh/plugin-prometheus';
import useMeshRateLimit from '@graphql-mesh/plugin-rate-limit';
import type { KeyValueCache, Logger, YamlConfig } from '@graphql-mesh/types';
import { DefaultLogger } from '@graphql-mesh/utils';
import parseDuration from 'parse-duration';
import { addCommands } from './commands/index';
import { createDefaultConfigPaths } from './config';
import { getMaxConcurrency } from './getMaxConcurrency';
import type { ServerConfig } from './servers/types';

export type GatewayCLIConfig = (
  | GatewayCLISupergraphConfig
  | GatewayCLISubgraphConfig
  | GatewayCLIProxyConfig
) &
  ServerConfig & {
    /**
     * Count of workers to spawn. Defaults to `os.availableParallelism()` when NODE_ENV
     * is "production", otherwise only one (the main) worker.
     */
    fork?: number;
    /**
     * GraphQL schema polling interval in milliseconds.
     *
     * If cache is provided in the config, the {@link supergraph} will be cached setting the TTL to this interval in seconds.
     *
     * @default 10_000
     */
    pollingInterval?: number;
  } & GatewayCLIBuiltinPluginConfig;

export interface GatewayCLISupergraphConfig
  extends Omit<GatewayConfigSupergraph, 'supergraph' | 'cache'> {
  /**
   * SDL, path or an URL to the Federation Supergraph.
   *
   * Alternatively, CDN options for pulling a remote Federation Supergraph.
   *
   * @default 'supergraph.graphql'
   */
  // default matches commands/supergraph.ts
  supergraph?: GatewayConfigSupergraph['supergraph'];
}

export interface GatewayCLISubgraphConfig
  extends Omit<GatewayConfigSubgraph, 'subgraph' | 'cache'> {
  /**
   * SDL, path or an URL to the Federation Supergraph.
   *
   * Alternatively, CDN options for pulling a remote Federation Supergraph.
   *
   * @default 'subgraph.graphql'
   */
  // default matches commands/subgraph.ts
  subgraph?: GatewayConfigSubgraph['subgraph'];
}

export interface GatewayCLIProxyConfig
  extends Omit<GatewayConfigProxy, 'proxy' | 'cache'> {
  /**
   * HTTP executor to proxy all incoming requests to another HTTP endpoint.
   */
  proxy?: GatewayConfigProxy['proxy'];
}

export interface GatewayCLIBuiltinPluginConfig {
  /**
   * Configure JWT Auth
   *
   * [Learn more](https://graphql-hive.com/docs/gateway/authorization-authentication)
   */
  jwt?: JWTAuthPluginOptions;
  /**
   * Configure Prometheus metrics
   *
   * [Learn more](https://graphql-hive.com/docs/gateway/monitoring-tracing)
   */
  prometheus?: Exclude<PrometheusPluginOptions, GatewayConfigContext>;
  /**
   * Configure OpenTelemetry
   *
   * [Learn more](https://graphql-hive.com/docs/gateway/monitoring-tracing)
   */
  openTelemetry?: Exclude<OpenTelemetryMeshPluginOptions, GatewayConfigContext>;
  /**
   * Configure Rate Limiting
   *
   * [Learn more](https://graphql-hive.com/docs/gateway/other-features/security/rate-limiting)
   */
  rateLimiting?: Exclude<
    Parameters<typeof useMeshRateLimit>[0],
    GatewayConfigContext
  >;
  /**
   * Enable Just-In-Time compilation of GraphQL documents.
   *
   * [Learn more](https://github.com/zalando-incubator/graphql-jit?tab=readme-ov-file#benchmarks)
   */
  jit?: boolean;
  cache?:
    | KeyValueCache
    | GatewayCLILocalforageCacheConfig
    | GatewayCLIRedisCacheConfig
    | GatewayCLICloudflareKVCacheConfig;
}

export type GatewayCLILocalforageCacheConfig = YamlConfig.LocalforageConfig & {
  type: 'localforage';
};

export type GatewayCLIRedisCacheConfig = YamlConfig.RedisConfig & {
  type: 'redis';
};

export type GatewayCLICloudflareKVCacheConfig =
  YamlConfig.CFWorkersKVCacheConfig & {
    type: 'cfw-kv';
  };

/**
 * Type helper for defining the config.
 */
export function defineConfig(config: GatewayCLIConfig) {
  return config;
}

/** The context of the running program. */
export interface CLIContext {
  /** @default new DefaultLogger() */
  log: Logger;
  /** @default 'Mesh Serve' */
  productName: string;
  /** @default 'Federated GraphQL Gateway' */
  productDescription: string;
  /** @default '@graphql-hive/gateway' */
  productPackageName: string;
  /** @default 'Hive Gateway logo' */
  productLogo?: string;
  /** @default https://the-guild.dev/graphql/hive/docs/gateway */
  productLink: string;
  /** @default 'hive-gateway' */
  /**
   * A safe binary executable name, should not contain any special
   * characters or white-spaces.
   *
   * @default 'hive-gateway'
   */
  binName: string;
  /** @default 'gateway.config' */
  configFileName: string;
  /** @default globalThis.__VERSION__ */
  version: string;
}

/** Inferred program options from the root command {@link cli}. */
export type CLIGlobals = CLI extends Command<any, infer O> ? O : never;

export type CLI = typeof cli;

export type AddCommand = (ctx: CLIContext, cli: CLI) => void;

// we dont use `Option.default()` in the command definitions because we want the CLI options to
// override the config file (with option defaults, config file will always be overwritten)
const maxFork = getMaxConcurrency();
export const defaultOptions = {
  fork: process.env['NODE_ENV'] === 'production' ? maxFork : 1,
  host:
    platform().toLowerCase() === 'win32' ||
    // is WSL?
    release().toLowerCase().includes('microsoft')
      ? '127.0.0.1'
      : '0.0.0.0',
  port: 4000,
  polling: '10s',
};

/** Root cli for the gateway. */
let cli = new Command()
  .configureHelp({
    // will print help of global options for each command
    showGlobalOptions: true,
  })
  .addOption(
    new Option(
      '--fork <count>',
      `count of workers to spawn. uses "${maxFork}" (available parallelism) workers when NODE_ENV is "production", otherwise "1" (the main) worker (default: ${JSON.stringify(defaultOptions.fork)}`,
    )
      .env('FORK')
      .argParser((v) => {
        const count = parseInt(v);
        if (isNaN(count)) {
          throw new InvalidArgumentError('not a number.');
        }
        if (count > maxFork) {
          throw new InvalidArgumentError(
            `exceedes number of available parallelism "${maxFork}".`,
          );
        }
        return count;
      }),
  )
  .addOption(
    new Option(
      '-c, --config-path <path>',
      `path to the configuration file. defaults to the following files respectively in the current working directory: ${createDefaultConfigPaths('gateway').join(', ')}`,
    ).env('CONFIG_PATH'),
  )
  .option(
    '-h, --host <hostname>',
    `host to use for serving (default: ${JSON.stringify(defaultOptions.host)}`,
    defaultOptions.host,
  )
  .addOption(
    new Option(
      '-p, --port <number>',
      `port to use for serving (default: ${JSON.stringify(defaultOptions.port)}`,
    )
      .env('PORT')
      .argParser((v) => {
        const port = parseInt(v);
        if (isNaN(port)) {
          throw new InvalidArgumentError('not a number.');
        }
        return port;
      }),
  )
  .addOption(
    new Option(
      '--polling <duration>',
      `schema polling interval in human readable duration (default: ${JSON.stringify(defaultOptions.polling)})`,
    )
      .default(parseDuration(defaultOptions.polling))
      .env('POLLING')
      .argParser((v) => {
        const interval = parseDuration(v);
        if (!interval) {
          throw new InvalidArgumentError('not a duration.');
        }
        return interval;
      }),
  )
  .option('--no-masked-errors', "don't mask unexpected errors in responses")
  .option(
    '--masked-errors',
    'mask unexpected errors in responses (default: true)',
    // we use "null" intentionally so that we know when the user provided the flag vs when not
    // see here https://github.com/tj/commander.js/blob/970ecae402b253de691e6a9066fea22f38fe7431/lib/command.js#L655
    // @ts-expect-error
    null,
  )
  .addOption(
    new Option(
      '--hive-registry-token <token>',
      'Hive registry token for usage metrics reporting',
    ).env('HIVE_REGISTRY_TOKEN'),
  )
  .option(
    '--hive-persisted-documents-endpoint <endpoint>',
    '[EXPERIMENTAL] Hive CDN endpoint for fetching the persisted documents. requires the "--hive-persisted-documents-token <token>" option',
  )
  .option(
    '--hive-persisted-documents-token <token>',
    '[EXPERIMENTAL] Hive persisted documents CDN endpoint token. requires the "--hive-persisted-documents-endpoint <endpoint>" option',
  )
  .addOption(
    new Option(
      '--hive-cdn-endpoint <endpoint>',
      'Hive CDN endpoint for fetching the schema',
    ).env('HIVE_CDN_ENDPOINT'),
  )
  .addOption(
    new Option(
      '--hive-cdn-key <key>',
      'Hive CDN API key for fetching the schema. implies that the "schemaPathOrUrl" argument is a url',
    ).env('HIVE_CDN_KEY'),
  )
  .addOption(
    new Option(
      '--apollo-graph-ref <graphRef>',
      'Apollo graph ref of the managed federation graph (<YOUR_GRAPH_ID>@<VARIANT>)',
    ).env('APOLLO_GRAPH_REF'),
  )
  .addOption(
    new Option(
      '--apollo-key <apiKey>',
      'Apollo API key to use to authenticate with the managed federation up link',
    ).env('APOLLO_KEY'),
  )
  .option('--disable-websockets', 'Disable WebSockets support')
  .addOption(
    new Option(
      '--jit',
      'Enable Just-In-Time compilation of GraphQL documents',
    ).env('JIT'),
  );

export async function run(userCtx: Partial<CLIContext>) {
  const ctx: CLIContext = {
    log: new DefaultLogger(),
    productName: 'Hive Gateway',
    productDescription: 'Federated GraphQL Gateway',
    productPackageName: '@graphql-hive/gateway',
    productLink: 'https://the-guild.dev/graphql/hive/docs/gateway',
    binName: 'hive-gateway',
    configFileName: 'gateway.config',
    version: globalThis.__VERSION__ || 'dev',
    ...userCtx,
  };

  const { binName, productDescription, version } = ctx;
  cli = cli.name(binName).description(productDescription);
  cli.version(version);

  if (cluster.worker?.id) {
    ctx.log = ctx.log.child(`Worker #${cluster.worker.id}`);
  }

  addCommands(ctx, cli);

  return cli.parseAsync();
}

export function handleNodeWarnings() {
  const originalProcessEmitWarning = process.emitWarning.bind(process);
  process.emitWarning = function gatewayEmitWarning(
    warning: string | Error,
    ...opts: any[]
  ) {
    if (['1', 'y', 'yes', 't', 'true'].includes(String(process.env['DEBUG']))) {
      originalProcessEmitWarning(warning, ...opts);
    }
  };
}

export function enableModuleCachingIfPossible() {
  let cacheDir: string | undefined;
  if (globalThis.__PACKED_DEPS_PATH__) {
    cacheDir = join(globalThis.__PACKED_DEPS_PATH__, 'node-compile-cache');
  }
  if (module.enableCompileCache) {
    module.enableCompileCache(cacheDir);
  }
}
