import {
  BatchSpanProcessor,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { getEnvStr, isNode } from '~internal/env';
import type { CLIContext } from '..';

export async function handleOpenTelemetryCLIOpts(
  ctx: CLIContext,
  cliOpts: {
    hiveAccessToken: string | undefined; // TODO: Use it to enable tracing by default once stable
    hiveTarget: string | undefined;
    hiveTraceAccessToken: string | undefined;
    hiveTraceEndpoint: string;
    openTelemetryExporterType: 'otlp-http' | 'otlp-grpc' | undefined;
    openTelemetry: boolean | string | undefined;
  },
): Promise<boolean> {
  const accessToken = cliOpts.hiveTraceAccessToken; // TODO: also use value of hiveAccessToken
  const traceEndpoint = cliOpts.hiveTraceEndpoint;
  const target = cliOpts.hiveTarget;
  const openTelemetry = cliOpts.openTelemetry;
  const exporterType = cliOpts.openTelemetryExporterType ?? 'otlp-http';

  const log = ctx.log.child('[OpenTelemetry] ');

  if (openTelemetry || accessToken) {
    log.debug(
      { openTelemetry, exporterType, target, traceEndpoint },
      'Initializing OpenTelemetry SDK',
    );

    const { openTelemetrySetup, HiveTracingSpanProcessor } =
      await import('@graphql-hive/plugin-opentelemetry/setup');
    const processors: SpanProcessor[] = [];

    const logAttributes = {
      traceEndpoints: [] as {
        url: string | null;
        type?: string;
        target?: string;
      }[],
      contextManager: false,
    };

    let integration: { name: string; source: { flag: string; env: string } };

    if (openTelemetry) {
      const otelEndpoint =
        typeof openTelemetry === 'string'
          ? openTelemetry
          : getEnvStr('OTEL_EXPORTER_OTLP_ENDPOINT');

      log.debug({ exporterType, otelEndpoint }, 'Setting up OTLP Exporter');

      integration = {
        name: 'OpenTelemetry',
        source: { flag: '--opentelemetry', env: 'OPENTELEMETRY' },
      };

      logAttributes.traceEndpoints.push({
        url: otelEndpoint ?? null,
        type: exporterType,
      });

      log.debug({ type: exporterType }, 'Loading OpenTelemetry exporter');

      const { OTLPTraceExporter } = await import(
        `@opentelemetry/exporter-trace-${exporterType}`
      );

      processors.push(
        new BatchSpanProcessor(new OTLPTraceExporter({ url: otelEndpoint })),
      );
    }

    if (accessToken) {
      log.debug({ target, traceEndpoint }, 'Setting up Hive Tracing');

      integration ??= {
        name: 'Hive Tracing',
        source: {
          flag: '--hive-trace-access-token',
          env: 'HIVE_TRACE_ACCESS_TOKEN',
        },
      };
      if (!target) {
        ctx.log.error(
          'Hive tracing needs a target. Please provide it through "--hive-target <target>"',
        );
        process.exit(1);
      }

      logAttributes.traceEndpoints.push({
        url: traceEndpoint,
        type: 'hive tracing',
        target,
      });

      processors.push(
        new HiveTracingSpanProcessor({
          accessToken,
          target,
          endpoint: traceEndpoint,
        }),
      );
    }

    log.debug('Trying to load AsyncLocalStorage based Context Manager');

    const contextManager = await import('@opentelemetry/context-async-hooks')
      .then((module) => {
        logAttributes.contextManager = true;
        return new module.AsyncLocalStorageContextManager();
      })
      .catch(() => null);

    openTelemetrySetup({
      log,
      traces: { processors },
      resource: await detectResource().catch((err) => {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          err.code === 'ERR_MODULE_NOT_FOUND'
        ) {
          ctx.log.warn(
            err,
            `NodeJS modules necessary for environment detection is missing, please install it to auto-detect the environment`,
          );
          return undefined;
        }
        throw err;
      }),
      contextManager,
      _initialization: {
        name: integration!.name,
        source: `cli flag (${integration!.source.flag}) or environment variables (${integration!.source.env})`,
        logAttributes,
      },
    });

    return true;
  }

  return false;
}

async function detectResource() {
  if (isNode()) {
    // to prevent pkgroll from bundling the module (module is not listed in package.json)
    const autoInstrumentationsNodeName =
      '@opentelemetry/auto-instrumentations-node';
    const { getResourceDetectors } = await import(autoInstrumentationsNodeName);
    // to prevent pkgroll from bundling the module (module is not listed in package.json)
    const resourcesName = '@opentelemetry/resources';
    const { detectResources } = await import(resourcesName);
    return detectResources({ detectors: getResourceDetectors() });
  }
  return undefined;
}
