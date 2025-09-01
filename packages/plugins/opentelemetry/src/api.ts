import { Logger } from '@graphql-hive/logger';
import { context, Tracer } from '@opentelemetry/api';
import type { OpenTelemetryPluginUtils } from './plugin';

export * from '@opentelemetry/api';

export type HiveAPI = Omit<OpenTelemetryPluginUtils, 'tracer'> & {
  tracer?: Tracer;
  /**
   * Register the Hive OpenTelemetry plugin utility API
   *
   * @param utils: The plugin instance with all the utility methods
   * @param log: A Logger that will be used to warn in case of double registration. Leave it undefined or null to disable the log.
   * @returns true if successful, false if the API was already registered
   */
  setPluginUtils(utils: OpenTelemetryPluginUtils, log?: Logger): boolean;
  /**
   * Unregister the current Hive OpenTelemetry plugin utility API if any is registered. No-op if no API was registered
   */
  disable(): void;
};

type HiveAPIDelegate = Omit<HiveAPI, 'setPluginUtils' | 'disable'>;

const defaultDelegate: HiveAPIDelegate = {
  getActiveContext: () => context.active(),
  getExecutionRequestContext: () => context.active(),
  getHttpContext: () => context.active(),
  getOperationContext: () => context.active(),
};

let delegate: HiveAPIDelegate = defaultDelegate;

export const hive: HiveAPI = {
  getActiveContext: (payload) => delegate.getActiveContext(payload),

  getExecutionRequestContext: (executionRequest) =>
    delegate.getExecutionRequestContext(executionRequest),

  getHttpContext: (request) => delegate.getHttpContext(request),

  getOperationContext: (context) => delegate.getOperationContext(context),

  get tracer() {
    return delegate.tracer;
  },

  setPluginUtils: (utils, log) => {
    if (delegate == defaultDelegate) {
      delegate = utils;
      return true;
    } else {
      log?.warn(
        "OpenTelemetry plugin's utils are already registered. This is a no-op",
      );
      return false;
    }
  },

  disable() {
    delegate = defaultDelegate;
  },
};
