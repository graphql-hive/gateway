import { NodeSDK, startNodeSdk } from '@opentelemetry/sdk-node';

export type {
  LoggerProviderConfig,
  MeterProviderConfig,
  NodeSDKConfiguration,
} from '@opentelemetry/sdk-node';

// sdk-node has no namespace re-exports of the other sdk packages, they're bundled on their own
export { NodeSDK, startNodeSdk };
