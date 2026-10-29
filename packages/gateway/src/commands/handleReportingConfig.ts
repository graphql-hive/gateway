import {
  CLIContext,
  GatewayConfig,
  GatewayGraphOSReportingOptions,
  GatewayHiveReportingOptions,
} from '..';

export interface ReportingCLIOptions {
  hiveTarget: string | undefined;
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
    ...Object.entries(cliOpts).reduce((acc, [key, val]) => {
      if (val != null) {
        return { ...acc, [key]: val };
      }
      // omit nullish values so that the spread does not override available options
      return acc;
    }, {}),
    hiveTarget:
      // cli arguments always take precedence over config
      cliOpts.hiveTarget ?? confOpts.hiveTarget,
  };

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

  // CLI-provided tokens require an explicit target. Config-only tokens (common
  // for self-hosting) may omit target.
  const cliProvidedAccessToken =
    cliOpts.hiveAccessToken ||
    cliOpts.hiveUsageAccessToken ||
    cliOpts.hiveTraceAccessToken;
  if (cliProvidedAccessToken && !opts.hiveTarget) {
    ctx.log.error(
      'Hive access token needs a target. Please provide it through the "--hive-target <target>" option or the config.',
    );
    process.exit(1);
  }

  const hiveUsageAccessToken =
    opts.hiveAccessToken || opts.hiveUsageAccessToken;
  if (hiveUsageAccessToken) {
    ctx.log.info('Configuring Hive usage reporting');
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
