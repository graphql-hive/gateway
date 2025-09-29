import {
  hiveTracingSetup as _hiveTracingSetup,
  openTelemetrySetup as _openTelemetrySetup,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  OpentelemetrySetupOptions,
} from '@graphql-hive/plugin-opentelemetry/setup';
import { resourceFromAttributes } from '@opentelemetry/resources';

export * from '@graphql-hive/plugin-opentelemetry/setup';

export const openTelemetrySetup: typeof _openTelemetrySetup = (options) => {
  return _openTelemetrySetup({
    ...options,
    resource: createGatewayResource(options),
  });
};

export const hiveTracingSetup: typeof _hiveTracingSetup = (options) => {
  return _hiveTracingSetup({
    ...options,
    resource: createGatewayResource(options),
  });
};

function createGatewayResource(
  options: Pick<OpentelemetrySetupOptions, 'resource'>,
): OpentelemetrySetupOptions['resource'] {
  if (!options.resource) {
    return {
      serviceName: 'hive-gateway',
      serviceVersion: globalThis.__OTEL_PLUGIN_VERSION__ ?? 'unknown',
    };
  } else if (!('serviceName' in options.resource)) {
    return resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'hive-gateway',
      [ATTR_SERVICE_VERSION]: globalThis.__OTEL_PLUGIN_VERSION__ ?? 'unknown',
    }).merge(options.resource);
  } else {
    return options.resource;
  }
}
