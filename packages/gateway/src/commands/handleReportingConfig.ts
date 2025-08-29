import {
  CLIContext,
  GatewayConfig,
  GatewayGraphOSReportingOptions,
  GatewayHiveReportingOptions,
} from '..';

export interface ReportingCLIOptions {
  hiveTarget: string | undefined;
  hiveRegistryToken: string | undefined;
  hiveUsageTarget: string | undefined;
  hiveAccessToken: string | undefined;
  hiveUsageAccessToken: string | undefined;
  hiveTraceAccessToken: string | undefined;
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
          hiveTarget: loadedConfig.reporting.target,
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
  const opts = {
    ...confOpts,
    ...cliOpts,
    hiveTarget:
      // cli arguments always take precedence over config
      confOpts.hiveTarget ?? cliOpts.hiveTarget ?? cliOpts.hiveUsageTarget,
  };

  if (cliOpts.hiveRegistryToken && cliOpts.hiveUsageAccessToken) {
    ctx.log.error(
      'Cannot use "--hive-registry-token" with "--hive-usage-access-token". Please use "--hive-usage-target" and "--hive-usage-access-token" or the config instead.',
    );
    process.exit(1);
  }

  if (cliOpts.hiveUsageTarget && cliOpts.hiveTarget) {
    ctx.log.error(
      'Cannot use "--hive-usage-target" with "--hive-target". Please only use "--hive-target"',
    );
    process.exit(1);
  }

  if (cliOpts.hiveRegistryToken && opts.hiveTarget) {
    ctx.log.error(
      'Cannot use "--hive-registry-token" with a target. Please use "--hive-usage-target" and "--hive-usage-access-token" or the config instead.',
    );
    process.exit(1);
  }

  if (
    opts.hiveTarget &&
    !opts.hiveAccessToken &&
    !opts.hiveUsageAccessToken &&
    !opts.hiveTraceAccessToken
  ) {
    ctx.log.error(
      'Hive usage target needs an access token. Please provide it through "--hive-access-token <token>", or specific "--hive-usage-access-token <token>" and "--hive-trace-access-token" options, or the config.',
    );
    process.exit(1);
  }

  if (
    (opts.hiveAccessToken ||
      opts.hiveUsageAccessToken ||
      opts.hiveTraceAccessToken) &&
    !opts.hiveTarget
  ) {
    ctx.log.error(
      'Hive access token needs a target. Please provide it through the "--hive-target <target>" option or the config.',
    );
    process.exit(1);
  }

  const hiveUsageAccessToken =
    opts.hiveAccessToken || opts.hiveUsageAccessToken || opts.hiveRegistryToken;
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
      target: opts.hiveTarget,
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
