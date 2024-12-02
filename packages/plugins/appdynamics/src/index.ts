import { type GatewayPlugin } from '@graphql-hive/gateway-runtime';
import type { Logger } from '@graphql-mesh/types';
import appd from 'appdynamics';

type AppDynamicsPluginOptions = {
  logger: Logger;
};

export default function useAppDynamics(
  options: AppDynamicsPluginOptions,
): GatewayPlugin {
  const logger = options.logger.child('AppDynamics');

  return {
    onRequest() {
      logger.debug('starting a transaction');
    },
  };
}
