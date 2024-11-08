import cluster from 'node:cluster';
import {
  createGatewayRuntime,
  type GatewayConfigProxy,
} from '@graphql-hive/gateway-runtime';
import { isUrl, PubSub } from '@graphql-mesh/utils';
import {
  defaultOptions,
  type AddCommand,
  type CLIContext,
  type CLIGlobals,
  type GatewayCLIConfig,
} from '../cli';
import {
  getBuiltinPluginsFromConfig,
  getCacheInstanceFromConfig,
  loadConfig,
} from '../config';
import { startServerForRuntime } from '../servers/startServerForRuntime';
import { handleFork } from './handleFork';

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
        hiveCdnEndpoint,
        hiveCdnKey,
        hiveRegistryToken,
        maskedErrors,
        polling,
        hivePersistedDocumentsEndpoint,
        hivePersistedDocumentsToken,
        ...opts
      } = this.optsWithGlobals<CLIGlobals>();
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
              'Hive CDN endpoint must be a URL when providing --hive-cdn-key but got ' +
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

      const pubsub = loadedConfig.pubsub || new PubSub();
      const cache = await getCacheInstanceFromConfig(loadedConfig, {
        pubsub,
        logger: ctx.log,
      });
      const builtinPlugins = await getBuiltinPluginsFromConfig(
        {
          ...loadedConfig,
          ...opts,
        },
        {
          logger: ctx.log,
          cache,
        },
      );

      const config: ProxyConfig = {
        ...defaultOptions,
        ...loadedConfig,
        ...opts,
        ...(hiveRegistryToken
          ? {
              reporting: {
                ...loadedConfig.reporting,
                type: 'hive',
                token: hiveRegistryToken,
              },
            }
          : {}),
        ...(polling ? { pollingInterval: polling } : {}),
        proxy,
        ...(schema ? { schema } : {}),
        logging: loadedConfig.logging ?? ctx.log,
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
          `error: polling interval duration too short, use at least 10 seconds\n`,
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

  log.info(`Proxying requests to ${config.proxy.endpoint}`);

  const runtime = createGatewayRuntime(config);

  await startServerForRuntime(runtime, {
    ...config,
    log,
  });
}
