import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { CLIContext } from '..';

export async function handleOpenTelemetryConfig(
  ctx: CLIContext,
  cliOpts: {
    hiveAccessToken: string | undefined; // TODO: Use it to enable tracing by default once stable
    hiveTarget: string | undefined;
    hiveTraceAccessToken: string | undefined;
    openTelemetryExporterType: 'otlp-http' | 'otlp-grpc' | undefined;
    openTelemetry: boolean | string | undefined;
  },
) {
  const accessToken = cliOpts.hiveTraceAccessToken; // TODO: also use value of hiveAccessToken
  const target = cliOpts.hiveTarget;
  const openTelemetry = cliOpts.openTelemetry;
  const exporterType = cliOpts.openTelemetryExporterType ?? 'otlp-http';

  if (typeof openTelemetry === 'string' || accessToken) {
    const { openTelemetrySetup, HiveTracingSpanProcessor } = await import(
      '@graphql-mesh/plugin-opentelemetry/setup'
    );
    const processors = [];

    if (openTelemetry) {
      const { OTLPTraceExporter } = await import(
        `@opentelemetry/exporter-trace-${exporterType}`
      );

      processors.push(
        new BatchSpanProcessor(new OTLPTraceExporter({ url: openTelemetry })),
      );
    }

    if (accessToken) {
      if (!target) {
        ctx.log.error(
          'Hive tracing needs a target. Please provide it through "--hive-target <target>"',
        );
        process.exit(1);
      }

      processors.push(
        new HiveTracingSpanProcessor({
          accessToken,
          target,
        }),
      );
    }

    openTelemetrySetup({
      traces: { processors },
      contextManager: await import('@opentelemetry/context-async-hooks')
        .then((module) => new module.AsyncLocalStorageContextManager())
        .catch(() => null),
    });
  }
}
