import cluster from 'node:cluster';
import { lstat, watch as watchFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { Option } from '@commander-js/extra-typings';
import {
  createGatewayRuntime,
  type GatewayConfigSupergraph,
  type GatewayGraphOSManagedFederationOptions,
  type GatewayHiveCDNOptions,
  type UnifiedGraphConfig,
} from '@graphql-hive/gateway-runtime';
import { PubSub } from '@graphql-hive/pubsub';
import { isUrl, registerTerminateHandler } from '@graphql-mesh/utils';
import { CodeFileLoader } from '@graphql-tools/code-file-loader';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { loadTypedefs } from '@graphql-tools/load';
import { asArray, isValidPath } from '@graphql-tools/utils';
import { getNodeEnv } from '~internal/env';
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
import { handleLoggingConfig } from './handleLoggingOption';
import { handleReportingConfig } from './handleReportingConfig';

export const addCommand: AddCommand = (ctx, cli) =>
  cli
    .command('supergraph')
    .description(
      'serve a Federation supergraph provided by a compliant composition tool such as Mesh Compose or Apollo Rover',
    )
    .argument(
      '[schemaPathOrUrl]',
      'path to the composed supergraph schema file or a url from where to pull the supergraph schema (default: "supergraph.graphql")',
    )
    .addOption(
      new Option(
        '--apollo-uplink <uplink>',
        'The URL of the managed federation up link. When retrying after a failure, you should cycle through the default up links using this option.',
      ).env('APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT'),
    )
    .action(async function supergraph(schemaPathOrUrl) {
      const {
        hiveCdnEndpoint,
        hiveCdnKey,
        hiveRegistryToken,
        hiveUsageTarget,
        hiveUsageAccessToken,
        maskedErrors,
        apolloGraphRef,
        apolloKey,
        hivePersistedDocumentsEndpoint,
        hivePersistedDocumentsToken,
        ...opts
      } = this.optsWithGlobals();

      // TODO: move to optsWithGlobals once https://github.com/commander-js/extra-typings/pull/76 is merged
      const { apolloUplink } = this.opts();

      const loadedConfig = await loadConfig({
        log: ctx.log,
        configPath: opts.configPath,
        quiet: !cluster.isPrimary,
        configFileName: ctx.configFileName,
      });

      let supergraph:
        | UnifiedGraphConfig
        | GatewayHiveCDNOptions
        | GatewayGraphOSManagedFederationOptions = 'supergraph.graphql';
      if (schemaPathOrUrl) {
        ctx.log.info(`Supergraph will be loaded from ${schemaPathOrUrl}`);
        if (hiveCdnKey) {
          ctx.log.info(`Using Hive CDN key`);
          if (!isUrl(schemaPathOrUrl)) {
            ctx.log.error(
              'Hive CDN endpoint must be a URL when providing --hive-cdn-key but got ' +
                schemaPathOrUrl,
            );
            process.exit(1);
          }
          supergraph = {
            type: 'hive',
            endpoint: schemaPathOrUrl,
            key: hiveCdnKey,
          };
        } else if (apolloKey) {
          ctx.log.info(`Using GraphOS API key`);
          if (!schemaPathOrUrl.includes('@')) {
            ctx.log.error(
              `Apollo GraphOS requires a graph ref in the format <graph-id>@<graph-variant> when providing --apollo-key. Please provide a valid graph ref not ${schemaPathOrUrl}.`,
            );
            process.exit(1);
          }
          supergraph = {
            type: 'graphos',
            apiKey: apolloKey,
            graphRef: schemaPathOrUrl,
            ...(apolloUplink ? { upLink: apolloUplink } : {}),
          };
        } else {
          supergraph = schemaPathOrUrl;
        }
      } else if (hiveCdnEndpoint) {
        if (!isUrl(hiveCdnEndpoint)) {
          ctx.log.error(
            `Hive CDN endpoint must be a valid URL but got ${hiveCdnEndpoint}. Please provide a valid URL.`,
          );
          process.exit(1);
        }
        if (!hiveCdnKey) {
          ctx.log.error(
            `Hive CDN requires an API key. Please provide an API key using the --hive-cdn-key option.` +
              `Learn more at https://the-guild.dev/graphql/hive/docs/features/high-availability-cdn#cdn-access-tokens`,
          );
          process.exit(1);
        }
        ctx.log.info(`Using Hive CDN endpoint: ${hiveCdnEndpoint}`);
        supergraph = {
          type: 'hive',
          endpoint: hiveCdnEndpoint,
          key: hiveCdnKey,
        };
      } else if (apolloGraphRef) {
        if (!apolloGraphRef.includes('@')) {
          ctx.log.error(
            `Apollo GraphOS requires a graph ref in the format <graph-id>@<graph-variant>. Please provide a valid graph ref not ${apolloGraphRef}.`,
          );
          process.exit(1);
        }
        if (!apolloKey) {
          ctx.log.error(
            `Apollo GraphOS requires an API key. Please provide an API key using the --apollo-key option.`,
          );
          process.exit(1);
        }
        ctx.log.info(`Using Apollo Graph Ref: ${apolloGraphRef}`);
        supergraph = {
          type: 'graphos',
          apiKey: apolloKey,
          graphRef: apolloGraphRef,
          upLink: apolloUplink,
        };
      } else if ('supergraph' in loadedConfig) {
        supergraph = loadedConfig.supergraph!; // TODO: assertion wont be necessary when exactOptionalPropertyTypes
        // TODO: how to provide hive-cdn-key?
      } else {
        ctx.log.info(`Using default supergraph location: ${supergraph}`);
      }

      const registryConfig: Pick<SupergraphConfig, 'reporting'> = {};
      const reporting = handleReportingConfig(ctx, loadedConfig, {
        hiveRegistryToken,
        hiveUsageTarget,
        hiveUsageAccessToken,
        apolloGraphRef: apolloGraphRef || schemaPathOrUrl,
        apolloKey,
      });
      if (reporting) {
        registryConfig.reporting = reporting;
      }

      const pubsub = loadedConfig.pubsub || new PubSub();
      const cwd = loadedConfig.cwd || process.cwd();
      if (loadedConfig.logging != null) {
        handleLoggingConfig(loadedConfig.logging, ctx);
      }
      const cache = await getCacheInstanceFromConfig(loadedConfig, {
        pubsub,
        logger: ctx.log,
        cwd,
      });
      const builtinPlugins = await getBuiltinPluginsFromConfig(
        {
          ...loadedConfig,
          ...opts,
        },
        {
          logger: ctx.log,
          cache,
          pubsub,
          cwd,
        },
      );

      const config: SupergraphConfig = {
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
        supergraph,
        logging: ctx.log,
        productName: ctx.productName,
        productDescription: ctx.productDescription,
        productPackageName: ctx.productPackageName,
        productLink: ctx.productLink,
        productLogo: ctx.productLogo,
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
      return runSupergraph(ctx, config);
    })
    .allowUnknownOption(getNodeEnv() === 'test')
    .allowExcessArguments(getNodeEnv() === 'test');

export type SupergraphConfig = GatewayConfigSupergraph & GatewayCLIConfig;

export async function runSupergraph(
  { log }: CLIContext,
  config: SupergraphConfig,
) {
  let absSchemaPath: string | null = null;
  if (
    typeof config.supergraph === 'string' &&
    isValidPath(config.supergraph) &&
    !isUrl(config.supergraph)
  ) {
    const supergraphPath = config.supergraph;
    absSchemaPath = isAbsolute(supergraphPath)
      ? String(supergraphPath)
      : resolve(process.cwd(), supergraphPath);
    log.info(`Reading supergraph from ${absSchemaPath}`);
    try {
      await lstat(absSchemaPath);
    } catch {
      log.error(
        `Could not read supergraph from ${absSchemaPath}. Make sure the file exists.`,
      );
      process.exit(1);
    }
  }

  if (absSchemaPath) {
    // Polling should not be enabled when watching the file
    delete config.pollingInterval;
    if (cluster.isPrimary) {
      log.info(`Watching ${absSchemaPath} for changes`);

      const ctrl = new AbortController();
      registerTerminateHandler((signal) => {
        log.info(`Closing watcher for ${absSchemaPath} on ${signal}`);
        return ctrl.abort(`Process terminated on ${signal}`);
      });

      (async function watcher() {
        for await (const f of watchFile(absSchemaPath, {
          signal: ctrl.signal,
        })) {
          if (f.eventType === 'rename') {
            // TODO: or should we just ignore?
            throw new Error(`Supergraph file was renamed to "${f.filename}"`);
          }
          log.info(`${absSchemaPath} changed. Invalidating supergraph...`);
          if (config.fork && config.fork > 1) {
            for (const workerId in cluster.workers) {
              cluster.workers[workerId]!.send('invalidateUnifiedGraph');
            }
          } else {
            // @ts-expect-error the runtime should've been created at this time
            runtime.invalidateUnifiedGraph();
          }
        }
      })()
        .catch((e) => {
          if (e.name === 'AbortError') return;
          log.error(`Watcher for ${absSchemaPath} closed with an error`, e);
        })
        .then(() => {
          log.info(`Watcher for ${absSchemaPath} successfuly closed`);
        });
    }
  }

  if (handleFork(log, config)) {
    return;
  }

  if (config.additionalTypeDefs) {
    const loaders = [new GraphQLFileLoader(), new CodeFileLoader()];
    const additionalTypeDefsArr = asArray(config.additionalTypeDefs);
    config.additionalTypeDefs = await Promise.all(
      additionalTypeDefsArr.flatMap(async (ptr) => {
        if (typeof ptr === 'string' && ptr.length <= 255 && isValidPath(ptr)) {
          const sources = await loadTypedefs(ptr, {
            loaders,
          });
          return sources.map((source) => {
            const typeSource =
              source.document || source.rawSDL || source.schema;
            if (!typeSource) {
              throw new Error(`Invalid source ${source.location || ptr}`);
            }
            return typeSource;
          });
        }
        return ptr;
      }),
    );
  }

  const runtime = createGatewayRuntime(config);

  if (absSchemaPath) {
    log.info(`Serving local supergraph from ${absSchemaPath}`);
  } else if (isUrl(String(config.supergraph))) {
    log.info(`Serving remote supergraph from ${config.supergraph}`);
  } else if (
    typeof config.supergraph === 'object' &&
    'type' in config.supergraph &&
    config.supergraph.type === 'hive'
  ) {
    log.info(
      `Serving supergraph from Hive CDN at ${config.supergraph.endpoint}`,
    );
  } else {
    log.info('Serving supergraph from config');
  }

  await startServerForRuntime(runtime, {
    ...config,
    log,
  });
}
