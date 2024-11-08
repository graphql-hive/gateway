import cluster from 'node:cluster';
import { lstat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import {
  createGatewayRuntime,
  type GatewayConfigSubgraph,
  type UnifiedGraphConfig,
} from '@graphql-hive/gateway-runtime';
import { isUrl, PubSub } from '@graphql-mesh/utils';
import { isValidPath } from '@graphql-tools/utils';
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
import { startServerForRuntime } from '../server';
import { handleFork } from './handleFork';

export const addCommand: AddCommand = (ctx, cli) =>
  cli
    .command('subgraph')
    .description(
      'serve a Federation subgraph that can be used with any Federation compatible router like Apollo Router/Gateway',
    )
    .argument(
      '[schemaPathOrUrl]',
      'path to the subgraph schema file or a url from where to pull the subgraph schema (default: "subgraph.graphql")',
    )
    .action(async function subgraph(schemaPathOrUrl) {
      const {
        maskedErrors,
        hiveRegistryToken,
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

      let subgraph: UnifiedGraphConfig = 'subgraph.graphql';
      if (schemaPathOrUrl) {
        subgraph = schemaPathOrUrl;
      } else if ('subgraph' in loadedConfig) {
        subgraph = loadedConfig.subgraph!; // TODO: assertion wont be necessary when exactOptionalPropertyTypes
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

      const config: SubgraphConfig = {
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
        subgraph,
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
      return runSubgraph(ctx, config);
    });

export type SubgraphConfig = GatewayConfigSubgraph & GatewayCLIConfig;

export async function runSubgraph({ log }: CLIContext, config: SubgraphConfig) {
  let absSchemaPath: string | null = null;
  if (
    typeof config.subgraph === 'string' &&
    isValidPath(config.subgraph) &&
    !isUrl(config.subgraph)
  ) {
    const subgraphPath = config.subgraph;
    absSchemaPath = isAbsolute(subgraphPath)
      ? String(subgraphPath)
      : resolve(process.cwd(), subgraphPath);
    try {
      await lstat(absSchemaPath);
    } catch {
      throw new Error(`Subgraph schema at ${absSchemaPath} does not exist`);
    }
  }

  if (handleFork(log, config)) {
    return;
  }

  const runtime = createGatewayRuntime(config);

  if (absSchemaPath) {
    log.info(`Serving local subgraph from ${absSchemaPath}`);
  } else if (isUrl(String(config.subgraph))) {
    log.info(`Serving remote subgraph from ${config.subgraph}`);
  } else {
    log.info('Serving subgraph from config');
  }

  await startServerForRuntime(runtime, {
    ...config,
    log,
  });
}
