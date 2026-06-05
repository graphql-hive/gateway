import { createHive } from '@graphql-hive/core';
import { GatewayConfigContext } from '@graphql-hive/gateway-runtime';
import { MaybePromise } from '@whatwg-node/promise-helpers';
import { ServerAdapterInitialContext } from '@whatwg-node/server';
import type { MCPOperationsLoader } from '../plugin.js';

export interface HiveLoaderAppDeploymentConfig {
  /** App deployment name to fetch operations from */
  appName: string;
  /** App version to fetch operations from */
  appVersion: string;
}

export interface HiveLoaderConfig {
  /**
   * CDN endpoint(s) for looking up persisted documents.
   *
   * It is possible to provide an endpoint list. The first endpoint will be treated as the primary source.
   * The secondary endpoint will be used in case the first endpoint fails to respond.
   *
   * @example
   * ```
   * [
   *   "https://cdn.graphql-hive.com/artifacts/v1/9fb37bc4-e520-4019-843a-0c8698c25688",
   *   "https://cdn-mirror.graphql-hive.com/artifacts/v1/9fb37bc4-e520-4019-843a-0c8698c25688"
   * ]
   * ```
   */
  endpoint: string | [string, string];
  /**
   * CDN access token
   * @example hv2ZjUxNGUzN2MtNjVhNS0=
   */
  accessToken: string;
  /**
   * The app deployment to fetch persisted documents from. Can be a static config or a
   * function that derives the config from every incoming request.
   *
   * BEWARE: If using a function, the loader will fetch the manifest and all persisted documents
   * on every request, which may have performance implications. Consider caching strategies if
   * the app deployment config does not change frequently.
   */
  appDeployment:
    | HiveLoaderAppDeploymentConfig
    | ((payload: {
        serverContext: GatewayConfigContext & ServerAdapterInitialContext;
        request: Request;
      }) => MaybePromise<HiveLoaderAppDeploymentConfig>);
}

/**
 * Creates an {@link MCPOperationsLoader} that fetches persisted GraphQL documents
 * from a Hive App Deployment on every MCP request.
 *
 * `endpoint` and `accessToken` are fixed at setup time. `appName` and `appVersion`
 * can each be a static string or a function that derives the value from the
 * incoming request (e.g. for multi-tenant setups driven by request headers).
 *
 * @experimental Subject to breaking changes without notice.
 */
export function createHiveLoader(
  ctx: GatewayConfigContext,
  config: HiveLoaderConfig,
): MCPOperationsLoader {
  const hive = createHive({
    enabled: false,
    logger: ctx.log,
    persistedDocuments: {
      cdn: {
        endpoint: config.endpoint,
        accessToken: config.accessToken,
      },
    },
  });
  if (!hive.persistedDocuments) {
    // should never happen
    throw new Error('persistedDocuments is not available on the Hive client');
  }
  const pd = hive.persistedDocuments;

  return {
    async load(payload) {
      const appDeployment =
        typeof config.appDeployment === 'function'
          ? await config.appDeployment(payload)
          : config.appDeployment;
      const { appName, appVersion } = appDeployment;

      const manifest = await pd.manifest({ appName, appVersion });
      if (!manifest) {
        throw new Error(
          `No manifest found for app "${appName}" version "${appVersion}"`,
        );
      }

      const bodies = await Promise.all(
        manifest.documentHashes.map(async (hash) => {
          const body = await pd.resolve(hash);
          if (!body) {
            throw new Error(
              `Persisted document "${hash}" could not be resolved for app "${appName}" version "${appVersion}"`,
            );
          }
          return body;
        }),
      );

      return bodies.join('\n');
    },
  };
}
