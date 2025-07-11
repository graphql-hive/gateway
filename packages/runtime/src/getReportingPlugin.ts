import { useApolloUsageReport } from '@graphql-yoga/plugin-apollo-usage-report';
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
    return useHiveConsole({
      log: configContext.log.child('[useHiveConsole] '),
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
              allowArbitraryDocuments:
                !!config.persistedDocuments.allowArbitraryDocuments,
            },
          }
        : {}),
    });
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
