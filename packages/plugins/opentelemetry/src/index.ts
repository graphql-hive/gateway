import {
  useOpenTelemetry,
  type OpenTelemetryGatewayPluginOptions,
  type OpenTelemetryPlugin,
} from './plugin';

export * from './processors';

export type OpenTelemetryMeshPluginOptions = OpenTelemetryGatewayPluginOptions;

export {
  useOpenTelemetry,
  OpenTelemetryPlugin,
  OpenTelemetryGatewayPluginOptions,
};
