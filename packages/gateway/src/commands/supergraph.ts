import cluster from 'node:cluster';
import { lstat, watch as watchFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import {
  Command,
  InvalidArgumentError,
  Option,
} from '@commander-js/extra-typings';
import {
  createGatewayRuntime,
  createLoggerFromLogging,
  type DevFetcherTargetReference,
  type GatewayConfigSupergraph,
  type GatewayGraphOSManagedFederationOptions,
  type GatewayHiveCDNOptions,
  type GatewayHiveDevOptions,
  type HiveDevService,
  type UnifiedGraphConfig,
} from '@graphql-hive/gateway-runtime';
import { MemPubSub } from '@graphql-hive/pubsub';
import { isUrl, registerTerminateHandler } from '@graphql-mesh/utils';
import { CodeFileLoader } from '@graphql-tools/code-file-loader';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { loadTypedefs } from '@graphql-tools/load';
import { asArray, isValidPath } from '@graphql-tools/utils';
import { getEnvBool, getNodeEnv } from '~internal/env';
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
import { handleOpenTelemetryCLIOpts } from './handleOpenTelemetryCLIOpts';
import { handleReportingConfig } from './handleReportingConfig';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parses a `--dev-target` value into a {@link DevFetcherTargetReference}. Accepts either a
 * target UUID, or a "$organizationSlug/$projectSlug/$targetSlug" slug path.
 */
function parseDevTarget(target: string): DevFetcherTargetReference | null {
  if (UUID_RE.test(target)) {
    return { byId: target };
  }
  const parts = target.split('/');
  const [organizationSlug, projectSlug, targetSlug] = parts;
  if (parts.length !== 3 || !organizationSlug || !projectSlug || !targetSlug) {
    return null;
  }
  return { bySelector: { organizationSlug, projectSlug, targetSlug } };
}

/**
 * Parses a `<service-name>=<value>` option occurrence into a map keyed by service name. A name
 * repeated across occurrences of the same option overrides its previous value.
 */
function collectByServiceName(
  raw: string,
  previous: Record<string, string>,
): Record<string, string> {
  const eqIdx = raw.indexOf('=');
  const name = raw.slice(0, eqIdx).trim();
  if (eqIdx === -1 || !name) {
    throw new InvalidArgumentError(`invalid entry "${raw}", expected "<service-name>=<value>".`);
  }
  return { ...previous, [name]: raw.slice(eqIdx + 1).trim() };
}

const DEV_SERVICE_SOURCES = new Set(['federation', 'graphql', 'file']);

function collectDevServiceSource(
  raw: string,
  previous: Record<string, string>,
): Record<string, string> {
  const source = raw.slice(raw.indexOf('=') + 1).trim();
  if (!DEV_SERVICE_SOURCES.has(source)) {
    throw new InvalidArgumentError(
      `invalid source "${source}", expected "federation", "graphql" or "file".`,
    );
  }
  return collectByServiceName(raw, previous);
}

/**
 * Builds {@link HiveDevService} objects, one per key of `urlByName` (which is the set of dev
 * service names), overlaying the optional `sourceByName`/`schemaByName` for that name and erroring
 * out via `onError` on any inconsistency.
 */
function buildDevServices(
  urlByName: Record<string, string>,
  sourceByName: Record<string, string>,
  schemaByName: Record<string, string>,
  onError: (message: string) => never,
): HiveDevService[] {
  const names = Object.keys(urlByName);
  for (const name of [...Object.keys(sourceByName), ...Object.keys(schemaByName)]) {
    if (!(name in urlByName)) {
      onError(
        `--dev-service-source/--dev-service-schema references unknown service "${name}". ` +
          `Expected one of the services given via --dev-service-url: ${names.join(', ') || '(none)'}.`,
      );
    }
  }
  return names.map((name) => {
    const url = urlByName[name]!;
    const source = sourceByName[name];
    const schema = schemaByName[name];
    if (source === 'file') {
      if (!schema) {
        onError(
          `--dev-service-schema is required for service "${name}" (--dev-service-source file).`,
        );
      }
      return { name, url, source: 'file', schema };
    }
    if (schema) {
      onError(
        `--dev-service-schema is only valid when --dev-service-source is "file" (service "${name}").`,
      );
    }
    return {
      name,
      url,
      ...(source ? { source: source as 'federation' | 'graphql' } : {}),
    };
  });
}

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
    .addOption(
      new Option(
        '--hive-router-runtime',
        'Use the Hive Router runtime for query planning and execution (env: HIVE_ROUTER_RUNTIME)',
      ).env('HIVE_ROUTER_RUNTIME'),
    )
    .on('optionEnv:hive-router-runtime', function (this: Command) {
      // we need this because commanderjs only checks for the existence of the
      // variable, and not whether it is truthy (HIVE_ROUTER_RUNTIME=0 would be still true)
      // TODO: this should be done in commanderjs itself, raise an issue
      this.setOptionValueWithSource(
        'hiveRouterRuntime', // must be camelCase
        getEnvBool('HIVE_ROUTER_RUNTIME'),
        'env',
      );
    })
    .addOption(
      new Option(
        '--dev-remote',
        'Compose the dev supergraph remotely via the Hive registry instead of composing locally. Only applies when the supergraph source is a Hive dev fetcher (`supergraph: { type: "dev", ... }` in the config file).',
      ).env('DEV_REMOTE'),
    )
    .addOption(
      new Option(
        '--dev-registry <endpoint>',
        'Hive registry endpoint used for remote composition of a dev supergraph source. Requires --dev-remote and --dev-registry-token.',
      ).env('DEV_REGISTRY'),
    )
    .addOption(
      new Option(
        '--dev-registry-token <token>',
        'Hive registry access token used for remote composition of a dev supergraph source. Requires --dev-remote and --dev-registry.',
      ).env('DEV_REGISTRY_TOKEN'),
    )
    .addOption(
      new Option(
        '--dev-target <target>',
        'The target to compose against when using a dev supergraph source, as "$organizationSlug/$projectSlug/$targetSlug" or a target UUID.',
      ).env('DEV_TARGET'),
    )
    .addOption(
      new Option(
        '--dev-service-url <name>=<url>',
        'Add a service to the dev supergraph source, as "<service-name>=<url>". Repeat once per ' +
          'service. When provided, this defines the dev supergraph source services in full, ' +
          'overriding any "services" configured in the config file.',
      )
        .argParser(collectByServiceName)
        .default({} as Record<string, string>),
    )
    .addOption(
      new Option(
        '--dev-service-source <name>=<federation|graphql|file>',
        'How to obtain the schema for a dev supergraph source service, as "<service-name>=<source>": ' +
          '"federation" (default, via the federation `_service { sdl }` field), "graphql" (via ' +
          'introspection), or "file" (from a local SDL file, requires --dev-service-schema for the ' +
          'same service name). The service name must match one given via --dev-service-url.',
      )
        .argParser(collectDevServiceSource)
        .default({} as Record<string, string>),
    )
    .addOption(
      new Option(
        '--dev-service-schema <name>=<path>',
        'Path to a local SDL file for a dev supergraph source service, as "<service-name>=<path>". ' +
          'Required (and only valid) for a service using --dev-service-source file for the same ' +
          'service name.',
      )
        .argParser(collectByServiceName)
        .default({} as Record<string, string>),
    )
    .action(async function supergraph(schemaPathOrUrl) {
      const {
        opentelemetry,
        opentelemetryExporterType,
        hiveCdnEndpoint,
        hiveCdnKey,
        hiveRegistryToken,
        hiveUsageTarget,
        hiveTarget,
        hiveAccessToken,
        hiveUsageAccessToken,
        hiveTraceAccessToken,
        hiveTraceEndpoint,
        maskedErrors,
        apolloGraphRef,
        apolloKey,
        hivePersistedDocumentsEndpoint,
        hivePersistedDocumentsToken,
        hivePersistedDocumentsCacheTtl,
        hivePersistedDocumentsCacheNotFoundTtl,
        devRemote,
        devRegistry,
        devRegistryToken,
        devTarget,
        devServiceUrl,
        devServiceSource,
        devServiceSchema,
        ...opts
      } = this.optsWithGlobals();

      // TODO: move to optsWithGlobals once https://github.com/commander-js/extra-typings/pull/76 is merged
      const { apolloUplink } = this.opts();

      ctx.log.info(
        `Starting ${ctx.productName} ${ctx.version} with supergraph`,
      );

      const openTelemetryEnabledByCLI = await handleOpenTelemetryCLIOpts(ctx, {
        openTelemetry: opentelemetry,
        openTelemetryExporterType: opentelemetryExporterType,
        hiveAccessToken,
        hiveTarget,
        hiveTraceAccessToken,
        hiveTraceEndpoint,
      });

      const loadedConfig = await loadConfig({
        log: ctx.log,
        configPath: opts.configPath,
        quiet: !cluster.isPrimary,
        configFileName: ctx.configFileName,
      });

      let supergraph:
        | UnifiedGraphConfig
        | GatewayHiveCDNOptions
        | GatewayGraphOSManagedFederationOptions
        | GatewayHiveDevOptions = './supergraph.graphql';
      if (schemaPathOrUrl) {
        ctx.log.info(`Supergraph will be loaded from "${schemaPathOrUrl}"`);
        if (hiveCdnKey) {
          ctx.log.info('Using Hive CDN key');
          if (!isUrl(schemaPathOrUrl)) {
            ctx.log.error(
              `Hive CDN endpoint must be a URL when providing --hive-cdn-key but got "${schemaPathOrUrl}"`,
            );
            process.exit(1);
          }
          supergraph = {
            type: 'hive',
            endpoint: schemaPathOrUrl,
            key: hiveCdnKey,
          };
        } else if (apolloKey) {
          ctx.log.info('Using GraphOS API key');
          if (!schemaPathOrUrl.includes('@')) {
            ctx.log.error(
              `Apollo GraphOS requires a graph ref in the format <graph-id>@<graph-variant> when providing --apollo-key. Please provide a valid graph ref not "${schemaPathOrUrl}".`,
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
            `Hive CDN requires an API key. Please provide an API key using the --hive-cdn-key option. Learn more at https://the-guild.dev/graphql/hive/docs/features/high-availability-cdn#cdn-access-tokens`,
          );
          process.exit(1);
        }
        ctx.log.info(`Using Hive CDN endpoint ${hiveCdnEndpoint}`);
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
            'Apollo GraphOS requires an API key. Please provide an API key using the --apollo-key option.',
          );
          process.exit(1);
        }
        ctx.log.info(`Using Apollo Graph Ref ${apolloGraphRef}`);
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
        ctx.log.info(`Using default supergraph location "${supergraph}"`);
      }

      const onDevOptionError = (message: string): never => {
        ctx.log.error(message);
        return process.exit(1);
      };
      const devServices = buildDevServices(
        devServiceUrl,
        devServiceSource,
        devServiceSchema,
        onDevOptionError,
      );

      let devSupergraph: GatewayHiveDevOptions | undefined;
      if (typeof supergraph === 'object' && 'type' in supergraph && supergraph.type === 'dev') {
        devSupergraph = supergraph;
      } else if (devServices.length) {
        if (schemaPathOrUrl || hiveCdnEndpoint || apolloGraphRef) {
          onDevOptionError(
            '--dev-service-* options cannot be combined with a schema path/url, --hive-cdn-endpoint, or --apollo-graph-ref.',
          );
        }
        devSupergraph = { type: 'dev', services: [] };
        supergraph = devSupergraph;
      }

      if (devSupergraph) {
        if (devServices.length) {
          devSupergraph.services = devServices;
        }
        if (devRemote != null) {
          devSupergraph.remote = devRemote;
        }
        if (devRegistry) {
          devSupergraph.registry = devRegistry;
        }
        if (devRegistryToken) {
          devSupergraph.token = devRegistryToken;
        }
        if (devTarget) {
          const target = parseDevTarget(devTarget);
          if (!target) {
            onDevOptionError(
              `Invalid --dev-target "${devTarget}". Expected "$organizationSlug/$projectSlug/$targetSlug" or a UUID.`,
            );
          }
          devSupergraph.target = target;
        }
      } else if (
        devRemote != null ||
        devRegistry ||
        devRegistryToken ||
        devTarget ||
        devServices.length
      ) {
        onDevOptionError(
          'The --dev-* options require the supergraph source to be a Hive dev fetcher (`supergraph: { type: "dev", ... }` in the config file, or set via --dev-service-url).',
        );
      }

      const registryConfig: Pick<SupergraphConfig, 'reporting'> = {};
      const reporting = handleReportingConfig(ctx, loadedConfig, {
        hiveTarget,
        hiveAccessToken,
        hiveTraceAccessToken,
        hiveRegistryToken,
        hiveUsageTarget,
        hiveUsageAccessToken,
        apolloGraphRef: apolloGraphRef || schemaPathOrUrl,
        apolloKey,
      });
      if (reporting) {
        registryConfig.reporting = reporting;
      }

      const pubsub = loadedConfig.pubsub || new MemPubSub();
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
          openTelemetry: openTelemetryEnabledByCLI
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
      config.renderLegacyGraphiQL ||= opts.renderLegacyGraphiql;
      if (config.renderLegacyGraphiQL) {
        // Setting these to undefined will make the runtime use default GraphiQL
        config.renderGraphiQL = undefined;
        config.playgroundName = undefined;
      }
      if (opts.hiveRouterRuntime && !config.unifiedGraphHandler) {
        ctx.log.warn('Using Hive Router Runtime');
        try {
          ctx.log.debug('Loading @graphql-hive/router-runtime package');
          const moduleName = '@graphql-hive/router-runtime';
          const { unifiedGraphHandler } = await import(moduleName);
          config.unifiedGraphHandler ||= unifiedGraphHandler;
        } catch (e) {
          ctx.log.warn(
            'Could not load the @graphql-hive/router-runtime package. Please install it to use the Router Runtime.' +
              ' Falling back to the default runtime.',
          );
        }
      }
      if (hivePersistedDocumentsEndpoint) {
        const token =
          hivePersistedDocumentsToken ||
          (loadedConfig.persistedDocuments &&
            'token' in loadedConfig.persistedDocuments &&
            loadedConfig.persistedDocuments.token);
        if (!token) {
          ctx.log.error(
            'Hive persisted documents needs a CDN token. Please provide it through the "--hive-persisted-documents-token <token>" option or the config.',
          );
          process.exit(1);
        }

        config.persistedDocuments = {
          ...loadedConfig.persistedDocuments,
          type: 'hive',
          endpoint: hivePersistedDocumentsEndpoint,
          token,
          // Apply cache options from CLI (CLI takes precedence over config)
          ...(hivePersistedDocumentsCacheTtl != null
            ? { cacheTtlSeconds: hivePersistedDocumentsCacheTtl }
            : {}),
          ...(hivePersistedDocumentsCacheNotFoundTtl != null
            ? {
                cacheNotFoundTtlSeconds: hivePersistedDocumentsCacheNotFoundTtl,
              }
            : {}),
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
    try {
      await lstat(absSchemaPath);
    } catch (err) {
      log.error(
        { path: absSchemaPath, err },
        'Could not find supergraph. Make sure the file exists.',
      );
      process.exit(1);
    }
  }

  if (absSchemaPath) {
    // Polling should not be enabled when watching the file
    delete config.pollingInterval;
    if (cluster.isPrimary) {
      log.info({ path: absSchemaPath }, 'Watching supergraph file for changes');

      const ctrl = new AbortController();
      registerTerminateHandler((signal) => {
        log.info(
          { path: absSchemaPath },
          `Closing watcher for supergraph on ${signal}`,
        );
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
          log.info(
            { path: absSchemaPath },
            'Supergraph changed. Invalidating...',
          );
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
          log.error(
            { path: absSchemaPath, err: e },
            'Supergraph watcher closed with an error',
          );
        })
        .then(() => {
          log.info(
            { path: absSchemaPath },
            'Supergraph watcher successfuly closed',
          );
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
    log.info({ path: absSchemaPath }, 'Loading local supergraph');
  } else if (isUrl(String(config.supergraph))) {
    log.info({ url: config.supergraph }, 'Loading remote supergraph');
  } else if (
    typeof config.supergraph === 'object' &&
    'type' in config.supergraph &&
    config.supergraph.type === 'hive'
  ) {
    log.info(
      { endpoint: config.supergraph.endpoint },
      'Loading supergraph from Hive CDN',
    );
  } else if (
    typeof config.supergraph === 'object' &&
    'type' in config.supergraph &&
    config.supergraph.type === 'dev'
  ) {
    log.info(
      { remote: !!config.supergraph.remote },
      'Composing supergraph from local subgraphs using the Hive dev fetcher',
    );
  } else {
    log.info('Loading supergraph from config');
  }

  await runtime.getSchema();

  await startServerForRuntime(runtime, {
    ...config,
    log,
  });
}
