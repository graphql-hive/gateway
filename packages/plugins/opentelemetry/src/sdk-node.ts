import sdkDefault, {
  api,
  contextBase,
  core,
  LoggerProviderConfig,
  logs,
  MeterProviderConfig,
  metrics,
  node,
  NodeSDK,
  NodeSDKConfiguration,
  resources,
  tracing,
} from '@opentelemetry/sdk-node';

export type { LoggerProviderConfig, MeterProviderConfig, NodeSDKConfiguration };

export {
  api,
  contextBase,
  core,
  logs,
  metrics,
  node,
  NodeSDK,
  resources,
  sdkDefault,
  tracing,
};

export default sdkDefault;
