import {
  CLIContext,
  GatewayConfig,
  GatewayGraphOSReportingOptions,
  GatewayHiveReportingOptions,
} from '..';

export function handleReportingConfig(
  ctx: CLIContext,
  loadedConfig: Partial<GatewayConfig<Record<string, any>>>,
  opts: {
    hiveRegistryToken: string | undefined;
    hiveUsageTarget: string | undefined;
    hiveUsageAccessToken: string | undefined;
    apolloGraphRef: string | undefined;
    apolloKey: string | undefined;
  },
): GatewayHiveReportingOptions | GatewayGraphOSReportingOptions | null {
  const {
    hiveRegistryToken,
    hiveUsageTarget,
    hiveUsageAccessToken,
    apolloGraphRef,
    apolloKey,
  } = opts;

  if (hiveRegistryToken) {
    if (hiveUsageAccessToken || hiveUsageTarget) {
      ctx.log.error(
        `Cannot use "--hive-registry-token" with "--hive-usage-target" or "--hive-usage-access-token". Please use "--hive-usage-target" and "--hive-usage-access-token" instead.`,
      );
      process.exit(1);
    }
    ctx.log.warn(
      `"--hive-registry-token" is deprecated! Please use "--hive-usage-target" and "--hive-usage-access-token" instead.`,
    );
    ctx.log.info(`Configuring Hive registry reporting`);
    return {
      ...loadedConfig.reporting,
      type: 'hive',
      token: hiveRegistryToken,
    };
  } else if (hiveUsageAccessToken || hiveUsageTarget) {
    if (!hiveUsageAccessToken) {
      ctx.log.error(
        `Hive usage target needs an access token. Please provide it through the "--hive-usage-access-token <token>" option or the config.`,
      );
      process.exit(1);
    }
    if (!hiveUsageTarget) {
      ctx.log.error(
        `Hive usage access token needs a target. Please provide it through the "--hive-usage-target <target>" option or the config.`,
      );
      process.exit(1);
    }
    ctx.log.info(`Configuring Hive usage reporting`);
    return {
      ...loadedConfig.reporting,
      type: 'hive',
      target: hiveUsageTarget,
      token: hiveUsageAccessToken,
    };
  } else if (apolloKey) {
    ctx.log.info(`Configuring Apollo GraphOS registry reporting`);
    if (!apolloGraphRef) {
      ctx.log.error(
        `Apollo GraphOS requires a graph ref in the format <graph-id>@<graph-variant>. Please provide a valid graph ref.`,
      );
      process.exit(1);
    }
    return {
      type: 'graphos',
      apiKey: apolloKey,
      graphRef: apolloGraphRef,
    };
  }
  return null;
}
