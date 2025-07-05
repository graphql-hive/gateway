import cluster from 'node:cluster';
import {
  createGatewayRuntime,
  createLoggerFromLogging,
  type GatewayConfigProxy,
} from '@graphql-hive/gateway-runtime';
import { PubSub } from '@graphql-hive/pubsub';
import { isUrl } from '@graphql-mesh/utils';
import {
  defaultOptions,
  type AddCommand,
  type CLIContext,
  type GatewayCLIConfig,
} from '../cli';
import {
  getBuiltinPluginsFromConfig,
  getCacheInstanceFromConfig,
  loadConfig,
} from '../config';
import { startServerForRuntime } from '../servers/startServerForRuntime';
import { handleFork } from './handleFork';
import { handleOpenTelemetryConfig } from './handleOpenTelemetryConfig';
import { handleReportingConfig } from './handleReportingConfig';

export const addCommand: AddCommand = (ctx, cli) =>
  cli
    .command('proxy')
    .description(
      'serve a proxy to a GraphQL API and add additional features such as monitoring/tracing, caching, rate limiting, security, and more',
    )
    .argument('[endpoint]', 'URL of the endpoint GraphQL API to proxy')
    .option(
      '--schema <schemaPathOrUrl>',
      'path to the GraphQL schema file or a url from where to pull the schema',
    )
    .action(async function proxy(endpoint) {
      const {
        opentelemetry,
        opentelemetryExporterType,
        hiveCdnEndpoint,
        hiveCdnKey,
        hiveRegistryToken,
        hiveTarget,
        hiveUsageTarget,
        hiveAccessToken,
        hiveUsageAccessToken,
        hiveTraceAccessToken,
        maskedErrors,
        hivePersistedDocumentsEndpoint,
        hivePersistedDocumentsToken,
        ...opts
      } = this.optsWithGlobals();

      ctx.log.info(`Starting ${ctx.productName} ${ctx.version} in proxy mode`);

      await handleOpenTelemetryConfig(ctx, {
        openTelemetry: opentelemetry,
        openTelemetryExporterType: opentelemetryExporterType,
        hiveAccessToken,
        hiveTarget,
        hiveTraceAccessToken,
      });

      const loadedConfig = await loadConfig({
        log: ctx.log,
        configPath: opts.configPath,
        quiet: !cluster.isPrimary,
        configFileName: ctx.configFileName,
      });

      let proxy: GatewayConfigProxy['proxy'] | undefined;
      if (endpoint) {
        proxy = { endpoint };
      } else if ('proxy' in loadedConfig) {
        proxy = loadedConfig.proxy;
        // TODO: how to provide hive-cdn-key?
      }
      if (!proxy) {
        ctx.log.error(
          'Proxy endpoint not defined. Please provide it in the [endpoint] argument or in the config file.',
        );
        process.exit(1);
      }

      let schema: GatewayConfigProxy['schema'] | undefined;
      const hiveCdnEndpointOpt =
        // TODO: take schema from optsWithGlobals once https://github.com/commander-js/extra-typings/pull/76 is merged
        this.opts().schema || hiveCdnEndpoint;
      if (hiveCdnEndpointOpt) {
        if (hiveCdnKey) {
          if (!isUrl(hiveCdnEndpointOpt)) {
            ctx.log.error(
              'Endpoint must be a URL when providing --hive-cdn-key but got ' +
                hiveCdnEndpointOpt,
            );
            process.exit(1);
          }
          schema = {
            type: 'hive',
            endpoint: hiveCdnEndpointOpt, // see validation above
            key: hiveCdnKey,
          };
        } else {
          // TODO: take schema from optsWithGlobals once https://github.com/commander-js/extra-typings/pull/76 is merged
          schema = this.opts().schema;
        }
      } else if ('schema' in loadedConfig) {
        schema = loadedConfig.schema;
        // TODO: how to provide hive-cdn-key?
      }
      if (hiveCdnKey && !schema) {
        process.stderr.write(
          `error: option '--schema <schemaPathOrUrl>' is required when providing '--hive-cdn-key <key>'\n`,
        );
        process.exit(1);
      }

      const registryConfig: Pick<ProxyConfig, 'reporting'> = {};
      const reporting = handleReportingConfig(ctx, loadedConfig, {
        hiveRegistryToken,
        hiveTarget,
        hiveUsageTarget,
        hiveAccessToken,
        hiveUsageAccessToken,
        hiveTraceAccessToken,
        // proxy can only do reporting to hive registry
        apolloGraphRef: undefined,
        apolloKey: undefined,
      });
      if (reporting) {
        registryConfig.reporting = reporting;
      }

      const pubsub = loadedConfig.pubsub || new PubSub();
      const cwd = loadedConfig.cwd || process.cwd();
      if (loadedConfig.logging != null) {
        ctx.log = createLoggerFromLogging(loadedConfig.logging);
      }
      const cache = await getCacheInstanceFromConfig(loadedConfig, {
        pubsub,
        log: ctx.log,
        cwd,
      });
      const builtinPlugins = await getBuiltinPluginsFromConfig(
        {
          ...loadedConfig,
          ...opts,
          openTelemetry: opentelemetry
            ? { ...loadedConfig.openTelemetry, traces: true }
            : loadedConfig.openTelemetry,
        },
        {
          log: ctx.log,
          cache,
          pubsub,
          cwd,
        },
      );

      const config: ProxyConfig = {
        ...defaultOptions,
        ...loadedConfig,
        ...opts,
        pollingInterval:
          opts.polling ||
          ('pollingInterval' in loadedConfig
            ? loadedConfig.pollingInterval
            : undefined) ||
          defaultOptions.pollingInterval,
        ...registryConfig,
        proxy,
        schema,
        logging: ctx.log,
        productName: ctx.productName,
        productDescription: ctx.productDescription,
        productPackageName: ctx.productPackageName,
        productLink: ctx.productLink,
        ...(ctx.productLogo ? { productLogo: ctx.productLogo } : {}),
        pubsub,
        cache,
        plugins(ctx) {
          const userPlugins = loadedConfig.plugins?.(ctx) ?? [];
          return [...builtinPlugins, ...userPlugins];
        },
      };
      if (hivePersistedDocumentsEndpoint) {
        const token =
          hivePersistedDocumentsToken ||
          (loadedConfig.persistedDocuments &&
            'token' in loadedConfig.persistedDocuments &&
            loadedConfig.persistedDocuments.token);
        if (!token) {
          ctx.log.error(
            `Hive persisted documents needs a CDN token. Please provide it through the "--hive-persisted-documents-token <token>" option or the config.`,
          );
          process.exit(1);
        }
        config.persistedDocuments = {
          ...loadedConfig.persistedDocuments,
          type: 'hive',
          endpoint: hivePersistedDocumentsEndpoint,
          token,
        };
      }
      if (maskedErrors != null) {
        // overwrite masked errors from loaded config only when provided
        // @ts-expect-error maskedErrors is a boolean but incorrectly inferred
        config.maskedErrors = maskedErrors;
      }
      if (
        typeof config.pollingInterval === 'number' &&
        config.pollingInterval < 10_000
      ) {
        process.stderr.write(
          `error: polling interval duration too short ${config.pollingInterval}, use at least 10 seconds\n`,
        );
        process.exit(1);
      }
      return runProxy(ctx, config);
    });

export type ProxyConfig = GatewayConfigProxy & GatewayCLIConfig;

export async function runProxy({ log }: CLIContext, config: ProxyConfig) {
  if (handleFork(log, config)) {
    return;
  }

  const runtime = createGatewayRuntime(config);

  log.info({ endpoint: config.proxy.endpoint }, 'Loading schema');

  await runtime.getSchema();

  log.info({ endpoint: config.proxy.endpoint }, 'Proxying requests');

  await startServerForRuntime(runtime, {
    ...config,
    log,
  });
}
