import {
  CLIContext,
  GatewayConfig,
  GatewayGraphOSReportingOptions,
  GatewayHiveReportingOptions,
} from '..';

export interface ReportingCLIOptions {
  hiveRegistryToken: string | undefined;
  hiveUsageTarget: string | undefined;
  hiveUsageAccessToken: string | undefined;
  apolloGraphRef: string | undefined;
  apolloKey: string | undefined;
}

export function handleReportingConfig(
  ctx: CLIContext,
  loadedConfig: Partial<GatewayConfig<Record<string, any>>>,
  cliOpts: ReportingCLIOptions,
): GatewayHiveReportingOptions | GatewayGraphOSReportingOptions | null {
  const confOpts: Partial<ReportingCLIOptions> = {
    ...(loadedConfig.reporting?.type === 'hive'
      ? {
          hiveRegistryToken: loadedConfig.reporting.token,
          hiveUsageTarget: loadedConfig.reporting.target,
          hiveUsageAccessToken: loadedConfig.reporting.token,
        }
      : {}),
    ...(loadedConfig.reporting?.type === 'graphos'
      ? {
          apolloGraphRef: loadedConfig.reporting.graphRef,
          apolloKey: loadedConfig.reporting.apiKey,
        }
      : {}),
  };
  const opts = { ...confOpts, ...cliOpts };

  if (cliOpts.hiveRegistryToken && cliOpts.hiveUsageAccessToken) {
    ctx.log.error(
      'Cannot use "--hive-registry-token" with "--hive-usage-access-token". Please use "--hive-usage-target" and "--hive-usage-access-token" or the config instead.',
    );
    process.exit(1);
  }

  if (cliOpts.hiveRegistryToken && opts.hiveUsageTarget) {
    ctx.log.error(
      'Cannot use "--hive-registry-token" with a target. Please use "--hive-usage-target" and "--hive-usage-access-token" or the config instead.',
    );
    process.exit(1);
  }

  if (opts.hiveUsageTarget && !opts.hiveUsageAccessToken) {
    ctx.log.error(
      'Hive usage target needs an access token. Please provide it through the "--hive-usage-access-token <token>" option or the config.',
    );
    process.exit(1);
  }

  if (opts.hiveUsageAccessToken && !opts.hiveUsageTarget) {
    ctx.log.error(
      'Hive usage access token needs a target. Please provide it through the "--hive-usage-target <target>" option or the config.',
    );
    process.exit(1);
  }

  const hiveUsageAccessToken =
    opts.hiveUsageAccessToken || opts.hiveRegistryToken;
  if (hiveUsageAccessToken) {
    // different logs w and w/o the target to disambiguate
    if (opts.hiveUsageTarget) {
      ctx.log.info('Configuring Hive usage reporting');
    } else {
      ctx.log.info('Configuring Hive registry reporting');
    }
    return {
      ...loadedConfig.reporting,
      type: 'hive',
      token: hiveUsageAccessToken,
      target: opts.hiveUsageTarget,
    };
  }

  if (opts.apolloKey) {
    ctx.log.info('Configuring Apollo GraphOS registry reporting');
    if (!opts.apolloGraphRef?.includes('@')) {
      ctx.log.error(
        `Apollo GraphOS requires a graph ref in the format <graph-id>@<graph-variant>. Please provide a valid graph ref ${opts.apolloGraphRef ? `not ${opts.apolloGraphRef}` : ''}.`,
      );
      process.exit(1);
    }
    return {
      ...loadedConfig.reporting,
      type: 'graphos',
      apiKey: opts.apolloKey,
      graphRef: opts.apolloGraphRef,
    };
  }

  return null;
}
