import { DiagLogLevel } from '@opentelemetry/api';
import {
  useOpenTelemetry,
  type OpenTelemetryGatewayPluginOptions,
  type OpenTelemetryPlugin,
} from './plugin';

export * from './processors';

export type OpenTelemetryMeshPluginOptions = OpenTelemetryGatewayPluginOptions;

export const OpenTelemetryDiagLogLevel = DiagLogLevel;

export {
  useOpenTelemetry,
  OpenTelemetryPlugin,
  OpenTelemetryGatewayPluginOptions,
};
