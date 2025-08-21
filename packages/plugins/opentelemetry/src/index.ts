import { DiagLogLevel } from '@opentelemetry/api';
import {
  useOpenTelemetry,
  type OpenTelemetryGatewayPluginOptions,
  type OpenTelemetryPlugin,
  type OpenTelemetryPluginUtils,
} from './plugin';

export * from './attributes';

export const OpenTelemetryDiagLogLevel = DiagLogLevel;

export {
  useOpenTelemetry,
  OpenTelemetryPlugin,
  OpenTelemetryGatewayPluginOptions,
  OpenTelemetryPluginUtils,
};
